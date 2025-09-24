-- Accounting Database Schema

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number VARCHAR(20) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id UUID REFERENCES public.chart_of_accounts(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coa_account_type ON public.chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_parent_id ON public.chart_of_accounts(parent_id);

-- Fiscal Years
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_years_dates_check CHECK (end_date > start_date),
  CONSTRAINT fiscal_years_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_dates ON public.fiscal_years(start_date, end_date);

-- Journal Entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number VARCHAR(20) NOT NULL UNIQUE,
  date DATE NOT NULL,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  reference TEXT,
  is_posted BOOLEAN NOT NULL DEFAULT FALSE,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_by_id UUID REFERENCES public.journal_entries(id),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  posted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal_year ON public.journal_entries(fiscal_year_id);

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  description TEXT,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT journal_entry_lines_debit_credit_check CHECK (
    (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON public.journal_entry_lines(account_id);

-- Function to check if journal entry is balanced
CREATE OR REPLACE FUNCTION public.check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC(14,2);
  total_credit NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM public.journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;
  
  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced. Total debit (%) does not equal total credit (%)', total_debit, total_credit;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure journal entries are balanced before posting
CREATE TRIGGER trg_check_journal_entry_balance
  BEFORE UPDATE OF is_posted ON public.journal_entries
  FOR EACH ROW
  WHEN (OLD.is_posted = FALSE AND NEW.is_posted = TRUE)
  EXECUTE FUNCTION public.check_journal_entry_balance();

-- Function to generate account balances
CREATE OR REPLACE FUNCTION public.get_account_balance(
  p_account_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_type TEXT,
  debit_total NUMERIC(14,2),
  credit_total NUMERIC(14,2),
  balance NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH account_totals AS (
    SELECT
      coa.id,
      coa.name,
      coa.account_type,
      COALESCE(SUM(jel.debit), 0) AS debit_sum,
      COALESCE(SUM(jel.credit), 0) AS credit_sum
    FROM
      public.chart_of_accounts coa
    LEFT JOIN
      public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN
      public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE
      coa.id = p_account_id
      AND je.is_posted = TRUE
      AND (p_start_date IS NULL OR je.date >= p_start_date)
      AND (p_end_date IS NULL OR je.date <= p_end_date)
    GROUP BY
      coa.id, coa.name, coa.account_type
  )
  SELECT
    at.id,
    at.name,
    at.account_type,
    at.debit_sum,
    at.credit_sum,
    CASE
      WHEN at.account_type IN ('asset', 'expense') THEN at.debit_sum - at.credit_sum
      ELSE at.credit_sum - at.debit_sum
    END AS balance
  FROM
    account_totals at;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security Policies
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Policy for managers (full access)
CREATE POLICY manager_chart_of_accounts ON public.chart_of_accounts
  FOR ALL USING (public.current_role() = 'manager');

CREATE POLICY manager_fiscal_years ON public.fiscal_years
  FOR ALL USING (public.current_role() = 'manager');

CREATE POLICY manager_journal_entries ON public.journal_entries
  FOR ALL USING (public.current_role() = 'manager');

CREATE POLICY manager_journal_entry_lines ON public.journal_entry_lines
  FOR ALL USING (public.current_role() = 'manager');

-- Policy for accountants (read all, write/update non-posted)
CREATE POLICY accountant_chart_of_accounts ON public.chart_of_accounts
  FOR ALL USING (public.current_role() = 'accountant');

CREATE POLICY accountant_fiscal_years ON public.fiscal_years
  FOR SELECT USING (public.current_role() = 'accountant');

CREATE POLICY accountant_fiscal_years_insert ON public.fiscal_years
  FOR INSERT WITH CHECK (public.current_role() = 'accountant');

CREATE POLICY accountant_journal_entries_select ON public.journal_entries
  FOR SELECT USING (public.current_role() = 'accountant');

CREATE POLICY accountant_journal_entries_insert ON public.journal_entries
  FOR INSERT WITH CHECK (public.current_role() = 'accountant');

CREATE POLICY accountant_journal_entries_update ON public.journal_entries
  FOR UPDATE USING (
    public.current_role() = 'accountant' AND 
    is_posted = FALSE
  );

CREATE POLICY accountant_journal_entry_lines ON public.journal_entry_lines
  FOR ALL USING (
    public.current_role() = 'accountant' AND
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id AND je.is_posted = FALSE
    )
  );

-- Policy for employees (read-only access to limited data)
CREATE POLICY employee_chart_of_accounts ON public.chart_of_accounts
  FOR SELECT USING (public.current_role() = 'employee' AND is_active = TRUE);

CREATE POLICY employee_fiscal_years ON public.fiscal_years
  FOR SELECT USING (public.current_role() = 'employee');

CREATE POLICY employee_journal_entries ON public.journal_entries
  FOR SELECT USING (
    public.current_role() = 'employee' AND
    is_posted = TRUE
  );

CREATE POLICY employee_journal_entry_lines ON public.journal_entry_lines
  FOR SELECT USING (
    public.current_role() = 'employee' AND
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id AND je.is_posted = TRUE
    )
  );
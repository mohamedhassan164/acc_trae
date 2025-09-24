import { api } from '@/lib/api';

// Types
export interface Account {
  id: string;
  account_number: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent_id?: string;
  description?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_by: string;
  created_at: string;
}

export interface JournalEntryLine {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  account?: Account;
  description?: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id?: string;
  entry_number?: string;
  date: string;
  fiscal_year_id: string;
  fiscal_year?: { name: string };
  description: string;
  reference?: string;
  is_posted: boolean;
  is_reversed: boolean;
  reversed_by_id?: string;
  created_by?: string;
  created_by_user?: { name: string };
  approved_by?: string;
  approved_by_user?: { name: string };
  created_at?: string;
  posted_at?: string;
  lines?: JournalEntryLine[];
}

export interface AccountBalance {
  account_id: string;
  account_name: string;
  account_type: string;
  debit_total: number;
  credit_total: number;
  balance: number;
}

// Chart of Accounts
export const getChartOfAccounts = async (): Promise<Account[]> => {
  const response = await api.get('/accounting/chart-of-accounts');
  return response.data;
};

export const createAccount = async (account: Partial<Account>): Promise<Account> => {
  const response = await api.post('/accounting/chart-of-accounts', account);
  return response.data;
};

// Fiscal Years
export const getFiscalYears = async (): Promise<FiscalYear[]> => {
  const response = await api.get('/accounting/fiscal-years');
  return response.data;
};

export const createFiscalYear = async (fiscalYear: Partial<FiscalYear>): Promise<FiscalYear> => {
  const response = await api.post('/accounting/fiscal-years', fiscalYear);
  return response.data;
};

// Journal Entries
export const getJournalEntries = async (params?: {
  fiscal_year_id?: string;
  start_date?: string;
  end_date?: string;
  is_posted?: boolean;
}): Promise<JournalEntry[]> => {
  const response = await api.get('/accounting/journal-entries', { params });
  return response.data;
};

export const getJournalEntry = async (id: string): Promise<JournalEntry> => {
  const response = await api.get(`/accounting/journal-entries/${id}`);
  return response.data;
};

export const createJournalEntry = async (data: {
  entry: Partial<JournalEntry>;
  lines: Partial<JournalEntryLine>[];
}): Promise<JournalEntry> => {
  const response = await api.post('/accounting/journal-entries', data);
  return response.data;
};

export const postJournalEntry = async (id: string): Promise<JournalEntry> => {
  const response = await api.patch(`/accounting/journal-entries/${id}/post`);
  return response.data;
};

// Account Balances
export const getAccountBalance = async (
  accountId: string,
  params?: {
    start_date?: string;
    end_date?: string;
  }
): Promise<AccountBalance> => {
  const response = await api.get(`/accounting/accounts/${accountId}/balance`, { params });
  return response.data;
};
import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { authenticateToken } from './auth';

const router = Router();

// Apply authentication middleware
router.use(authenticateToken);

// Get chart of accounts
router.get('/chart-of-accounts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .order('account_number');

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch chart of accounts' });
  }
});

// Create account
router.post('/chart-of-accounts', async (req, res) => {
  try {
    const { account_number, name, account_type, parent_id, description } = req.body;
    
    if (!account_number || !name || !account_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        account_number,
        name,
        account_type,
        parent_id: parent_id || null,
        description: description || '',
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get fiscal years
router.get('/fiscal-years', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fiscal_years')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error fetching fiscal years:', error);
    return res.status(500).json({ error: 'Failed to fetch fiscal years' });
  }
});

// Create fiscal year
router.post('/fiscal-years', async (req, res) => {
  try {
    const { name, start_date, end_date } = req.body;
    
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('fiscal_years')
      .insert({
        name,
        start_date,
        end_date,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    console.error('Error creating fiscal year:', error);
    return res.status(500).json({ error: 'Failed to create fiscal year' });
  }
});

// Get journal entries
router.get('/journal-entries', async (req, res) => {
  try {
    const { fiscal_year_id, start_date, end_date, is_posted } = req.query;
    
    let query = supabase
      .from('journal_entries')
      .select(`
        *,
        fiscal_year:fiscal_years(name),
        created_by_user:user_profiles!created_by(name),
        approved_by_user:user_profiles!approved_by(name)
      `)
      .order('date', { ascending: false });
    
    if (fiscal_year_id) {
      query = query.eq('fiscal_year_id', fiscal_year_id);
    }
    
    if (start_date) {
      query = query.gte('date', start_date);
    }
    
    if (end_date) {
      query = query.lte('date', end_date);
    }
    
    if (is_posted !== undefined) {
      query = query.eq('is_posted', is_posted === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// Get journal entry with lines
router.get('/journal-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get journal entry
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select(`
        *,
        fiscal_year:fiscal_years(name),
        created_by_user:user_profiles!created_by(name),
        approved_by_user:user_profiles!approved_by(name)
      `)
      .eq('id', id)
      .single();
    
    if (entryError) throw entryError;
    
    // Get journal entry lines
    const { data: lines, error: linesError } = await supabase
      .from('journal_entry_lines')
      .select(`
        *,
        account:chart_of_accounts(id, account_number, name, account_type)
      `)
      .eq('journal_entry_id', id)
      .order('id');
    
    if (linesError) throw linesError;
    
    return res.json({
      ...entry,
      lines: lines || []
    });
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    return res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

// Create journal entry with lines
router.post('/journal-entries', async (req, res) => {
  const { entry, lines } = req.body;
  
  if (!entry || !lines || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Invalid journal entry data' });
  }
  
  // Start a transaction
  const client = await supabase.getClient();
  
  try {
    // Insert journal entry
    const { data: journalEntry, error: entryError } = await client
      .from('journal_entries')
      .insert({
        ...entry,
        created_by: req.user.id
      })
      .select()
      .single();
    
    if (entryError) throw entryError;
    
    // Insert journal entry lines
    const linesWithEntryId = lines.map(line => ({
      ...line,
      journal_entry_id: journalEntry.id
    }));
    
    const { data: journalLines, error: linesError } = await client
      .from('journal_entry_lines')
      .insert(linesWithEntryId)
      .select();
    
    if (linesError) throw linesError;
    
    return res.status(201).json({
      ...journalEntry,
      lines: journalLines
    });
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// Post journal entry
router.patch('/journal-entries/:id/post', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if journal entry exists and is not already posted
    const { data: existingEntry, error: checkError } = await supabase
      .from('journal_entries')
      .select('is_posted')
      .eq('id', id)
      .single();
    
    if (checkError) throw checkError;
    
    if (!existingEntry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    if (existingEntry.is_posted) {
      return res.status(400).json({ error: 'Journal entry is already posted' });
    }
    
    // Update journal entry to posted
    const { data, error } = await supabase
      .from('journal_entries')
      .update({
        is_posted: true,
        posted_at: new Date().toISOString(),
        approved_by: req.user.id
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return res.json(data);
  } catch (error) {
    console.error('Error posting journal entry:', error);
    return res.status(500).json({ error: 'Failed to post journal entry' });
  }
});

// Get account balance
router.get('/accounts/:id/balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    
    const { data, error } = await supabase.rpc('get_account_balance', {
      p_account_id: id,
      p_start_date: start_date || null,
      p_end_date: end_date || null
    });
    
    if (error) throw error;
    
    return res.json(data);
  } catch (error) {
    console.error('Error fetching account balance:', error);
    return res.status(500).json({ error: 'Failed to fetch account balance' });
  }
});

export default router;
// ========================================
// CONFIGURAÇÃO SUPABASE
// ========================================
const SUPABASE_URL = 'https://wktrxlzrvwlbpztzuaai.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DUj_d5dokWFwOYJqlVthfQ_4XEH7Sn8';

const { createClient } = supabase;
window.pharmabookSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

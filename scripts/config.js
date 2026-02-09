// ========================================
// CONFIGURAÇÃO SUPABASE
// ========================================
const SUPABASE_URL = 'https://wktrxlzrvwlbpztzuaai.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DUj_d5dokWFwOYJqlVthfQ_4XEH7Sn8';

const { createClient } = supabase;
const SUPABASE_AUTH_REDIRECT = `${window.location.origin}/auth`;

window.pharmabookSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});
window.pharmabookAuthRedirectUrl = SUPABASE_AUTH_REDIRECT;

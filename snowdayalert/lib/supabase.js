

// Secure Supabase client with environment validation
import { createClient } from '@supabase/supabase-js';

// Validate environment variables on startup
if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

// Create client with secure defaults
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false, // No sessions (stateless API)
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    }
  }
);

// Health check function
export async function checkDatabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    return { connected: true };
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return { connected: false, error: error.message };
  }
}
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://opiipezwttttnallhegz.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waWlwZXp3dHR0dG5hbGxoZWd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjY1NDQsImV4cCI6MjEwNDYwMjU0NH0.Of8p7LNDbngEZearcl1j-neGbWinIXe3bYhhoLoVLVY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

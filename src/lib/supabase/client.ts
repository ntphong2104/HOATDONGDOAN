import { createBrowserClient } from '@supabase/ssr';

function getValidUrl(url: string | undefined): string {
  if (!url) return 'https://placeholder.supabase.co';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
  } catch {
    // invalid URL
  }
  return 'https://placeholder.supabase.co';
}

export function createClient() {
  const supabaseUrl = getValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

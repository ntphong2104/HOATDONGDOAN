import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = getValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseAnonKey && process.env.NODE_ENV === 'production') {
    throw new Error('Supabase anon key is required');
  }
  const finalAnonKey = supabaseAnonKey || 'placeholder-anon-key';

  return createServerClient(
    supabaseUrl,
    finalAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component read-only fallback
          }
        },
      },
    }
  );
}

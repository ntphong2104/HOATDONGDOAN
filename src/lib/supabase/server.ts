import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js';
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

const g = globalThis as unknown as {
  __hddAdminSupabaseClient?: SupabaseClient;
  __hddAdminSupabaseKey?: string;
};

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

export async function createAdminClient() {
  const supabaseUrl = getValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!serviceRoleKey) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      console.error('[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is missing in production! Refusing silent fallback to anon/user client.');
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production');
    }
    return createClient();
  }

  const cacheKey = `${supabaseUrl}::${serviceRoleKey}`;
  if (g.__hddAdminSupabaseClient && g.__hddAdminSupabaseKey === cacheKey) {
    return g.__hddAdminSupabaseClient;
  }

  const client = createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  g.__hddAdminSupabaseClient = client;
  g.__hddAdminSupabaseKey = cacheKey;
  return client;
}


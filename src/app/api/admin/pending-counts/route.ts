import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 30_000;

interface PendingCountsCache {
  pending_proposals: number;
  pending_office_borrows: number;
  expiresAt: number;
  inflight: Promise<{ pending_proposals: number; pending_office_borrows: number }> | null;
}

function getCache(): PendingCountsCache {
  const g = globalThis as unknown as { __hddAdminPendingCounts?: PendingCountsCache };
  if (!g.__hddAdminPendingCounts) {
    g.__hddAdminPendingCounts = {
      pending_proposals: 0,
      pending_office_borrows: 0,
      expiresAt: 0,
      inflight: null,
    };
  }
  return g.__hddAdminPendingCounts;
}

async function fetchCounts(supabase: any) {
  const cache = getCache();
  if (Date.now() < cache.expiresAt) {
    return {
      pending_proposals: cache.pending_proposals,
      pending_office_borrows: cache.pending_office_borrows,
    };
  }
  if (cache.inflight) return cache.inflight;

  const task = (async () => {
    try {
      const [propRes, borrowRes] = await Promise.all([
        supabase
          .from('event_proposals')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('office_borrow_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      const pending_proposals = Number(propRes.count) || 0;
      const pending_office_borrows = Number(borrowRes.count) || 0;

      cache.pending_proposals = pending_proposals;
      cache.pending_office_borrows = pending_office_borrows;
      cache.expiresAt = Date.now() + CACHE_TTL_MS;
      return { pending_proposals, pending_office_borrows };
    } catch {
      return {
        pending_proposals: cache.pending_proposals,
        pending_office_borrows: cache.pending_office_borrows,
      };
    } finally {
      cache.inflight = null;
    }
  })();

  cache.inflight = task;
  return task;
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const isPrivileged =
    auth.isSuperAdmin ||
    auth.isEventAdmin ||
    auth.isOfficeAdmin ||
    ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin', 'office_admin'].includes(
      auth.tier || ''
    );

  if (!isPrivileged) {
    return NextResponse.json({
      success: true,
      data: { pending_proposals: 0, pending_office_borrows: 0 },
    });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const data = await fetchCounts(supabase);

  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

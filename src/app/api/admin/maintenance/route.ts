import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

function normalizeMaintenanceValue(raw: any): { maintenance_mode: boolean; maintenance_message: string } {
  if (!raw || typeof raw !== 'object') {
    return { maintenance_mode: false, maintenance_message: '' };
  }
  if (typeof raw.maintenance_mode === 'boolean') {
    return {
      maintenance_mode: raw.maintenance_mode,
      maintenance_message: raw.maintenance_message || '',
    };
  }
  let val = raw.value;
  if (typeof val === 'string') {
    if (val === 'true' || val === 'false') {
      return { maintenance_mode: val === 'true', maintenance_message: '' };
    }
    try {
      val = JSON.parse(val);
    } catch {}
  }
  if (typeof val === 'boolean') {
    return { maintenance_mode: val, maintenance_message: '' };
  }
  if (val && typeof val === 'object') {
    return {
      maintenance_mode: Boolean(val.enabled ?? val.maintenance_mode),
      maintenance_message: String(val.message ?? val.maintenance_message ?? ''),
    };
  }
  return { maintenance_mode: false, maintenance_message: '' };
}

export async function GET() {
  try {
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());
    const q = supabase.from('system_settings').select('key, value').eq('key', 'maintenance_mode');
    const { data, error } = typeof q.single === 'function' ? await q.single() : await q.maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: normalizeMaintenanceValue(data),
    });
  } catch {
    return NextResponse.json({ success: true, data: { maintenance_mode: false, maintenance_message: '' } });
  }
}

export async function PATCH(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { enabled, message } = await req.json();
  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const payloadValue = {
    enabled: Boolean(enabled),
    message: typeof message === 'string' ? message : '',
  };

  const upsertQuery = supabase
    .from('system_settings')
    .upsert(
      {
        key: 'maintenance_mode',
        value: payloadValue,
        updated_at: new Date().toISOString(),
        updated_by: auth.email,
      },
      { onConflict: 'key' }
    )
    .select();

  const { data, error } = typeof upsertQuery.single === 'function'
    ? await upsertQuery.single()
    : await upsertQuery.maybeSingle();

  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });

  return NextResponse.json({
    success: true,
    data: {
      ...normalizeMaintenanceValue(data || { value: payloadValue }),
    },
  });
}

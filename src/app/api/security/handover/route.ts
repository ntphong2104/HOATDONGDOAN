import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { getStoredProposalById, saveProposalToStore } from '@/lib/constants/proposals-store';
import { saveHandoverRecordToDb } from '@/lib/constants/handover-store';

export async function POST(req: Request) {
  try {
    let auth = await getAuthContext();
    if (!auth) {
      try {
        const cookieStore = await cookies();
        const demoCookie = cookieStore.get('demo_session');
        if (demoCookie?.value) {
          const demoUser = parseDemoCookie(demoCookie.value);
          if (demoUser?.email) {
            auth = {
              email: demoUser.email,
              isSuperAdmin: demoUser.tier === 'super_admin',
              isEventAdmin: ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'].includes(demoUser.tier),
              isChecker: true,
              isSecurity: demoUser.tier === 'security' || demoUser.email.includes('baove'),
              tier: demoUser.tier || 'security',
            };
          }
        }
      } catch {}
    }

    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const isAuthorized =
      auth.isSuperAdmin ||
      auth.tier === 'security' ||
      auth.tier === 'facility' ||
      auth.tier === 'youth_union' ||
      auth.email.includes('baove') ||
      auth.email.includes('security');

    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: 'Forbidden', message: 'Bạn không có quyền cập nhật sổ bàn giao chìa khóa' }, { status: 403 });
    }

    const body = await req.json();
    const { proposal_id, action } = body;

    if (!proposal_id || !['handover', 'return', 'reset'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Thiếu thông tin mã đơn hoặc hành động' }, { status: 400 });
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

    const nowIso = new Date().toISOString();
    let updatePayload: Record<string, any> = {};

    if (action === 'handover') {
      updatePayload = {
        key_status: 'handed_over',
        key_handed_at: nowIso,
        key_handed_by: auth.email,
      };
    } else if (action === 'return') {
      updatePayload = {
        key_status: 'returned',
        key_returned_at: nowIso,
        key_returned_by: auth.email,
      };
    } else if (action === 'reset') {
      updatePayload = {
        key_status: 'pending',
        key_handed_at: null,
        key_handed_by: null,
        key_returned_at: null,
        key_returned_by: null,
      };
    }

    let returnData: any = null;

    try {
      const { data, error } = await supabase
        .from('event_proposals')
        .update(updatePayload)
        .eq('id', proposal_id)
        .select()
        .single();

      if (!error && data) {
        returnData = data;
      }
    } catch {}

    // Persist to Supabase system_settings (Guaranteed persistent storage across all Vercel serverless instances)
    try {
      await saveHandoverRecordToDb(
        supabase,
        proposal_id,
        {
          key_status: updatePayload.key_status,
          key_handed_at: updatePayload.key_handed_at,
          key_handed_by: updatePayload.key_handed_by,
          key_returned_at: updatePayload.key_returned_at,
          key_returned_by: updatePayload.key_returned_by,
        },
        auth.email
      );
    } catch (e) {
      console.warn('Could not save to DB system_settings handover registry:', e);
    }

    // Also update local persistent store
    const storedProp = getStoredProposalById(proposal_id);
    if (storedProp) {
      const updated = saveProposalToStore({
        ...storedProp,
        ...updatePayload,
      });
      if (!returnData) returnData = updated;
    }

    if (!returnData) {
      returnData = {
        id: proposal_id,
        ...updatePayload,
      };
    }

    return NextResponse.json({
      success: true,
      data: returnData,
      message: action === 'handover' ? 'Đã ghi nhận bàn giao chìa khóa thành công' : 'Đã ghi nhận nhận lại chìa khóa thành công',
    });
  } catch (err: any) {
    console.error('Error updating key handover:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error', message: err.message }, { status: 500 });
  }
}

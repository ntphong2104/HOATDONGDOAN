import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { OFFICIAL_UNITS } from '@/lib/constants/units';

/**
 * One-time migration: backfill event_roles for the managing unit (LCĐ/CLB)
 * so that unit accounts can see events created from their proposals.
 *
 * Only super_admin can run this.
 * DELETE this file after running once.
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới chạy được' }, { status: 403 });
  }

  const supabase = await createAdminClient();

  // Get all approved proposals that created events
  const { data: proposals } = await supabase
    .from('event_proposals')
    .select('id, organization_unit, created_by, created_event_id')
    .eq('status', 'approved')
    .not('created_event_id', 'is', null);

  if (!proposals || proposals.length === 0) {
    return NextResponse.json({ success: true, message: 'Không có proposal nào cần backfill', count: 0 });
  }

  let inserted = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const prop of proposals) {
    if (!prop.organization_unit || !prop.created_event_id) {
      skipped++;
      continue;
    }

    // Find the official unit matching the proposal's organization_unit
    const matchedUnit = OFFICIAL_UNITS.find(
      (u) => u.name === prop.organization_unit
    );

    if (!matchedUnit?.email) {
      details.push(`⏭️ Không tìm thấy unit cho "${prop.organization_unit}"`);
      skipped++;
      continue;
    }

    // Skip if already assigned
    const { data: existing } = await supabase
      .from('event_roles')
      .select('id')
      .eq('event_id', prop.created_event_id)
      .ilike('email', matchedUnit.email)
      .eq('role_type', 'event_admin')
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Insert the unit as event_admin
    const { error } = await supabase.from('event_roles').insert({
      event_id: prop.created_event_id,
      email: matchedUnit.email,
      role_type: 'event_admin',
    });

    if (error) {
      details.push(`❌ Lỗi gán ${matchedUnit.email} cho event ${prop.created_event_id}: ${error.message}`);
    } else {
      inserted++;
      details.push(`✅ Đã gán ${matchedUnit.email} (${matchedUnit.name}) → event ${prop.created_event_id}`);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Backfill hoàn tất: ${inserted} đã gán, ${skipped} bỏ qua`,
    inserted,
    skipped,
    details,
  });
}

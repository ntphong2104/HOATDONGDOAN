import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createClient();

  const { data: eventRatings, error } = await supabase
    .from('unit_ratings')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: eventRatings || [],
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Only the 4 approver tiers can submit official ratings
  const allowedTiers = ['youth_union', 'ctsv', 'facility', 'super_admin'];
  if (!allowedTiers.includes(auth.tier) && !auth.isSuperAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Chỉ các cấp Ban ngành (Đoàn, CTSV, CSVC, Super Admin) mới có quyền đánh giá chất lượng sự kiện.',
    }, { status: 403 });
  }

  const raterTier = auth.isSuperAdmin ? 'super_admin' : auth.tier;

  const body = await req.json();
  const { stars, feedback = '', organization_unit, proposal_id } = body;

  const numStars = Number(stars);
  if (!numStars || numStars < 1 || numStars > 5) {
    return NextResponse.json({ success: false, error: 'Số sao đánh giá phải từ 1 đến 5 sao' }, { status: 400 });
  }

  const supabase = await createClient();

  // Find event and proposal info if not provided
  let orgUnit = organization_unit;
  let propId = proposal_id;

  if (!orgUnit) {
    const { data: prop } = await supabase
      .from('event_proposals')
      .select('id, organization_unit')
      .eq('created_event_id', resolvedParams.id)
      .single();

    if (prop) {
      orgUnit = prop.organization_unit;
      propId = prop.id;
    } else {
      const { data: ev } = await supabase
        .from('events')
        .select('created_by')
        .eq('event_id', resolvedParams.id)
        .single();
      orgUnit = ev?.created_by || 'Đơn vị tổ chức';
    }
  }

  const { data: rating, error: ratingErr } = await supabase
    .from('unit_ratings')
    .upsert(
      {
        event_id: resolvedParams.id,
        proposal_id: propId || null,
        organization_unit: orgUnit,
        rater_email: auth.email,
        rater_tier: raterTier,
        stars: numStars,
        feedback: feedback.trim(),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,rater_tier' }
    )
    .select()
    .single();

  if (ratingErr) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: rating,
    message: `Đã gửi đánh giá ${numStars} sao cho ${orgUnit} thành công!`,
  });
}

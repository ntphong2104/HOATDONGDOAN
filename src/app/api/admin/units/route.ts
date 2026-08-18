import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { OFFICIAL_UNITS, getCustomUnitsFromDb, saveCustomUnitsToDb, type OfficialUnit } from '@/lib/constants/units';

export async function GET() {
  try {
    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const customUnits = await getCustomUnitsFromDb(supabase);

    // Merge official units with custom units (custom units can override or add new)
    const existingCodes = new Set(customUnits.map(u => u.code));
    const baseUnits = OFFICIAL_UNITS.filter(u => !existingCodes.has(u.code));
    const allUnits = [...baseUnits, ...customUnits];

    return NextResponse.json({
      success: true,
      data: allUnits,
    });
  } catch (err) {
    return NextResponse.json({
      success: true,
      data: OFFICIAL_UNITS,
    });
  }
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden', message: 'Chỉ Super Admin mới có quyền thêm đơn vị / LCĐ' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { code, name, type, email } = body;

    if (!code || !name) {
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Mã đơn vị và tên đơn vị không được để trống' }, { status: 400 });
    }

    const cleanCode = String(code).trim().toUpperCase().replace(/\s+/g, '_');
    const cleanName = String(name).trim();
    const cleanType = String(type || 'Liên Chi Đoàn (LCĐ)').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const customUnits = await getCustomUnitsFromDb(supabase);

    const newUnit: OfficialUnit = {
      code: cleanCode,
      name: cleanName,
      type: cleanType,
      email: cleanEmail,
    };

    const updatedCustomUnits = [...customUnits.filter(u => u.code !== cleanCode), newUnit];
    await saveCustomUnitsToDb(supabase, updatedCustomUnits, auth.email);

    return NextResponse.json({
      success: true,
      data: newUnit,
      message: `Đã thêm đơn vị / LCĐ "${cleanName}" thành công!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Internal Error', message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden', message: 'Chỉ Super Admin mới có quyền xóa đơn vị' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Thiếu mã đơn vị cần xóa' }, { status: 400 });
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const customUnits = await getCustomUnitsFromDb(supabase);

    const filtered = customUnits.filter(u => u.code !== code);
    await saveCustomUnitsToDb(supabase, filtered, auth.email);

    return NextResponse.json({
      success: true,
      message: `Đã xóa đơn vị mã "${code}" thành công!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Internal Error', message: err.message }, { status: 500 });
  }
}

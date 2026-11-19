import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { resolveActorLcdScope, resolveDelegateExpiry } from '@/lib/utils/lcd-auth';
import { normalizeLcdCode, resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentByMssv, isPlaceholderClass, isPlaceholderName } from '@/lib/utils/student-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const scope = await resolveActorLcdScope(supabase, auth);
    if (scope.role === 'none') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const requestedLcd = request?.url
      ? normalizeLcdCode(new URL(request.url).searchParams.get('lcd'))
      : null;

    const { data, error } = await supabase
      .from('class_delegates')
      .select('*')
      .order('granted_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
    }

    const now = new Date();
    const filterLcdCode = scope.role === 'lcd' ? scope.lcd?.code : requestedLcd;

    const delegates = (data || [])
      .map((d: any) => {
        const expires = new Date(d.expires_at);
        const isExpired = expires < now;
        const daysLeft = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const lcdDef = resolveStudentLcd(d.class_id, d.mssv);

        return {
          ...d,
          lcd_code: lcdDef?.code || null,
          lcd_name: lcdDef?.shortName || null,
          isExpired,
          daysLeft,
          status: !d.is_active ? 'revoked' : isExpired ? 'expired' : 'active',
        };
      })
      .filter((d: any) => {
        if (!filterLcdCode) return true;
        return d.lcd_code === filterLcdCode;
      });

    return NextResponse.json({ success: true, data: delegates });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const scope = await resolveActorLcdScope(supabase, auth);
    if (scope.role === 'none') {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin, Đoàn Trường hoặc 8 Liên Chi Đoàn mới có quyền cấp quyền BCH Chi Đoàn.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      mssv,
      mssvs,
      role_title,
      notes,
      expires_at,
      duration_days,
    } = body;

    // Support both single `mssv` and bulk `mssvs: string[]`
    const rawMssvList: string[] = Array.isArray(mssvs)
      ? mssvs
      : mssv
      ? [mssv]
      : [];

    const uniqueMssvs = Array.from(
      new Set(
        rawMssvList
          .map((m) => String(m || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (uniqueMssvs.length === 0) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập ít nhất 1 MSSV sinh viên' }, { status: 400 });
    }

    if (uniqueMssvs.length > 200) {
      return NextResponse.json({ success: false, error: 'Tối đa 200 sinh viên trong một lần nạp' }, { status: 400 });
    }

    const now = new Date();
    const expiryDate = resolveDelegateExpiry({
      expires_at,
      duration_days: duration_days ?? (expires_at ? undefined : 365), // Mặc định theo nhiệm kỳ (12 tháng)
    });

    // Fetch existing users and existing delegates for these MSSVs in parallel
    const [{ data: dbStudents }, { data: existingDelegates }] = await Promise.all([
      supabase.from('users').select('mssv, email, full_name, class_id').in('mssv', uniqueMssvs),
      supabase.from('class_delegates').select('*').in('mssv', uniqueMssvs),
    ]);

    const userByMssv = new Map<string, any>();
    for (const s of dbStudents || []) {
      userByMssv.set(String(s.mssv || '').trim().toUpperCase(), s);
    }

    const existingByMssv = new Map<string, any>();
    for (const d of existingDelegates || []) {
      const m = String(d.mssv || '').trim().toUpperCase();
      if (!existingByMssv.has(m)) {
        existingByMssv.set(m, d);
      }
    }

    const added: any[] = [];
    const updated: any[] = [];
    const errors: Array<{ mssv: string; reason: string }> = [];

    for (const cleanMssv of uniqueMssvs) {
      const dbUser = userByMssv.get(cleanMssv);
      const master = getMasterStudentByMssv(cleanMssv);

      const fullName =
        dbUser?.full_name && !isPlaceholderName(dbUser.full_name, cleanMssv)
          ? dbUser.full_name
          : master?.full_name || dbUser?.full_name || null;

      const classId =
        dbUser?.class_id && !isPlaceholderClass(dbUser.class_id)
          ? String(dbUser.class_id).trim().toUpperCase()
          : master?.class_id
          ? String(master.class_id).trim().toUpperCase()
          : null;

      const email =
        dbUser?.email ||
        `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`;

      if (!fullName && !dbUser && !master) {
        errors.push({ mssv: cleanMssv, reason: `Không tìm thấy sinh viên ${cleanMssv} trong dữ liệu Học viện` });
        continue;
      }

      if (!classId || classId === 'CHƯA PHÂN LỚP' || classId === 'PTIT-HCM') {
        errors.push({ mssv: cleanMssv, reason: `Sinh viên ${fullName || cleanMssv} chưa có thông tin Chi đoàn / Lớp` });
        continue;
      }

      // Strict LCĐ ownership guard
      const studentLcd = resolveStudentLcd(classId, cleanMssv);
      if (scope.role === 'lcd' && scope.lcd) {
        if (!studentLcd || studentLcd.code !== scope.lcd.code) {
          errors.push({
            mssv: cleanMssv,
            reason: `Sinh viên ${fullName || cleanMssv} (${classId}) thuộc ${studentLcd ? studentLcd.shortName : 'LCĐ khác'}, không nằm trong phạm vi quản lý của ${scope.lcd.shortName}`,
          });
          continue;
        }
      }

      const finalRoleTitle = role_title ? String(role_title).trim() : 'BCH Chi đoàn';
      const customNote = notes ? String(notes).trim() : '';
      const finalNotes = customNote
        ? `${finalRoleTitle} — ${customNote}`
        : `${finalRoleTitle} lớp ${classId} (theo nhiệm kỳ)`;

      const existing = existingByMssv.get(cleanMssv);

      if (existing) {
        const { data: updatedRow, error: updErr } = await supabase
          .from('class_delegates')
          .update({
            full_name: fullName || existing.full_name,
            class_id: classId,
            email,
            granted_at: now.toISOString(),
            expires_at: expiryDate.toISOString(),
            created_by: auth.email,
            is_active: true,
            notes: finalNotes,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updErr) {
          console.error('POST /api/admin/delegates update error:', updErr);
          const isRls = updErr.code === '42501' || updErr.code === 'PGRST116';
          errors.push({
            mssv: cleanMssv,
            reason: isRls
              ? 'CSDL chưa mở quyền RLS bảng class_delegates cho LCĐ (hãy chạy migration 012_lcd_rls_policies.sql trên Supabase hoặc cấu hình SUPABASE_SERVICE_ROLE_KEY).'
              : 'Không thể cập nhật quyền trong cơ sở dữ liệu',
          });
        } else if (updatedRow) {
          updated.push(updatedRow);
        }
      } else {
        const { data: insertedRow, error: insErr } = await supabase
          .from('class_delegates')
          .insert({
            mssv: cleanMssv,
            email,
            full_name: fullName || cleanMssv,
            class_id: classId,
            granted_at: now.toISOString(),
            expires_at: expiryDate.toISOString(),
            created_by: auth.email,
            is_active: true,
            notes: finalNotes,
          })
          .select()
          .single();

        if (insErr) {
          console.error('POST /api/admin/delegates insert error:', insErr);
          const isRls = insErr.code === '42501' || insErr.code === 'PGRST116';
          errors.push({
            mssv: cleanMssv,
            reason: isRls
              ? 'CSDL chưa mở quyền RLS bảng class_delegates cho LCĐ (hãy chạy migration 012_lcd_rls_policies.sql trên Supabase hoặc cấu hình SUPABASE_SERVICE_ROLE_KEY).'
              : 'Không thể lưu quyền trong cơ sở dữ liệu',
          });
        } else if (insertedRow) {
          added.push(insertedRow);
        }
      }
    }

    const totalSuccess = added.length + updated.length;

    // Single-student mode preserves clean HTTP error status when failed
    if (uniqueMssvs.length === 1 && totalSuccess === 0) {
      const firstErr = errors[0];
      const isForbidden = firstErr?.reason?.includes('phạm vi quản lý');
      const isNotFound = firstErr?.reason?.includes('Không tìm thấy');
      return NextResponse.json(
        { success: false, error: firstErr?.reason || 'Không thể cấp quyền BCH Chi đoàn' },
        { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
      );
    }

    const expiryLabel = expiryDate.toLocaleDateString('vi-VN');
    const summaryMsg =
      uniqueMssvs.length === 1
        ? `Đã cấp quyền BCH Chi đoàn lớp ${(added[0] || updated[0]).class_id} cho ${(added[0] || updated[0]).full_name} (${uniqueMssvs[0]}) đến ${expiryLabel}!`
        : `Đã xử lý xong: thêm mới ${added.length}, gia hạn/cập nhật ${updated.length}${errors.length > 0 ? `, bỏ qua ${errors.length} dòng lỗi` : ''} (hạn nhiệm kỳ đến ${expiryLabel}).`;

    return NextResponse.json({
      success: true,
      message: summaryMsg,
      data: uniqueMssvs.length === 1 ? (added[0] || updated[0]) : { added, updated, errors },
      added_count: added.length,
      updated_count: updated.length,
      error_count: errors.length,
      errors,
    });
  } catch (err: any) {
    console.error('POST /api/admin/delegates error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const scope = await resolveActorLcdScope(supabase, auth);
    if (scope.role === 'none') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, expires_at, duration_days, notes } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID ủy quyền' }, { status: 400 });
    }

    const { data: existing, error: findErr } = await supabase
      .from('class_delegates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy bản ghi BCH Chi đoàn' }, { status: 404 });
    }

    if (scope.role === 'lcd' && scope.lcd) {
      const targetLcd = resolveStudentLcd(existing.class_id, existing.mssv);
      if (!targetLcd || targetLcd.code !== scope.lcd.code) {
        return NextResponse.json(
          { success: false, error: 'Bạn chỉ có quyền gia hạn BCH Chi đoàn thuộc Liên Chi Đoàn của mình.' },
          { status: 403 }
        );
      }
    }

    const newExpiry = resolveDelegateExpiry({
      expires_at,
      duration_days: duration_days ?? (expires_at ? undefined : 365),
    });

    const payload: Record<string, any> = {
      expires_at: newExpiry.toISOString(),
      is_active: true,
    };
    if (notes !== undefined) {
      payload.notes = String(notes).trim();
    }

    const { data: updated, error: updErr } = await supabase
      .from('class_delegates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (updErr || !updated) {
      console.error('PATCH /api/admin/delegates error:', updErr);
      const isRls = !updErr || updErr.code === '42501' || updErr.code === 'PGRST116';
      return NextResponse.json(
        {
          success: false,
          error: isRls
            ? 'CSDL chưa mở quyền RLS bảng class_delegates cho LCĐ (hãy chạy migration 012_lcd_rls_policies.sql trên Supabase hoặc cấu hình SUPABASE_SERVICE_ROLE_KEY).'
            : 'Không thể gia hạn quyền BCH Chi đoàn',
        },
        { status: isRls ? 403 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Đã gia hạn quyền BCH Chi đoàn ${existing.class_id} (${existing.full_name}) đến ${newExpiry.toLocaleDateString('vi-VN')}!`,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const scope = await resolveActorLcdScope(supabase, auth);
    if (scope.role === 'none') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID ủy quyền' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('class_delegates')
      .select('id, class_id, mssv, full_name')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy bản ghi ủy quyền' }, { status: 404 });
    }

    if (scope.role === 'lcd' && scope.lcd) {
      const targetLcd = resolveStudentLcd(existing.class_id, existing.mssv);
      if (!targetLcd || targetLcd.code !== scope.lcd.code) {
        return NextResponse.json(
          { success: false, error: 'Bạn không có quyền thu hồi BCH Chi đoàn thuộc Liên Chi Đoàn khác.' },
          { status: 403 }
        );
      }
    }

    const { data: deleted, error } = await supabase
      .from('class_delegates')
      .delete()
      .eq('id', id)
      .select('id');

    if (error || !deleted || deleted.length === 0) {
      console.error('DELETE /api/admin/delegates error:', error);
      const isRls = !error || error.code === '42501' || error.code === 'PGRST116';
      return NextResponse.json(
        {
          success: false,
          error: isRls
            ? 'CSDL chưa mở quyền RLS bảng class_delegates cho LCĐ (hãy chạy migration 012_lcd_rls_policies.sql trên Supabase hoặc cấu hình SUPABASE_SERVICE_ROLE_KEY).'
            : 'Lỗi hệ thống, vui lòng thử lại',
        },
        { status: isRls ? 403 : 500 }
      );
    }

    return NextResponse.json({ success: true, message: `Đã thu hồi quyền BCH Chi đoàn lớp ${existing.class_id} (${existing.full_name})` });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

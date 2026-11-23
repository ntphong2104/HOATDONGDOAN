import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getMasterStudentByMssv, isPlaceholderClass } from '@/lib/utils/student-profile';
import { chunkArray } from '@/lib/supabase/pagination';
import * as XLSX from 'xlsx';

function normalizeKey(str: string): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền nạp danh sách sinh viên' },
        { status: 403 }
      );
    }

    const rateLimit = checkRateLimit(`upload_users_${auth.email}`, 3, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Chưa chọn file Excel' },
        { status: 400 }
      );
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File vượt quá giới hạn 10MB cho phép' },
        { status: 413 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File Excel không có dữ liệu trang tính' },
        { status: 400 }
      );
    }

    const mssvAliases = ['mssv', 'ma_sv', 'ma_sinh_vien', 'masv', 'student_id', 'so_the_sinh_vien', 'ma_so_sinh_vien', 'ma_so_sv'];
    const nameAliases = ['ho_va_ten', 'ho_ten', 'full_name', 'ten_sinh_vien', 'ten_sv', 'ho_ten_lot_va_ten', 'ho_ten_sinh_vien'];
    const classAliases = ['lop', 'class_id', 'lop_sinh_hoat', 'ma_lop', 'class', 'ten_lop'];
    const emailAliases = ['email', 'mail', 'dia_chi_email', 'thu_dien_tu'];

    const rawRecords: Array<{
      mssv: string;
      email: string;
      full_name: string;
      class_id: string;
    }> = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let totalRowsCounted = 0;

    // Scan through ALL sheets in workbook
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
      if (!rawRows || rawRows.length === 0) continue;

      totalRowsCounted += rawRows.length;

      // Find header row in this sheet
      let headerRowIdx = -1;
      let colMap: { mssv: number; name: number; classId: number; email: number; ho: number; ten: number } = {
        mssv: -1,
        name: -1,
        classId: -1,
        email: -1,
        ho: -1,
        ten: -1,
      };

      for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        let foundMssv = -1;
        let foundName = -1;
        let foundClass = -1;
        let foundEmail = -1;
        let foundHo = -1;
        let foundTen = -1;

        for (let c = 0; c < row.length; c++) {
          const val = normalizeKey(row[c]);
          if (!val) continue;

          // Strict checking to avoid 'email' matching 'ma'
          if (emailAliases.includes(val)) {
            foundEmail = c;
          } else if (mssvAliases.includes(val)) {
            foundMssv = c;
          } else if (nameAliases.includes(val)) {
            foundName = c;
          } else if (classAliases.includes(val)) {
            foundClass = c;
          } else if (val === 'ho' || val === 'ho_lot' || val === 'ho_dem') {
            foundHo = c;
          } else if (val === 'ten') {
            foundTen = c;
          }
        }

        if (foundMssv !== -1 || foundName !== -1 || foundEmail !== -1) {
          headerRowIdx = r;
          colMap = {
            mssv: foundMssv,
            name: foundName,
            classId: foundClass,
            email: foundEmail,
            ho: foundHo,
            ten: foundTen,
          };
          break;
        }
      }

      const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

      for (let i = startRow; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        let mssv = '';
        let email = '';
        let fullName = '';
        let classId = '';

        if (headerRowIdx !== -1) {
          if (colMap.mssv !== -1) mssv = String(row[colMap.mssv] ?? '').trim();
          if (colMap.email !== -1) email = String(row[colMap.email] ?? '').trim();
          if (colMap.name !== -1) fullName = String(row[colMap.name] ?? '').trim();
          if (colMap.classId !== -1) classId = String(row[colMap.classId] ?? '').trim();

          if (!fullName && (colMap.ho !== -1 || colMap.ten !== -1)) {
            const ho = colMap.ho !== -1 ? String(row[colMap.ho] ?? '').trim() : '';
            const ten = colMap.ten !== -1 ? String(row[colMap.ten] ?? '').trim() : '';
            fullName = `${ho} ${ten}`.trim();
          }
        }

        // Fallback: Pattern detection per cell
        if (!mssv || !fullName) {
          for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] ?? '').trim();
            if (!cell) continue;

            if (cell.includes('@') && !email) {
              email = cell;
              const extracted = extractMSSV(cell);
              if (extracted && !mssv) mssv = extracted;
            } else if (/^[A-Z]\d{2}[A-Z]{4}\d{3}$/i.test(cell) && !mssv) {
              mssv = cell.toUpperCase();
            } else if (/^D\d{2}[A-Z0-9\-]+$/i.test(cell) && !classId) {
              classId = cell.toUpperCase();
            } else if (/^[A-ZÀ-Ỹa-zà-ỹ\s]{4,60}$/.test(cell) && !fullName && !['NAM', 'NU', 'NỮ', 'KHÔNG', 'CO'].includes(cell.toUpperCase())) {
              fullName = cell;
            }
          }
        }

        // Clean & Normalize MSSV (strictly remove @domain if any)
        if (mssv) {
          if (mssv.includes('@')) {
            mssv = mssv.split('@')[0];
          }
          mssv = mssv.toUpperCase().replace(/\s+/g, '');
        } else if (email) {
          const extracted = extractMSSV(email);
          if (extracted) mssv = extracted;
        }

        // Normalize Email
        if (email) {
          email = email.toLowerCase().replace(/\s+/g, '');
          if (email.endsWith('@')) {
            email = `${email}student.ptithcm.edu.vn`;
          } else if (!email.includes('@')) {
            email = `${email}@student.ptithcm.edu.vn`;
          }
        } else if (mssv) {
          email = `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;
        }

        // Cho phép file chỉ có 2 cột (MSSV + Mã lớp mới khi chia chuyên ngành năm 4) bằng cách tự điền Họ tên từ Data.xlsx
        if (mssv && !fullName && classId) {
          const master = getMasterStudentByMssv(mssv);
          if (master?.full_name) {
            fullName = master.full_name;
          }
        }

        if (!mssv || (!fullName && !classId)) {
          const hasContent = row.some((c) => String(c ?? '').trim() !== '');
          if (hasContent) {
            errors.push({
              row: i + 1,
              reason: `Thiếu MSSV hoặc Họ tên (MSSV: "${mssv}", Họ tên: "${fullName}")`,
            });
          }
          continue;
        }

        rawRecords.push({
          mssv,
          email: email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          full_name: fullName,
          class_id: classId || 'Chưa phân lớp',
        });
      }
    }

    if (rawRecords.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không tìm thấy dòng sinh viên hợp lệ trong file. Vui lòng kiểm tra lại tiêu đề cột (MSSV, Họ và tên, Lớp, Email).`,
          errors: errors.slice(0, 10),
        },
        { status: 400 }
      );
    }

    // Deduplicate by MSSV
    const uniqueMap = new Map<string, { mssv: string; email: string; full_name: string; class_id: string }>();
    for (const rec of rawRecords) {
      uniqueMap.set(rec.mssv, rec);
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Fetch existing users for these MSSVs so we can:
    // 1. Preserve existing full_name if file only had (MSSV + Mã lớp mới)
    // 2. Detect Year 4 class transfers (old_class_id -> new_class_id) to auto-revoke stale BCH Chi đoàn roles
    const allMssvs = Array.from(uniqueMap.keys());
    const existingUserMap = new Map<string, { full_name?: string | null; class_id?: string | null }>();
    for (let i = 0; i < allMssvs.length; i += 300) {
      const { data: exRows } = await supabase
        .from('users')
        .select('mssv, full_name, class_id')
        .in('mssv', allMssvs.slice(i, i + 300));
      for (const ex of exRows || []) {
        const m = String(ex.mssv || '').trim().toUpperCase();
        if (m) existingUserMap.set(m, ex);
      }
    }

    const changedClassByMssv = new Map<string, { oldClass: string; newClass: string }>();
    const affectedOldClasses = new Set<string>();
    const finalRecords: Array<{ mssv: string; email: string; full_name: string; class_id: string }> = [];

    for (const rec of uniqueMap.values()) {
      const existing = existingUserMap.get(rec.mssv);
      const resolvedName = rec.full_name || String(existing?.full_name || '').trim() || rec.mssv;
      const newClass = String(rec.class_id || '').trim().toUpperCase();
      const oldClass = String(existing?.class_id || '').trim().toUpperCase();

      if (
        oldClass &&
        newClass &&
        oldClass !== newClass &&
        !isPlaceholderClass(oldClass) &&
        !isPlaceholderClass(newClass)
      ) {
        changedClassByMssv.set(rec.mssv, { oldClass, newClass });
        affectedOldClasses.add(oldClass);
      }

      const normalizedRec = {
        ...rec,
        full_name: resolvedName,
        class_id: newClass || 'Chưa phân lớp',
      };
      uniqueMap.set(rec.mssv, normalizedRec);
      finalRecords.push(normalizedRec);
    }

    // Batch upsert in chunks of 500
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < finalRecords.length; i += chunkSize) {
      const chunk = finalRecords.slice(i, i + chunkSize);
      const { error: upsertError } = await supabase
        .from('users')
        .upsert(chunk, { onConflict: 'mssv' });

      if (upsertError) {
        console.error('Upsert error chunk:', upsertError);
        errors.push({ row: i + 1, reason: upsertError.message });
      } else {
        inserted += chunk.length;
      }
    }

    if (inserted === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không thể nạp dữ liệu: ${errors[0].reason}`,
          errors: errors.slice(0, 10),
        },
        { status: 400 }
      );
    }

    // Tự động thu hồi quyền BCH Chi đoàn lớp cũ khi SV chuyển lớp chuyên ngành (năm 4)
    let delegatesRevokedCount = 0;
    if (changedClassByMssv.size > 0) {
      try {
        const changedMssvList = Array.from(changedClassByMssv.keys());
        const oldClassesList = Array.from(affectedOldClasses);

        // 1. Thu hồi BCH nếu chính bạn BCH vừa chuyển sang lớp mới khác với lớp đang được cấp quyền
        const activeDelegatesByMssv: any[] = [];
        for (const mChunk of chunkArray(changedMssvList, 200)) {
          const { data: delChunk } = await supabase
            .from('class_delegates')
            .select('id, mssv, class_id')
            .eq('is_active', true)
            .in('mssv', mChunk);
          if (delChunk) activeDelegatesByMssv.push(...delChunk);
        }

        const revokeIds = new Set<string>();
        for (const d of activeDelegatesByMssv || []) {
          const m = String(d.mssv || '').trim().toUpperCase();
          const change = changedClassByMssv.get(m);
          const delClass = String(d.class_id || '').trim().toUpperCase();
          if (change && delClass && delClass !== change.newClass) {
            revokeIds.add(String(d.id));
          }
        }

        // 2. Nếu lớp cũ không còn sinh viên nào trong bảng users (đã giải thể / chia hết sang lớp mới) -> thu hồi hết BCH lớp cũ đó
        for (const oldCls of oldClassesList) {
          const { count } = await supabase
            .from('users')
            .select('mssv', { count: 'exact', head: true })
            .eq('class_id', oldCls);

          if ((count ?? 0) === 0) {
            const { data: oldClsDelegates } = await supabase
              .from('class_delegates')
              .select('id')
              .eq('is_active', true)
              .eq('class_id', oldCls);
            for (const d of oldClsDelegates || []) {
              revokeIds.add(String(d.id));
            }
          }
        }

        if (revokeIds.size > 0) {
          const idsArr = Array.from(revokeIds);
          let revokedTotal = 0;
          for (const idChunk of chunkArray(idsArr, 200)) {
            const { error: revErr } = await supabase
              .from('class_delegates')
              .update({ is_active: false })
              .in('id', idChunk);
            if (!revErr) revokedTotal += idChunk.length;
          }
          delegatesRevokedCount = revokedTotal;
        }
      } catch (revCatch) {
        console.warn('[upload-users] Auto-revoke stale delegates skipped:', revCatch);
      }
    }

    // Sync updated student names and classes to any matching records in user_penalties
    try {
      const allUploadedMssvs = finalRecords.map((r) => r.mssv.toUpperCase().trim());
      const penalizedStudents: any[] = [];
      for (const mChunk of chunkArray(allUploadedMssvs, 200)) {
        const { data: penChunk } = await supabase
          .from('user_penalties')
          .select('mssv')
          .in('mssv', mChunk);
        if (penChunk) penalizedStudents.push(...penChunk);
      }

      if (penalizedStudents.length > 0) {
        const nowIso = new Date().toISOString();
        for (const pChunk of chunkArray(penalizedStudents, 25)) {
          await Promise.all(
            pChunk.map(async (p) => {
              const rec = uniqueMap.get(String(p.mssv || '').toUpperCase().trim());
              if (!rec) return;
              await supabase
                .from('user_penalties')
                .update({
                  full_name: rec.full_name,
                  class_id: rec.class_id,
                  email: rec.email,
                  updated_at: nowIso,
                })
                .eq('mssv', p.mssv);
            })
          );
        }
      }
    } catch {}

    const classChangeSummary =
      changedClassByMssv.size > 0
        ? ` (${changedClassByMssv.size} SV chuyển sang lớp mới${
            delegatesRevokedCount > 0 ? `, tự động thu hồi ${delegatesRevokedCount} quyền BCH lớp cũ` : ''
          })`
        : '';

    return NextResponse.json({
      success: true,
      message: `Đã nạp thành công ${inserted} sinh viên vào hệ thống!${classChangeSummary}`,
      data: {
        total_rows: totalRowsCounted,
        inserted,
        class_changed_count: changedClassByMssv.size,
        delegates_revoked_count: delegatesRevokedCount,
        skipped: errors.length,
        errors: errors.slice(0, 10),
      },
    });
  } catch (e: any) {
    console.error('Upload users error:', e);
    return NextResponse.json(
      { success: false, error: 'Lỗi hệ thống, vui lòng thử lại' },
      { status: 500 }
    );
  }
}

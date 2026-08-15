import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
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
        } else if (mssv) {
          email = `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;
        }

        if (!mssv || !fullName) {
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
    const finalRecords = Array.from(uniqueMap.values());

    // Batch upsert in chunks of 500
    const supabase = await createClient();
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

    return NextResponse.json({
      success: true,
      message: `Đã nạp thành công ${inserted} sinh viên vào hệ thống!`,
      data: {
        total_rows: totalRowsCounted,
        inserted,
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

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

function loadEnv() {
  for (const name of ['.env.local', '.env', '.env.production']) {
    const p = path.join(process.cwd(), name);
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zpllkynavzeorenclwrc.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment / .env.local');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function isPlaceholderName(name, mssv) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (n.includes('@')) return true;
  if (mssv && n.toUpperCase() === String(mssv).trim().toUpperCase()) return true;
  return false;
}

function isPlaceholderClass(cls) {
  const c = String(cls || '').trim().toUpperCase();
  return !c || c === 'PTIT-HCM';
}

async function fetchAllRows(table, selectCols, orderCol = 'created_at') {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(selectCols)}&order=${orderCol}.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  console.log('=== 1. ĐỌC DỮ LIỆU CHUẨN TỪ data/Data.xlsx ===');
  const excelPath = path.join(process.cwd(), 'data', 'Data.xlsx');
  const excelMap = new Map();
  if (fs.existsSync(excelPath)) {
    const wb = XLSX.readFile(excelPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    for (const r of rows) {
      const mssv = String(r['MSSV'] || r['mssv'] || '').trim().toUpperCase();
      if (!/^[A-Z]\d{2}[A-Z]{2,4}\d{3,4}$/.test(mssv)) continue;
      if (excelMap.has(mssv)) continue; // Giữ dòng đầu tiên chuẩn theo danh sách lớp
      const full_name = String(r['HỌ VÀ TÊN'] || '').normalize('NFC').trim().replace(/\s+/g, ' ');
      const class_id = String(r['Lớp'] || '').trim().toUpperCase().replace(/\s+/g, '');
      if (full_name && class_id && !isPlaceholderClass(class_id)) {
        excelMap.set(mssv, { full_name, class_id });
      }
    }
  }
  console.log(`✅ Đã đọc ${excelMap.size} sinh viên hợp lệ từ data/Data.xlsx`);

  console.log('\n=== 2. KIỂM TRA & BỔ SUNG BẢNG users + event_registrations ===');
  const [dbUsers, dbRegs] = await Promise.all([
    fetchAllRows('users', 'mssv,email,full_name,class_id', 'mssv'),
    fetchAllRows('event_registrations', 'id,event_id,mssv,email,full_name,class_id', 'id'),
  ]);
  console.log(`📊 Tổng dòng hiện tại: users = ${dbUsers.length}, event_registrations = ${dbRegs.length}`);

  // Build best-known directory: Excel -> users (real) -> event_registrations (real)
  const bestDir = new Map();
  for (const [mssv, info] of excelMap.entries()) {
    bestDir.set(mssv, { full_name: info.full_name, class_id: info.class_id });
  }
  for (const u of dbUsers) {
    const mssv = String(u.mssv || '').trim().toUpperCase();
    if (!mssv) continue;
    const cur = bestDir.get(mssv) || { full_name: null, class_id: null };
    if (!cur.full_name && !isPlaceholderName(u.full_name, mssv)) cur.full_name = String(u.full_name).trim();
    if (!cur.class_id && !isPlaceholderClass(u.class_id)) cur.class_id = String(u.class_id).trim().toUpperCase();
    if (cur.full_name || cur.class_id) bestDir.set(mssv, cur);
  }
  for (const r of dbRegs) {
    const mssv = String(r.mssv || '').trim().toUpperCase();
    if (!mssv) continue;
    const cur = bestDir.get(mssv) || { full_name: null, class_id: null };
    if (!cur.full_name && !isPlaceholderName(r.full_name, mssv)) cur.full_name = String(r.full_name).trim();
    if (!cur.class_id && !isPlaceholderClass(r.class_id)) cur.class_id = String(r.class_id).trim().toUpperCase();
    if (cur.full_name || cur.class_id) bestDir.set(mssv, cur);
  }

  const dbUserMap = new Map();
  let placeholderUsersBefore = 0;
  for (const u of dbUsers) {
    const mssv = String(u.mssv || '').trim().toUpperCase();
    dbUserMap.set(mssv, u);
    if (isPlaceholderName(u.full_name, mssv) || isPlaceholderClass(u.class_id)) {
      placeholderUsersBefore++;
    }
  }
  console.log(`🔍 Số sinh viên trong bảng users đang thiếu tên hoặc lớp (placeholder): ${placeholderUsersBefore}`);

  const usersToUpsert = [];
  let healedUsersCount = 0;
  let newUsersCount = 0;

  // 2a. Heal existing users or update from Excel
  for (const [mssv, u] of dbUserMap.entries()) {
    const best = bestDir.get(mssv);
    const excel = excelMap.get(mssv);
    if (!best && !excel) continue;

    const curNamePlaceholder = isPlaceholderName(u.full_name, mssv);
    const curClassPlaceholder = isPlaceholderClass(u.class_id);

    const targetName = excel?.full_name || (curNamePlaceholder && best?.full_name ? best.full_name : u.full_name);
    const targetClass = excel?.class_id || (curClassPlaceholder && best?.class_id ? best.class_id : u.class_id);

    if (targetName !== u.full_name || targetClass !== u.class_id) {
      usersToUpsert.push({
        mssv,
        email: u.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
        full_name: targetName || u.full_name || mssv,
        class_id: targetClass || u.class_id || 'PTIT-HCM',
      });
      if (curNamePlaceholder || curClassPlaceholder) healedUsersCount++;
    }
  }

  // 2b. Add any student from Data.xlsx not yet in users
  for (const [mssv, excel] of excelMap.entries()) {
    if (!dbUserMap.has(mssv)) {
      usersToUpsert.push({
        mssv,
        email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
        full_name: excel.full_name,
        class_id: excel.class_id,
      });
      newUsersCount++;
    }
  }

  console.log(`🚀 Cần cập nhật/thêm vào bảng users: ${usersToUpsert.length} dòng (Khôi phục thiếu tên/lớp: ${healedUsersCount}, Thêm mới từ Data.xlsx: ${newUsersCount})`);

  for (let i = 0; i < usersToUpsert.length; i += 200) {
    const batch = usersToUpsert.slice(i, i + 200);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=mssv`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.warn(`⚠️ Batch upsert users ${i} lỗi, thử từng dòng:`, await res.text());
      for (const row of batch) {
        await fetch(`${SUPABASE_URL}/rest/v1/users?mssv=eq.${encodeURIComponent(row.mssv)}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ full_name: row.full_name, class_id: row.class_id }),
        });
      }
    }
  }

  // 2c. Heal event_registrations rows that have placeholder name/class or differ from bestDir
  const regsToPatch = [];
  for (const r of dbRegs) {
    const mssv = String(r.mssv || '').trim().toUpperCase();
    const best = bestDir.get(mssv);
    if (!best) continue;
    const needName = isPlaceholderName(r.full_name, mssv) && Boolean(best.full_name);
    const needClass = isPlaceholderClass(r.class_id) && Boolean(best.class_id);
    if (needName || needClass) {
      regsToPatch.push({
        id: r.id,
        mssv,
        full_name: needName ? best.full_name : r.full_name,
        class_id: needClass ? best.class_id : r.class_id,
      });
    }
  }

  console.log(`🚀 Đang bổ sung họ tên & lớp cho ${regsToPatch.length} lượt đăng ký sự kiện (event_registrations) bị thiếu...`);
  let patchedRegs = 0;
  for (const item of regsToPatch) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/event_registrations?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ full_name: item.full_name, class_id: item.class_id }),
    });
    if (res.ok) patchedRegs++;
  }
  console.log(`✅ Đã cập nhật thành công ${patchedRegs}/${regsToPatch.length} lượt đăng ký trong event_registrations`);

  console.log('\n=== 3. ĐỒNG BỘ & KHÔI PHỤC SỐ ĐIỆN THOẠI / GIỚI TÍNH (CHỐNG MẤT SĐT) ===');
  const dataDir = path.join(process.cwd(), 'data');
  const profileFile = path.join(dataDir, 'user-profiles.json');
  const regExtraFile = path.join(dataDir, 'registration-extras.json');

  let localProfiles = {};
  if (fs.existsSync(profileFile)) {
    try { localProfiles = JSON.parse(fs.readFileSync(profileFile, 'utf-8')); } catch {}
  }

  let localRegExtras = {};
  if (fs.existsSync(regExtraFile)) {
    try { localRegExtras = JSON.parse(fs.readFileSync(regExtraFile, 'utf-8')); } catch {}
  }

  const dbSettings = await fetchAllRows('system_settings', 'key,value,updated_at', 'key');
  const dbProfileSettings = dbSettings.filter((s) => s.key.startsWith('user_profile_'));
  const dbEventRegSettings = dbSettings.filter((s) => s.key.startsWith('event_regs_'));

  // Unified map by canonical email or mssv
  const phoneByMssv = new Map();
  const recordPhone = (mssvOrEmail, phone, gender) => {
    const cleanPhone = String(phone || '').trim();
    if (cleanPhone.length < 8) return;
    const raw = String(mssvOrEmail || '').trim().toLowerCase();
    if (!raw) return;
    const mssv = (raw.includes('@') ? raw.split('@')[0] : raw).toUpperCase();
    const prev = phoneByMssv.get(mssv);
    phoneByMssv.set(mssv, {
      phone: cleanPhone,
      gender: gender || prev?.gender || 'Nam',
      email: raw.includes('@') ? raw : `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
    });
  };

  // 1) From registration-extras.json
  for (const eventRegs of Object.values(localRegExtras)) {
    if (!eventRegs || typeof eventRegs !== 'object') continue;
    for (const [mssv, ext] of Object.entries(eventRegs)) {
      if (ext?.phone) recordPhone(mssv, ext.phone, ext.gender);
    }
  }

  // 2) From DB event_regs_*
  for (const row of dbEventRegSettings) {
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (parsed && typeof parsed === 'object') {
        for (const [mssv, ext] of Object.entries(parsed)) {
          if (ext?.phone) recordPhone(mssv, ext.phone, ext.gender);
        }
      }
    } catch {}
  }

  // 3) From local user-profiles.json
  for (const [key, val] of Object.entries(localProfiles)) {
    if (val?.phone) recordPhone(key, val.phone, val.gender);
  }

  // 4) From DB user_profile_*
  for (const row of dbProfileSettings) {
    try {
      const email = row.key.replace(/^user_profile_/, '');
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (parsed?.phone) recordPhone(email, parsed.phone, parsed.gender);
    } catch {}
  }

  console.log(`📱 Tổng số sinh viên có SĐT đã thu thập & hợp nhất: ${phoneByMssv.size}`);

  const nowIso = new Date().toISOString();
  const settingsUpsert = [];

  for (const [mssv, info] of phoneByMssv.entries()) {
    const entry = {
      gender: info.gender || 'Nam',
      phone: info.phone,
      updated_at: nowIso,
    };
    const emailLower = info.email.toLowerCase();
    const studentEmail = `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;

    localProfiles[mssv.toLowerCase()] = entry;
    localProfiles[mssv.toUpperCase()] = entry;
    localProfiles[emailLower] = entry;
    localProfiles[emailLower.toUpperCase()] = entry;
    localProfiles[studentEmail] = entry;
    localProfiles[studentEmail.toUpperCase()] = entry;

    settingsUpsert.push({
      key: `user_profile_${emailLower}`,
      value: entry,
      updated_at: nowIso,
    });
    if (studentEmail !== emailLower) {
      settingsUpsert.push({
        key: `user_profile_${studentEmail}`,
        value: entry,
        updated_at: nowIso,
      });
    }
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(profileFile, JSON.stringify(localProfiles, null, 2), 'utf-8');
  console.log(`✅ Đã ghi đồng bộ ${Object.keys(localProfiles).length} khóa vào data/user-profiles.json`);

  // Deduplicate settingsUpsert by key
  const uniqueSettingsMap = new Map();
  for (const s of settingsUpsert) uniqueSettingsMap.set(s.key, s);
  const uniqueSettings = Array.from(uniqueSettingsMap.values());

  let syncedSettings = 0;
  for (let i = 0; i < uniqueSettings.length; i += 200) {
    const batch = uniqueSettings.slice(i, i + 200);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?on_conflict=key`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (res.ok) syncedSettings += batch.length;
    else console.error('❌ Lỗi sync system_settings:', await res.text());
  }
  console.log(`✅ Đã đồng bộ ${syncedSettings}/${uniqueSettings.length} hồ sơ SĐT lên bảng system_settings của Supabase`);

  // Also sync merged event_regs_* between localRegExtras and system_settings
  const eventRegUpserts = [];
  const allEventIds = new Set([
    ...Object.keys(localRegExtras),
    ...dbEventRegSettings.map((r) => r.key.replace(/^event_regs_/, '')),
  ]);
  for (const eventId of allEventIds) {
    const localMap = localRegExtras[eventId] || {};
    const dbRow = dbEventRegSettings.find((r) => r.key === `event_regs_${eventId}`);
    let dbMap = {};
    if (dbRow?.value) {
      try { dbMap = typeof dbRow.value === 'string' ? JSON.parse(dbRow.value) : dbRow.value; } catch {}
    }
    const merged = { ...localMap, ...dbMap };
    for (const [m, lEntry] of Object.entries(localMap)) {
      const dEntry = dbMap[m];
      if (lEntry && dEntry) {
        merged[m] = {
          ...dEntry,
          ...lEntry,
          phone: lEntry.phone || dEntry.phone || phoneByMssv.get(m)?.phone || '',
          gender: lEntry.gender || dEntry.gender || phoneByMssv.get(m)?.gender || 'Nam',
          department_id: lEntry.department_id ?? dEntry.department_id,
          department_name: lEntry.department_name ?? dEntry.department_name,
          review_status: dEntry.review_status || lEntry.review_status,
        };
      }
    }
    localRegExtras[eventId] = merged;
    eventRegUpserts.push({
      key: `event_regs_${eventId}`,
      value: JSON.stringify(merged),
      updated_at: nowIso,
    });
  }
  fs.writeFileSync(regExtraFile, JSON.stringify(localRegExtras, null, 2), 'utf-8');
  if (eventRegUpserts.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?on_conflict=key`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(eventRegUpserts),
    });
    if (res.ok) {
      console.log(`✅ Đã đồng bộ ${eventRegUpserts.length} sự kiện (event_regs_*) giữa file và Supabase system_settings`);
    }
  }

  console.log('\n🎉 HOÀN TẤT ĐỒNG BỘ DỮ LIỆU SINH VIÊN & SĐT!');
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});

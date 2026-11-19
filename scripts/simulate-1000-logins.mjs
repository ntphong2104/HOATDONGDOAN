import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'load-test-jwt-secret-ptithcm-2026';
const TOTAL_USERS = Number(process.env.TOTAL_USERS || 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 200); // 200 simultaneous active connections in flight

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createSignedSupabaseJwt(email, id, secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: 'authenticated',
      exp: nowSec + 3600,
      iat: nowSec,
      sub: id,
      email: email.toLowerCase(),
      role: 'authenticated',
    })
  );
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${header}.${payload}.${signature}`;
}

function load1000Students() {
  const excelPath = path.join(process.cwd(), 'data', 'Data.xlsx');
  const students = [];
  if (fs.existsSync(excelPath)) {
    const wb = XLSX.readFile(excelPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const seen = new Set();
    for (const r of rows) {
      const mssv = String(r['MSSV'] || r['mssv'] || '').trim().toUpperCase();
      if (!mssv || seen.has(mssv)) continue;
      seen.add(mssv);
      students.push({
        mssv,
        email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
        id: crypto.createHash('md5').update(mssv).digest('hex'),
      });
      if (students.length >= TOTAL_USERS) break;
    }
  }
  while (students.length < TOTAL_USERS) {
    const idx = students.length + 1;
    const mssv = `N23DCCN${String(idx).padStart(3, '0')}`;
    students.push({
      mssv,
      email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
      id: crypto.createHash('md5').update(mssv).digest('hex'),
    });
  }
  return students;
}

async function simulateOneStudentLoginFlow(student) {
  const jwt = createSignedSupabaseJwt(student.email, student.id, JWT_SECRET);
  const cookieVal = encodeURIComponent(JSON.stringify({ access_token: jwt }));
  const headers = {
    Cookie: `sb-ptithcm-auth-token=${cookieVal}`,
    Accept: 'application/json, text/html',
  };

  const userStart = Date.now();
  const stepResults = [];

  // Exactly what happens when a student finishes Google login and lands on Student Portal:
  // 1. SSR HomePage (GET /)
  // 2. Client parallel calls: GET /api/me (shared cache across Gate, Header, Dashboard), GET /api/me/class-lookup, GET /api/me/qr-token
  try {
    const ssrStart = Date.now();
    const ssrRes = await fetch(`${BASE_URL}/`, { headers, redirect: 'manual' });
    await ssrRes.text();
    stepResults.push({ endpoint: 'GET / (SSR)', status: ssrRes.status, ms: Date.now() - ssrStart });

    const apiStart = Date.now();
    const [meRes, delegateRes, qrRes] = await Promise.all([
      fetch(`${BASE_URL}/api/me`, { headers }).then(async (r) => {
        await r.text();
        return { endpoint: 'GET /api/me', status: r.status, ms: Date.now() - apiStart };
      }),
      fetch(`${BASE_URL}/api/me/class-lookup`, { headers }).then(async (r) => {
        await r.text();
        return { endpoint: 'GET /api/me/class-lookup', status: r.status, ms: Date.now() - apiStart };
      }),
      fetch(`${BASE_URL}/api/me/qr-token`, { headers }).then(async (r) => {
        await r.text();
        return { endpoint: 'GET /api/me/qr-token', status: r.status, ms: Date.now() - apiStart };
      }),
    ]);

    stepResults.push(meRes, delegateRes, qrRes);
    const allOk = stepResults.every((s) => s.status === 200);
    return {
      ok: allOk,
      totalMs: Date.now() - userStart,
      steps: stepResults,
    };
  } catch (err) {
    return {
      ok: false,
      totalMs: Date.now() - userStart,
      error: err?.message || 'Request failed',
      steps: stepResults,
    };
  }
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p));
  return sortedArr[idx];
}

async function main() {
  const students = load1000Students();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`🚀 GIẢ LẬP ${students.length} SINH VIÊN ĐĂNG NHẬP & VÀO CỔNG SV CÙNG LÚC`);
  console.log(`   Target: ${BASE_URL} | Concurrency: ${CONCURRENCY} luồng song song`);
  console.log(`   Mỗi SV thực hiện: GET / (SSR) + GET /api/me + GET /api/me/class-lookup + GET /api/me/qr-token`);
  console.log(`   Tổng số HTTP Requests: ${students.length * 4} requests`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const startAll = Date.now();
  const userResults = new Array(students.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= students.length) break;
      userResults[idx] = await simulateOneStudentLoginFlow(students[idx]);
      completed++;
      if (completed % 200 === 0 || completed === students.length) {
        const elapsedSec = ((Date.now() - startAll) / 1000).toFixed(1);
        const okSoFar = userResults.filter((r) => r && r.ok).length;
        console.log(`  ⏳ Tiến độ: ${completed}/${students.length} SV hoàn tất (${elapsedSec}s) | Thành công: ${okSoFar}/${completed}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const totalElapsedMs = Date.now() - startAll;
  const successUsers = userResults.filter((r) => r?.ok).length;
  const failedUsers = students.length - successUsers;

  const userTimes = userResults.map((r) => r.totalMs).sort((a, b) => a - b);
  const allSteps = userResults.flatMap((r) => r.steps || []);
  const stepTimes = allSteps.map((s) => s.ms).sort((a, b) => a - b);
  const okSteps = allSteps.filter((s) => s.status === 200).length;

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('📊 KẾT QUẢ KIỂM THỬ TẢI 1.000 SINH VIÊN ĐĂNG NHẬP ĐỒNG THỜI');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`✅ Sinh viên đăng nhập & tải trang thành công : ${successUsers}/${students.length} (${((successUsers / students.length) * 100).toFixed(2)}%)`);
  console.log(`✅ Tổng HTTP Requests thành công (HTTP 200)   : ${okSteps}/${allSteps.length} (${((okSteps / Math.max(1, allSteps.length)) * 100).toFixed(2)}%)`);
  console.log(`❌ Số lỗi (5xx / Timeout / Dropped)           : ${failedUsers}`);
  console.log(`⏱️  Tổng thời gian xử lý 1.000 SV (4.000 req)  : ${(totalElapsedMs / 1000).toFixed(2)} giây`);
  console.log(`⚡ Thông lượng (Throughput)                   : ${Math.round((allSteps.length / totalElapsedMs) * 1000)} req/giây (${Math.round((students.length / totalElapsedMs) * 1000)} SV/giây)`);
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('📈 Độ trễ mỗi HTTP Request:');
  console.log(`   • P50 (Trung vị) : ${percentile(stepTimes, 0.5)} ms`);
  console.log(`   • P90            : ${percentile(stepTimes, 0.9)} ms`);
  console.log(`   • P95            : ${percentile(stepTimes, 0.95)} ms`);
  console.log(`   • P99            : ${percentile(stepTimes, 0.99)} ms`);
  console.log(`   • Max            : ${percentile(stepTimes, 1.0)} ms`);
  console.log('📈 Tổng thời gian trọn vẹn 1 SV (SSR + 3 API):');
  console.log(`   • P50 (Trung vị) : ${percentile(userTimes, 0.5)} ms`);
  console.log(`   • P95            : ${percentile(userTimes, 0.95)} ms`);
  console.log('═══════════════════════════════════════════════════════════════════');

  if (failedUsers > 0) {
    const statusCounts = {};
    for (const s of allSteps) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }
    console.log('Chi tiết mã trạng thái HTTP:', statusCounts);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

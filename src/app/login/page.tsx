'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useGoogleOneTap } from '@/hooks/useGoogleOneTap';
import {
  YouthUnionIcon,
  UserIcon,
  UsersIcon,
  ScanCameraIcon,
  SettingsIcon,
  ShieldCheckIcon,
  CalendarIcon,
  CheckCircleIcon,
  GoogleIcon,
} from '@/components/icons';
import DualLogos from '@/components/DualLogos';
import styles from './login.module.css';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const [oneTapError, setOneTapError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [modalDismissed, setModalDismissed] = useState(false);

  // Activate Google One Tap prompt automatically on page load
  useGoogleOneTap(undefined, (isLoading, err) => {
    setLoading(isLoading);
    if (err) setOneTapError(err);
  });

  const supabase = createClient();

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('Login error', error);
      setLoading(false);
    }
  };

  const handleDemoLogin = async (
    role: 'user' | 'checker' | 'event_admin' | 'youth_union' | 'ctsv' | 'facility' | 'super_admin' | string
  ) => {
    setDemoLoading(role);
    try {
      if (typeof window !== 'undefined') {
        document.cookie = 'demo_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {}
      }

      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success && data.redirectUrl) {
        if (typeof window !== 'undefined') {
          window.location.replace(data.redirectUrl);
        }
      } else {
        alert('Lỗi đăng nhập thử nghiệm');
        setDemoLoading(null);
      }
    } catch (e) {
      console.error(e);
      alert('Không thể kết nối');
      setDemoLoading(null);
    }
  };

  let modalInfo: { title: string; message: string; type: 'warning' | 'error' } | null = null;
  if (!modalDismissed) {
    if (errorParam === 'invalid_domain') {
      modalInfo = {
        title: 'Yêu Cầu Email Học Viện',
        message: 'Vui lòng sử dụng tài khoản Email Học Viện (@ptithcm.edu.vn hoặc @student.ptithcm.edu.vn) để đăng nhập vào hệ thống.',
        type: 'warning',
      };
    } else if (errorParam === 'not_registered') {
      modalInfo = {
        title: 'Tài Khoản Chưa Được Đăng Ký',
        message: 'Tài khoản Email của bạn chưa có trong danh sách sinh viên / ban ngành. Vui lòng liên hệ Đoàn Trường để được hỗ trợ cấp quyền.',
        type: 'error',
      };
    } else if (errorParam === 'auth_failed') {
      modalInfo = {
        title: 'Đăng Nhập Thất Bại',
        message: 'Không thể xác thực tài khoản Google. Vui lòng thử lại hoặc chọn tài khoản khác.',
        type: 'error',
      };
    } else if (oneTapError) {
      modalInfo = {
        title: 'Thông Báo Đăng Nhập',
        message: oneTapError,
        type: 'warning',
      };
    }
  }

  const closeModal = () => {
    setModalDismissed(true);
    setOneTapError(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/login');
    }
  };

  return (
    <div className={styles.container}>
      {/* POPUP MODAL THÔNG BÁO */}
      {modalInfo && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div
              className={styles.modalIconBox}
              style={{
                background: modalInfo.type === 'warning' ? '#fef3c7' : '#fee2e2',
                color: modalInfo.type === 'warning' ? '#d97706' : '#dc2626',
              }}
            >
              {modalInfo.type === 'warning' ? (
                <YouthUnionIcon size={28} color="#d97706" />
              ) : (
                <ShieldCheckIcon size={28} color="#dc2626" />
              )}
            </div>
            <h3 className={styles.modalTitle}>{modalInfo.title}</h3>
            <p className={styles.modalMessage}>{modalInfo.message}</p>
            <button
              type="button"
              className={styles.modalConfirmBtn}
              onClick={closeModal}
              style={{
                background: modalInfo.type === 'warning' ? '#d97706' : '#2563eb',
              }}
            >
              Đã hiểu & Thử lại
            </button>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div
          className={styles.logoArea}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}
        >
          <DualLogos size="lg" />
        </div>
        <h1 className={styles.title}>HOẠT ĐỘNG ĐOÀN</h1>
        <p className={styles.subtitle}>
          Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh
        </p>

        {/* Official Standard Google Sign-In Button */}
        <div>
          <button
            className={styles.googleSignInBtn}
            onClick={handleLogin}
            disabled={loading || !!demoLoading}
            type="button"
          >
            <GoogleIcon size={20} />
            <span>{loading ? 'Đang chuyển hướng Google...' : 'Tiếp tục sử dụng dịch vụ bằng Google'}</span>
          </button>
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerSpan}>HOẶC TEST NHANH VỚI TÀI KHOẢN DEMO</span>
        </div>

        {/* NHÓM 1: CÁC CẤP PHÊ DUYỆT KẾ HOẠCH ĐA TẦNG */}
        <div className={styles.demoSection} style={{ marginBottom: '1.25rem' }}>
          <span className={styles.demoLabel} style={{ color: '#c2410c', fontWeight: 700 }}>
            Tài khoản 4 Cấp Phê Duyệt Kế Hoạch Sự Kiện:
          </span>
          <div className={styles.demoGrid}>
            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('youth_union')}
              disabled={loading || !!demoLoading}
              style={{ background: '#fefce8', borderColor: '#fef08a' }}
            >
              <span className={styles.demoBtnTitle}>
                <YouthUnionIcon size={16} color="#ca8a04" />
                1. Đoàn Học Viện
              </span>
              <span className={styles.demoBtnDesc}>Duyệt Bước 1 (Nội dung)</span>
            </button>

            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('ctsv')}
              disabled={loading || !!demoLoading}
              style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}
            >
              <span className={styles.demoBtnTitle}>
                <UsersIcon size={16} color="#2563eb" />
                2. Phòng CTSV
              </span>
              <span className={styles.demoBtnDesc}>Duyệt Bước 2 (&gt;50 SV)</span>
            </button>

            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('facility')}
              disabled={loading || !!demoLoading}
              style={{ background: '#fdf4ff', borderColor: '#f5d0fe' }}
            >
              <span className={styles.demoBtnTitle}>
                <SettingsIcon size={16} color="#c026d3" />
                3. Phòng CSVC
              </span>
              <span className={styles.demoBtnDesc}>Duyệt Bước 3 (Cấp phòng)</span>
            </button>

            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('super_admin')}
              disabled={loading || !!demoLoading}
              style={{ background: '#fef2f2', borderColor: '#fecaca' }}
            >
              <span className={styles.demoBtnTitle}>
                <ShieldCheckIcon size={16} color="#dc2626" />
                4. Super Admin
              </span>
              <span className={styles.demoBtnDesc}>Duyệt Cuối & Tạo Sự Kiện</span>
            </button>
          </div>
        </div>

        {/* NHÓM 2: 24 ĐƠN VỊ LCĐ & CLB / ĐỘI / NHÓM (ADMIN NHỎ) */}
        <div className={styles.demoSection} style={{ marginBottom: '1.25rem' }}>
          <span className={styles.demoLabel} style={{ color: '#2563eb', fontWeight: 700 }}>
            Tài khoản 24 Đơn vị LCĐ & CLB (Admin Đơn Vị):
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            <select
              id="subAdminSelect"
              defaultValue=""
              style={{
                flex: 1,
                padding: '0.6rem 0.85rem',
                border: '1.5px solid #cbd5e1',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#1e293b',
                background: '#ffffff',
                cursor: 'pointer',
              }}
              onChange={(e) => {
                if (e.target.value) {
                  handleDemoLogin(e.target.value as any);
                }
              }}
            >
              <option value="" disabled>
                -- Chọn Đơn vị LCĐ & CLB để đăng nhập ngay --
              </option>
              <optgroup label="── 8 LIÊN CHI ĐOÀN (LCĐ) ──">
                <option value="lcdcntt">1. LCĐ Khoa Công nghệ Thông tin (lcdcntt@...)</option>
                <option value="lcdcndpt">2. LCĐ Công nghệ Đa phương tiện (lcdcndpt@...)</option>
                <option value="lcdattt">3. LCĐ An toàn Thông tin (lcdattt@...)</option>
                <option value="lcdvt">4. LCĐ Khoa Viễn thông (lcdvt@...)</option>
                <option value="lcddt">5. LCĐ Khoa Điện tử (lcddt@...)</option>
                <option value="lcdqtkd">6. LCĐ Khoa Quản trị Kinh doanh (lcdqtkd@...)</option>
                <option value="lcdmkt">7. LCĐ Marketing (lcdmkt@...)</option>
                <option value="lcdketoan">8. LCĐ Kế toán (lcdketoan@...)</option>
              </optgroup>

              <optgroup label="── 16 CÂU LẠC BỘ / ĐỘI / NHÓM ──">
                <option value="clb.itmc">1. CLB ITMC (clb.itmc@...)</option>
                <option value="clb.antoanthongtin">2. CLB An toàn Thông tin (clb.antoanthongtin@...)</option>
                <option value="clb.tienganh">3. CLB Tiếng Anh (clb.tienganh@...)</option>
                <option value="doivannghe">4. Đội Văn Nghệ (doivannghe@...)</option>
                <option value="clb.guitar">5. CLB Guitar (clb.guitar@...)</option>
                <option value="doisinhvientinhnguyen">6. Đội Sinh Viên Tình Nguyện (doisinhvientinhnguyen@...)</option>
                <option value="clb.ketnoi">7. CLB Kết Nối (clb.ketnoi@...)</option>
                <option value="clb.truyenthongcmc">8. CLB C.MC (clb.truyenthongcmc@...)</option>
                <option value="clb.37dosinhvien">9. CLB 37 Độ Sinh viên (clb.37dosinhvien@...)</option>
                <option value="clb.bma">10. CLB BMA (clb.bma@...)</option>
                <option value="clb.bongchuyen">11. CLB Bóng Chuyền (clb.bongchuyen@...)</option>
                <option value="clbbongda">12. CLB Bóng Đá (clbbongda@...)</option>
                <option value="clb.bongro">13. CLB Bóng Rổ (clb.bongro@...)</option>
                <option value="clb.vovinam">14. CLB VOVINAM (clb.vovinam@...)</option>
                <option value="clb.co">15. CLB Cờ (clb.co@...)</option>
                <option value="clb.caulong">16. CLB Cầu Lông (clb.caulong@...)</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* NHÓM 3: SINH VIÊN & CTV */}
        <div className={styles.demoSection}>
          <div className={styles.demoGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('checker')}
              disabled={loading || !!demoLoading}
            >
              <span className={styles.demoBtnTitle}>
                <ScanCameraIcon size={15} color="#16a34a" />
                CTV Quét Mã
              </span>
              <span className={styles.demoBtnDesc}>Camera Check-in</span>
            </button>

            <button
              type="button"
              className={styles.demoBtn}
              onClick={() => handleDemoLogin('user')}
              disabled={loading || !!demoLoading}
            >
              <span className={styles.demoBtnTitle}>
                <UserIcon size={15} color="#2563eb" />
                Sinh Viên
              </span>
              <span className={styles.demoBtnDesc}>Mã QR Cá Nhân</span>
            </button>
          </div>
        </div>

        {/* Thông tin liên hệ hỗ trợ Đoàn Trường */}
        <div
          style={{
            marginTop: '1.75rem',
            padding: '0.85rem 1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '0.78rem',
            color: '#475569',
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: '#1e3a8a',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '0.75rem',
            }}
          >
            ĐOÀN THANH NIÊN HỌC VIỆN CƠ SỞ TP.HCM
          </div>
          <div style={{ color: '#334155' }}>
            Mọi thắc mắc liên hệ Email:{' '}
            <a
              href="mailto:doantn@ptithcm.edu.vn"
              style={{ color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}
            >
              doantn@ptithcm.edu.vn
            </a>
          </div>
          <div style={{ color: '#64748b', marginTop: '0.15rem', fontSize: '0.76rem' }}>
            Đ/c <strong>Nguyễn Thanh Phong</strong> — Ủy viên Ban Thường vụ Đoàn trường
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.container}>Đang tải...</div>}>
      <LoginContent />
    </Suspense>
  );
}

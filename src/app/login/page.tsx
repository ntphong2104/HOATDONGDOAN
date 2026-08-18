'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useGoogleOneTap } from '@/hooks/useGoogleOneTap';
import {
  YouthUnionIcon,
  ShieldCheckIcon,
  GoogleIcon,
} from '@/components/icons';
import DualLogos from '@/components/DualLogos';
import styles from './login.module.css';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const [oneTapError, setOneTapError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const redirectParam = searchParams.get('redirect') || searchParams.get('next');

  const [modalDismissed, setModalDismissed] = useState(false);

  // Activate Google One Tap prompt automatically on page load
  useGoogleOneTap(undefined, (isLoading, err) => {
    setLoading(isLoading);
    if (err) setOneTapError(err);
  });

  const supabase = createClient();

  const handleLogin = async () => {
    setLoading(true);
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const secureOrigin = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')
      ? currentOrigin
      : currentOrigin.replace(/^http:\/\//, 'https://');

    const callbackUrl =
      redirectParam && redirectParam.startsWith('/')
        ? `${secureOrigin}/auth/callback?next=${encodeURIComponent(redirectParam)}`
        : `${secureOrigin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      setLoading(false);
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
        message: 'Tài khoản Email của bạn chưa có trong danh sách sinh viên / ban ngành. Vui lòng liên hệ Ban Quản Trị để được cấp quyền.',
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

        {/* Official Google Sign-In */}
        <div>
          <button
            className={styles.googleSignInBtn}
            onClick={handleLogin}
            disabled={loading}
            type="button"
          >
            <GoogleIcon size={20} />
            <span>{loading ? 'Đang chuyển hướng Google...' : 'Đăng nhập với Google Email Học Viện'}</span>
          </button>
        </div>

        {/* Thông tin liên hệ hỗ trợ */}
        <div
          style={{
            marginTop: '1.75rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '0.8rem',
            color: '#475569',
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          <span>Mọi thắc mắc hoặc cần cấp quyền, vui lòng liên hệ <strong>BCH Đoàn Thanh niên</strong>: </span>
          <a
            href="mailto:doantn@ptithcm.edu.vn"
            style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}
          >
            doantn@ptithcm.edu.vn
          </a>
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

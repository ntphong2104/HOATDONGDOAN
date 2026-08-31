'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
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

/* ── Particle Network Canvas ── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: { x: number; y: number; vx: number; vy: number; r: number; color: string; opacity: number }[] = [];

    const colors = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#a78bfa'];
    const CONNECT_DIST = 160;
    const MOUSE_DIST = 200;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticles = () => {
      const count = Math.min(Math.floor((canvas.width * canvas.height) / 12000), 100);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2.5 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.4 + 0.5,
      }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Draw connections between particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = 0.25 * (1 - dist / CONNECT_DIST);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw mouse connections - connect to nearby particles
      for (const p of particles) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_DIST) {
          const alpha = 0.4 * (1 - dist / MOUSE_DIST);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.moveTo(mx, my);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();

          // Slightly push particles away from mouse for interactive feel
          p.vx += dx * 0.00015;
          p.vy += dy * 0.00015;
        }
      }

      // Draw mouse dot
      if (mx > 0 && my > 0) {
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.fill();
      }

      // Draw & move particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;

        p.x += p.vx;
        p.y += p.vy;

        // Dampen velocity
        p.vx *= 0.999;
        p.vy *= 0.999;

        // Bounce off edges
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Keep in bounds
        p.x = Math.max(0, Math.min(canvas.width, p.x));
        p.y = Math.max(0, Math.min(canvas.height, p.y));
      }

      animationId = requestAnimationFrame(draw);
    };

    resize();
    createParticles();
    draw();

    const onResize = () => { resize(); createParticles(); };
    window.addEventListener('resize', onResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.particleCanvas} aria-hidden="true" />;
}

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
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    }

    // Auto-redirect if already authenticated
    const checkAlreadyLoggedIn = async () => {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const redirectParam =
              new URLSearchParams(window.location.search).get('redirect') ||
              new URLSearchParams(window.location.search).get('next');
            if (redirectParam && redirectParam.startsWith('/') && redirectParam !== '/login') {
              window.location.href = redirectParam;
            } else if (data.data.tier === 'super_admin' || data.data.isSuperAdmin) {
              window.location.href = '/super-admin';
            } else if (['youth_union', 'ctsv', 'facility'].includes(data.data.tier)) {
              window.location.href = '/admin/proposals';
            } else if (data.data.tier === 'event_admin' || data.data.isEventAdmin) {
              window.location.href = '/admin';
            } else if (data.data.tier === 'security') {
              window.location.href = '/security';
            } else if (data.data.tier === 'checker') {
              window.location.href = '/scanner';
            } else {
              window.location.href = '/';
            }
          }
        }
      } catch {}
    };
    checkAlreadyLoggedIn();
  }, []);

  const handleDemoLogin = async (role: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success) {
        if (role === 'super_admin') window.location.href = '/super-admin';
        else if (role === 'youth_union') window.location.href = '/admin/proposals';
        else if (role === 'event_admin' || role === 'lcdcntt') window.location.href = '/admin';
        else window.location.href = '/';
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
      {/* Particle Network Background */}
      <ParticleCanvas />

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
        <div className={styles.logoArea}>
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
        <div className={styles.helpBox}>
          <span>Mọi thắc mắc hoặc cần cấp quyền, vui lòng liên hệ <strong>BCH Đoàn Thanh niên</strong></span>
          <div className={styles.helpLinks}>
            <a href="https://www.facebook.com/doanthanhnien.ptithcm" target="_blank" rel="noopener noreferrer" className={styles.helpLink}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              <span>Đoàn TN PTIT HCM</span>
            </a>
            <a href="mailto:doanthanhnien@ptithcm.edu.vn" className={styles.helpLink}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <span>doanthanhnien@ptithcm.edu.vn</span>
            </a>
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

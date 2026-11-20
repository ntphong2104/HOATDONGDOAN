'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/components/ToastProvider';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectDeviceType(): 'ios_pwa' | 'android' | 'desktop' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/i.test(ua);
  if (isIos) return 'ios_pwa';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Windows|Linux/i.test(ua)) return 'desktop';
  return 'unknown';
}

export default function PushNotificationButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const checkLocalSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);

    setIsIos(ios);
    setIsStandalone(standalone);

    const canPush =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(canPush);

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    if (canPush) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const existing = await reg.pushManager.getSubscription();
          setSubscribedHere(Boolean(existing));
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    checkLocalSubscription();
  }, [checkLocalSubscription]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const ensurePublicKey = async (): Promise<string | null> => {
    if (publicKey) return publicKey;
    const res = await fetch('/api/push/subscribe', { cache: 'no-store' });
    const json = await res.json();
    if (json.success && json.data?.publicKey) {
      setPublicKey(json.data.publicKey);
      return json.data.publicKey;
    }
    return null;
  };

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Bạn đã từ chối quyền thông báo. Vui lòng bật lại trong Cài đặt thiết bị.');
        return;
      }

      const key = await ensurePublicKey();
      if (!key) {
        toast.error('Hệ thống chưa hoàn tất cấu hình bảng thông báo (chạy migration 015 trên Supabase).');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const appServerKey = urlBase64ToUint8Array(key);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey.buffer as ArrayBuffer,
        });
      }

      const subJson = sub.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          device_type: detectDeviceType(),
        }),
      });
      const saveJson = await saveRes.json();
      if (saveJson.success) {
        setSubscribedHere(true);
        toast.success(saveJson.message || 'Đã bật thông báo đẩy thành công!');
      } else {
        toast.error(saveJson.error || 'Không thể lưu đăng ký thông báo.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Không thể bật thông báo trên trình duyệt này.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let endpoint = '';
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
        }
      }
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setSubscribedHere(false);
      toast.success('Đã tắt thông báo trên thiết bị này.');
    } catch {
      toast.error('Lỗi khi tắt thông báo.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
      } else {
        toast.error(json.error || 'Không gửi được thông báo thử.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          checkLocalSubscription();
        }}
        title={subscribedHere ? 'Thông báo đẩy đang bật' : 'Bật thông báo đẩy'}
        aria-label="Cài đặt thông báo đẩy"
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          background: subscribedHere ? 'rgba(34, 197, 94, 0.22)' : 'rgba(255, 255, 255, 0.12)',
          color: '#ffffff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {subscribedHere && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4ade80',
              border: '1.5px solid #1e3a8a',
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 'min(320px, calc(100vw - 24px))',
            background: '#ffffff',
            color: '#0f172a',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
            padding: '1rem',
            zIndex: 1200,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Thông báo đẩy</strong>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 999,
                background: subscribedHere ? '#dcfce7' : '#f1f5f9',
                color: subscribedHere ? '#15803d' : '#64748b',
              }}
            >
              {subscribedHere ? 'Đang bật' : 'Đang tắt'}
            </span>
          </div>

          {isIos && !isStandalone ? (
            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem' }}>
                Để nhận thông báo trên <strong>iPhone / iPad</strong>, Apple yêu cầu mở ứng dụng từ Màn hình chính:
              </p>
              <ol style={{ margin: 0, paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>
                  Bấm nút <strong>Chia sẻ (Share)</strong> ở Safari → chọn <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Mở biểu tượng <strong>Hoạt Động Đoàn</strong> ngoài Màn hình chính rồi bấm lại chuông này để bật thông báo!
                </li>
              </ol>
            </div>
          ) : !supported ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
              Trình duyệt hiện tại chưa hỗ trợ Web Push. Hãy mở bằng <strong>Chrome</strong> (Android / Máy tính) hoặc cài ra <strong>Màn hình chính</strong> (iPhone iOS 16.4+).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
                Nhận thông báo ngay khi có sự kiện mới, kết quả duyệt CTV, phê duyệt kế hoạch hoặc đơn mượn dụng cụ VPĐ.
              </p>

              {permission === 'denied' && (
                <div style={{ fontSize: '0.78rem', color: '#b91c1c', background: '#fef2f2', padding: '0.5rem 0.65rem', borderRadius: 8 }}>
                  Quyền thông báo đang bị chặn trên trình duyệt. Hãy bật lại trong Cài đặt ứng dụng / trình duyệt.
                </div>
              )}

              {subscribedHere ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    disabled={testing}
                    onClick={handleSendTest}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.7rem',
                      borderRadius: 9,
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {testing ? 'Đang gửi...' : 'Gửi thử thông báo'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDisable}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: 9,
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Tắt
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleEnable}
                  style={{
                    width: '100%',
                    padding: '0.58rem 0.85rem',
                    borderRadius: 9,
                    border: 'none',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busy ? 'Đang kích hoạt...' : 'Bật thông báo trên thiết bị này'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

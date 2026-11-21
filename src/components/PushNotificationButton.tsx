'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import styles from './PushNotificationButton.module.css';

interface InboxNotification {
  id: string;
  title: string;
  body: string;
  url: string | null;
  target_type: string;
  created_at: string;
  is_read: boolean;
}

function formatRelativeTimeVN(iso: string): string {
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

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

const CLIENT_INBOX_TTL_MS = 60_000;
let clientInboxCache: { notifications: InboxNotification[]; unreadCount: number; ts: number } | null = null;

export default function PushNotificationButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState<InboxNotification[]>(
    () => clientInboxCache?.notifications || []
  );
  const [unreadCount, setUnreadCount] = useState<number>(
    () => clientInboxCache?.unreadCount || 0
  );
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePopoverPosition = useCallback(() => {
    if (typeof window === 'undefined' || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    if (window.innerWidth <= 640) {
      setPopoverStyle({
        position: 'fixed',
        top: Math.max(60, rect.bottom + 8),
        left: 12,
        right: 12,
        width: 'auto',
      });
    } else {
      const rightOffset = Math.max(12, window.innerWidth - rect.right);
      setPopoverStyle({
        position: 'fixed',
        top: rect.bottom + 10,
        right: rightOffset,
        left: 'auto',
        width: 'min(370px, calc(100vw - 24px))',
      });
    }
  }, []);

  const loadInbox = useCallback(async (force = false) => {
    if (!force && clientInboxCache && Date.now() - clientInboxCache.ts < CLIENT_INBOX_TTL_MS) {
      setNotifications(clientInboxCache.notifications);
      setUnreadCount(clientInboxCache.unreadCount);
      return;
    }
    try {
      setLoadingInbox(true);
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        const list = Array.isArray(json.data.notifications) ? json.data.notifications : [];
        const count = Number(json.data.unread_count) || 0;
        clientInboxCache = { notifications: list, unreadCount: count, ts: Date.now() };
        setNotifications(list);
        setUnreadCount(count);
      }
    } catch {
      // ignore silently
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadInbox();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadInbox]);

  // Sync PWA Home Screen red badge (iOS 16.4+ PWA, Android, Desktop) with unread count
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unreadCount > 0) {
      if (typeof nav.setAppBadge === 'function') {
        nav.setAppBadge(unreadCount).catch(() => {});
      }
    } else if (typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  }, [unreadCount]);

  const handleMarkRead = async (item: InboxNotification) => {
    if (!item.is_read) {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n));
        const nextCount = next.filter((n) => !n.is_read).length;
        clientInboxCache = { notifications: next, unreadCount: nextCount, ts: Date.now() };
        setUnreadCount(nextCount);
        return next;
      });
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => {});
    }
    if (item.url && item.url.startsWith('/')) {
      setOpen(false);
      router.push(item.url);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true }));
      clientInboxCache = { notifications: next, unreadCount: 0, ts: Date.now() };
      return next;
    });
    setUnreadCount(0);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch {
      // ignore
    }
  };

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
    updatePopoverPosition();
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrap = wrapRef.current && wrapRef.current.contains(target);
      const inPopover = popoverRef.current && popoverRef.current.contains(target);
      if (!inWrap && !inPopover) {
        setOpen(false);
      }
    };
    window.addEventListener('resize', updatePopoverPosition);
    document.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open, updatePopoverPosition]);

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

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            checkLocalSubscription();
            loadInbox(true);
          }
        }}
        title={subscribedHere ? 'Thông báo đẩy đang bật' : 'Bật thông báo đẩy'}
        aria-label="Cài đặt thông báo đẩy"
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          background: 'rgba(255, 255, 255, 0.12)',
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
        {unreadCount > 0 && (
          <span className={styles.bellBadge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={popoverStyle}>
          {/* 1. In-App Notification Inbox Header */}
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>
              <span>Thông báo</span>
              {unreadCount > 0 && (
                <span className={styles.unreadPill}>{unreadCount} mới</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>

          {/* 2. Recent Notifications List */}
          <div className={styles.notifList}>
            {loadingInbox && notifications.length === 0 ? (
              <div className={styles.emptyInbox}>Đang tải thông báo...</div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyInbox}>
                Chưa có thông báo mới nào gần đây.
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.notifItem} ${!item.is_read ? styles.notifItemUnread : ''}`}
                  onClick={() => handleMarkRead(item)}
                >
                  <span className={!item.is_read ? styles.unreadDot : styles.readDot} />
                  <div className={styles.notifContent}>
                    <span className={styles.notifTitle}>{item.title}</span>
                    {item.body && <span className={styles.notifBody}>{item.body}</span>}
                    <span className={styles.notifTime}>
                      {formatRelativeTimeVN(item.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 3. Compact Web Push Toggle Footer */}
          <div className={styles.pushFooter}>
            <div className={styles.pushFooterRow}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                Thông báo đẩy thiết bị
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: subscribedHere ? '#dcfce7' : '#e2e8f0',
                  color: subscribedHere ? '#15803d' : '#475569',
                }}
              >
                {subscribedHere ? 'Đang bật' : 'Đang tắt'}
              </span>
            </div>

            {isIos && !isStandalone ? (
              <div style={{ fontSize: '0.74rem', color: '#475569', lineHeight: 1.4 }}>
                Trên iPhone/iPad: bấm <strong>Chia sẻ → Add to Home Screen</strong> rồi mở app ngoài Màn hình chính để bật thông báo đẩy.
              </div>
            ) : !supported ? (
              <div style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4 }}>
                Trình duyệt chưa hỗ trợ đẩy nền — bạn vẫn xem đầy đủ thông báo ở danh sách phía trên.
              </div>
            ) : permission === 'denied' ? (
              <div style={{ fontSize: '0.73rem', color: '#b91c1c', background: '#fef2f2', padding: '0.4rem 0.55rem', borderRadius: 8 }}>
                Trình duyệt đang chặn quyền thông báo đẩy. Hãy bật lại trong Cài đặt trang web nếu muốn nhận pop-up nền.
              </div>
            ) : subscribedHere ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleDisable}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Đang tắt...' : 'Tắt thông báo đẩy trên thiết bị này'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleEnable}
                style={{
                  width: '100%',
                  padding: '0.48rem 0.75rem',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1d4ed8',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {busy ? 'Đang kích hoạt...' : 'Bật thông báo đẩy trên thiết bị này'}
              </button>
            )}
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}

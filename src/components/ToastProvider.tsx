'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalToastHandler: ((message: string, type?: ToastType) => void) | null = null;

/**
 * Standalone helper to trigger a toast from anywhere without hook
 */
export function showAppToast(message: string, type: ToastType = 'info') {
  if (globalToastHandler) {
    globalToastHandler(message, type);
  } else if (typeof window !== 'undefined') {
    // Fallback if provider not mounted yet
    const rawAlert = (window as any).__originalAlert || window.alert;
    if (typeof rawAlert === 'function') rawAlert(message);
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (!message || typeof message !== 'string') return;
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newToast: ToastItem = { id, message, type };

    setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep max 5 toasts

    // Auto dismiss after 3.8s
    setTimeout(() => {
      removeToast(id);
    }, 3800);
  }, [removeToast]);

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const error = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);

  useEffect(() => {
    globalToastHandler = showToast;

    // Polyfill window.alert to automatically use our top-left toast
    if (typeof window !== 'undefined') {
      if (!(window as any).__originalAlert) {
        (window as any).__originalAlert = window.alert;
      }
      window.alert = (msg: any) => {
        const str = String(msg || '');
        // Determine type based on message keywords
        const lower = str.toLowerCase();
        let detectedType: ToastType = 'info';
        if (
          lower.includes('thành công') ||
          lower.includes('đã xóa') ||
          lower.includes('đã duyệt') ||
          lower.includes('đã cấp') ||
          lower.includes('đã cập nhật') ||
          lower.includes('chúc mừng') ||
          lower.includes('đã mở')
        ) {
          detectedType = 'success';
        } else if (
          lower.includes('lỗi') ||
          lower.includes('thất bại') ||
          lower.includes('từ chối') ||
          lower.includes('không thể') ||
          lower.includes('bảo vệ bất biến') ||
          lower.includes('bị khóa')
        ) {
          detectedType = 'error';
        } else if (lower.includes('cảnh báo') || lower.includes('chờ') || lower.includes('hết hạn')) {
          detectedType = 'warning';
        }

        showToast(str, detectedType);
      };
    }

    return () => {
      globalToastHandler = null;
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}

      {/* Top-Left Floating Toast Container */}
      <div className={styles.toastContainer} aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          const typeClass =
            toast.type === 'success'
              ? styles.toastSuccess
              : toast.type === 'error'
              ? styles.toastError
              : toast.type === 'warning'
              ? styles.toastWarning
              : styles.toastInfo;

          const iconClass =
            toast.type === 'success'
              ? styles.iconBoxSuccess
              : toast.type === 'error'
              ? styles.iconBoxError
              : toast.type === 'warning'
              ? styles.iconBoxWarning
              : styles.iconBoxInfo;

          const iconChar =
            toast.type === 'success'
              ? '✓'
              : toast.type === 'error'
              ? '✕'
              : toast.type === 'warning'
              ? '⚠'
              : 'ℹ';

          return (
            <div key={toast.id} className={`${styles.toastItem} ${typeClass}`}>
              <div className={`${styles.iconBox} ${iconClass}`}>{iconChar}</div>
              <div className={styles.messageContent}>{toast.message}</div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => removeToast(toast.id)}
                aria-label="Đóng thông báo"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: showAppToast,
      success: (msg: string) => showAppToast(msg, 'success'),
      error: (msg: string) => showAppToast(msg, 'error'),
      warning: (msg: string) => showAppToast(msg, 'warning'),
      info: (msg: string) => showAppToast(msg, 'info'),
    };
  }
  return ctx;
}

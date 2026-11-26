'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { MoonIcon, SunIcon, MonitorIcon } from '@/components/icons';
import styles from './ThemeToggleButton.module.css';

export type AppTheme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'hdd_theme';
const THEME_EVENT = 'hdd-theme-change';

interface ThemeChangeDetail {
  preference: ThemePreference;
  resolved: AppTheme;
}

export function resolveSystemTheme(): AppTheme {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function resolveAppTheme(pref: ThemePreference): AppTheme {
  return pref === 'system' ? resolveSystemTheme() : pref;
}

function applyResolvedDomTheme(pref: ThemePreference, resolved: AppTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme-pref', pref);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#050608' : '#1e3a8a');
  }
}

export function applyAppTheme(pref: ThemePreference) {
  const resolved = resolveAppTheme(pref);
  applyResolvedDomTheme(pref, resolved);
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ThemeChangeDetail>(THEME_EVENT, {
        detail: { preference: pref, resolved },
      })
    );
  }
}

export function getCurrentThemePreference(): ThemePreference {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        return stored;
      }
    } catch {}
  }
  if (typeof document !== 'undefined') {
    const prefAttr = document.documentElement.getAttribute('data-theme-pref');
    if (prefAttr === 'dark' || prefAttr === 'light' || prefAttr === 'system') {
      return prefAttr;
    }
  }
  return 'system';
}

export function getCurrentAppTheme(): AppTheme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
  }
  return resolveAppTheme(getCurrentThemePreference());
}

interface ThemeToggleButtonProps {
  variant?: 'header' | 'floating' | 'segmented';
  className?: string;
}

const THEME_OPTIONS: { value: ThemePreference; label: string; shortLabel: string }[] = [
  { value: 'light', label: 'Sáng', shortLabel: 'Sáng' },
  { value: 'dark', label: 'Tối (Obsidian)', shortLabel: 'Tối' },
  { value: 'system', label: 'Theo hệ thống', shortLabel: 'Hệ thống' },
];

export default function ThemeToggleButton({
  variant = 'header',
  className = '',
}: ThemeToggleButtonProps) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<AppTheme>('light');

  useEffect(() => {
    const sync = () => {
      const pref = getCurrentThemePreference();
      const resolved = resolveAppTheme(pref);
      setPreference(pref);
      setResolvedTheme(resolved);
      applyResolvedDomTheme(pref, resolved);
    };
    sync();

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ThemeChangeDetail | AppTheme>).detail;
      if (detail && typeof detail === 'object' && 'preference' in detail) {
        setPreference(detail.preference);
        setResolvedTheme(detail.resolved);
      } else {
        sync();
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const nextPref: ThemePreference =
          e.newValue === 'dark' || e.newValue === 'light' || e.newValue === 'system'
            ? e.newValue
            : 'system';
        const resolved = resolveAppTheme(nextPref);
        applyResolvedDomTheme(nextPref, resolved);
        setPreference(nextPref);
        setResolvedTheme(resolved);
      }
    };

    const mql =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const onSystemChange = () => {
      const currentPref = getCurrentThemePreference();
      if (currentPref === 'system') {
        const nextResolved = resolveSystemTheme();
        applyResolvedDomTheme('system', nextResolved);
        setPreference('system');
        setResolvedTheme(nextResolved);
      }
    };

    window.addEventListener(THEME_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onSystemChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onSystemChange);
      }
    }

    return () => {
      window.removeEventListener(THEME_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', onSystemChange);
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(onSystemChange);
        }
      }
    };
  }, []);

  const handleSelect = useCallback((nextPref: ThemePreference) => {
    const resolved = resolveAppTheme(nextPref);
    setPreference(nextPref);
    setResolvedTheme(resolved);
    applyAppTheme(nextPref);
  }, []);

  const handleQuickToggle = useCallback(() => {
    const currentResolved = getCurrentAppTheme();
    const nextResolved: AppTheme = currentResolved === 'dark' ? 'light' : 'dark';
    const nextPref: ThemePreference =
      nextResolved === resolveSystemTheme() ? 'system' : nextResolved;
    setPreference(nextPref);
    setResolvedTheme(nextResolved);
    applyAppTheme(nextPref);
  }, []);

  if (variant === 'segmented') {
    return (
      <div className={`${styles.segmentedRow} ${className}`.trim()}>
        <span className={styles.segmentedLabel}>Giao diện</span>
        <div className={styles.segmentedTrack} role="radiogroup" aria-label="Chế độ giao diện">
          {THEME_OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => handleSelect(opt.value)}
                className={`${styles.segmentedBtn} ${active ? styles.segmentedBtnActive : ''}`}
                title={opt.label}
              >
                {opt.value === 'light' && <SunIcon size={13} />}
                {opt.value === 'dark' && <MoonIcon size={13} />}
                {opt.value === 'system' && <MonitorIcon size={13} />}
                <span>{opt.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const nextLabel = resolvedTheme === 'dark' ? 'Sáng' : 'Tối';
  const currentModeText =
    preference === 'system'
      ? `Theo hệ thống (${resolvedTheme === 'dark' ? 'Tối' : 'Sáng'})`
      : resolvedTheme === 'dark'
      ? 'Tối'
      : 'Sáng';
  const triggerLabel = `Giao diện: ${currentModeText} — Bấm để chuyển sang ${nextLabel}`;

  return (
    <div
      className={`${styles.wrapper} ${variant === 'floating' ? styles.floatingWrapper : ''} ${className}`.trim()}
    >
      <button
        type="button"
        onClick={handleQuickToggle}
        className={`${styles.toggleBtn} ${variant === 'floating' ? styles.floatingSurface : ''}`.trim()}
        title={triggerLabel}
        aria-label={triggerLabel}
      >
        {resolvedTheme === 'dark' ? (
          <MoonIcon size={17} color="#93c5fd" />
        ) : (
          <SunIcon size={18} color={variant === 'floating' ? '#d97706' : '#fde047'} />
        )}
      </button>
    </div>
  );
}

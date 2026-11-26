import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggleButton from '@/components/ThemeToggleButton';

describe('ThemeToggleButton (Light / Dark / System)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-pref');
    document.head.innerHTML = '<meta name="theme-color" content="#1e3a8a" />';
  });

  it('defaults to system mode and toggles Light <-> Dark directly on single click without dropdown', async () => {
    const user = userEvent.setup();
    render(<ThemeToggleButton />);

    expect(document.documentElement.getAttribute('data-theme-pref')).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Click once -> switches directly to Dark (no dropdown menu)
    const trigger = screen.getByRole('button', { name: /Giao diện: Theo hệ thống/i });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-pref')).toBe('dark');
    expect(localStorage.getItem('hdd_theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#050608');

    // Click again -> switches back to Light (matches OS default -> restores 'system' preference)
    await user.click(screen.getByRole('button', { name: /Giao diện: Tối/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme-pref')).toBe('system');
    expect(localStorage.getItem('hdd_theme')).toBe('system');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#1e3a8a');
  });

  it('tracks live OS prefers-color-scheme changes automatically when in System mode', () => {
    const origMatchMedia = window.matchMedia;
    let isSystemDark = true;
    const listeners = new Set<() => void>();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        get matches() {
          return query === '(prefers-color-scheme: dark)' ? isSystemDark : false;
        },
        media: query,
        onchange: null,
        addListener: (cb: () => void) => listeners.add(cb),
        removeListener: (cb: () => void) => listeners.delete(cb),
        addEventListener: (_evt: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_evt: string, cb: () => void) => listeners.delete(cb),
        dispatchEvent: jest.fn(),
      })),
    });

    try {
      render(<ThemeToggleButton variant="floating" />);
      expect(document.documentElement.getAttribute('data-theme-pref')).toBe('system');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      act(() => {
        isSystemDark = false;
        listeners.forEach((cb) => cb());
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#1e3a8a');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: origMatchMedia,
      });
    }
  });

  it('renders 3-pill segmented switcher inside account menu and switches cleanly', async () => {
    const user = userEvent.setup();
    render(<ThemeToggleButton variant="segmented" />);

    const darkRadio = screen.getByRole('radio', { name: /Tối/i });
    const systemRadio = screen.getByRole('radio', { name: /Hệ thống/i });
    expect(systemRadio).toHaveAttribute('aria-checked', 'true');

    await user.click(darkRadio);
    expect(darkRadio).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('hdd_theme')).toBe('dark');
  });
});

import { detectInAppBrowser } from '@/lib/utils/detect-browser';

describe('Unit Tests: detectInAppBrowser', () => {
  const setUserAgent = (ua: string) => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: ua,
      configurable: true,
      writable: true,
    });
  };

  test('detects Zalo in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) Mobile/15E148 Zalo/23.05.01');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Zalo');
  });

  test('detects Facebook in-app browser (FBAN/FBAV)', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/340.0.0.29.117;]');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Facebook');
  });

  test('detects Messenger in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Messenger/380.0.0.12.110 Mobile/15E148');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Messenger');
  });

  test('detects Instagram in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 Instagram 231.0.0.17.112');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Instagram');
  });

  test('detects TikTok in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) Mobile/15E148 musical_ly_20.8.0');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('TikTok');
  });

  test('detects WeChat in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) MicroMessenger/8.0.2 Mobile/15E148');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('WeChat');
  });

  test('detects Line in-app browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Line/11.11.0 Mobile/15E148');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Line');
  });

  test('detects generic iOS UIWebView without Safari keyword', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile/15E148');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(true);
    expect(result.browserName).toBe('Trình duyệt ẩn');
  });

  test('returns false for standard Mobile Safari', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(false);
    expect(result.browserName).toBeNull();
  });

  test('returns false for standard Mobile Chrome on Android', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36');
    const result = detectInAppBrowser();
    expect(result.isInApp).toBe(false);
    expect(result.browserName).toBeNull();
  });
});

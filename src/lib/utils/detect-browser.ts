// Detect in-app browsers that block camera access
export interface InAppBrowserInfo {
  isInApp: boolean;
  browserName: string | null;
}

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof window === 'undefined') {
    return { isInApp: false, browserName: null };
  }

  const ua = navigator.userAgent || '';

  if (/Zalo/i.test(ua)) return { isInApp: true, browserName: 'Zalo' };
  if (/MicroMessenger/i.test(ua)) return { isInApp: true, browserName: 'WeChat' };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { isInApp: true, browserName: 'Facebook' };
  if (/Messenger/i.test(ua)) return { isInApp: true, browserName: 'Messenger' };
  if (/Instagram/i.test(ua)) return { isInApp: true, browserName: 'Instagram' };
  if (/musical_ly|ByteLocale|BytedanceWebview/i.test(ua)) return { isInApp: true, browserName: 'TikTok' };
  if (/Line\//i.test(ua)) return { isInApp: true, browserName: 'Line' };

  // Generic WebView check
  const isGenericWebView =
    /(wv|WebView)/i.test(ua) ||
    (/iPhone|iPod|iPad/i.test(ua) && !/Safari/i.test(ua));
  if (isGenericWebView) return { isInApp: true, browserName: 'Trình duyệt ẩn' };

  return { isInApp: false, browserName: null };
}

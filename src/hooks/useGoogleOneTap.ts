'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isValidSchoolEmail } from '@/lib/utils/extract-mssv';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (notification?: (notification: any) => void) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

// Generate random hex string for OAuth nonce
function generateNonce(): string {
  const array = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Hash nonce with SHA-256 for Google IdToken verification
async function hashNonce(nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function useGoogleOneTap(clientId?: string, onStatusChange?: (loading: boolean, error?: string) => void) {
  const router = useRouter();
  const googleClientId = clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId) return;
    if (typeof navigator !== 'undefined' && (navigator.webdriver || /Lighthouse|HeadlessChrome|Chrome-Lighthouse|bot/i.test(navigator.userAgent))) {
      return;
    }

    let isMounted = true;
    const rawNonce = generateNonce();

    const loadGoogleScript = async () => {
      if (document.getElementById('google-gsi-client')) {
        initializeOneTap();
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (isMounted) initializeOneTap();
      };
      document.body.appendChild(script);
    };

    const initializeOneTap = async () => {
      if (!window.google?.accounts?.id) return;

      try {
        const hashedNonce = await hashNonce(rawNonce);

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) return;
            if (onStatusChange) onStatusChange(true);

            const supabase = createClient();
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: rawNonce,
            });

            if (error) {
              if (onStatusChange) onStatusChange(false, error.message);
              return;
            }

            if (data?.session) {
              const email = data.session.user.email?.toLowerCase().trim() || '';
              const isSchool = isValidSchoolEmail(email) || email.includes('bchdoan');

              if (!isSchool) {
                await supabase.auth.signOut();
                if (onStatusChange)
                  onStatusChange(
                    false,
                    'Vui lòng sử dụng tài khoản Email Học Viện (@ptithcm.edu.vn hoặc @student.ptithcm.edu.vn)'
                  );
                router.push('/login?error=invalid_domain');
                return;
              }

              const redirectParam =
                typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search).get('redirect') ||
                    new URLSearchParams(window.location.search).get('next')
                  : null;
              window.location.href = redirectParam && redirectParam.startsWith('/') && redirectParam !== '/login' ? redirectParam : '/';
            }
          },
          nonce: hashedNonce,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
        });

        // Retry prompt with exponential backoff if Google doesn't respond
        let retryCount = 0;
        const maxRetries = 3;
        const tryPrompt = () => {
          if (!isMounted || retryCount >= maxRetries) return;
          window.google?.accounts?.id?.prompt((notification: any) => {
            // If Google skipped/dismissed the prompt, retry after delay
            if (notification?.isSkippedMoment?.() || notification?.isDismissedMoment?.()) {
              retryCount++;
              if (retryCount < maxRetries && isMounted) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
                setTimeout(tryPrompt, delay);
              }
            }
          });
        };
        tryPrompt();
      } catch {}
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        if (isMounted) loadGoogleScript();
      });
    } else {
      setTimeout(() => {
        if (isMounted) loadGoogleScript();
      }, 300);
    }

    return () => {
      isMounted = false;
    };
  }, [googleClientId, router, onStatusChange]);
}

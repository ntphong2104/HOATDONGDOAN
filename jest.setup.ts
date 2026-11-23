import '@testing-library/jest-dom';

// Test environment defaults for guarded runtime features & secrets
process.env.ENABLE_DEMO_MODE = process.env.ENABLE_DEMO_MODE || 'true';
process.env.PERSONAL_QR_SECRET = process.env.PERSONAL_QR_SECRET || 'jest-personal-qr-secret-key';
process.env.DYNAMIC_QR_SECRET = process.env.DYNAMIC_QR_SECRET || 'jest-dynamic-qr-secret-key';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'jest-cron-secret-key';
process.env.NEXT_PUBLIC_SCHOOL_DOMAIN = process.env.NEXT_PUBLIC_SCHOOL_DOMAIN || 'student.ptithcm.edu.vn';

// Attach Fetch API and matchMedia to window in JSDOM
if (typeof window !== 'undefined') {
  (window as any).Headers = (global as any).Headers;
  (window as any).Request = (global as any).Request;
  (window as any).Response = (global as any).Response;

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }
}

// Polyfill Next.js next/navigation for Jest
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

// Polyfill Next.js next/server for unit/whitebox API tests in Jest environment
jest.mock('next/server', () => {
  return {
    NextResponse: (global as any).Response,
    NextRequest: (global as any).Request,
  };
});

// Polyfill Web Audio API AudioContext for Jest
class MockAudioContext {
  state: string = 'suspended';
  currentTime: number = 0;
  destination: any = {};

  resume = jest.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  createOscillator = jest.fn().mockImplementation(() => ({
    type: 'sine',
    connect: jest.fn(),
    frequency: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
    start: jest.fn(),
    stop: jest.fn(),
  }));

  createGain = jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    },
  }));
}

(global as any).AudioContext = MockAudioContext;
if (typeof window !== 'undefined') {
  (window as any).AudioContext = MockAudioContext;
}

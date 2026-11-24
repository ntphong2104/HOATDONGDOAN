# Design System Rules — Hoạt Động Đoàn PTIT HCM

Reference architecture and UI conventions for implementing Figma designs and maintaining cross-page visual consistency across the **Hoạt Động Đoàn PTIT HCM** web application.

---

## 1. Token Definitions

All global design tokens are defined as CSS Custom Properties under `:root` in [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css). No external CSS token compiler (Style Dictionary / Tailwind / Sass) is used; tokens are consumed directly by native CSS Modules.

```css
/* src/app/globals.css */
:root {
  --primary-50: #eff6ff;
  --primary-100: #dbeafe;
  --primary-200: #bfdbfe;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4ed8;
  --primary-800: #1e40af;
  --primary-900: #1e3a8a;

  --neutral-50: #f8fafc;
  --neutral-100: #f1f5f9;
  --neutral-200: #e2e8f0;
  --neutral-300: #cbd5e1;
  --neutral-400: #94a3b8;
  --neutral-500: #64748b;
  --neutral-600: #475569;
  --neutral-700: #334155;
  --neutral-800: #1e293b;
  --neutral-900: #0f172a;

  --success-50: #f0fdf4;
  --success-100: #dcfce7;
  --success-600: #16a34a;
  --success-700: #15803d;

  --warning-50: #fffbeb;
  --warning-100: #fef3c7;
  --warning-600: #d97706;
  --warning-700: #b45309;

  --error-50: #fef2f2;
  --error-100: #fee2e2;
  --error-600: #dc2626;
  --error-700: #b91c1c;

  /* Semantic Surface, Border & Text Tokens */
  --bg-primary: var(--neutral-50);
  --bg-surface: #ffffff;
  --bg-subtle: var(--neutral-100);
  --border-color: var(--neutral-200);
  --border-strong: var(--neutral-300);
  --text-primary: var(--neutral-900);
  --text-secondary: var(--neutral-600);
  --text-muted: var(--neutral-500);

  /* Unified Page Container & Card Geometry Tokens */
  --page-max-wide: 1600px;
  --page-max-standard: 1360px;
  --page-max-detail: 960px;
  --page-max-form: 680px;
  --card-radius: 16px;
  --card-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);

  /* Typography & Motion */
  --font-plus-jakarta: 'Plus Jakarta Sans';
  --font-inter: 'Inter';
  --font-sans: var(--font-plus-jakarta), var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-normal: 220ms;
}
```

### Page Width Tiers & Card Language
- **`--page-max-wide` (`1600px`)**: High-density Super Admin tables and overview dashboards ([`src/app/super-admin/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/super-admin/page.module.css)).
- **`--page-max-standard` (`1360px`)**: Standard portals & workspaces (`/`, `/events`, `/ranking`, `/admin`, `/admin/proposals`, `/admin/events/[id]`, `/office/duty`, `/office/borrow`, `/office/admin`, `/security`).
- **`--page-max-detail` (`960px`)**: Proposal creation & document detail pages ([`src/app/admin/proposals/new/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/admin/proposals/new/page.module.css), [`src/app/admin/proposals/[id]/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/admin/proposals/[id]/page.module.css)).
- **`--page-max-form` (`680px`)**: Focused forms & mobile scanner flows ([`src/app/events/[id]/register/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/events/[id]/register/page.module.css), [`src/app/scanner/scanner.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/scanner/scanner.module.css)).
- **Unified Institutional Hero Card**: Flat `#ffffff` surface, `1px solid #e2e8f0`, `border-left: 3px solid #1d4ed8`, `border-radius: 16px`, `padding: 1.25rem 1.5rem`, `box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04)`.

---

## 2. Component Library

UI components live in [`src/components/`](file:///Users/mac/Dev/HOATDONGDOAN/src/components) (plus route-scoped UI modules inside [`src/app/`](file:///Users/mac/Dev/HOATDONGDOAN/src/app)). No external UI component library or Storybook is installed; all components are bespoke React 19 components.

### Key Architecture & Primitives
- **Server + Client Split**: Route `page.tsx` files verify auth (`getAuthContext()`), query Supabase SSR data in parallel, and hydrate `'use client'` dashboard components (e.g., [`src/app/page.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/page.tsx) → [`StudentDashboardClient.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentDashboardClient.tsx)).
- **Navigation Shell**: [`Header.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.tsx) renders the top navy app bar (`60px` height), circular icon controls, [`UserMenuDropdown.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/UserMenuDropdown.tsx), collapsible desktop left sidebar (`256px`), and [`MobileBottomNav.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/MobileBottomNav.tsx).
- **Reusable Core Widgets**: [`StatCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StatCard.tsx), [`DataTable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DataTable.tsx), [`EventCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/EventCard.tsx), [`RoleBadge.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/RoleBadge.tsx), [`StudentWeeklyTimetable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentWeeklyTimetable.tsx), [`QRCodeDisplay.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRCodeDisplay.tsx), [`QRScanner.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRScanner.tsx), [`ToastProvider.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ToastProvider.tsx).

---

## 3. Frameworks & Libraries

Defined in [`package.json`](file:///Users/mac/Dev/HOATDONGDOAN/package.json):
- **Framework**: Next.js `16.3.1` (App Router) + React `19.2.8`
- **Dev & Build**: `next dev` (Turbopack) and `next build --webpack`
- **Styling**: Native CSS Modules (`*.module.css`) + CSS Custom Properties (`src/app/globals.css`)
- **UI & Domain Libraries**: `qrcode.react`, `html5-qrcode`, `xlsx`, `@supabase/ssr`, `@supabase/supabase-js`
- **Testing & Quality**: Jest `30.4.2` (`jest-environment-jsdom`), Testing Library (`@testing-library/react`, `@testing-library/user-event`), TypeScript `5`, ESLint `9` (`eslint-config-next`)

---

## 4. Asset Management

- **Local Static Assets**: Stored under [`public/`](file:///Users/mac/Dev/HOATDONGDOAN/public) and [`public/logos/`](file:///Users/mac/Dev/HOATDONGDOAN/public/logos) (`logo-ptit.png`, `logo-doan.png`, PWA icons `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
- **Fonts**: `Plus Jakarta Sans` and `Inter` loaded in [`src/app/layout.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/layout.tsx) via Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`).
- **Image Optimization & Security**: Configured in [`next.config.ts`](file:///Users/mac/Dev/HOATDONGDOAN/next.config.ts) with `formats: ['image/avif', 'image/webp']`, `minimumCacheTTL: 31536000`, and CSP `img-src 'self' data: blob: https://*.googleusercontent.com https://accounts.google.com https://ptithcm.com https://*.ptithcm.edu.vn`.
- **Google OAuth Avatars**: Rendered with `referrerPolicy="no-referrer"` in [`UserMenuDropdown.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/UserMenuDropdown.tsx) with initial-letter fallback on `onError`.

---

## 5. Icon System

Custom inline SVG icons are centralized in [`src/components/icons/Icons.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/Icons.tsx) with shared types in [`src/components/icons/types.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/types.ts) and barrel export [`src/components/icons/index.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/index.ts).

```tsx
// Pattern in src/components/icons/Icons.tsx
const createIcon = (displayName: string, svgContent: React.ReactNode, defaultStrokeWidth = 2) => {
  const IconComponent = React.forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, color = 'currentColor', strokeWidth = defaultStrokeWidth, className = '', title, ...props }, ref) => (
      <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} ...>
        {title && <title>{title}</title>}
        {svgContent}
      </svg>
    )
  );
  IconComponent.displayName = displayName;
  return IconComponent;
};
```

- **Naming & Usage**: `*Icon` PascalCase exports (e.g., `CalendarIcon`, `ShieldCheckIcon`, `ArrowLeftIcon`, `QrCodeIcon`, `ClockIcon`), always imported from `@/components/icons`.

---

## 6. Styling Approach

- **CSS Modules First**: Pair every page/component with a sibling `*.module.css` file; import as `import styles from './Component.module.css'`.
- **Global Shell Offsets**: [`Header.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.tsx) toggles `body[data-sidebar]` (`padding-left: 256px` on `>= 1024px`) and `body[data-has-bottom-nav='true']` on mobile (`<= 768px`) in [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css).
- **Standard Breakpoints**:
  - `1040px` / `1024px`: Desktop sidebar pinning & 2-column narrowing
  - `880px`: Portal 2-column (`360px | 1fr`) collapses to single column
  - `768px` / `680px` / `640px`: Mobile bottom navigation, agenda switches, compact headers

---

## 7. Project Structure

```text
src/
├── app/                   # Next.js App Router pages, route CSS modules, and API routes
│   ├── page.tsx           # Student Portal SSR entry (redirects officers to default workspace)
│   ├── events/            # Event discovery, registration, and CTV recruitment pages
│   ├── ranking/           # Semester & LCĐ event participation ranking board
│   ├── admin/             # Organizer workbench, proposals workflow, LCD & event management
│   ├── office/            # Office admin, CTV duty shifts (/office/duty), equipment borrow (/office/borrow)
│   ├── scanner/           # Dynamic QR check-in camera scanner
│   ├── security/          # Guard key handover ledger
│   ├── super-admin/       # School-wide system dashboard
│   └── api/               # Route Handlers (auth, me, events, admin, office, proposals, cron)
├── components/            # Shared UI components + *.module.css + icons/
├── hooks/                 # Client hooks (e.g. useGoogleOneTap.ts)
└── lib/                   # Auth helpers, security sanitizers, constants/stores, types.ts, utils/
__tests__/                 # Jest unit and whitebox tests mirroring src/
```

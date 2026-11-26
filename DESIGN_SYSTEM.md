# Design System Rules — Hoạt Động Đoàn PTIT HCM

Comprehensive design-to-code architecture, token contracts, and component standards for integrating Figma designs via the **Figma Model Context Protocol (MCP)** across **Hoạt Động Đoàn PTIT HCM** (`https://ptithcm.com`).

> **Core Aesthetic Mandate**: Dual-theme institutional craftsmanship — **Crisp Institutional Light** (`:root`) paired with **5-Tier Obsidian Deep Black** (`html[data-theme='dark']`). Every surface, hairline border, input well, and status pill MUST consume semantic CSS Custom Properties so Light and Dark modes render with zero FOUC, WCAG AA contrast, and zero washed-out slate gray.

---

## 1. Token Definitions

### Where Tokens Live & Format
- **Single Source of Truth**: [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css) defines all primitive and semantic tokens using native **CSS Custom Properties** (`--*`).
- **Token Transformation**: None (no Style Dictionary, Sass, PostCSS custom plugins, or Tailwind). Native CSS variables switch instantaneously at runtime via `html[data-theme='dark']` with `0 KB` CSS bundle duplication.
- **Zero-FOUC Theme Hydration**: [`src/app/layout.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/layout.tsx) injects a synchronous `<head>` script (`THEME_INIT_SCRIPT`) that reads `localStorage.getItem('hdd_theme')` before first paint and sets `document.documentElement.setAttribute('data-theme', 'dark' | 'light')` + `<meta name="theme-color">`.

### Semantic Surface & Elevation Hierarchy (5-Tier Obsidian vs. Institutional Light)

| Semantic Token | Light Mode (`:root`) | Obsidian Dark (`[data-theme='dark']`) | Mandatory Usage Contract |
| :--- | :--- | :--- | :--- |
| `--bg-primary` | `#f8fafc` | `#050608` (True Pitch Obsidian) | Outer full-page canvas (`body`, `.container`, `min-height: 100vh` wrappers) |
| `--bg-input` | `#ffffff` | `#050608` (Recessed Obsidian Well) | Search bars, text inputs, `<select>`, `<textarea>` inside cards/toolbars |
| `--bg-surface` | `#ffffff` | `#0b0d12` (Deep Obsidian Card) | Primary cards, KPI tiles, data tables, modals, desktop sidebar |
| `--bg-subtle` | `#f8fafc` | `#10131a` (Subtle Obsidian Panel) | Filter bars, `<thead>`, nested metadata panels, inner list rows |
| `--bg-elevated` | `#ffffff` | `#12161f` (Floating Popover) | Dropdown menus (`UserMenuDropdown`), floating controls, tooltips |
| `--bg-muted` | `#f1f5f9` | `#171c26` (Chip & Hover Fill) | Inactive filter chips, row hover states, count badges, skeletons |
| `--header-bg` | `linear-gradient(135deg, #1e3a8a, #1e40af)` | `linear-gradient(180deg, #080a0f, #06080c)` | Top fixed `60px` institutional app bar |
| `--bottom-nav-bg` | `rgba(255, 255, 255, 0.96)` | `rgba(7, 9, 13, 0.94)` | Translucent mobile bottom tab bar (`backdrop-filter: blur(14px)`) |
| `--border-color` | `#e2e8f0` | `#1c2029` (Crisp Hairline) | Default `1px` card, table, and divider borders |
| `--border-strong` | `#cbd5e1` | `#272d3b` (Interactive Border) | Input borders, secondary button borders, card hover borders |

### Typography & Brand Accent Tokens

```css
/* src/app/globals.css — Typography & Brand Tokens */
:root {
  --font-plus-jakarta: 'Plus Jakarta Sans';
  --font-inter: 'Inter';
  --font-sans: var(--font-plus-jakarta), var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-primary: #0f172a;       /* Dark: #f8fafc (Pure crisp white headings) */
  --text-body: #334155;          /* Dark: #dce3ee (Readable body copy & table cells) */
  --text-secondary: #475569;     /* Dark: #94a3b8 (Subtitles & secondary labels) */
  --text-muted: #64748b;         /* Dark: #7f8b9e (Timestamps & helper copy, >= 5.2:1 AA) */
  --text-subtle: #94a3b8;        /* Dark: #5c6678 (Placeholders & disabled labels) */
  --text-brand: #1d4ed8;         /* Dark: #60a5fa (Interactive links & royal blue badges) */
  --text-brand-strong: #1e40af;  /* Dark: #93c5fd (Emphasized brand callouts) */
  --brand-accent: #1d4ed8;       /* Dark: #2563eb (3px institutional left accent border) */
}
```

### Semantic Status & Callout Tints
Never hardcode light pastel hexes (`#eff6ff`, `#dcfce7`, `#fee2e2`, `#fef3c7`, `#f5f3ff`, `#f0fdfa`, `#ecfeff`, `#fdf2f8`) in CSS Modules or inline `style={{}}`. Always pair the semantic tint family:
- **Blue (Brand / Official)**: `--tint-blue-bg`, `--tint-blue-strong`, `--tint-blue-border` + `--text-brand`
- **Green (Open / Checked-in / Approved)**: `--tint-green-bg`, `--tint-green-strong`, `--tint-green-border` + `--status-green-text`
- **Red (Urgent / Rejected / Overdue)**: `--tint-red-bg`, `--tint-red-strong`, `--tint-red-border` + `--status-red-text`
- **Amber (Pending / Volunteer / Warning)**: `--tint-amber-bg`, `--tint-amber-strong`, `--tint-amber-border` + `--status-amber-text`
- **Purple (LCĐ Scoped / Academic)**: `--tint-purple-bg`, `--tint-purple-strong`, `--tint-purple-border` + `--status-purple-text`
- **Teal (Office Duty / CTV Recruitment)**: `--tint-teal-bg`, `--tint-teal-strong`, `--tint-teal-border` + `--status-teal-text`
- **Cyan (Cohort Scoped)**: `--tint-cyan-bg`, `--tint-cyan-strong`, `--tint-cyan-border` + `--status-cyan-text`
- **Pink (Gender Scoped Pills)**: `--tint-pink-bg`, `--tint-pink-strong`, `--tint-pink-border` + `--status-pink-text`

### 8-Faculty (LCĐ) Adaptive Identity Tokens
Defined in [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css) and consumed via [`src/lib/utils/lcd.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/lib/utils/lcd.ts) (`LCD_DEFINITIONS`):
- `--lcd-{cntt|cndpt|attt|vt|dt|qtkd|mkt|kt}-{fg|bg|border}` — automatically shifts ultra-dark faculty colors (`LCD_DT`, `LCD_MKT`, `LCD_VT`) to luminous WCAG AA tones in Dark Mode.

### Locked Physical Surfaces (Never Invert in Dark Mode!)
- **QR Code Quiet Zones** (`--qr-surface: #ffffff`, `--qr-fg: #000000`): Optical & infrared camera scanners require high-contrast black modules on a pure `#ffffff` quiet zone ([`QRCodeDisplay.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRCodeDisplay.tsx), [`DynamicEventQRModal.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DynamicEventQRModal.tsx)).
- **Print Stylesheet** (`@media print` in [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css#L313-L335)): Automatically resets `html[data-theme='dark']` back to white paper `#ffffff` and `#0f172a` ink when printing administrative proposals or attendance sheets.

### Layout Container Tiers & Motion Curves
- **`--page-max-wide` (`1600px`)**: High-density school-wide tables & executive dashboards ([`src/app/super-admin/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/super-admin/page.module.css)).
- **`--page-max-standard` (`1360px`)**: Standard portals & workspaces (`/`, `/events`, `/ranking`, `/admin`, `/admin/proposals`, `/admin/events/[id]`, `/office/duty`, `/office/borrow`, `/office/admin`, `/security`).
- **`--page-max-detail` (`960px`)**: Proposal authoring & document detail views ([`src/app/admin/proposals/new/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/admin/proposals/new/page.module.css), [`src/app/admin/proposals/[id]/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/admin/proposals/[id]/page.module.css)).
- **`--page-max-form` (`680px`)**: Focused registration forms & camera scanner flows ([`src/app/events/[id]/register/page.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/events/[id]/register/page.module.css), [`src/app/scanner/scanner.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/scanner/scanner.module.css)).
- **Radii & Motion**: `--card-radius: 16px` (`--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px`, `--radius-full: 9999px`), `--ease-spring: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)`.

---

## 2. Component Library

All UI components are bespoke React 19 components in [`src/components/`](file:///Users/mac/Dev/HOATDONGDOAN/src/components) paired 1:1 with `*.module.css` files (no external UI kit or Storybook; verified via Jest + React Testing Library in [`__tests__/unit/components/`](file:///Users/mac/Dev/HOATDONGDOAN/__tests__/unit/components)).

### Architecture & Core Reusable Components
1. **SSR Auth + Client Workspace Split**:
   - Server `page.tsx` routes resolve `getAuthContext()` ([`src/lib/auth/permissions.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/lib/auth/permissions.ts)), fetch initial Supabase data in parallel, and hydrate interactive `'use client'` views (e.g., [`StudentDashboardClient.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentDashboardClient.tsx)).
2. **Global Navigation & Theme Shell**:
   - [`Header.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.tsx) + [`Header.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.module.css): Fixed `60px` top bar, [`DualLogos.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DualLogos.tsx), [`ThemeToggleButton.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ThemeToggleButton.tsx), [`UserMenuDropdown.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/UserMenuDropdown.tsx), collapsible `256px` desktop left sidebar, and [`MobileBottomNav.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/MobileBottomNav.tsx).
   - [`ThemeToggleButton.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ThemeToggleButton.tsx): Supports `variant="header"` (`36×36px` glass pill in top bar) and `variant="floating"` (`40×40px` corner toggle on `/login`), broadcasting `'hdd-theme-change'` + `storage` events across tabs.
3. **Domain Display & Data Primitives**:
   - [`StatCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StatCard.tsx): KPI metric card with `tabular-nums`, semantic icon badge (`primary | success | warning | error`), and shimmer skeleton state.
   - [`DataTable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DataTable.tsx): Responsive data table with sticky/subtle `--bg-subtle` header, empty state, and horizontal touch scroll.
   - [`EventCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/EventCard.tsx): Event summary card with live status dot (`active | pending | rejected | closed`), date/end-date range, resolved location, and check-in counter.
   - [`StudentWeeklyTimetable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentWeeklyTimetable.tsx): 7-column desktop weekly grid (`Sáng / Chiều / Tối`) that adapts into a 7-day interactive strip + agenda list below `680px`.
   - [`RoleBadge.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/RoleBadge.tsx): Semantic role pill (`participant | volunteer | organizer`).
   - [`QRCodeDisplay.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRCodeDisplay.tsx), [`DynamicEventQRModal.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DynamicEventQRModal.tsx), [`QRScanner.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRScanner.tsx): Optical QR rendering and camera scanning suite.
   - [`ToastProvider.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ToastProvider.tsx) + [`Toast.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Toast.tsx): Imperative `useToast()` notification stack.

### Canonical Institutional Hero & Filter Bar Pattern

```css
/* Unified Institutional Hero Banner */
.heroBanner {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--brand-accent);
  border-radius: var(--card-radius, 16px);
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
  box-shadow: var(--card-shadow);
}

/* Recessed Search Input Inside Filter Card */
.searchInput {
  height: 40px;
  border-radius: 12px;
  border: 1.5px solid var(--border-strong);
  background: var(--bg-input); /* #ffffff in Light, #050608 recessed well in Obsidian Dark */
  color: var(--text-primary);
}
```

---

## 3. Frameworks & Libraries

Configured in [`package.json`](file:///Users/mac/Dev/HOATDONGDOAN/package.json):
- **UI & Routing Framework**: Next.js `16.3.1` (App Router) + React `19.2.8` (`react-dom` `19.2.8`)
- **Bundler & Build System**: `next dev` (Turbopack) for local development; `next build --webpack` for production builds
- **Styling Engine**: Native CSS Modules (`*.module.css`) + Global CSS Custom Properties ([`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css))
- **Data, Auth & Utilities**: `@supabase/ssr` (`^0.12.4`), `@supabase/supabase-js` (`^2.112.3`), `qrcode.react` (`^4.2.0`), `html5-qrcode` (`^2.3.8`), `xlsx` (`^0.18.5`)
- **Verification Toolchain**: TypeScript `5` (`strict`), ESLint `9` (`eslint-config-next`), Jest `30.4.2` (`ts-jest` + `jest-environment-jsdom` + `identity-obj-proxy` for CSS Modules), `@testing-library/react` `16.3.2`

---

## 4. Asset Management

- **Static Brand Assets**: Stored in [`public/`](file:///Users/mac/Dev/HOATDONGDOAN/public) and [`public/logos/`](file:///Users/mac/Dev/HOATDONGDOAN/public/logos) (`logo-ptit.png`, `logo-doan.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
- **Dual Brand Logos**: Always render institutional emblems via [`DualLogos.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DualLogos.tsx), which wraps both PNG emblems in crisp circular white `#ffffff` badges so official red/blue/green crests remain authentic on both Navy and Obsidian `#050608` surfaces.
- **Web Fonts**: `Plus Jakarta Sans` (weights `400–800`) and `Inter` (weights `400–800`) loaded via Google Fonts in [`src/app/layout.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/layout.tsx).
- **Image Optimization & CSP**: [`next.config.ts`](file:///Users/mac/Dev/HOATDONGDOAN/next.config.ts) enables `formats: ['image/avif', 'image/webp']`, `minimumCacheTTL: 31536000`, immutable `1-year` caching on `/logos/*`, and strict `Content-Security-Policy` (`img-src 'self' data: blob: https://*.googleusercontent.com https://accounts.google.com https://ptithcm.com https://*.ptithcm.edu.vn`).
- **User Avatars**: Google OAuth profile images (`lh3.googleusercontent.com`) MUST include `referrerPolicy="no-referrer"` and an `onError` initial-letter fallback (see [`UserMenuDropdown.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/UserMenuDropdown.tsx)).

---

## 5. Icon System

All vector icons live in [`src/components/icons/Icons.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/Icons.tsx) with shared `IconProps` in [`src/components/icons/types.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/types.ts) and barrel re-exports in [`src/components/icons/index.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/index.ts).

```tsx
import { CalendarIcon, MapPinIcon, ShieldCheckIcon, SunIcon, MoonIcon } from '@/components/icons';

// Usage: inherits currentColor by default, or accepts CSS token strings
<CalendarIcon size={16} color="var(--text-brand)" />
```

### Icon Conventions when Translating Figma Designs
1. **Check `@/components/icons` First**: Reuse existing `*Icon` PascalCase exports before adding new SVGs.
2. **Adding New Figma Icons**: Register new `24×24` stroke-based icons inside [`src/components/icons/Icons.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/Icons.tsx) using the `createIcon(displayName, svgContent, defaultStrokeWidth)` factory and export with the `*Icon` suffix. Never scatter raw inline `<svg>` paths across feature pages unless rendering third-party brand marks (e.g., Google/Facebook).
3. **Color Binding**: Pass `color="currentColor"` (default) or `color="var(--status-*-text)"` rather than hardcoded dark/light hex strings.

---

## 6. Styling Approach

- **Methodology**: Scoped **CSS Modules** (`Component.module.css` / `page.module.css`) consuming global CSS variables from [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css).
- **Numeric Precision**: Apply `font-variant-numeric: tabular-nums` on all KPI counters, attendance ratios, timestamps, and countdown timers.
- **Global Viewport Offsets**:
  - `body[data-sidebar='expanded']` applies `padding-left: 256px` at `min-width: 1024px` (`padding-top: 60px` for fixed header).
  - `body[data-has-bottom-nav='true']` applies `padding-bottom: calc(68px + env(safe-area-inset-bottom))` at `max-width: 768px`.
- **Responsive Breakpoints**:
  - `1080px` / `1040px` / `1024px`: 3-column card grids step down to 2 columns; desktop sidebar switches to slide-over drawer below `1024px`.
  - `880px`: Student Portal 2-column grid (`360px minmax(0, 1fr)`) collapses to 1 column.
  - `768px` / `680px`: Mobile bottom navigation activates (`768px`); weekly timetable switches from 7-column table to mobile day-strip agenda (`679px`); card grids collapse to `1fr` (`680px`).
  - `640px` / `480px`: Compact mobile padding (`0.85rem–1rem`), full-width search inputs, stacked action buttons.

---

## 7. Project Structure & Figma MCP Integration Checklist

```text
src/
├── app/                        # Next.js 16 App Router pages, route CSS Modules, and API Route Handlers
│   ├── globals.css             # Master Light + Obsidian Dark CSS Custom Property token engine
│   ├── layout.tsx              # Root HTML shell, zero-FOUC theme init script, Google Fonts, ToastProvider
│   ├── login/                  # Authentication portal with ParticleCanvas & floating ThemeToggleButton
│   ├── page.tsx                # Student Portal SSR entry (smart-redirects officers to default workspace)
│   ├── events/                 # Event discovery (/events), registration (/register), CTV (/recruitment)
│   ├── ranking/                # Semester & 8-LCĐ participation leaderboard
│   ├── admin/                  # Event Admin workbench, Proposals workflow (/proposals), Event detail (/events/[id])
│   ├── office/                 # VPĐ Admin (/office/admin), CTV Duty (/office/duty), Equipment (/office/borrow)
│   ├── scanner/                # Camera QR check-in scanner (/scanner)
│   ├── security/               # Guard room key handover ledger (/security)
│   ├── super-admin/            # Executive school-wide control center (/super-admin)
│   └── api/                    # Backend endpoints (auth, me, events, admin, office, proposals, cron)
├── components/                 # Reusable UI primitives + sibling *.module.css + icons/
├── hooks/                      # Client hooks (e.g., useGoogleOneTap.ts)
└── lib/                        # Auth permissions, security sanitizers, JSON/Supabase stores, types.ts, utils/
__tests__/                      # Jest unit & whitebox suites mirroring src/
```

### Mandatory Checklist When Implementing Figma Frames via MCP
1. **Outer Page Wrapper**: Always set `background: var(--bg-primary)` on `.container` / `.page` (`#f8fafc` Light / `#050608` Pitch Obsidian Dark).
2. **Cards & Panels**: Set `background: var(--bg-surface)` + `border: 1px solid var(--border-color)` + `box-shadow: var(--card-shadow)`. Never use slate-gray hexes (`#111827`, `#1e293b`, `#334155`) for card surfaces.
3. **Inputs & Selects**: Set `background: var(--bg-input)` + `border: 1.5px solid var(--border-strong)` + `color: var(--text-primary)` so controls appear recessed (`#050608`) inside `#0b0d12` / `#10131a` cards in Dark Mode.
4. **Badges & Callouts**: Map every colored Figma badge to `--tint-{blue|green|red|amber|purple|teal|cyan|pink}-{bg|strong|border}` and `--status-*-text`.
5. **Dual-Theme Verification**: Verify every new Figma screen under both `html[data-theme='light']` and `html[data-theme='dark']` (plus mobile `390px` width) before completion.

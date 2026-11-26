# Design System Rules — Hoạt Động Đoàn PTIT HCM

Comprehensive design-to-code architecture, token contracts, and component standards for integrating Figma designs via the **Figma Model Context Protocol (MCP)** across **Hoạt Động Đoàn PTIT HCM** (`https://ptithcm.com`).

> **Core Aesthetic Mandate**: Dual-theme institutional craftsmanship combining **Layer 1 (Seamless L-Shell & `14px` Inset Rounded Viewport Frame)** and **Layer 2 (`1px` Translucent Hairline Monolith Architecture)**:
> - **Crisp Institutional Light (`:root`)**: Royal Blue header (`#1e3a8a → #1e40af`), `#eef2f7` desktop shell bezel, and pure `#ffffff` / `#f8fafc` surfaces.
> - **Monolith Obsidian Hairline Dark (`html[data-theme='dark']`)**: Seamless neutral charcoal `#111215` L-shell (top bar + persistent left sidebar) framing a recessed `#050507` pitch-black viewport (`border-radius: 14px`, `border: 1px solid rgba(255, 255, 255, 0.095)`), paired with `#0a0b0e` monolith cards, `1px solid rgba(255, 255, 255, 0.08)` silver-graphite hairlines, and `inset 0 1px 0 rgba(255, 255, 255, 0.035)` top specular highlights.

---

## 1. Token Definitions

### Where Tokens Live & Format
- **Single Source of Truth**: [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css) defines all primitive, shell, surface, border, and semantic status tokens using native **CSS Custom Properties** (`--*`).
- **Token Transformation**: None (zero Tailwind, Sass, or build-time token compiler). Runtime switching occurs in `0 ms` via `html[data-theme='dark' | 'light']` and `html[data-theme-pref='light' | 'dark' | 'system']`.
- **Zero-FOUC & Extension-Safe Theme Hydration**: [`src/app/layout.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/layout.tsx) injects `<meta name="darkreader-lock" />`, `colorScheme: 'light dark'`, and synchronous `THEME_INIT_SCRIPT` in `<head>` to resolve `'light' | 'dark' | 'system'` (via `window.matchMedia('(prefers-color-scheme: dark)')`) prior to first paint.

### Layer 1 & Layer 2 Semantic Surface & Hairline Hierarchy

| Semantic Token | Light Mode (`:root`) | Monolith Obsidian (`[data-theme='dark']`) | Mandatory Usage Contract |
| :--- | :--- | :--- | :--- |
| `--shell-bg` | `#eef2f7` | `#111215` (Matte Neutral Charcoal) | Outer desktop L-shell bezel (`body[data-sidebar]` & `.viewportFrame` mask) |
| `--frame-border` | `rgba(15, 23, 42, 0.09)` | `rgba(255, 255, 255, 0.095)` | `1px` hairline border around the `14px` rounded desktop viewport frame |
| `--header-bg` | `linear-gradient(135deg, #1e3a8a, #1e40af)` | `#111215` (Seamless L-Shell Top) | Fixed `60px` top bar (`--header-border: transparent` in Dark Mode) |
| `--sidebar-bg` | `#eef2f7` | `#111215` (Seamless L-Shell Left) | Persistent `260px` left navigation rail (`border-right: none` on desktop) |
| `--sidebar-active-bg` | `#ffffff` | `rgba(255, 255, 255, 0.065)` | Active sidebar item smoky-graphite pill (`border: 1px solid --sidebar-active-border`) |
| `--pill-active-bg` | `#1d4ed8` | `rgba(255, 255, 255, 0.075)` | Active segmented/scope/board tab pill (`border: 1px solid --pill-active-border`) |
| `--bg-primary` | `#f8fafc` | `#050507` (Recessed Pitch Black) | Main content viewport canvas inside the `14px` rounded frame |
| `--bg-input` | `#ffffff` | `#08090b` (Recessed Input Well) | Search bars, text inputs, `<select>`, `<textarea>` inside cards/toolbars |
| `--bg-surface` | `#ffffff` | `#0a0b0e` (Monolith Card Surface) | Primary cards, KPI tiles, data tables, modals, sidebar account card |
| `--bg-subtle` | `#f8fafc` | `#0f1014` (Subtle Inner Surface) | Filter bars, `<thead>`, segmented tracks, nested list items |
| `--bg-elevated` | `#ffffff` | `#14151a` (Floating Popover) | Dropdown menus (`UserMenuDropdown`), notification inbox popover |
| `--bg-muted` | `#f1f5f9` | `#191b21` (Interactive Hover Fill) | Row hover states, neutral count pills, skeleton shimmers |
| `--border-color` | `#e2e8f0` | `rgba(255, 255, 255, 0.08)` | Default `1px` translucent hairline border on cards, tables, and dividers |
| `--border-strong` | `#cbd5e1` | `rgba(255, 255, 255, 0.14)` | Interactive input borders, secondary buttons, hover hairlines |
| `--card-shadow` | `0 1px 3px rgba(15, 23, 42, 0.04)` | `inset 0 1px 0 rgba(255, 255, 255, 0.035)` | Subtle drop shadow in Light; subpixel top glass rim in Dark |
| `--hero-border-left` | `3px solid var(--brand-accent)` | `1px solid rgba(255, 255, 255, 0.085)` | Institutional left accent in Light; uniform `1px` hairline in Dark |

### Typography & True Neutral Zinc Scale

```css
/* src/app/globals.css — Typography & Brand Tokens */
:root {
  --font-plus-jakarta: 'Plus Jakarta Sans';
  --font-inter: 'Inter';
  --font-sans: var(--font-plus-jakarta), var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-primary: #0f172a;       /* Dark: #f4f4f6 (Crisp off-white headings) */
  --text-body: #334155;          /* Dark: #d4d4d8 (Neutral zinc body & table cells) */
  --text-secondary: #475569;     /* Dark: #a1a1aa (Subtitles & inactive nav items) */
  --text-muted: #64748b;         /* Dark: #71717a (Timestamps & metadata) */
  --text-subtle: #94a3b8;        /* Dark: #52525b (Placeholders & section eyebrows) */
  --text-brand: #1d4ed8;         /* Dark: #60a5fa (Interactive links & semantic highlights) */
  --text-brand-strong: #1e40af;  /* Dark: #93c5fd (Emphasized brand callouts) */
  --brand-accent: #1d4ed8;       /* Dark: #2563eb (Primary CTA buttons) */
}
```

### Whisper-Quiet Semantic Status Tints & 8-LCĐ Identity
Never hardcode light pastel hexes (`#eff6ff`, `#dcfce7`, `#fee2e2`, `#fef3c7`) or opaque bright borders (`#f59e0b`, `#94a3b8`) on cards. Always consume semantic tint triplets (`0.09–0.10` alpha fill + `0.24–0.26` hairline border in Dark Mode):
- **Status Families**: `blue`, `green`, `red`, `amber`, `purple`, `teal`, `cyan`, `pink` (`--tint-{color}-{bg|strong|border}` + `--status-{color}-text`).
- **8-LCĐ Adaptive Tokens**: `--lcd-{cntt|cndpt|attt|vt|dt|qtkd|mkt|kt}-{fg|bg|border}` mapped in [`src/lib/utils/lcd.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/lib/utils/lcd.ts).
- **Locked Optical & Print Surfaces**: QR quiet zones (`--qr-surface: #ffffff`, `--qr-fg: #000000`) never invert; `@media print` restores white paper `#ffffff` and hides `.viewportFrame`.

---

## 2. Component Library

All UI components are bespoke React 19 components in [`src/components/`](file:///Users/mac/Dev/HOATDONGDOAN/src/components) paired 1:1 with `*.module.css` files and tested via Jest + React Testing Library in [`__tests__/unit/components/`](file:///Users/mac/Dev/HOATDONGDOAN/__tests__/unit/components).

### Core Shell & Domain Components
1. **L-Shell App Frame & Navigation**:
   - [`Header.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.tsx) + [`Header.module.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/Header.module.css): Renders the fixed `60px` top bar (`z-index: 140`), the desktop `.viewportFrame` rounded cutout (`top: 60px; left: 260px | 8px; right: 8px; bottom: 8px; border-radius: 14px; border: 1px solid var(--frame-border); box-shadow: 0 0 0 12px var(--shell-bg); pointer-events: none; z-index: 130`), the seamless `260px` persistent left sidebar (`z-index: 125`), and [`MobileBottomNav.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/MobileBottomNav.tsx) (`≤ 768px`).
   - [`ThemeToggleButton.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ThemeToggleButton.tsx): Supports `variant="header"` (`36×36px`, `9px` radius hairline button), `variant="floating"` (`40×40px` on `/login`), and `variant="segmented"` (3-pill `Sáng / Tối / Hệ thống` control inside [`UserMenuDropdown.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/UserMenuDropdown.tsx)).
2. **Data, Portal & Emulation Components**:
   - [`StudentDashboardClient.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentDashboardClient.tsx): 2-column stretch-aligned student workspace (`360px minmax(0, 1fr)`) with digital QR ID card, [`StudentWeeklyTimetable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StudentWeeklyTimetable.tsx), and attendance history.
   - [`RankingBoard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/RankingBoard.tsx) + [`ranking-scope.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/lib/utils/ranking-scope.ts): 3-scope emulation leaderboard (*Tổng hợp Toàn trường*, *Đoàn Trường & Phát động*, *Hoạt động Cơ sở — Còn lại*) with 6-sheet Excel export.
   - [`StatCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/StatCard.tsx), [`DataTable.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DataTable.tsx), [`EventCard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/EventCard.tsx), [`AdminOverviewDashboard.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/AdminOverviewDashboard.tsx), [`QRCodeDisplay.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/QRCodeDisplay.tsx), [`DynamicEventQRModal.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DynamicEventQRModal.tsx), [`ToastProvider.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/ToastProvider.tsx).

### Canonical Hairline Card & Pill Tab Pattern

```css
/* Layer 2: Monolith Surface + 1px Translucent Hairline Card */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-left: var(--hero-border-left, 1px solid var(--border-color));
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
  box-shadow: var(--card-shadow);
}

/* Smoky-Graphite Active Pill Tab (Dark) / Royal Blue Pill (Light) */
.tabBtnActive {
  background: var(--pill-active-bg);
  border: 1px solid var(--pill-active-border);
  color: var(--pill-active-fg);
  border-radius: 9px;
}
```

---

## 3. Frameworks & Libraries

Configured in [`package.json`](file:///Users/mac/Dev/HOATDONGDOAN/package.json):
- **Framework**: Next.js `16.3.1` (App Router) + React `19.2.8` (`react-dom` `19.2.8`)
- **Bundler**: `next dev` (Turbopack) in development; `next build --webpack` in production
- **Styling**: Native CSS Modules (`*.module.css`) + Global CSS Custom Properties ([`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css))
- **Data, Auth & Export**: `@supabase/ssr` (`^0.12.4`), `@supabase/supabase-js` (`^2.112.3`), `qrcode.react` (`^4.2.0`), `html5-qrcode` (`^2.3.8`), `xlsx` (`^0.18.5`)
- **Testing & Quality**: TypeScript `5` (`strict`), ESLint `9` (`eslint-config-next`, `react-hooks/purity`), Jest `30.4.2` + `@testing-library/react` `16.3.2`

---

## 4. Asset Management

- **Static Brand Assets**: Stored in [`public/`](file:///Users/mac/Dev/HOATDONGDOAN/public) and [`public/logos/`](file:///Users/mac/Dev/HOATDONGDOAN/public/logos) (`logo-ptit.png`, `logo-doan.png`, PWA icons).
- **Institutional Emblems**: Rendered exclusively through [`DualLogos.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/DualLogos.tsx) on circular `#ffffff` badges so official crests remain crisp on `#111215` and `#1e3a8a` headers.
- **Typography**: `Plus Jakarta Sans` (`400–800`) and `Inter` (`400–800`) via Google Fonts in [`src/app/layout.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/layout.tsx).
- **Optimization & Security**: [`next.config.ts`](file:///Users/mac/Dev/HOATDONGDOAN/next.config.ts) enforces `image/avif` + `image/webp`, `1-year` immutable caching on `/logos/*`, and strict `Content-Security-Policy`. Google avatars require `referrerPolicy="no-referrer"` + initial-letter fallback.

---

## 5. Icon System

All vector icons reside in [`src/components/icons/Icons.tsx`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/Icons.tsx) (`IconProps` in [`types.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/types.ts), barrel exports in [`index.ts`](file:///Users/mac/Dev/HOATDONGDOAN/src/components/icons/index.ts)):

```tsx
import { CalendarIcon, BadgeMedalIcon, SunIcon, MoonIcon, MonitorIcon } from '@/components/icons';

<BadgeMedalIcon size={16} color="var(--text-brand)" />
```

- Always import existing `*Icon` components from `@/components/icons` first; register any new `24×24` stroke icons via `createIcon(...)` inside `Icons.tsx` with `currentColor` stroke binding.

---

## 6. Styling Approach

- **CSS Modules + Global Token Engine**: Co-located `*.module.css` files consuming semantic variables from [`src/app/globals.css`](file:///Users/mac/Dev/HOATDONGDOAN/src/app/globals.css).
- **Responsive Shell Geometry**:
  - **Desktop (`min-width: 1024px`)**: `body[data-sidebar]` applies `background-color: var(--shell-bg); padding: 60px 8px 8px 260px` (`8px` left when unpinned), while `.viewportFrame` masks and borders the `14px` rounded main viewport at all scroll positions.
  - **Tablet & Mobile (`max-width: 1023px`)**: `.viewportFrame` hides (`display: none`) so content utilizes 100% horizontal width without double-bezel nesting; `body[data-has-bottom-nav='true']` reserves `calc(68px + env(safe-area-inset-bottom))` at `≤ 768px`.
- **Tabular Numerals**: Always set `font-variant-numeric: tabular-nums` on KPIs, ranking counts, percentages, and timers.

---

## 7. Project Structure & Figma MCP Integration Checklist

```text
src/
├── app/                        # Next.js 16 App Router pages, route CSS Modules, and 79 API Route Handlers
│   ├── globals.css             # Master Light + L-Shell Monolith Obsidian CSS Custom Property engine
│   ├── layout.tsx              # Root HTML shell, darkreader-lock, zero-FOUC theme script, ToastProvider
│   ├── login/                  # Auth portal with ParticleCanvas & floating ThemeToggleButton
│   ├── page.tsx                # Student Portal SSR entry
│   ├── events/                 # Event discovery (/events), registration (/register), CTV (/recruitment)
│   ├── ranking/                # 3-scope emulation & 8-LCĐ / 16-CLB leaderboard (/ranking)
│   ├── admin/                  # Event Admin workbench, Proposals (/proposals), Event detail (/events/[id])
│   ├── office/                 # VPĐ Admin (/office/admin), CTV Duty (/office/duty), Equipment (/office/borrow)
│   ├── scanner/                # Camera QR check-in scanner (/scanner)
│   ├── security/               # Guard room key handover ledger (/security)
│   ├── super-admin/            # Executive school-wide control center (/super-admin)
│   └── api/                    # Backend API routes (auth, me, events, ranking, admin, office, proposals, cron)
├── components/                 # Reusable React 19 UI primitives + *.module.css + icons/
├── hooks/                      # Client hooks (useGoogleOneTap.ts)
└── lib/                        # Auth/RBAC helpers, security sanitizers, ranking-scope.ts, types.ts, utils/
__tests__/                      # 58 Jest unit & whitebox test suites
```

### Mandatory Checklist When Translating Figma Designs via MCP
1. **Respect the Desktop L-Shell**: Never add duplicate outer page margins on `<main>`—`body[data-sidebar]` and `Header.tsx` `.viewportFrame` automatically provide the `#111215` bezel and `14px` rounded `1px` viewport border on desktop while keeping mobile full-bleed.
2. **Use Hairline `1px` Borders**: Use `1px solid var(--border-color)` (`rgba(255, 255, 255, 0.08)` in Dark) and `--hero-border-left` rather than thick `2px–4px` solid colored borders or heavy drop shadows.
3. **Neutral Active Pills**: Use `--pill-active-bg` / `--pill-active-border` / `--pill-active-fg` for segmented controls and view tabs; reserve solid `#2563eb` / `#1d4ed8` strictly for primary CTA buttons.
4. **Dual-Theme + Mobile Check**: Validate every screen in both `data-theme="dark"` and `data-theme="light"` at `1440px` (L-shell frame active) and `390px` (full-bleed mobile nav active).

# ServiGo — Design System

> Single source of truth for the ServiGo Next.js frontend.
> Generated from: `ui-ux-pro-max` (Marketplace / Flat Design pattern), `brand`, `design-consultation`, `design-system` skills.

---

## 1. Brand Direction

**Direction:** Trustworthy Professional Marketplace  
**Style:** Flat Design — 2D, minimal, bold blues, clean lines, SVG icon-heavy, no gradients except hero.  
**Voice:** Direct, confident, warm. "Done right." — action-oriented copy, no jargon.  
**Target audience:** Urban homeowners 25–50, mobile-first, value speed and transparency.

---

## 2. Color Tokens

Defined in `globals.css` as CSS custom properties (three-layer: primitive → semantic → component).

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1E40AF` | Buttons, links, active nav, brand mark |
| `--color-primary-dark` | `#1E3A8A` | Hover on primary elements |
| `--color-primary-light` | `#3B82F6` | Hero gradient end, secondary accents |
| `--color-accent` | `#EA580C` | Primary CTA buttons, urgency badges |
| `--color-accent-dark` | `#C2410C` | Hover on accent buttons |
| `--color-bg` | `#EFF6FF` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals, inputs |
| `--color-muted` | `#E9EEF6` | Section backgrounds, chips, skeleton |
| `--color-border` | `#BFDBFE` | All borders and dividers |
| `--color-fg` | `#1E3A8A` | Primary text |
| `--color-fg-muted` | `#4B5563` | Secondary / supporting text |
| `--color-fg-subtle` | `#9CA3AF` | Placeholder, disabled text |
| `--color-destructive` | `#DC2626` | Errors, destructive actions |
| `--color-success` | `#16A34A` | Success states, "available" badges |

**Contrast compliance (WCAG AA):**  
- `--color-fg` (#1E3A8A) on `--color-bg` (#EFF6FF): ~8.4:1 ✅  
- White on `--color-primary` (#1E40AF): ~7.0:1 ✅  
- White on `--color-accent` (#EA580C): ~3.3:1 (large text only, used ≥16px bold) ✅  

---

## 3. Typography Scale

**Font family:** `Inter` (Google Fonts, weights 400/500/600/700/800)  
**Base size:** 16px · **Line-height:** 1.5

| Role | Size | Weight | Usage |
|---|---|---|---|
| Display / H1 | 48–60px (`text-5xl`/`text-6xl`) | 800 | Hero headline |
| Heading 2 | 30px (`text-3xl`) | 700–800 | Section titles |
| Heading 3 | 20px (`text-xl`) | 600–700 | Card titles |
| Body | 16px (`text-base`) | 400 | Paragraph text |
| Body small | 14px (`text-sm`) | 400–500 | Supporting copy |
| Caption / Label | 12px (`text-xs`) | 500–600 | Badges, timestamps |

---

## 4. Spacing

8px base grid. All spacing is a multiple of 4px.

| Token | Value | Example use |
|---|---|---|
| `--space-1` | 4px | Icon gap |
| `--space-2` | 8px | Input padding block |
| `--space-3` | 12px | Badge padding |
| `--space-4` | 16px | Card padding (sm), nav height item |
| `--space-6` | 24px | Section gap |
| `--space-8` | 32px | Card gap |
| `--space-12` | 48px | Section vertical padding (sm) |
| `--space-16` | 64px | Hero vertical padding |

---

## 5. Radius + Shadow Rules

**Radius:**
- `--radius-sm` (4px) — small badges, focus ring offset
- `--radius-md` (8px) — inputs, buttons, small chips
- `--radius-lg` (12px) — cards, panels
- `--radius-xl` (16px) — large cards, hero panels
- `--radius-full` (9999px) — pills, avatar circles

**Shadows (flat-ish — very subtle blue tint):**
- `--shadow-sm` — resting card state
- `--shadow-md` — hover card state (transition 200ms)
- `--shadow-lg` — modal, login card

**Rule:** No `box-shadow` on text elements or buttons. Shadows only on surfaces (cards, modals). Elevate on hover, not on rest for interactive items.

---

## 6. Component Rules

### Buttons
| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary CTA | `--color-accent` | white | none | `opacity: 0.85` |
| Secondary | transparent | `--color-primary` | 1.5px `--color-primary` | `opacity: 0.7` |
| Ghost | transparent | `--color-primary` | none | `opacity: 0.7` |
| Disabled | any | any | — | `opacity: 0.4`, `cursor-not-allowed` |

- Min height: **44px** on mobile (touch target rule from ui-ux-pro-max)
- `cursor-pointer` always set
- `border-radius: --radius-md`
- Font: 14px, `font-semibold`

### Inputs
- Border: `1.5px solid --color-border`
- Focus: border switches to `--color-primary` (no box-shadow outline on the input itself — use `:focus-visible` outline for keyboard nav)
- Visible `<label>` always above input — never placeholder-only
- Error message below the field (not only at top)
- Padding: `12px 16px`

### Cards
- Background: `--color-surface`
- Border: `1px solid --color-border`
- Radius: `--radius-xl`
- Hover: `--shadow-md`, `transition: box-shadow 200ms`
- No gradient backgrounds on cards

### Badges / Status chips
- Rounded-full pill
- Semantic color pairs: success green `#dcfce7`/`#16a34a`, error red `#fee2e2`/`#dc2626`, warning amber `#fef3c7`/`#d97706`, neutral `--color-muted`/`--color-fg-muted`
- Font: `text-xs font-semibold`

---

## 7. Motion Rules

From **motion-framer** skill + ui-ux-pro-max animation guidelines:

| Rule | Value |
|---|---|
| Duration fast (hover/micro) | 150ms |
| Duration base (page enter) | 350ms |
| Duration slow (layout shift) | 500ms |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` (standard material ease) |
| Page enter | `opacity: 0 → 1`, `y: 18 → 0` |
| Section/hero fade-in | `opacity: 0 → 1`, `y: 14 → 0`, staggered delays |
| Card hover | CSS `transition-shadow 200ms` only (no JS) |
| Button hover | CSS `opacity` transition 150ms |

**What animates:** Page container enter, hero headline/CTA stagger.  
**What does NOT animate:** Navigation, data tables, form fields, infinite loops, decorative-only sequences.  
**`prefers-reduced-motion`:** Handled in `globals.css` — all durations collapse to 0.01ms.

### Components
- `MotionPage` — wraps each page, fade-up on mount
- `MotionFadeIn` — wraps individual sections/hero elements, accepts `delay` prop for stagger

---

## 8. Layout

- Max content width: `max-w-7xl` (1280px) with `px-4 sm:px-6 lg:px-8`
- Navbar height: 64px (`h-16`), sticky, `backdrop-blur-sm`
- Mobile breakpoint: 390px (tested at `sm:390px`, `md:768px`, `lg:1024px`, `xl:1280px`)
- Grid: 12-col via Tailwind responsive grid utilities
- No horizontal scroll at any breakpoint

---

## 9. Icons

- Use SVG icon libraries (Lucide or Heroicons) — **no emoji as interactive icons**
- Current pages use emoji as placeholder content (service categories, map) — swap for SVG in production
- Icon-only buttons must have `aria-label`

---

## 10. Design Review Checklist (from design-review skill)

- [x] Spacing consistent (8px grid throughout)
- [x] Text contrast ≥ 4.5:1 for all body text
- [x] Touch targets ≥ 44px height on all interactive elements
- [x] Hover states on all clickable elements
- [x] Focus rings visible for keyboard nav (`:focus-visible` global)
- [x] `cursor-pointer` on all buttons and links
- [x] Responsive: mobile-first, no fixed px widths
- [x] `prefers-reduced-motion` respected
- [x] Empty state on EV map panel (placeholder with message)
- [x] Disabled button states (opacity + `cursor-not-allowed`)
- [x] Visible labels on all form inputs (login page)
- [x] Error/helper text placement defined (below field)
- [ ] SVG icons to replace emoji placeholders (next sprint)
- [ ] Dark mode tokens (next sprint)

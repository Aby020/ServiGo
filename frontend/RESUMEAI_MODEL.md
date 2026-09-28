# ResumeAI → ServiGo UI Model (UI-only reference spec)

> **Scope note.** This document records **visual and interaction patterns only**.
> It contains **no** resume content, personal details, or page copy from
> ResumeAI. Everything below was derived by reading the ResumeAI frontend's
> token file, component library and motion variants. It is a *design
> reference*, not a content source.

Reference read: `D:\AbiLabs\ResumeAI\frontend` (read-only).

---

## 1. Theme direction

**Dual-theme, token-driven, light-first.** The whole system is defined as plain
CSS custom properties under `:root` (light) and overridden under
`:root[data-theme="dark"]`, then bridged into Tailwind v4 via `@theme inline`.
There is **no `tailwind.config.js`** — utilities resolve against the live
`var()` at the point of use, so a theme swap is one attribute on `<html>`.

| | Light (default) | Dark |
|---|---|---|
| Ground | warm paper `#f5f4f1` | deep ink `#13161c` |
| Surface | `#ffffff` | `#1a1e26` |
| Surface 2 / 3 | `#faf9f6` / `#f0efeb` | `#20242e` / `#262b37` |
| Border | `#e6e4df` | `#2b303c` |
| Text (strong → muted) | `#232220 → #757068` | `#f2f4f7 → #8a919d` |
| Accent | career teal `#0f766e` | teal `#2dd4bf` |

Key ideas to carry over:

- **Named roles, not raw colors.** `bg-surface`, `text-ink`, `border-line`,
  `text-muted` — never `text-gray-700`. Roles make a theme swap free.
- **A 4-step surface ladder** (`bg` → `surface` → `surface-2` → `surface-3`)
  is the backbone of the whole layout. Depth is built by stepping the ladder,
  not by adding shadows.
- **One accent, used sparingly.** Teal appears on eyebrows, the primary button,
  the active progress bar, and a handful of links — nowhere else. Everything
  else is neutral.
- **Status colors are paired, never bare.** Every success/warning/danger/info
  hue has a `-soft` sibling, and chips are `bg-*-soft` + `text-*` with a
  `border-*/30` edge.

## 2. Typography scale

- **Two families, three roles.**
  - `--font-display` ('Syne' → Inter fallback) — **headings only**.
    `font-display font-bold tracking-tight`, with `leading-[1.08]` on the hero
    and `leading-tight` on section titles.
  - `--font-sans` ('Inter') — body, UI, controls.
  - `--font-mono` — **eyebrows, labels, metadata, numerals**.
    Always paired with `text-xs font-medium uppercase tracking-[0.2em]`.
- **Type ramp** (all Tailwind defaults — no custom scale):
  - Hero `text-4xl sm:text-5xl lg:text-[3.4rem]` / `text-5xl sm:text-6xl lg:text-7xl`
  - Section title `text-3xl sm:text-4xl`
  - Card title `text-base` … `text-xl sm:text-2xl`
  - Body `text-base`, body-lg `sm:text-lg`, small `text-sm`, micro `text-xs`,
    tiniest `text-[11px]` (metadata only)
  - Stat numerals: `font-display text-3xl font-bold tabular-nums`
- **Hierarchy rules:** exactly one `h1` per page. Every section opens with the
  same eyebrow → `h2` → description triad, left-aligned by default, `max-w-2xl`.
  Numerals use `tabular-nums` so figures don't jitter during count-up.

## 3. Spacing rhythm

- **Container:** `mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8`.
  (ServiGo spec calls for `max-w-7xl`; the *gutter ladder* is what matters.)
- **Section padding — one three-step ladder, used everywhere:**
  `py-16 sm:py-24 lg:py-28`. Nothing uses an arbitrary py.
- **Section separation:** `border-b border-line` between major bands, plus an
  alternating ground (`bg-bg` / `bg-surface-2`) to mark the rhythm. This is the
  main reason the page reads as "designed" rather than "stacked boxes".
- **Header → content gap:** `mt-14` (56px) after a section header. This is the
  single most-repeated number in the layout.
- **Grid gaps:** `gap-5` (cards), `gap-6` (tight card pairs), `gap-8` (panel
  internals), `gap-14` (hero columns), `gap-9` (numbered step lists).
- **Inset rhythm:** `p-5` cards, `p-6` panels, `p-3.5` tiles, `px-4 py-3`
  window chrome, `px-6 py-4` panel headers.

## 4. Border / radius / shadow

- **Borders are hairlines.** `border border-line` (1px) is the default card
  edge. `border-line-strong` is reserved for the top rule on numbered step
  lists. Colored borders only ever appear at 30% opacity
  (`border-primary/30`) on a soft-tinted chip.
- **Restrained radii — the scale is deliberately small:**
  `xs 4 · sm 6 · md 8 · lg 12 · xl 16 · pill 999`.
  Cards use `rounded-lg`; hero product mockups use `rounded-xl`; chips use
  `rounded` (4px) or `rounded-md`; buttons use `rounded-md`. **Nothing is
  `rounded-3xl`.** Large radii read as toy, not premium.
- **Shadows are structural, never neon** — and only on things that float:
  | token | value (light) |
  |---|---|
  | `--shadow-xs` | `0 1px 2px rgba(24,30,38,.04)` |
  | `--shadow-sm` | `0 1px 2px …, 0 1px 3px rgba(24,30,38,.07)` |
  | `--shadow-md` | `0 2px 4px …, 0 6px 18px rgba(24,30,38,.09)` |
  | `--shadow-lg` | `0 4px 8px …, 0 16px 40px rgba(24,30,38,.14)` |
  In-set surfaces (cards on a card) get `shadow-sm` or none. Only the hero
  visualization and modals get `shadow-lg`.
- **Focus is a system:** `:focus-visible { outline: 2px solid var(--primary);
  outline-offset: 2px }` globally, with `outline-primary` utilities on
  interactive controls.

## 5. Navbar style

- `sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-sm`, `h-16`.
- **Same height, same border, same tokens on every public page.** A single
  sticky header lives in the app shell — pages never render their own.
- Layout: brand (logo + wordmark) · center link list (`gap-8`, `text-sm
  font-medium text-text-soft` → `hover:text-ink`) · right actions (secondary
  ghost link + `buttonClasses('primary','sm')`).
- Mobile: a `h-9 w-9` ghost hamburger + a bordered panel that drops below the
  header, links at `px-3 py-2.5`. Closes on Escape and on link click.
- No shadow on the bar itself — the `border-b` is the separator.

## 6. Card style & density — what makes the cards feel *rich*

A rich card is **not** a box with a title in it. Every card in the reference
carries at least three of these layers:

1. **A labeled micro-header.** `text-[11px] font-semibold uppercase
   tracking-wider text-muted`. This alone is most of the "designed" feeling.
2. **Data, not adjectives.** A number, a bar, a before/after pair, a list with
   check/warn glyphs. Illustrative numbers beat lorem text.
3. **A nested surface** one step up the ladder (`bg-surface-2` on
   `bg-surface`) with its own hairline — creates depth without shadows.
4. **A status chip** in a `-soft` tone, often with a leading dot.
5. **A defined bottom edge** — `border-t border-line pt-3` with mono metadata
   on the left and a mono delta on the right.
6. **Tight, consistent padding** (`p-5` / `p-6`) and `space-y-5` between blocks.

Cards that could all look the same are deliberately made to differ: a wide
lead card, then 2×2 pairs, then numbered step rows with ghost numerals
(`text-primary/25`) and a `border-t border-line-strong` rule.

## 7. Motion patterns

All motion lives in one file of shared variants. Nothing is animated ad hoc.

| variant | definition | used for |
|---|---|---|
| `fadeUp` | `{opacity:0, y:16}` → `{opacity:1, y:0}`, `.4s easeOut` | blocks entering view |
| `fadeIn` | opacity only, `.35s easeOut` | elements already in layout |
| `staggerContainer` | `staggerChildren: 0.08, delayChildren: 0.05` | hero + grids |
| `staggerChild` | `{opacity:0, y:12}` → 0, `.35s easeOut` | children of a container |
| `pageTransition` | in `{0,8}` `.3s`, out `{0,-8}` `.18s` | route change |
| `hoverLift` | `y: -2`, `.18s easeOut` | **interactive cards only** |

Rules that matter:

- **Subtle distances only.** 8–24px. No scale-from-0.9, no big zooms.
- **Short durations.** 180ms hover, 350ms enter, 550ms max for a bar fill.
  One curve: `easeOut` (`cubic-bezier(.16,1,.3,1)`).
- **Trigger on `whileInView` with `viewport={{ once: true }}`** for everything
  below the fold, so scrolling back up doesn't re-animate.
- **Hover lift is `-2px`, never more**, and it is *reserved for cards*.
  Buttons change background color; they do not move. Image zoom is
  `scale-105` at `duration-700` — the only "large" value in the system.
- **Reduced motion is a global kill switch**, not a per-component concern:
  - JS: `MotionConfig reducedMotion="user"` wraps the whole app — every variant
    collapses to a single dissolve, no component needs to know.
  - CSS: a `prefers-reduced-motion: reduce` block forces
    `animation-duration/transition-duration: .01ms` and
    `scroll-behavior: auto` on every element, catching CSS-driven affordances
    (the sweep animation) that JS can't reach.
  - Information must still be conveyed without the animation (a sweeping
    indeterminate bar becomes a static centered sheen).

## 8. Top reusable components + behaviors

| # | Component | Behavior / contract |
|---|---|---|
| 1 | **`Container`** | `as`-polymorphic (`div`/`section`/`header`/`footer`); `max-w-6xl` + the `px-4 sm:px-6 lg:px-8` gutter ladder. The single width authority. |
| 2 | **`Button` / `buttonClasses`** | 4 variants (`primary`/`secondary`/`ghost`/`danger`) × 3 sizes (`sm h-8`/`md h-10`/`lg h-12`). `loading` renders an inline spinner, sets `disabled` + `aria-busy`. `fullWidth`. Crucially, **`buttonClasses` is exported separately** so `<Link>`/`<a>` can wear button styles without a polymorphic `as` prop. |
| 3 | **`Panel`** | The canonical surface: `border border-line bg-surface`, optional `header` slot split by its own `border-b px-6 py-4`. Every content block uses it, so cards/lists/forms read as one system. |
| 4 | **`SectionHeader`** | The editorial header triple: mono eyebrow **with a `h-px w-6 bg-primary` hairline**, `font-display` title, optional description. `align="center"` variant. Animates `fadeUp` on `whileInView`. |
| 5 | **`SectionLabel`** | The eyebrow alone, as a real `<h2 id>` — used where a section has no title block. |
| 6 | **`ProductCard`** (hero viz) | Window chrome (`h-2.5` dots, mono title, `↗` link) over a `space-y-5 p-5` body: stat tiles, chip rows, an AI-suggestion block, and a revision footer. `rounded-xl … shadow-lg`. |
| 7 | **`Placeholder`** | Scaffolding stays inside a bordered card (`rounded-lg border bg-surface px-8 py-14 shadow-sm`) so an unfinished page doesn't look broken. |
| 8 | **`LoadingState` / `Spinner`** | `role="status" aria-live="polite"`, centered, `py-16`, spinner inherits `text-primary`. Loading is a first-class *state*, never a blank page. |
| 9 | **`ThemeToggle`** | Cycles light → dark, persists to `localStorage`, and the attribute is written to `<html>` **before first paint** by an inline script in `index.html` — no flash of wrong theme. |
| 10 | **`LandingNav` / `PageShell`** | Sticky `h-16` bar (see §5). Escape-to-close + close-on-navigate for the mobile panel; `aria-expanded`/`aria-controls` wired to the panel. |
| 11 | **`useReducedMotion` / `useMediaQuery`** | Live media-query hook with an `addListener` fallback for older Safari. Paired with `MotionConfig` so reduced-motion is handled in exactly two places. |
| 12 | **`cn()`** | `clsx` + `tailwind-merge` in `lib/utils/cn` — every component composes classes through it so caller overrides actually win. |

---

## 9. The port checklist for ServiGo

1. Replace ad-hoc hex values in JSX with **role tokens** (`bg-surface`,
   `text-ink`, `border-line`); no inline `style={{}}` for color.
2. Adopt the `py-16 sm:py-24 lg:py-28` section ladder and `mt-14` header gap.
3. Cut radii to the `4/6/8/12/16` scale — **kill every `rounded-2xl`/`rounded-3xl`**.
4. Shadows only on floating things; depth otherwise from the surface ladder.
5. Exactly **one** sticky navbar, rendered by the app shell, token-styled so it
   reads identically over the hero and every section below it.
6. Every image goes through a `SafeImage` that swaps to a local fallback on
   error — a card must never render a broken-image icon.
7. One `MotionPage` per page; hero staggered with `staggerContainer`/
   `staggerChild`; hover lift `-2px` on cards only; reduced motion handled
   globally in CSS **and** via `MotionConfig reducedMotion="user"`.

---
name: Gemini Enterprise Obsidian
colors:
  background: '#0b0f19'
  on-background: '#f3f4f6'
  surface: '#111827'
  surface-dim: '#0b0f19'
  surface-bright: '#1f2937'
  surface-container-lowest: '#0b0f19'
  surface-container-low: '#111827'
  surface-container: '#18202f'
  surface-container-high: '#1f2937'
  surface-container-highest: '#2b3544'
  surface-variant: '#1f2937'
  on-surface: '#f3f4f6'
  on-surface-variant: '#9ca3af'
  inverse-surface: '#f3f4f6'
  inverse-on-surface: '#111827'
  outline: '#4b5563'
  outline-variant: '#374151'
  surface-tint: '#3b82f6'
  primary: '#2563eb'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#dbeafe'
  inverse-primary: '#93c5fd'
  secondary: '#6366f1'
  on-secondary: '#ffffff'
  secondary-container: '#312e81'
  on-secondary-container: '#e0e7ff'
  tertiary: '#10b981'
  on-tertiary: '#052e16'
  tertiary-container: '#064e3b'
  on-tertiary-container: '#d1fae5'
  error: '#ef4444'
  on-error: '#ffffff'
  error-container: '#7f1d1d'
  on-error-container: '#fee2e2'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  mono-id:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
  stat-lg:
    fontFamily: Outfit
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
rounded:
  sm: 0.375rem
  DEFAULT: 0.5rem
  md: 0.5rem
  lg: 0.75rem
  xl: 0.875rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: 24px
---

# Design System: Gemini Enterprise Manager
**Project ID:** 13879585810428878861

## Brand & Style

Gemini Enterprise Manager embodies a mission-critical cloud control plane crafted for enterprise AI platform architects, security administrators, and SRE teams. The aesthetic is grounded in deep obsidian-slate surfaces paired with crisp hairline borders, disciplined typographic hierarchy, and luminous electric-blue interactive accents that project authority, precision, and operational calm across high-density governance workflows.

Rather than relying on heavy drop shadows or decorative gradients, the visual language achieves clarity through crisp tonal elevation steps, high-contrast status semantics, and tabular data alignment. Every screen balances dense cloud resource telemetry—reasoning engines, discovery data stores, safety guardrails, and IAM policies—with progressive disclosure via slide-over inspector drawers and keyboard-first omnibar navigation.

## Colors

The palette is anchored by **Deep Obsidian Canvas** (`#0b0f19`) for root backgrounds and **Midnight Slate** (`#111827`) for primary navigation rails and shell chrome. Elevated surfaces step cleanly through **Carbon Panel** (`#18202f`), **Graphite Card** (`#1f2937`), and **Interactive Hover Slate** (`#2b3544`), separated by subtle **Steel Hairline** (`#374151`) borders so dense multi-pane workspaces remain effortlessly scannable without visual muddiness.

**Enterprise Cobalt** (`#2563eb`) serves as the primary interactive accent for primary actions, active navigation states, and `2px` high-visibility keyboard focus rings (`#3b82f6`). **Signal Indigo** (`#6366f1`) distinguishes AI evaluation, cURL inspection, and developer tooling affordances. Functional status roles pair high-contrast text with muted tinted containers: **Emerald Operational** (`#10b981` on `#064e3b`) for healthy/enabled resources, **Amber Drift** (`#f59e0b` on `#78350f`) for configuration warnings, and **Crimson Guardrail** (`#ef4444` on `#7f1d1d`) for destructive actions and Model Armor policy blocks.

## Typography

The typographic hierarchy pairs **Outfit** for page titles, section headers, and hero KPI metrics with **Inter** for dense operational UI controls, tables, and form labels, alongside **JetBrains Mono** for GCP project numbers, resource paths, cURL snippets, and trace latencies. Outfit's geometric clarity gives top-level headers and executive telemetry numbers unmistakable presence, while Inter's tall x-height maintains crisp legibility at compact `12px`–`14px` enterprise table scales.

Section overlines use uppercase `11px` semi-bold labels with `0.06em` tracking in **Muted Slate** (`#9ca3af`—ensuring WCAG AA 4.5:1 contrast against dark surfaces). All numeric columns, latency percentiles (`p50`/`p95`/`p99`), and token cost figures enforce `tabular-nums` alignment.

## Layout & Spacing

The application uses a fixed viewport **Command Shell** (`100vh` flex layout) composed of a collapsible left vertical navigation rail (`256px` expanded, `64px` icon rail collapsed, responsive slide-over drawer below `1024px`), a sticky `56px` contextual top bar housing breadcrumbs, active GCP project switcher, feature-gate badge, and `⌘K` omnibar trigger, and an independently scrolling main workspace canvas with `24px` desktop padding.

Spacing adheres to a strict `4px` base unit (`8px` compact control gaps, `16px` card padding, `20px` grid gutters, `24px` section rhythm). Data tables wrap inside inline-size container queries with sticky right-pinned action columns so primary **Inspect**, **Test**, and **Permissions** controls never scroll out of reach on `1280px` laptop viewports.

## Elevation & Depth

Depth is communicated through **Tonal Surface Layering** and crisp `1px` borders rather than heavy shadows:

1. **Level 0 (Root Canvas):** `#0b0f19` base workspace backdrop.
2. **Level 1 (Navigation & Header Chrome):** `#111827` persistent rail and header with `#1f2937` dividers.
3. **Level 2 (Cards & Data Tables):** `#18202f`–`#1f2937` containers bordered by `1px solid rgba(55, 65, 81, 0.8)`.
4. **Level 3 (Slide-Over Drawers & Modals):** `#1f2937` dialogs over a `rgba(0, 0, 0, 0.75)` backdrop with `8px` backdrop blur (`backdrop-blur-sm`) and elevated `24px` ambient shadow.

## Shapes

The shape language uses disciplined, architectural **8px (`0.5rem`)** radii on buttons, inputs, and menu items, paired with **12px (`0.75rem`)** radii on cards, tables, and modal dialogs. Status badges, project tier gates, and filter chips use **full pill (`9999px`)** geometry with a leading `6px` status dot AND explicit text label so state is never conveyed by color alone.

## Components

### Buttons

Primary buttons use solid **Enterprise Cobalt** (`#2563eb`, hover `#1d4ed8`) with crisp white `14px` medium text and `8px` corners. Secondary buttons use **Graphite Card** (`#1f2937`) with `#374151` borders, while destructive actions require explicit danger styling (`#dc2626`) gated behind confirmation dialogs. Every interactive button enforces visible `focus-visible` keyboard rings (`2px` `#3b82f6` with `2px` dark offset).

### Cards & Resource Containers

Cards use `#18202f` or `#1f2937` backgrounds with `1px` `#374151` borders, `16px`–`20px` internal padding, and structured header rows pairing title + subtitle on the left with contextual action buttons on the right.

### Navigation

The left rail groups 16 enterprise modules under 5 semantic categories (**Agent Management**, **Knowledge & Resources**, **Testing & Analysis**, **Security & Access**, **System**). Active routes display a solid cobalt pill (`#2563eb`), `aria-current="page"`, and an optional contextual API cURL inspector trigger.

### Inputs & Forms

Inputs pair an explicit `<label htmlFor>` above a `#111827` field container bordered by `#374151`, transitioning to `#3b82f6` with a subtle glow ring on focus. Validation errors appear inline beneath the input with an icon and `#fca5a5` text.

### Slide-Over Inspector & Telemetry Widgets

Selecting an agent, data store, connector, or trace opens a structured right-hand inspector drawer or split detail pane with tabbed sections (`Overview`, `Tools & Data Stores`, `IAM Policy`, `Live cURL`), keeping fleet context visible without jarring full-page context switches.

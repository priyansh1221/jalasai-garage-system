# Handoff: JalaSai UI Calm Redesign (Legacy + New UI, phone-first)

## Overview
Phone-first redesign of the two JalaSai Garage System UIs — the **Legacy UI** (dark, Rajdhani/amber) and the **New UI** (light glassmorphism, Manrope). Goal: reduce visual overload ("feels too much") without changing any workflow or backend. Every control in the redesign maps 1:1 to an existing function in `js/` — this is a re-layout + re-styling pass only.

Screens covered (per UI): **Jobs/Home**, **Invoices/Billing**, **Quick Invoice modal**.

## About the Design Files
The `.dc.html` files in this bundle are **design references created in HTML** — they show intended look and behavior, not production code to copy. The task is to **recreate these designs inside the existing JalaSai codebase** (vanilla HTML/CSS/JS, no build step): edit the existing markup in `index.html` / `NEW UI/index.html`, the row-template strings in `js/shell.js` / `js/jobs.js` / `js/new-ui.js`, and the two `style.css` files. **Do not touch** `js/data.js`, `js/sync.js`, Supabase, or any business logic.

- `Legacy UI (current).dc.html`, `New UI (current).dc.html` — faithful recreations of today's phone UI (baseline reference).
- `Redesign — Both UIs.dc.html` — the target. Options 1a–1c = Legacy, 1d–1f = New UI.

## Fidelity
**High-fidelity.** Colors, type, spacing and radii are exact and drawn from the app's own stylesheets. Recreate pixel-perfectly using the codebase's existing classes/tokens wherever one already matches (`.btn-p`, `.sbadge`, `.new-row`, etc.).

## Function mapping (critical constraint)
Every redesigned control calls an EXISTING function — nothing new in the backend:

| Redesigned control | Existing function |
|---|---|
| Bottom action bar: "+ New Job" | `openNewJob()` |
| Bottom action bar / FAB: "Quick Invoice" | `openQuickInvoice()` |
| Job card "Done ✓" / "Start ▸" | `markDone(id)` / `setJobStatus(id, 'in-progress')` |
| Tap job card → details sheet | `viewJob(id)` (details sheet then exposes `openEditJob`, `openJobPartsDrawer`, `removeJob`, `sendBill`) |
| "⛭ Filter" button | opens existing mechanic select + status checkbox menu (`filterJobs`, `toggleJobStatusFilterMenu`) |
| Completed-today collapsed row | `toggleDoneJobs()`; also hosts `openAddIncome()`, `openAddExp()` |
| Invoice card "Collect ₹X" | `openPayment(id)` → `savePayment()` |
| Invoice card 🖨 / 📱 | `openInvoice(id)` / `sendBill(id)` |
| "Dues only" chip | client-side filter over `jobDue(j) > 0` before render (same data `renderInvoices` uses) |
| Sort ↕ button | `setInvoiceSort(col)` |
| Quick Invoice fields | identical ids/handlers (`qi-*`, `saveQuickInvoice(mode)`) — only layout changes |
| "More ▼" collapsed group | show/hide wrapper around existing discount, invoice-no, invoice-date, notes, photo fields (fields keep their ids) |

## Design principles applied (both UIs)
1. **One stat strip** instead of 4 stacked KPI cards (4 columns, hairline dividers).
2. **One search + one Filter/Sort button** replaces the 6–8 stacked toolbar buttons; those actions move into the filter menu / collapsed rows.
3. **Thumb action bar** pinned bottom (Legacy) / existing bottom nav kept (New UI); primary actions never live at the top of a long scroll.
4. **Job cards: one primary action** visible; everything else behind card tap (`viewJob`).
5. **Invoices: cards, not a horizontally-scrolling table** on phone; dues get a red border + inline "Collect" button; "Dues only" chip filter.
6. **Quick Invoice: essentials first** (customer → vehicle/work → total/paid/payment); discount, invoice no./date, notes, photo collapsed under "More". Save Invoice is the single full-width primary; Save as Job Card / Save & Next are secondary; Cancel is the ✕.

---

## LEGACY UI (options 1a–1c)

### Design tokens (from root `style.css` — unchanged)
- Background: `linear-gradient(180deg,#111418 0%,#0b0d10 42%,#08090b 100%)`
- Card surface: `linear-gradient(180deg,rgba(28,31,36,.97),rgba(16,18,22,.99))`, border `1px solid rgba(255,255,255,.06)`, shadow `inset 0 1px 0 rgba(255,255,255,.04), 0 16px 34px rgba(0,0,0,.28)`
- Text `#f6f1eb` · muted `#a39a92` · accent `#d7d9de` · amber `#d28a42` · warn `#f5bb3d` · danger `#ff5f5f` · green `#00c896` · vehicle tan `#d8c2a7` · border `#2d3239`
- Fonts: headings `Rajdhani` 600/700, body `DM Sans` 300–500
- Buttons: primary = `.btn-p` gradient with amber border `rgba(210,138,66,.34)` (hover text `#ffe2c3`, border `.52`); ghost = `.btn-g`; danger = `.btn-r`
- Radii: cards 16px, inputs/buttons 12px, chips/badges 999px/20px

### 1a — Jobs (landing)
- **Header band** (nav surface gradient, bottom hairline): row 1 = logo 108×38 (radius 8) left, "Offline" pill right (red-tint pill, 6px dot, Rajdhani 600 11px); row 2 = horizontal-scroll tab pills (7px 13px padding, active pill = gradient + amber border). Removes the old two-row 76px nav + separate gs-bar.
- **Stat strip**: one card, 4 cells (flex 1/1/1/1.4), 1px dividers `rgba(255,255,255,.06)`. Value Rajdhani 700 20px (Active `#d7d9de`, In Prog `#f5bb3d`, Ready `#d28a42`, ₹Today `#d7d9de`); label 9px uppercase muted, 4px above-gap.
- **Search row**: search input flex 1 (44px min-height) + "⛭ Filter" ghost button.
- **Job card**: padding 14px (18px left for 3px status bar: warn/green/muted by status). Row: name Rajdhani 700 17px ↔ reg no amber 12px. Bike 12px `#d8c2a7`; work 13px muted lh 1.5. Footer: status sbadge + due badge, spacer, one primary "Done ✓" (36px). Meta line 11px `#6d665f`: mechanic · id · time.
- **Completed row**: dashed 1px `rgba(255,255,255,.1)` collapsed bar, hosts "+Income · +Expense" too.
- **Action bar**: fixed 12px from edges, `rgba(12,14,18,.92)` blur(12px) container radius 18, two 48px buttons: ghost "Quick Invoice", primary "+ New Job" (amber border `.52`, text `#ffe2c3`).

### 1b — Invoices
- Header: title + count left, "Dues only · ₹4,350" red pill chip right (`rgba(255,71,87,.12)` bg, `.3` border).
- Search + "↕ Sort" ghost button row.
- **Invoice card**: name ↔ `#4451` (Rajdhani 700). Meta 12px muted: bike · reg · date, time. Money row: total Rajdhani 700 18px, "Paid ₹600" 11px green, due badge. Dues card: border `rgba(255,71,87,.22)` + full-width "Collect ₹850" primary + 🖨 📱 icon buttons (40px). Clear cards: badge + right-aligned icon buttons only.
- Action bar: single "+ Quick Invoice" primary.

### 1c — Quick Invoice (modal, same `qi-*` fields)
- Sheet radius 18, padding 18; title ↔ ✕ (34px square ghost).
- Section labels: 10px uppercase `#d6c2ae` Rajdhani 600 (no boxed sections — flat groups with 16px gaps).
- Customer: one search input + recent chips as pills (999px, 36px) + dashed amber "+ New" chip.
- Vehicle & Work: bike (flex 1.4) + reg (flex 1) on one row; work textarea 64px.
- Amount: Total (amber border `.3`) + Paid, both 52px, Rajdhani 700 20px. Payment chips Cash/UPI/Card (selected = primary gradient); "Mechanic: Sanjay ▾" chip right.
- "More ▼" dashed collapsed row → reveals existing discount/invoice-no/date/notes/photo fields unchanged.
- Footer: "Save Invoice" 50px full-width primary; row of two 42px ghosts (Save as Job Card, Save & Next).

---

## NEW UI (options 1d–1f)

### Design tokens (from `NEW UI/style.css` final override block — unchanged)
- Background: `linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,255,255,0) 34%), linear-gradient(180deg,#eef0f4 0%,#dde1e8 100%)`
- Glass card: bg `rgba(250,251,253,.7)`, border `1px solid rgba(255,255,255,.72)`, shadow `0 14px 36px rgba(31,41,55,.1), inset 0 1px 0 rgba(255,255,255,.78)`, `backdrop-filter: blur(22px) saturate(145%)`
- Inner row: `rgba(255,255,255,.58)`, border `rgba(18,20,24,.07)`, radius 16–18
- Text `#151922` · muted `#68707c` · ink `#111318` · blue `#155eef` · green `#138a5b` · orange `#e06f1f` · red `#ef4056` · purple `#7256d9`
- Font: `Manrope` 700/800 (weight 850 in CSS renders as 800)
- Primary button = solid `#111318`, white text, radius 12–14; ghost = `rgba(255,255,255,.68)` + border `rgba(17,24,39,.1)`
- Status chips: 999px pills, tinted bg at .12/.13 alpha
- Bottom nav: unchanged from current (5 tabs, active = `#111` pill)

### 1d — Home
- **Single top bar** replaces floating hamburger + gs-bar + hero: 44px menu button, brand "JalaSai" 17px/800 with status line "Offline · saved on device" 11px muted beneath, sync dot right (10px; `#8f97a3` offline / `#138a5b` healthy / `#ff8a2f` pending / `#ef4056` issue — same states as `renderHomeDashboard`). System Health panel is DELETED; the dot + status line carry it.
- **KPI strip**: one glass card, 4 columns with left hairlines: ₹Today / Jobs / Dues (red) / Reorder (orange). Value 18px/800, label 9px uppercase muted.
- **Quick actions: 4** (New Job solid-ink primary, Invoice, Scan, Receive), grid 4×, 72px tall, icon 18px over 11px label. Customer + Reports move into the sidebar/More (functions unchanged).
- **"In the workshop" panel** (new use of existing `home-jobs-list` markup): panel head h2 16px/800 + "Jobs →" ghost chip; `new-row` items 58px: name 14px bold, meta 12px muted, status pill right.
- **"Reorder needed" panel**: unchanged structure from current (`new-row` + low/out pills).

### 1e — Billing
- Top bar: menu + "Billing" + "142 invoices · ₹4,350 due" subtitle.
- Search (44px, radius 14) + ↕ sort icon button.
- **Chip filter row**: All (active = ink pill) / Dues (6) (red tint) / Today (ghost).
- **Invoice cards** replace the min-width 620px table: same content as Legacy 1b but glass surfaces; dues card border `rgba(239,64,86,.24)`, "Collect ₹850" = solid-ink primary; 🖨 📱 ghosts.
- Bottom nav: Billing active.

### 1f — Quick Invoice
Same structure as 1c with New UI skin: sheet `rgba(250,251,253,.97)` radius 20; labels 10px uppercase 850 muted; inputs white `.9` radius 14; Total border `rgba(21,94,239,.35)`; selected chips solid ink; "+ New" chip dashed blue; "More ▼" dashed `rgba(17,24,39,.18)`; Save Invoice solid ink 50px.

---

## Interactions & Behavior
- Tab/nav switching: existing `showPage(p)`; page fade `.15s ease` kept.
- Job card tap → `viewJob(id)` details sheet (existing modal) — status select, Edit, Parts, Delete, photos all live there.
- Filter button → existing status-checkbox menu + mechanic select, presented as a bottom sheet on phone (same checkboxes/handlers).
- "More ▼" groups: simple class toggle (`display:none` ↔ block), chevron rotates; fields keep ids so `saveQuickInvoice` reads them unchanged.
- Collect → existing `m-payment` modal (amount, method chips, notes, discount → `savePayment()`).
- Buttons: transitions `.18–.2s ease`, hover states per existing `.btn-p:hover` / `.btn-g:hover` rules.
- Touch targets: ≥44px for all primary controls; 34–40px only for tertiary icon buttons.
- Skeletons/pagination: keep `renderPageSkeleton`, `paginatedLongList` — card list renders from the same row loop that currently emits `<tr>`.

## State Management
No new state. Two additions to render-layer only:
- `invoiceFilter: 'all' | 'dues' | 'today'` (client-side predicate before the existing sort/paginate).
- `quickInvoiceMoreOpen: boolean` (UI toggle).
Both can live as module-level vars like existing `invoiceSort` / `invoiceSearch`.

## Assets
- `assets/jalasai-logo-premium.jpg` (existing repo asset; 108×38 in redesigned Legacy header).
- Fonts via existing Google Fonts links: Rajdhani 500–700, DM Sans 300–500 (Legacy); Manrope 500–800 (New UI).
- New UI icons: existing `.ui-ico` CSS icons — the glyphs in the mock (⌂ ▤ 🧾 ▦ ＋) are placeholders for them.

## Files
- `Redesign — Both UIs.dc.html` — target design, options 1a–1f
- `Legacy UI (current).dc.html` — baseline recreation, Legacy
- `New UI (current).dc.html` — baseline recreation, New UI
Open each in a browser; screens are laid out side by side at 390px width.

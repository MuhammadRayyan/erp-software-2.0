# UAE Manager — Design System & UI Guidelines

This specification defines the tokens, navigation architecture, primitives, table paradigms, and interaction patterns used across UAE Manager. All styling is implemented with Tailwind CSS v4 utilities backed by semantic CSS custom properties in [globals.css](../src/app/globals.css).

---

## 1. Visual Design Principles

1. **Calm, High-Contrast Clarity**: Light surfaces layer cleanly (`--background` → `--surface` → `--surface-raised`), avoiding harsh borders or saturated backgrounds while maintaining WCAG AA legibility across Light and Dark modes.
2. **Tabular Financial Precision**: Monetary totals, invoice numbers, exchange rates, quantities, and dates render with `tabular-nums` (`.tabular` utility) and right-aligned numeric columns so columns scan vertically without horizontal jitter.
3. **Predictable Workspace Rhythm**: Standard page shells, card padding, form grids, and Z-pattern document builders give users identical muscle memory across Sales, Purchases, Banking, Payroll, and Settings.
4. **Keyboard-First Productivity**: Every major navigation jump (`Ctrl/Cmd+K`), search/filter select (`Combobox`), and multi-line document grid (`Tab` / `Shift+Tab` + spreadsheet TSV paste) supports rapid keyboard entry.

---

## 2. Color Tokens & Global Styles (`src/app/globals.css`)

Do not hardcode Tailwind palette colors (like `bg-gray-100` or `text-red-600`) in shared chrome, badges, or surfaces where semantic variables apply.

| Token | Light Mode | Dark Mode | Purpose |
| :--- | :--- | :--- | :--- |
| `--background` | `#f2f5f8` | `#171c24` | Outer canvas background |
| `--surface` | `#f8fafc` | `#1c222c` | Navigation rails & secondary bands |
| `--surface-raised` | `#ffffff` | `#222a35` | Cards, panels, tables, popovers, inputs |
| `--surface-muted` | `#edf1f5` | `#29323e` | Table headers, hover washes, totals strips |
| `--foreground` | `#202936` | `#e7ebf1` | Primary text |
| `--muted-foreground` | `#657184` | `#9aa6b5` | Labels, helper copy, table captions |
| `--border` / `--border-strong` | `#dce2e9` / `#cbd4df` | `#303a47` / `#3b4756` | Panel dividers & interactive borders |
| `--primary` / `--primary-foreground` | `#356fd0` / `#ffffff` | `#6294e6` / `#101722` | Primary CTAs, active nav highlights |
| `--accent` / `--accent-foreground` | `#e9f0fb` / `#245cac` | `#263853` / `#b9d2f8` | Selected states, active nav pills |
| `--success` | `#20815a` | `#58b88c` | Paid, Posted, Cleared, Approved |
| `--warning` | `#a56514` | `#d7a353` | Draft, Pending Approval, Attention |
| `--danger` | `#c44040` | `#e27676` | Overdue, Void, Bounced, Errors |
| `--info` | `#2d6fbd` | `#72a7e6` | Sent, Informational, Issued |
| `--ring` | `#4b7fd2` | `#72a7ed` | Accessible keyboard focus outlines |

### Global Layout & Panel Classes
- `.page-container`: Centered workspace (`max-w: 1280px`, `padding: 22px 26px 40px`).
- `.page-header`, `.page-title` (`24px`, `font-weight: 650`, `-0.025em`), `.page-description`.
- `.data-panel`: Rounded raised container framing scrollable tables and toolbars.
- `.form-section`: Bordered white/raised card grouping header metadata or bottom summaries.

---

## 3. App Shell, Navigation & Command Palette

- **App Shell** ([app-shell.tsx](../src/components/app-shell/app-shell.tsx)):
  - **Collapsible left sidebar**: Persists user collapse state (`uaemanager.sidebarCollapsed` + `ui-sidebar-collapsed` cookie) with tooltip labels when collapsed and an accessible mobile drawer on `< lg` viewports.
  - **Active Business Label & Settings Footer**: Displays the active workspace name cleanly at the top-left (switching/creating workspaces lives exclusively in `AccountMenu` → `/businesses`) and provides a sticky bottom **Settings** link (**Customize Modules** via [customize/page.tsx](../src/app/b/[businessId]/settings/customize/page.tsx) and Super-Admin **System Health & Diagnostics** live inside Settings).
  - **Header utilities**: Notification bell with unread/pending-approval badges, Quick-search trigger button, and Account menu.
- **Global Command Palette (`Ctrl/Cmd + K`)** ([command-palette.tsx](../src/components/command-palette.tsx) & [command.tsx](../src/components/ui/command.tsx)):
  - Built on `cmdk` inside Radix `DialogRoot` (`CommandDialog`).
  - Groups commands deterministically in order: **Create** → **Navigation** → **Settings**, filtered dynamically by granted module permissions (`ModuleKey[]`), per-business [nav-customization.ts](../src/components/app-shell/nav-customization.ts) visibility, and super-admin status.
- **Settings Information Architecture**:
  - **Single-Column Settings Layout** ([settings/layout.tsx](../src/app/b/[businessId]/settings/layout.tsx)): Focused single-column workspace using [SettingsShell](../src/components/settings-shell.tsx) with a persistent back link to the Settings Hub across all viewports.
  - **Uncluttered Settings Hub**: [SettingsHubClient](../src/app/b/[businessId]/settings/settings-hub-client.tsx) groups company, tax, currency, document, and security controls into clean search-filterable grids without split-rail clutter.

---

## 4. Shared UI Primitives (`src/components/ui/`)

Configured via [components.json](../components.json) (`new-york` conventions, `lucide-react` icons, `cn()` class merging):

| Primitive | Source | Behavior & Key Rules |
| :--- | :--- | :--- |
| **Button** | [button.tsx](../src/components/ui/button.tsx) | Variants: `primary`, `secondary`, `ghost`, `danger`; Sizes: `default` (`h-9`), `sm` (`h-8`), `lg` (`h-10`), `icon` (`size-9`). Accepts optional `permission?: ActionKey \| ActionKey[]` and automatically hides when unauthorized via `useActionPermission()`. |
| **Badge** | [badge.tsx](../src/components/ui/badge.tsx) | Semantic tones: `neutral`, `info`, `warning`, `success`, `danger` (`h-[22px] rounded-[5px] text-[11.5px]`). |
| **Combobox** | [combobox.tsx](../src/components/ui/combobox.tsx) | Searchable Radix `Popover` + `cmdk` selector with `allowClear`, `disabled`, keyboard `Escape`/`Arrow` navigation, grid cell focus advance (`onGridTabAdvance`), and automatic `@tanstack/react-virtual` list virtualization when `options.length > 40`. |
| **Checkbox / Popover / Tabs / Tooltip** | `src/components/ui/*.tsx` | Built on `@radix-ui/react-checkbox`, `react-popover`, `react-tabs`, and `react-tooltip` (`TooltipProvider` delay `250ms`) with unified focus rings (`focus-visible:ring-2 focus-visible:ring-ring`) and `z-[70]` overlays. |

---

## 5. Three Standardized Table Paradigms

All tabular interfaces across the application must use one of three canonical patterns:

### Paradigm A — Primary List / Data Tables
- Used by Customers, Suppliers, Sales Quotes/Orders/Invoices, Purchase Quotes/Orders/Invoices, Receipts, Supplier Payments, Payroll Employees, Payslips, Items, and Bank Accounts.
- **Implementation**: `@tanstack/react-table` wrapped in [DataTable](../src/components/ui/data-table.tsx) and [CashDocumentTable](../src/modules/shared/cash-document-table.tsx).
- **URL-Synced Server State (`nuqs`)**: Search (`q`), status (`status`), date bounds (`from`, `to`), server sort (`sort`, `dir`), and pagination (`page`, `pageSize`) bind cleanly to URL parameters ([list-query-params.ts](../src/lib/list-query-params.ts)) so reloads, deep links, and Back navigation retain exact filters.
- **Zero-Match Preservation**: When filters match 0 rows, `DataTable` renders its empty card **below** the active toolbar and `ActiveFiltersRow` (`FilterChip` + reset control) — never unmount search/filter controls on empty results.
- **Table Widths**: Minimum table widths use the named tokens `--container-table-sm|md|lg|xl|2xl` (32.5 / 40 / 47.5 / 56.25 / 67.5 rem, defined in `@theme` in [globals.css](../src/app/globals.css)) as `min-w-table-*`; `DataTable` defaults to `min-w-table-lg`. Arbitrary pixel widths such as `min-w-[720px]` are rejected by [table-width-tokens.test.ts](../tests/unit/table-width-tokens.test.ts).
- **Columns, Density & Totals**: Supports `data-density="compact" | "default" | "comfortable"` via `.data-table`, sticky first column (`pinFirstColumn`), column visibility toggles (`useColumns`), hover/focus-revealed `.row-actions`, CSV export (`exportCsv`), batch selection checkboxes + `BatchActionBar`, and [TableTotalsBar](../src/components/table-totals-bar.tsx) showing DB-wide multi-currency totals rather than page-only sums.

### Paradigm B — Editable Document Line-Item Tables & Workspace Layout
- Used by Quote, Order, Invoice, Purchase Invoice, Credit Note, and Debit Note editors.
- **Workspace Structure** ([document-workspace-layout.tsx](../src/components/documents/document-workspace-layout.tsx)):
  1. Top `.form-section`: Counterparty, Document Dates, Currency/FX, Reference header fields.
  2. Middle `.form-section`: Full-width line items workspace ([DocumentGrid](../src/components/documents/grid/document-grid.tsx) / [DocumentLineTable](../src/components/documents/document-line-table.tsx)) with column visibility toggles, multi-row TSV spreadsheet paste (`parseTSV`), and `@tanstack/react-virtual` row virtualization above `25` lines.
  3. Bottom split (`lg:grid-cols-[1.25fr_0.75fr]`): Notes, Terms, Custom Fields on left; sticky `IsolatedDocumentTotals` (using isolated `useWatch` subscriptions so line edits do not re-render unrelated header sections) + tax-inclusive Radix `Checkbox` on right.
- **Non-Duplicative Sticky Action Bar** ([document-form-footer.tsx](../src/components/document-form-footer.tsx)):
  - Stays pinned at viewport bottom (`sticky bottom-0`) with primary permission-aware workflow actions (`Save Draft Quote`, `Save & Issue`, `Save & Post`, `Submit for Approval`, `Save Draft`).
  - Displays a single compact **Net Due / Total** pill (and Credit applied pill if applicable) instead of duplicating the full Subtotal/VAT breakdown already visible in the right-hand summary panel.

### Paradigm C — Read-Only Detail & Financial Report Tables
- Used by Document Paper Views (`DocumentViewLayout`), Activity Logs, Statements, Trial Balance / P&L / Balance Sheet, and HR Payroll EOSB breakdowns.
- Applies `.data-panel` and `.data-table` styling without inline row-selection checkboxes, pairing clickable source numbers and comparative drill-down triggers with semantic `StatusBadge` indicators and aligned `.col-numeric` figures.

---

## 6. Settlement Allocation & HR Payroll Conventions

- **FIFO Settlement Allocation** ([settlement-allocation-form.tsx](../src/components/documents/settlement-allocation-form.tsx) & [settlement-allocation-math.ts](../src/components/documents/settlement-allocation-math.ts)):
  - Shared by Customer Receipts and Supplier Payments (`direction: "receipt" | "payment"`).
  - `allocateFifo()` orders open documents strictly by `dueDate ASC` → `invoiceDate ASC` → `documentNumber ASC`, filtered to active settlement currency, displaying exact **Allocated** vs. **Advance / Unallocated Surplus** vs. **Over-allocated** states cleanly.
- **HR & Payroll Compliance**: Employee directories, Pay Run dialogs, Payslips, Salary Items, and EOSB previews follow Paradigm A/C semantics and must format all monetary cells using dynamic business currency (`formatMoney(minor, currency)`).

---

## 7. Accessibility & Motion

- Semantic `<button>`, `<th scope="col">`, explicit `aria-label` on `Combobox` triggers/search inputs, and Radix dialog/popover focus trapping ensure full keyboard and Playwright accessibility-locator compatibility.
- Interactive row and control transitions stay brief (`120ms ease`) and respect system reduced-motion preferences (`@media (prefers-reduced-motion: reduce)`).

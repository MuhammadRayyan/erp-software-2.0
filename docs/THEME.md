# Global Theme and UI Rules

This file defines only global visual rules. Page-specific layout belongs in phase specs.

## Design Character

Target feel:

**compact accounting application + polished modern SaaS craft**

Borrow:
- Manager.io: directness, compactness, low clutter
- QuickBooks/Xero: visible statuses, practical list actions
- Zoho Books: strong saved-document action set
- Odoo: clear draft -> posted/sent workflow concepts
- Linear/shadcn-style products: restrained visual polish and keyboard-friendly controls

Avoid:
- pure-white glare
- pure-black dark mode
- oversized cards
- huge empty spacing
- excessive gradients
- glassmorphism
- neon colors
- pill-shaped everything
- decorative animation
- dashboards with dozens of widgets
- icon-only buttons when the action is important or ambiguous

## Theme Modes

Required:
- Light
- Dark
- System

Use a `data-theme` or class-based selector so Tailwind dark variants work predictably.
Persist user selection locally in Phase 0; account-level persistence can come later.

## Color Strategy

Use semantic CSS variables, not hard-coded component colors.

Required tokens:

```css
--background
--foreground

--surface
--surface-raised
--surface-muted

--border
--border-strong

--muted
--muted-foreground

--primary
--primary-foreground

--secondary
--secondary-foreground

--accent
--accent-foreground

--success
--success-foreground
--warning
--warning-foreground
--danger
--danger-foreground
--info
--info-foreground

--ring
```

### Light Theme Direction

Do not use #ffffff for the whole application canvas.

Use:
- softly tinted neutral page background
- slightly lighter surfaces for content
- white only where useful for raised cards/sheets
- dark charcoal text instead of absolute black
- subdued cool-gray borders
- restrained blue primary accent

Visual direction, not mandatory literal values:

```text
Application background: cool gray/off-white
Surface: near-white
Raised surface: white
Primary text: charcoal/slate
Secondary text: muted slate
Border: cool light gray
Primary: calm medium blue
```

### Dark Theme Direction

Do not use #000000 as the page background.

Use:
- deep slate/charcoal background
- slightly lighter panels
- low-glare borders
- off-white text rather than pure white
- same blue family but adjusted for contrast

Do not simply invert the light theme.

## Typography

Prefer a modern system/Inter-like sans-serif.

Application:
- base body: 14px or 15px
- table text: 13px to 14px
- labels: 12px to 13px
- page title: ~24px
- section title: 16px to 18px

Use tabular numbers for money, totals, invoice numbers where appropriate.

Amounts should align right.

Avoid bold everywhere.
Use weight hierarchy:
- page title: semibold
- table header: medium
- normal data: regular
- totals: medium/semibold

## Spacing and Density

Primary density is "comfortable compact".

Typical:
- control height: 34-38px desktop
- primary button: 36-40px
- table row: 38-44px
- page gutters: 20-28px desktop
- section gaps: 20-24px
- small gaps: 6-12px

On touch/small screens, increase important tap targets.

## Radius and Elevation

Use modest radius:
- controls: 6px
- cards/panels: 8px
- dialogs: 10px

Use shadows sparingly.
Prefer borders and surface contrast for structure.

## Buttons

Button hierarchy:

1. Primary: one main action per page
2. Secondary/outline: important alternatives
3. Ghost: low-priority/tool actions
4. Destructive: only dangerous actions

Examples:

Invoice list:
`+ New Invoice` is primary.

Invoice view:
`Edit` may be primary.
`Email`, `Print/PDF` are secondary.
`More` contains duplicate/delete/less-used actions.

Responsive behavior:
- desktop: label + icon where useful
- smaller widths: preserve primary action label
- secondary actions may move into `More`
- never hide a critical action behind an unexplained icon

## Forms

Use full pages for major records.

Desktop:
- content max width generally 1100-1400px depending on table/form
- invoice forms may use wider canvas
- fields grouped into visually quiet sections
- labels above inputs unless a dense row pattern is clearly better

Do not put every section in a heavy card.

Use:
- subtle section separator
- heading
- optional short helper text

Long forms may have a sticky bottom action bar:

```text
Cancel                    Save Draft     Save
```

or contextual variants.

## Tables

Accounting tables should be dense, readable, and globally consistent across every module in the application.

Three standardized table paradigms are enforced globally:

### 1. Primary Entity List / Data Tables (`DataTable` Component)
All top-level list registers (Sales, Purchases, Banking, Projects, Inventory, and **HR & Payroll**):
- **Engine**: `@tanstack/react-table` legacy model (`useTable`, `createCoreRowModel`, `createSortedRowModel`).
- **Container**: Wrapped in `.data-panel` (`border: 1px solid var(--border)`, `border-radius: 8px`, `background: var(--surface-raised)`).
- **Headers**: Sticky headers (`var(--surface)`), semibold, interactive sort indicators with ascending/descending arrows.
- **Rows**: Subtle hairline dividers (`border-top: 1px solid var(--border)`), smooth hover highlight (`var(--surface-muted)`), and selected row indicators.
- **Data Formatting**: Right-aligned tabular money and numbers via `meta: { numeric: true }`, `.col-numeric`, and `.money`.
- **Status Badges**: Standardized semantic tone badges via `<StatusBadge />`.
- **Row Actions**: Context-sensitive 3-dot kebab menu (`DropdownMenu` with `MoreHorizontal` trigger) and hover-revealed navigation chevron (`ChevronRight`).
- **Density Control**: `DensityToggle` component binding to `useTableDensity(businessId)` supporting `compact` (40px), `default` (48px), and `comfortable` (56px) via `data-density`.
- **Column Visibility**: `useColumns` hook with dropdown selector (`columns-dropdown.tsx`) persisting user visibility preferences per business/module.
- **Cell Text Wrapping**: Primary text and multi-line descriptions use `meta: { wrap: true }` (applied via `.col-wrap` and `.whitespace-normal`) to avoid truncation of long employee names, designations, and notes.
- **Multi-Currency Support**: All tables receive the active business currency (fallback `"AED"`), formatting figures via `formatMoney(minor, currency)` rather than hardcoding currency codes.
- **Summary Totals**: `TableTotalsBar` docked below the table displaying filtered count, total count, and aggregated financial totals, rendered conditionally when filtered rows exist.
- **Empty States**: Standardized empty state card with Search icon, descriptive title, explanation subtext, and 1-click "Clear filters" action.

### 2. Document Line-Item Tables (`.line-item-table`)
Used in document creation and editing forms (Invoices, Quotes, Orders, Credit Notes, Debit Notes, and **Payslip Form**):
- Visual styling: `border-collapse: separate`, `border-spacing: 0 6px`.
- Rows: Floating rounded cards (`border-radius: 8px`, `border: 1px solid var(--border)`, `background: var(--surface-raised)`) with subtle hover elevation (`translateY(-1px)`).
- Headers: Clean uppercase, letter-spaced, muted labels without borders.
- Inputs: Consistent height (`h-8`), responsive text (`text-xs`), and right-aligned numeric inputs (`.money text-right`).
- Actions: End-of-row ghost icon button (`Trash2`) with danger hover state.

### 3. Read-Only Document Detail / Computation Tables (`.data-table`)
Used in saved document view screens and calculation breakdowns (Invoice detail, Bill detail, **Payslip Detail**, **EOSB Calculator Statutory Breakdown**, and **Pay Run Employee Selection**):
- Clean `.data-panel` enclosure with `.data-table`.
- Consistent column widths, `.money text-right` alignment, and bold summary footer (`tfoot`).

Do not make every cell editable by default. Use dedicated forms and modals for master record edits.

## Filters

Default list header:

```text
[ Search... ]                 [ Filter ] [ Columns ] [ + New ]
```

When filters are active, show compact removable filter chips below/within the toolbar.

On narrow screens:
- search can occupy first row
- Filter and primary action remain easy to reach
- Columns may move into More

## Statuses

Use semantic badges with restrained fills.

Examples:
- Draft: neutral
- Sent/Open: info
- Partially Paid: warning
- Paid: success
- Overdue: danger

Do not communicate status by color alone; always include text.

## Navigation

Desktop:
- left sidebar
- grouped module labels
- business switcher near top
- settings near bottom
- sidebar can collapse to icon rail, but default remains expanded

Small screens:
- sidebar becomes sheet/drawer
- top bar keeps current page/business context
- do not attempt to show desktop sidebar squeezed into mobile width

Hide unauthorized/unlicensed modules completely.

## Keyboard and Focus

Use visible focus rings.
Do not remove outlines without a replacement.

Support normal keyboard navigation through shadcn/Radix primitives.
Later add command palette shortcuts, but Phase 0 can include `Cmd/Ctrl+K` shell if cheap.

For drag-and-drop interfaces, provide non-drag alternatives eventually.
Phase 0 only needs basic usable drag interactions.

## Accessibility Baseline

Aim for:
- readable text contrast
- visible focus
- semantic labels
- keyboard-operable dialogs/menus
- no tiny clustered click targets
- text + icon for important actions

Do not turn Phase 0 into an accessibility certification project.

## Motion

Use only short functional transitions:
- dropdown/popover open
- sidebar collapse
- hover/focus
- small toast entry

Honor reduced motion when provided by primitives/platform.

No decorative page-transition animation.

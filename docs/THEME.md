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

Accounting tables should be dense and readable.

Required behaviors where relevant:
- row hover
- selected row
- sticky header for long lists
- right-aligned money
- status badge
- sortable columns
- search
- filter button
- optional Columns control
- row overflow menu
- horizontal scroll rather than broken wrapping

Do not make every cell editable by default.

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

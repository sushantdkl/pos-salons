---
name: The Hair Cut POS
description: A compact, role-aware operational interface for fast and trustworthy salon work.
colors:
  workspace-warm: "#f7f5f2"
  workspace-cool: "#f7f8fa"
  surface: "#ffffff"
  ink: "#111827"
  text: "#374151"
  muted-text: "#6b7280"
  border: "#e5e7eb"
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  allowed: "#047857"
  allowed-soft: "#ecfdf5"
  blocked: "#b91c1c"
  blocked-soft: "#fef2f2"
  caution: "#b45309"
  caution-soft: "#fffbeb"
typography:
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Outfit, Geist, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Outfit, Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Outfit, Geist, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px 12px 44px"
    height: "48px"
  card-operational:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  status-allowed:
    backgroundColor: "{colors.allowed-soft}"
    textColor: "{colors.allowed}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  status-blocked:
    backgroundColor: "#f3f4f6"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  status-mixed:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
---

# Design System: The Hair Cut POS

## Overview

**Creative North Star: "The Calm Control Desk"**

The Hair Cut POS is a compact operational workspace: quiet enough for long shifts, dense enough for counter work, and explicit about financial and access state. Warm dashboard chrome preserves the established salon identity, while white working surfaces and cool gray permission screens keep high-consequence tasks legible.

The system favors familiar controls, restrained neutrals, and color with a job. Blue marks functional focus and primary action; emerald confirms allowed or successful states; red is reserved for destructive or error meaning; gray communicates blocked or inactive state; amber identifies mixed access and policy locks. The permissions surface is role-first: choose the staff role, understand its access summary, then inspect or change grouped capabilities.

**Key Characteristics:**

- Compact, light, high-density operational composition.
- Role and status are visible before individual controls.
- White surfaces, fine borders, and restrained ambient shadow.
- Responsive stacking that preserves touch targets and reading order.
- Color is semantic, never ornamental.

## Colors

The palette pairs warm salon shell neutrals with cool operational surfaces and a disciplined set of semantic accents. Normative values live in the frontmatter.

### Primary

- **Action Blue:** Used for focused fields, primary operational accents, links, and the selected role identity.

### Secondary

- **Allowed Emerald:** Used for affirmative permission state, successful feedback, and allowed counts.

### Tertiary

- **Policy Amber:** Used for mixed groups, mandatory restrictions, and caution that is neither success nor failure.
- **Blocked Red:** Used for destructive action cues, errors, and blocked-count emphasis; routine blocked toggles remain neutral gray.

### Neutral

- **Warm Workspace:** The dashboard shell behind application content.
- **Cool Workspace:** The permissions workspace background for precise administrative tasks.
- **Clean Surface:** Cards, headers, navigation, fields, and control backgrounds.
- **Operational Ink:** Headings and high-priority values.
- **Working Text:** Controls and supporting labels.
- **Muted Text:** Descriptions, metadata, and secondary counts.
- **Hairline Border:** Section separation, input outlines, and card boundaries.

### Named Rules

**The Color Has a Job Rule.** Blue acts, emerald allows, red warns or destroys, gray blocks, and amber marks mixed or locked state; do not swap these meanings for variety.

**The Neutral Block Rule.** A routine denied permission is gray, not red. Red is reserved for destructive actions, errors, and summary emphasis so it retains urgency.

## Typography

**Display Font:** Manrope (with system-ui fallback)
**Body Font:** Outfit (with Geist and sans-serif fallbacks)

**Character:** Dashboard headings are sturdy and compact; body copy is open, plainspoken, and easy to scan at operational density. Weight, size, and spacing create hierarchy without decorative typography.

### Hierarchy

- **Headline** (700, 30px, 1.2): Major dashboard and administrative page titles; use tight tracking.
- **Title** (600, 16px, 1.5): Card headings, role summaries, group names, and important row labels.
- **Body** (400, 14px, 1.5): Descriptions, helper copy, metadata, and history details.
- **Label** (600, 12px, 0.14em): Short section eyebrows and compact operational labels; uppercase only when it improves grouping.

### Named Rules

**The Counter-Glance Rule.** A page title, selected role, group state, and primary action must remain distinguishable without relying on color alone.

## Layout

The application uses a fixed dashboard rail on desktop, 256px expanded and 80px collapsed, with content offset to match. Below the 1024px breakpoint the rail becomes an overlay drawer and a sticky mobile header exposes a minimum 48px menu control. Page content uses a centered container up to 1280px, 16px side padding on small screens and 32px from the small breakpoint upward.

Operational surfaces follow a tight 4px-based rhythm, most often 12px, 16px, 20px, 24px, and 32px. Cards and permission groups stack vertically with 12-20px gaps. Within a row, place identity and explanation first and status or action last. On narrow screens, rows stack in the same semantic order; action controls remain full-width or self-starting rather than compressing text. Horizontal role tabs may scroll rather than wrap.

**The Role-First Rule.** Permission work always resolves the active role before exposing grouped permission changes or history.

**The Stack, Don't Squeeze Rule.** Below the component's comfortable width, stack labels, summaries, and controls vertically while retaining at least 40px controls and 44-48px primary touch targets.

## Elevation & Depth

Depth is restrained and mostly structural. White surfaces are separated from the workspace by fine borders; low ambient shadows identify major cards, selected tabs, and branded marks. Higher shadows are reserved for reusable legacy cards on hover and must not become the default treatment for dense permission rows.

### Shadow Vocabulary

- **Selected Control** (`0 1px 2px rgba(0,0,0,0.05)`): Active segmented tabs and compact controls.
- **Operational Card** (`0 8px 28px rgba(17,24,39,0.05)`): Major summary containers only.
- **Brand Mark** (`0 8px 22px rgba(17,24,39,0.16)`): Small high-contrast identity marks.

### Named Rules

**The Border-Before-Shadow Rule.** Establish hierarchy with background, border, spacing, and type before adding shadow.

## Shapes

The system uses gently curved geometry: 10-12px controls and navigation items, 16px major cards and grouped surfaces, and fully rounded status chips. Borders are crisp and light. Icon containers echo the control radius, and circular geometry is limited to avatars, indicators, and pills rather than large content surfaces.

## Components

### Buttons

- **Shape:** Gently curved controls (10-12px) with centered icon-label pairs and minimum 40-48px height.
- **Primary:** Action blue with white text for committed actions; use 12px by 16px padding at standard operational size.
- **Hover / Focus:** Darken the fill or tint the neutral surface. Keyboard focus uses a visible two-pixel blue ring or equivalent border-plus-ring treatment.
- **Secondary / Ghost:** White or transparent surfaces with neutral text; borders distinguish bulk and reset actions.
- **Disabled:** Preserve the label and meaning, lower opacity, and show a non-interactive cursor. Locked permissions pair the disabled state with a lock icon and explanation.

### Chips

- **Style:** Compact semantic pills with tinted background, dark semantic text, and a one-pixel ring.
- **State:** Emerald means allowed, gray means blocked, amber means mixed or policy-locked. Every color state also has a text label and, where useful, an icon.

### Cards / Containers

- **Corner Style:** 16px for major permission and history surfaces; 12px for reusable cards and compact controls.
- **Background:** White on warm or cool off-white workspaces.
- **Shadow Strategy:** Flat by default; ambient shadow only for top-level summaries or deliberate selection.
- **Border:** One-pixel light gray dividers and outlines; amber may replace the outer border for a mixed permission group.
- **Internal Padding:** 16-20px for dense operational cards, up to 24px for general dashboard cards.

### Inputs / Fields

- **Style:** White fill, neutral border, 12px radius, 48px minimum height, and 14px operational text. Search reserves a 44px leading inset for its icon.
- **Focus:** Border shifts to blue with a soft two-pixel blue ring.
- **Error / Disabled:** Errors use red border and ring. Disabled fields use muted gray fill and reduced opacity without hiding their value.

### Navigation

The desktop navigation is a persistent white rail with 44px rows, 10px corners, compact icons, and medium-weight labels. The active item uses a dark left rule, warm neutral fill, and dark text; inactive icons may use restrained category colors. On mobile, navigation becomes an accessible overlay drawer with backdrop, Escape dismissal, and a sticky header trigger.

Reports form one expandable, salon-specific navigation group rather than a flat run of generic links. The parent row carries the group label and explicit expanded state; child routes use indented 40px rows, service-relevant icons, and a stronger active fill. Keep the group open while any report route is active, and preserve direct routes for Business Overview, Sales & Invoices, Services, Products & Retail, Payment Reconciliation, Customer Credit, Expenses, Salary Advances, and report comparison.

### Permission Group

Each group is an accordion-like bordered card. Its header carries the group label, description, allowed fraction, and semantic state chip. Expanded rows pair permission explanation with a single state toggle; protected denials add an amber lock explanation. Search expands matching groups, and history presents server-recorded changes as immutable rows.

### Configuration Center

Salon-wide settings use a category rail beside one focused configuration panel. Business, Billing & Tax, Calendar & Payroll, Payments & QR, and Account & Access remain stable categories; only the selected category's fields appear in the main panel. At desktop widths the rail is vertical and sticky; on smaller screens it becomes a horizontally scrollable row without changing category order. Printer & Documents is a clearly external destination from this rail, not another inline settings panel.

### Printer & Documents

Document configuration pairs editable receipt settings with a synthetic live preview. The editor controls receipt wording, visible fields, and 58mm compact or 80mm standard paper width; the preview mirrors the selected width, uses receipt-like monochrome typography, and stays secondary to the form on narrow screens. Label preview content as representative, never as a real invoice or hardware result.

Browser printing is an explicit capability boundary: the product may open the browser print dialog, but it does not silently control printer hardware or confirm that paper was printed. Keep this limitation visible beside print controls, and distinguish saving the template from running a browser print test.

### Feature Reports

Each report question has a dedicated route with a consistent operational frame: title and plain-language purpose, date-range presets and calendar-aware inputs, summary metrics, detailed records, CSV export, browser print, pagination, and empty or error states. Preserve route-level context and report-specific definitions instead of collapsing every feature into one overloaded dashboard. Tables may scroll horizontally on narrow screens; print output removes interactive chrome while retaining the report's title, period, metrics, and records.

## Do's and Don'ts

### Do:

- **Do** lead permission work with role selection and an allowed/blocked/available summary.
- **Do** preserve readable labels alongside every semantic color and icon.
- **Do** use compact 4px-based spacing and 40-48px interactive targets.
- **Do** stack controls responsively while preserving source order and full descriptions.
- **Do** keep administrator access, policy locks, and immutable history explicit in the interface.

### Don't:

- **Don't** use red for every denied permission; use neutral gray for routine blocked state.
- **Don't** use amber as decoration; reserve it for mixed access, restrictions, or caution.
- **Don't** replace the established dashboard shell, logo, or navigation behavior when extending the POS.
- **Don't** rely on icon-only or color-only permission states.
- **Don't** hide server-enforced authorization rules behind UI affordances or imply that UI visibility is enforcement.

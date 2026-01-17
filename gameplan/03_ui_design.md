# UI Design Document

**Generated:** 2026-01-18
**Status:** APPROVED

---

## 1. Design Direction

**Style:** Clean & Clinical (Stripe-inspired)
**Mood:** Professional, trustworthy, precise
**Density:** Comfortable (not cramped)

---

## 2. Design Tokens

### Colors

```css
/* Primary */
--primary:          #2563EB;  /* blue-600 - CTAs, links, Blueprint */
--primary-hover:    #1D4ED8;  /* blue-700 */
--primary-light:    #DBEAFE;  /* blue-100 - subtle backgrounds */

/* Financial */
--gain:             #16A34A;  /* green-600 - positive numbers */
--gain-light:       #DCFCE7;  /* green-100 */
--loss:             #DC2626;  /* red-600 - negative numbers */
--loss-light:       #FEE2E2;  /* red-100 */
--baseline:         #6B7280;  /* gray-500 - no conversion scenario */
--blueprint:        #2563EB;  /* blue-600 - Roth conversion scenario */

/* Neutral */
--background:       #FFFFFF;
--card:             #FFFFFF;
--border:           #E5E7EB;  /* gray-200 */
--border-strong:    #D1D5DB;  /* gray-300 */
--text-primary:     #111827;  /* gray-900 */
--text-secondary:   #6B7280;  /* gray-500 */
--text-muted:       #9CA3AF;  /* gray-400 */

/* State */
--focus-ring:       #2563EB;
--error:            #DC2626;
--warning:          #F59E0B;
```

### Typography

```css
/* Font Families */
--font-sans:        'Inter', system-ui, sans-serif;
--font-mono:        'JetBrains Mono', monospace;

/* Font Sizes */
--text-xs:          12px;
--text-sm:          14px;
--text-base:        16px;
--text-lg:          18px;
--text-xl:          20px;
--text-2xl:         24px;
--text-3xl:         30px;
--text-4xl:         36px;

/* Font Weights */
--font-normal:      400;
--font-medium:      500;
--font-semibold:    600;
--font-bold:        700;

/* Line Heights */
--leading-tight:    1.25;
--leading-normal:   1.5;
--leading-relaxed:  1.625;
```

### Spacing

```css
--space-1:    4px;
--space-2:    8px;
--space-3:    12px;
--space-4:    16px;
--space-5:    20px;
--space-6:    24px;
--space-8:    32px;
--space-10:   40px;
--space-12:   48px;
--space-16:   64px;
```

### Borders & Shadows

```css
/* Border Radius */
--radius-sm:    4px;
--radius-md:    6px;
--radius-lg:    8px;
--radius-xl:    12px;
--radius-full:  9999px;

/* Shadows */
--shadow-sm:    0 1px 2px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
--shadow-md:    0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.06);
--shadow-lg:    0 10px 15px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.06);
```

---

## 3. Component Specifications

### Buttons

| Variant | Background | Text | Border | Use Case |
|---------|------------|------|--------|----------|
| Primary | blue-600 | white | none | Main CTAs |
| Secondary | white | gray-700 | gray-300 | Secondary actions |
| Ghost | transparent | gray-600 | none | Tertiary actions |
| Danger | red-600 | white | none | Destructive actions |

```
Primary:    [████████████████]  44px height, 16px padding-x
            rounded-md, font-medium, shadow-sm

Secondary:  [────────────────]  44px height, 16px padding-x
            rounded-md, font-medium, border

Ghost:      [                ]  44px height, 12px padding-x
            rounded-md, font-medium, hover:bg-gray-100
```

### Form Inputs

```
┌─────────────────────────────────────┐
│ Label *                             │
├─────────────────────────────────────┤
│ Placeholder text                    │  40px height
└─────────────────────────────────────┘  rounded-md
  Helper text goes here                  border: gray-200
                                         focus: blue-600 ring

Error State:
┌─────────────────────────────────────┐
│ Label *                             │
├─────────────────────────────────────┤
│ Invalid value                       │  border: red-600
└─────────────────────────────────────┘
  ⚠ Error message in red
```

### Cards

```
┌─────────────────────────────────────┐
│                                     │  padding: 24px
│  Card Header                        │  background: white
│  ───────────────────────────────   │  border-radius: 8px
│                                     │  shadow: shadow-md
│  Card content goes here             │  border: 1px gray-200
│                                     │
└─────────────────────────────────────┘
```

### Stat Cards (Summary Numbers)

```
┌─────────────────────┐
│      BASELINE       │  Label: text-sm, gray-500, uppercase
│                     │
│     $839,409        │  Value: text-4xl, font-bold, mono
│                     │  Color: gray (baseline) / blue (blueprint)
│   No conversion     │  Subtitle: text-sm, gray-400
└─────────────────────┘
                         padding: 32px
                         text-align: center
```

### Data Tables

```
┌──────────────────────────────────────────────────────────────┐
│ Column 1      │ Column 2      │ Column 3      │ Column 4     │
├──────────────────────────────────────────────────────────────┤
│ Row 1 data    │ $1,234,567    │ 24%           │ +$50,000     │
│ Row 2 data    │ $1,345,678    │ 24%           │ +$55,000     │
│ Row 3 data    │ $1,456,789    │ 32%           │ -$10,000     │
└──────────────────────────────────────────────────────────────┘

- Header: bg-gray-50, font-semibold, text-sm
- Rows: border-b gray-100, hover:bg-gray-50
- Numbers: font-mono, right-aligned
- Gains: text-green-600
- Losses: text-red-600
- Sticky header on scroll
```

---

## 4. Micro-Interactions

### Page Transitions
- Route changes: Fade (150ms ease-out)
- Tab switches: Slide + fade (200ms)

### Loading States
- Calculation: Skeleton pulse on results
- Numbers: Count-up animation (800ms)
- Chart: Line draws left-to-right (1000ms)

### Form Interactions
- Focus: Border color transition (150ms)
- Error: Subtle shake (300ms)
- Success: Brief green flash

### Results Reveal
1. Summary cards stagger in (100ms delay each)
2. Numbers count from $0 to final value
3. Difference badge bounces once
4. Chart line animates drawing

### Hover States
- Buttons: Darken 10%, scale(0.98) on click
- Table rows: bg-gray-50
- Chart points: Scale 1.2x, show tooltip

---

## 5. Page Layouts

### Sidebar (Fixed)
- Width: 240px
- Background: white
- Border-right: 1px gray-200
- Logo at top
- Nav items with icons
- User menu at bottom

### Main Content
- Max-width: 1200px
- Padding: 32px
- Centered in viewport

### Form Layout
- Max-width: 800px
- Sections separated by 48px
- 2-column grid for related fields
- Full-width for strategy selection

### Results Layout
- Full width for chart
- 3-column grid for stat cards
- Tabbed sections for detail tables

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Desktop | 1280px+ | Full sidebar, 3-col stats |
| Laptop | 1024px | Narrower sidebar |
| Tablet | 768px | Collapsible sidebar |
| Mobile | < 768px | Out of scope for MVP |

---

## 7. Chart Specifications

### Wealth Trajectory (Line Chart)

```
Library: Recharts
Type: LineChart with dual lines

Baseline Line:
- Color: gray-400
- Stroke width: 2px
- Dashed: yes

Blueprint Line:
- Color: blue-600
- Stroke width: 3px
- Dashed: no

Grid:
- Horizontal only
- Color: gray-100

Axes:
- Y: Currency formatted ($500K, $1M, $1.5M)
- X: Age (65, 70, 75, 80...)

Tooltip:
- White card with shadow
- Shows both values + difference
```

### IRMAA Bar Chart

```
Type: BarChart

Bars:
- Color: blue-600 (normal)
- Color: red-500 (over threshold)

Threshold line:
- Dashed horizontal
- Color: red-400
- Label: "IRMAA Threshold"
```

---

## 8. Component Library

Using **shadcn/ui** with customizations:

| Component | Source | Customization |
|-----------|--------|---------------|
| Button | shadcn | Colors per tokens |
| Input | shadcn | Height 40px |
| Select | shadcn | Default |
| Checkbox | shadcn | Blue accent |
| RadioGroup | shadcn | Card-style options |
| Table | shadcn | Sticky header |
| Tabs | shadcn | Underline style |
| Card | shadcn | Shadow-md default |
| Dialog | shadcn | Default |
| Toast | shadcn | Bottom-right |
| Skeleton | shadcn | Default |
| Badge | Custom | Gain/loss variants |
| StatCard | Custom | For summary numbers |
| LineChart | Recharts | Per spec above |
| BarChart | Recharts | Per spec above |

---

*This document defines the visual specifications. Implementation uses shadcn/ui + Tailwind CSS.*

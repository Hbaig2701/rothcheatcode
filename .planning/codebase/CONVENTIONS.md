# Coding Conventions

**Analysis Date:** 2026-01-18

## Naming Patterns

**Files:**
- Components: kebab-case for UI components (`alert-dialog.tsx`, `dropdown-menu.tsx`)
- Utilities: kebab-case (`utils.ts`, `client.ts`, `server.ts`)
- Pages: `page.tsx`, `layout.tsx` (Next.js App Router convention)

**Functions:**
- Components: PascalCase (`Button`, `CardHeader`, `AlertDialogContent`)
- Utilities: camelCase (`cn`, `createClient`, `updateSession`)

**Types:**
- PascalCase for interfaces and types
- Use `type` imports: `import type { Metadata } from "next"`

## Code Style

**Formatting:**
- Double quotes for JSX attributes and imports
- 2-space indentation
- Trailing commas in multi-line structures

**TypeScript:**
- Strict mode enabled in `tsconfig.json`
- Path aliases: `@/*` maps to project root

## Component Patterns

**UI Component Structure:**
```typescript
"use client"  // Add when component uses hooks/interactivity

import * as React from "react"
import { cn } from "@/lib/utils"

function ComponentName({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="component-name"
      className={cn("tailwind-classes", className)}
      {...props}
    />
  )
}

export { ComponentName }
```

**Key Patterns:**
- Use `data-slot` attribute for component identification
- Spread `className` through `cn()` utility for Tailwind merge
- Named exports at file end
- Use `React.ComponentProps<"element">` for HTML element props

**Variant Pattern (CVA):**
```typescript
import { cva, type VariantProps } from "class-variance-authority"

const componentVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", secondary: "..." },
    size: { default: "...", sm: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
})
```

## Tailwind CSS Patterns

**Class Organization:**
1. Base layout classes (flex, grid, size)
2. Spacing classes (padding, margin, gap)
3. Visual classes (colors, borders, shadows)
4. State variants (hover, focus, disabled)

**Utility Function:**
```typescript
// lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## Client vs Server Components

**"use client" Directive:**
- Add to components using React hooks (useState, useEffect)
- Add to components with event handlers
- UI primitives from @base-ui typically require "use client"

**Server Components (default):**
- Page components (`app/page.tsx`)
- Layout components (`app/layout.tsx`)
- Components without interactivity

---

*Convention analysis: 2026-01-18*

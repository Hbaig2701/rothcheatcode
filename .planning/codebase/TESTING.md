# Testing Patterns

**Analysis Date:** 2026-01-18

## Current Testing Status

**No testing infrastructure is currently set up.** The project has no:
- Test runner (Jest, Vitest, etc.)
- Test files (*.test.ts, *.spec.ts)
- Testing dependencies in package.json
- Test configuration files

## Recommended Setup

**Option 1: Vitest (Recommended)**
```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom
```

Configuration file: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': './' },
  },
})
```

## Test File Organization

**Location:**
- Co-located with source files
- Pattern: `ComponentName.test.tsx` next to `ComponentName.tsx`

**Naming:**
- `*.test.ts` for utility tests
- `*.test.tsx` for component tests

## Priority Actions

1. Add Vitest to devDependencies
2. Create vitest.config.ts with path aliases
3. Add test scripts to package.json:
   ```json
   "scripts": {
     "test": "vitest",
     "test:watch": "vitest watch",
     "test:coverage": "vitest run --coverage"
   }
   ```
4. Write tests for `lib/utils.ts` first
5. Add component tests for Button and other UI primitives

---

*Testing analysis: 2026-01-18*

/**
 * localStorage Management for Column Preferences
 *
 * Handles saving/loading column visibility and width preferences
 */

import { DEFAULT_PRESETS } from './presets';

const STORAGE_KEY_PREFIX = 'retex_table_columns_';

// User-level "favourite columns" default. Separate per product type because
// Growth FIA and Guaranteed Income reports have partially-different column
// sets (rider fee vs bonus columns, etc.) — a single shared favourite would
// hide product-relevant columns. Lookup chain is: per-client saved →
// user default (this key) → built-in DEFAULT_PRESETS.
const USER_DEFAULT_KEY_PREFIX = 'retex_table_columns_user_default_';

export interface ColumnPreferences {
  selectedColumns: string[];                // Array of visible column IDs
  columnWidths: Record<string, number>;     // Column ID -> width in pixels
  lastUpdated: string;                      // ISO timestamp
}

/**
 * Save column preferences to localStorage
 *
 * @param tableId Unique identifier for this table (e.g., 'year-by-year', 'report-strategy')
 * @param prefs Column preferences to save
 */
export function saveColumnPreferences(
  tableId: string,
  prefs: ColumnPreferences
): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    const json = JSON.stringify(prefs);
    localStorage.setItem(key, json);
  } catch (error) {
    console.error(`[Column Storage] Failed to save preferences for ${tableId}:`, error);
    // Gracefully handle storage errors (quota exceeded, disabled, etc.)
  }
}

/**
 * Newly-shipped columns that should be auto-injected into existing saved
 * preferences so users who customized their column list before the column
 * existed still see it. Each entry says "if `id` isn't already in the
 * user's saved selectedColumns, splice it in immediately after `afterId`
 * (or append at end if afterId isn't present)." Append new entries here
 * when shipping a column that's important enough to bypass the user's
 * prior column choice once. Keep the list short — every entry adds a
 * column to every user's table without consent, which is intrusive.
 */
const COLUMN_MIGRATIONS: Array<{ id: string; afterId?: string; addedAt: string }> = [
  // Robert R. ticket a1639792 — combined "Total Fed Tax on IRA W/D" column
  // is the answer to "what does this conversion cost in federal tax?"
  // which the existing two-column split obscured.
  { id: 'federalTaxOnIRAWithdrawal', afterId: 'totalIRAWithdrawal', addedAt: '2026-05-12' },
];

/**
 * Load column preferences from localStorage. Applies pending column
 * migrations (see COLUMN_MIGRATIONS) so newly-default columns appear
 * for users who already had saved preferences. The migrated result is
 * persisted back so the migration runs at most once per user per column.
 *
 * @param tableId Unique identifier for this table
 * @returns Saved preferences or null if not found/error
 */
export function loadColumnPreferences(
  tableId: string
): ColumnPreferences | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as ColumnPreferences;

    // Validate structure
    if (
      !parsed.selectedColumns ||
      !Array.isArray(parsed.selectedColumns) ||
      !parsed.columnWidths ||
      typeof parsed.columnWidths !== 'object'
    ) {
      console.warn(`[Column Storage] Invalid preferences structure for ${tableId}, ignoring`);
      return null;
    }

    // Apply column migrations — inject any pending columns the user hasn't
    // seen yet. Persists back to localStorage so migrations don't re-run.
    let mutated = false;
    for (const m of COLUMN_MIGRATIONS) {
      if (parsed.selectedColumns.includes(m.id)) continue;
      const insertAt = m.afterId ? parsed.selectedColumns.indexOf(m.afterId) : -1;
      if (insertAt >= 0) {
        parsed.selectedColumns.splice(insertAt + 1, 0, m.id);
      } else {
        parsed.selectedColumns.push(m.id);
      }
      mutated = true;
    }
    if (mutated) {
      try {
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // Non-fatal — the in-memory result still includes the new column,
        // it just won't persist if storage is full / blocked.
      }
    }

    return parsed;
  } catch (error) {
    console.error(`[Column Storage] Failed to load preferences for ${tableId}:`, error);
    return null;
  }
}

/**
 * Clear column preferences for a specific table
 *
 * @param tableId Unique identifier for this table
 */
export function clearColumnPreferences(tableId: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[Column Storage] Failed to clear preferences for ${tableId}:`, error);
  }
}

/**
 * Get default columns for a product type
 *
 * @param productType Product type ('growth' or 'gi')
 * @returns Array of default column IDs
 */
export function getDefaultColumns(productType: 'growth' | 'gi'): string[] {
  const preset = DEFAULT_PRESETS[productType];
  return preset?.columns || DEFAULT_PRESETS.growth.columns;
}

/**
 * Resolve the columns + widths a table should open with, applying the
 * fallback chain: per-client saved → user default → built-in preset.
 *
 * Per-client edits always win once set, so an advisor can fine-tune one
 * client without losing the global favourite for everyone else. When the
 * user hasn't set a favourite, the built-in preset for the product type
 * is used — same behavior as before this function existed.
 *
 * @param tableId      Per-client storage key (e.g. `year-by-year-<clientId>`)
 * @param productType  Product type for built-in preset fallback
 * @returns Always returns a usable ColumnPreferences (never null).
 */
export function resolveColumnPreferences(
  tableId: string,
  productType: 'growth' | 'gi'
): ColumnPreferences {
  const perClient = loadColumnPreferences(tableId);
  if (perClient) return perClient;

  const userDefault = loadUserDefaultColumnPreferences(productType);
  if (userDefault) return userDefault;

  return {
    selectedColumns: getDefaultColumns(productType),
    columnWidths: {},
    lastUpdated: new Date(0).toISOString(),
  };
}

/**
 * Load the user's saved favourite columns for a given product type. Returns
 * null when the user hasn't set one — callers should fall through to
 * `getDefaultColumns(productType)` in that case, or use
 * `resolveColumnPreferences` to do the full chain.
 */
export function loadUserDefaultColumnPreferences(
  productType: 'growth' | 'gi'
): ColumnPreferences | null {
  try {
    const key = `${USER_DEFAULT_KEY_PREFIX}${productType}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as ColumnPreferences;
    if (
      !parsed.selectedColumns ||
      !Array.isArray(parsed.selectedColumns) ||
      !parsed.columnWidths ||
      typeof parsed.columnWidths !== 'object'
    ) {
      console.warn(`[Column Storage] Invalid user-default preferences for ${productType}, ignoring`);
      return null;
    }

    // Apply the same column migrations as per-client preferences so a user
    // who set a favourite before a new column shipped still sees the new
    // column. Persist back so the migration runs at most once per user.
    let mutated = false;
    for (const m of COLUMN_MIGRATIONS) {
      if (parsed.selectedColumns.includes(m.id)) continue;
      const insertAt = m.afterId ? parsed.selectedColumns.indexOf(m.afterId) : -1;
      if (insertAt >= 0) {
        parsed.selectedColumns.splice(insertAt + 1, 0, m.id);
      } else {
        parsed.selectedColumns.push(m.id);
      }
      mutated = true;
    }
    if (mutated) {
      try {
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // Non-fatal — in-memory copy still includes the new column.
      }
    }

    return parsed;
  } catch (error) {
    console.error(`[Column Storage] Failed to load user-default for ${productType}:`, error);
    return null;
  }
}

/**
 * Save the user's favourite columns for a given product type. This becomes
 * the default any new client opens with (per-client overrides still win).
 */
export function saveUserDefaultColumnPreferences(
  productType: 'growth' | 'gi',
  prefs: ColumnPreferences
): void {
  try {
    const key = `${USER_DEFAULT_KEY_PREFIX}${productType}`;
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch (error) {
    console.error(`[Column Storage] Failed to save user-default for ${productType}:`, error);
  }
}

/**
 * Clear the user's saved favourite for a product type. New clients revert
 * to the built-in preset; existing per-client overrides are untouched.
 */
export function clearUserDefaultColumnPreferences(productType: 'growth' | 'gi'): void {
  try {
    const key = `${USER_DEFAULT_KEY_PREFIX}${productType}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[Column Storage] Failed to clear user-default for ${productType}:`, error);
  }
}

/**
 * Check if localStorage is available
 *
 * @returns True if localStorage is available and working
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__retex_storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (error) {
    return false;
  }
}

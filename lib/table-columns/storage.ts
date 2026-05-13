/**
 * localStorage Management for Column Preferences
 *
 * Handles saving/loading column visibility and width preferences
 */

import { DEFAULT_PRESETS } from './presets';

const STORAGE_KEY_PREFIX = 'retex_table_columns_';

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

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
 * Load column preferences from localStorage
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

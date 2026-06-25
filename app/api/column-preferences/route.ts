import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Account-backed storage for year-by-year table column preferences.
 *
 * Durable replacement for the old localStorage-only persistence (which Safari
 * ITP / cache-clears / other devices silently wiped — Kwanza Ellis ticket).
 * The client keeps localStorage as an instant same-device cache and reconciles
 * against this on load.
 *
 *   GET    /api/column-preferences            -> all of the user's prefs (map by scope_key)
 *   GET    /api/column-preferences?key=<k>    -> a single pref (or null)
 *   PUT    /api/column-preferences            -> upsert { scopeKey, selectedColumns, columnWidths }
 *   DELETE /api/column-preferences?key=<k>    -> delete one
 */

interface PrefPayload {
  scopeKey?: string;
  selectedColumns?: string[];
  columnWidths?: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get('key');
  let query = supabase
    .from('column_preferences')
    .select('scope_key, selected_columns, column_widths, updated_at')
    .eq('user_id', user.id);
  if (key) query = query.eq('scope_key', key);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (key) {
    const row = data?.[0];
    return NextResponse.json({
      preference: row
        ? { selectedColumns: row.selected_columns, columnWidths: row.column_widths, lastUpdated: row.updated_at }
        : null,
    });
  }

  // Whole set, keyed by scope_key for a single-fetch hydrate.
  const map: Record<string, { selectedColumns: string[]; columnWidths: Record<string, number>; lastUpdated: string }> = {};
  for (const row of data ?? []) {
    map[row.scope_key] = {
      selectedColumns: row.selected_columns,
      columnWidths: row.column_widths,
      lastUpdated: row.updated_at,
    };
  }
  return NextResponse.json({ preferences: map });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PrefPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scopeKey = typeof body.scopeKey === 'string' ? body.scopeKey.trim() : '';
  if (!scopeKey) {
    return NextResponse.json({ error: 'scopeKey is required' }, { status: 400 });
  }
  const selectedColumns = Array.isArray(body.selectedColumns) ? body.selectedColumns.filter((c) => typeof c === 'string') : [];
  const columnWidths = body.columnWidths && typeof body.columnWidths === 'object' ? body.columnWidths : {};

  const { error } = await supabase
    .from('column_preferences')
    .upsert(
      {
        user_id: user.id,
        scope_key: scopeKey,
        selected_columns: selectedColumns,
        column_widths: columnWidths,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,scope_key' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('column_preferences')
    .delete()
    .eq('user_id', user.id)
    .eq('scope_key', key);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

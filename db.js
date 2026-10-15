// js/db.js — all database access in one place.
import { supabase } from './supabase.js';

// ---------- current state ----------
export async function fetchCurrentState(userId) {
  const { data, error } = await supabase
    .from('current_state').select('*').eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

// ---------- weekly ledger ----------
export async function fetchWeeklyHistory(userId) {
  const { data, error } = await supabase
    .from('weekly_updates').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Appends a weekly update AND syncs current_state — atomically, server-side. */
export async function saveWeeklyUpdate(values) {
  const { data, error } = await supabase.rpc('save_weekly_update', {
    p_reporting_week: values.reporting_week,
    p_total_deposited: values.total_deposited,
    p_realized_profit: values.realized_profit,
    p_prop_payouts: values.prop_payouts,
    p_current_equity: values.current_equity,
    p_peak_equity: values.peak_equity,
    p_target_amount: values.target_amount,
    p_target_date: values.target_date || null,
    p_notes: values.notes || null,
  });
  if (error) throw error;
  return data;
}

/** Corrects a historical entry; current_state is re-synced from the newest entry. */
export async function correctWeeklyUpdate(id, values) {
  const { error } = await supabase.rpc('correct_weekly_update', {
    p_id: id,
    p_reporting_week: values.reporting_week,
    p_total_deposited: values.total_deposited,
    p_realized_profit: values.realized_profit,
    p_prop_payouts: values.prop_payouts,
    p_current_equity: values.current_equity,
    p_peak_equity: values.peak_equity,
    p_target_amount: values.target_amount,
    p_target_date: values.target_date || null,
    p_notes: values.notes || null,
  });
  if (error) throw error;
}

export async function deleteWeeklyUpdate(id) {
  const { error } = await supabase.from('weekly_updates').delete().eq('id', id);
  if (error) throw error;
  const { error: syncErr } = await supabase.rpc('resync_current_state');
  if (syncErr) throw syncErr;
}

// ---------- preferences ----------
export async function updatePreferences({ target_amount, target_date, count_deposits_toward_goal }) {
  const { error } = await supabase.rpc('update_preferences', {
    p_target_amount: target_amount,
    p_target_date: target_date || null,
    p_count_deposits: count_deposits_toward_goal,
  });
  if (error) throw error;
}

export async function acknowledgeStartingValues() {
  const { error } = await supabase.rpc('acknowledge_starting_values');
  if (error) throw error;
}

// ---------- events ----------
export const EVENT_CATEGORIES = [
  { id: 'trading-day',   label: 'Trading Day',   color: '#2D8A69' },
  { id: 'weekly-review', label: 'Weekly Review', color: '#C5A56A' },
  { id: 'deposit',       label: 'Deposit',       color: '#8FA3C8' },
  { id: 'milestone',     label: 'Goal Milestone',color: '#E3C88A' },
  { id: 'important',     label: 'Important Event', color: '#C0564B' },
];

export async function fetchEvents(userId) {
  const { data, error } = await supabase
    .from('events').select('*').eq('user_id', userId).order('event_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveEvent(userId, event) {
  const payload = {
    user_id: userId,
    title: event.title,
    event_date: event.event_date,
    category: event.category,
    notes: event.notes || null,
  };
  if (event.id) {
    const { error } = await supabase.from('events').update(payload).eq('id', event.id);
    if (error) throw error;
    return event.id;
  }
  const { data, error } = await supabase.from('events').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------- notes ----------
export async function fetchNotes(userId) {
  const { data, error } = await supabase
    .from('notes').select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveNote(userId, note) {
  const payload = { user_id: userId, title: note.title, body: note.body || null };
  if (note.id) {
    const { error } = await supabase.from('notes').update(payload).eq('id', note.id);
    if (error) throw error;
    return note.id;
  }
  const { data, error } = await supabase.from('notes').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteNote(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchLatestNote(userId) {
  const { data, error } = await supabase
    .from('notes').select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- export / import ----------
export async function exportAll(userId) {
  const [state, weekly, events, notes] = await Promise.all([
    fetchCurrentState(userId),
    fetchWeeklyHistory(userId),
    fetchEvents(userId),
    fetchNotes(userId),
  ]);
  return {
    exported_at: new Date().toISOString(),
    app: 'joepaul-capital-terminal',
    version: 1,
    current_state: state,
    weekly_updates: weekly,
    events,
    notes,
  };
}

export async function importAll(userId, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup file.');
  const tables = ['current_state', 'weekly_updates', 'events', 'notes'];
  for (const t of tables) {
    if (payload[t] !== undefined && !Array.isArray(payload[t]) && typeof payload[t] !== 'object') {
      throw new Error(`Invalid "${t}" section in backup file.`);
    }
  }
  const results = { current_state: 0, weekly_updates: 0, events: 0, notes: 0 };

  if (payload.current_state) {
    const s = { ...payload.current_state, user_id: userId, updated_at: new Date().toISOString() };
    delete s.id;
    const { error } = await supabase.from('current_state').upsert(s);
    if (error) throw error;
    results.current_state = 1;
  }
  for (const t of ['weekly_updates', 'events', 'notes']) {
    if (Array.isArray(payload[t]) && payload[t].length) {
      const rows = payload[t].map((r) => {
        const row = { ...r, user_id: userId };
        delete row.id;
        return row;
      });
      const { error } = await supabase.from(t).insert(rows);
      if (error) throw error;
      results[t] = rows.length;
    }
  }
  return results;
}

export async function fetchUpcomingEvents(userId, limit = 5) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('events').select('*').eq('user_id', userId)
    .gte('event_date', today)
    .order('event_date', { ascending: true }).limit(limit);
  if (error) throw error;
  return data || [];
}

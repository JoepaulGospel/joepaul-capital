// js/settings.js — weekly update form, history with corrections, prefs, export/import.
import { requireAuth } from './auth.js';
import {
  fetchCurrentState, fetchWeeklyHistory,
  saveWeeklyUpdate, correctWeeklyUpdate, deleteWeeklyUpdate, updatePreferences,
  exportAll, importAll,
} from './db.js';
import * as F from './finance.js';
import { renderSidebar, setUserEmail, toast, fmtDate, defaultWeekLabel, escapeHtml } from './ui.js';

renderSidebar('settings');

const session = await requireAuth();
let state = null;
let history = [];
let editingId = null;

if (session) init();

async function init() {
  setUserEmail(session.user.email);
  await reload();
  document.getElementById('weekly-form').addEventListener('submit', onSave);
  document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
  document.getElementById('save-prefs-btn').addEventListener('click', onSavePrefs);
  document.getElementById('export-btn').addEventListener('click', onExport);
  document.getElementById('import-file').addEventListener('change', onImport);
}

async function reload() {
  [state, history] = await Promise.all([
    fetchCurrentState(session.user.id),
    fetchWeeklyHistory(session.user.id),
  ]);
  renderHistory();
}

function field(id) { return document.getElementById(id); }
function setError(id, msg) {
  const el = document.getElementById('e-' + id);
  if (el) el.textContent = msg || '';
}
function clearErrors() {
  ['week', 'deposited', 'profit', 'payouts', 'current', 'peak', 'target', 'target-date'].forEach((k) => setError(k, ''));
}

/** Pre-fill the form with the newest known values. */
function prefill() {
  field('f-week').value = state.reporting_week || defaultWeekLabel();
  field('f-deposited').value = state.total_deposited ?? '';
  field('f-profit').value = state.realized_profit ?? '';
  field('f-payouts').value = state.prop_payouts ?? '';
  field('f-current').value = state.current_equity ?? '';
  field('f-peak').value = state.peak_equity ?? '';
  field('f-target').value = state.target_amount ?? '';
  field('f-target-date').value = state.target_date || '';
  field('f-notes').value = state.weekly_notes || '';
  field('pref-crediting').checked = !!state.count_deposits_toward_goal;
}

async function onSave(e) {
  e.preventDefault();
  clearErrors();
  const values = {
    reporting_week: field('f-week').value.trim(),
    total_deposited: field('f-deposited').value,
    realized_profit: field('f-profit').value,
    prop_payouts: field('f-payouts').value,
    current_equity: field('f-current').value,
    peak_equity: field('f-peak').value,
    target_amount: field('f-target').value,
    target_date: field('f-target-date').value || null,
    notes: field('f-notes').value.trim(),
  };

  // validation — never trust the browser alone
  let ok = true;
  if (!values.reporting_week) { setError('week', 'Reporting week is required.'); ok = false; }
  const checks = [
    ['deposited', values.total_deposited, 'Total deposited'],
    ['profit', values.realized_profit, 'Realized profit'],
    ['payouts', values.prop_payouts, 'Prop payouts'],
    ['current', values.current_equity, 'Current equity'],
    ['peak', values.peak_equity, 'Peak equity'],
  ];
  const clean = {};
  for (const [key, raw, label] of checks) {
    const r = F.validateAmount(raw, { field: label });
    if (!r.ok) { setError(key, r.error); ok = false; } else clean[key] = r.value;
  }
  const t = F.validateAmount(values.target_amount, { field: 'Target amount', allowZero: false });
  if (!t.ok) { setError('target', t.error); ok = false; } else clean.target_amount = t.value;
  if (!ok) { toast('Please fix the highlighted fields.', 'error'); return; }

  // If equity hits a new high, peak follows automatically.
  if (clean.current > clean.peak) {
    clean.peak = clean.current;
    toast('New equity high — peak equity updated automatically.', 'success');
  }

  const payload = {
    reporting_week: values.reporting_week,
    total_deposited: clean.deposited,
    realized_profit: clean.profit,
    prop_payouts: clean.payouts,
    current_equity: clean.current,
    peak_equity: clean.peak,
    target_amount: clean.target_amount,
    target_date: values.target_date,
    notes: values.notes,
  };

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  try {
    if (editingId) {
      await correctWeeklyUpdate(editingId, payload);
      toast('Entry corrected. Dashboard re-synced from your newest entry.', 'success');
    } else {
      await saveWeeklyUpdate(payload);
      toast('Weekly update saved. Dashboard refreshed.', 'success');
    }
    cancelEdit();
    await reload();
    prefill();
  } catch (err) {
    console.error(err);
    toast('Save failed: ' + (err.message || 'unknown error'), 'error');
  } finally {
    btn.disabled = false;
  }
}

function renderHistory() {
  const body = document.getElementById('history-body');
  if (!history.length) {
    body.innerHTML = '<tr><td colspan="9" class="muted">No weekly updates yet.</td></tr>';
    prefill();
    return;
  }
  body.innerHTML = history.map((r) => `
    <tr>
      <td>${escapeHtml(r.reporting_week)}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${F.formatUSD(r.total_deposited)}</td>
      <td>${F.formatUSD(r.realized_profit)}</td>
      <td>${F.formatUSD(r.prop_payouts)}</td>
      <td>${F.formatUSD(r.current_equity)}</td>
      <td>${F.formatUSD(r.peak_equity)}</td>
      <td>${F.formatUSD(r.target_amount)}</td>
      <td style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-small" data-edit="${r.id}">Edit</button>
        <button class="btn btn-danger btn-small" data-del="${r.id}">Delete</button>
      </td>
    </tr>`).join('');
  body.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => startEdit(b.dataset.edit)));
  body.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => onDelete(b.dataset.del)));
  prefill();
}

function startEdit(id) {
  const row = history.find((r) => r.id === id);
  if (!row) return;
  editingId = id;
  field('f-week').value = row.reporting_week;
  field('f-deposited').value = row.total_deposited;
  field('f-profit').value = row.realized_profit;
  field('f-payouts').value = row.prop_payouts;
  field('f-current').value = row.current_equity;
  field('f-peak').value = row.peak_equity;
  field('f-target').value = row.target_amount;
  field('f-target-date').value = row.target_date || '';
  field('f-notes').value = row.notes || '';
  document.getElementById('save-btn').textContent = 'Save Correction';
  document.getElementById('cancel-edit-btn').style.display = 'inline-flex';
  const banner = document.getElementById('edit-mode-banner');
  banner.className = 'banner';
  banner.style.display = 'flex';
  banner.innerHTML = `<span>Editing the entry from <b>${escapeHtml(row.reporting_week)}</b>
    (saved ${fmtDate(row.created_at)}). Saving updates this record; the dashboard re-syncs
    from your newest entry.</span>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('save-btn').textContent = 'Save Update';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  const banner = document.getElementById('edit-mode-banner');
  banner.style.display = 'none';
  clearErrors();
}

async function onDelete(id) {
  const row = history.find((r) => r.id === id);
  if (!row) return;
  if (!confirm(`Delete the entry "${row.reporting_week}"? This cannot be undone.`)) return;
  try {
    await deleteWeeklyUpdate(id);
    toast('Entry deleted. Dashboard re-synced from your newest entry.', 'success');
    if (editingId === id) cancelEdit();
    await reload();
  } catch (err) {
    toast('Delete failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function onSavePrefs() {
  try {
    await updatePreferences({
      target_amount: state.target_amount,
      target_date: state.target_date,
      count_deposits_toward_goal: field('pref-crediting').checked,
    });
    state.count_deposits_toward_goal = field('pref-crediting').checked;
    toast('Preferences saved.', 'success');
  } catch (err) {
    toast('Save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function onExport() {
  try {
    const data = await exportAll(session.user.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `joepaul-capital-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup exported.', 'success');
  } catch (err) {
    toast('Export failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function onImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Importing adds the backup contents to your current data. Continue?')) {
    e.target.value = '';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const results = await importAll(session.user.id, payload);
    toast(`Imported: ${results.weekly_updates} weekly updates, ${results.events} events, ${results.notes} notes.`, 'success');
    await reload();
  } catch (err) {
    toast('Import failed: ' + (err.message || 'invalid file'), 'error');
  } finally {
    e.target.value = '';
  }
}

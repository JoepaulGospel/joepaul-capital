// js/calendar.js — interactive monthly calendar with full event CRUD.
import { requireAuth } from './auth.js';
import { fetchEvents, saveEvent, deleteEvent, EVENT_CATEGORIES } from './db.js';
import { renderSidebar, setUserEmail, toast, categoryMeta, escapeHtml } from './ui.js';

renderSidebar('calendar');

const session = await requireAuth();
let events = [];
let view = new Date(); view.setDate(1);

if (session) init();

async function init() {
  setUserEmail(session.user.email);
  document.getElementById('ev-category').innerHTML = EVENT_CATEGORIES
    .map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
  document.getElementById('cal-legend').innerHTML = EVENT_CATEGORIES.map((c) =>
    `<span class="ev-chip" style="border-color:${c.color}; color:${c.color};">${c.label}</span>`).join('');
  document.getElementById('cal-prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
  document.getElementById('cal-next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
  document.getElementById('cal-today').addEventListener('click', () => { view = new Date(); view.setDate(1); render(); });
  document.getElementById('ev-form').addEventListener('submit', onSaveEvent);
  document.getElementById('ev-cancel').addEventListener('click', closeModal);
  document.getElementById('ev-delete').addEventListener('click', onDeleteEvent);
  document.getElementById('ev-modal').addEventListener('click', (e) => { if (e.target.id === 'ev-modal') closeModal(); });
  await reload();
}

async function reload() {
  try {
    events = await fetchEvents(session.user.id);
  } catch (err) {
    toast('Could not load events.', 'error');
    events = [];
  }
  render();
}

function iso(d) { return d.toISOString().slice(0, 10); }

function render() {
  document.getElementById('cal-title').textContent =
    view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('cal-head').innerHTML =
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-head">${d}</div>`).join('');

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first grid
  const gridStart = new Date(first); gridStart.setDate(1 - startOffset);
  const todayIso = iso(new Date());
  const byDate = {};
  for (const ev of events) (byDate[ev.event_date] ||= []).push(ev);

  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dIso = iso(d);
    const inMonth = d.getMonth() === view.getMonth();
    const dayEvents = byDate[dIso] || [];
    html += `
      <div class="cal-day ${inMonth ? '' : 'other'} ${dIso === todayIso ? 'today' : ''}" data-date="${dIso}">
        <div class="dnum">${d.getDate()}</div>
        ${dayEvents.map((ev) => {
          const meta = categoryMeta(ev.category);
          return `<div class="cal-ev" style="border-color:${meta.color}; background:${meta.color}22; color:${meta.color};"
            data-ev="${ev.id}" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`;
        }).join('')}
      </div>`;
  }
  const body = document.getElementById('cal-body');
  body.innerHTML = html;
  body.querySelectorAll('.cal-day').forEach((cell) =>
    cell.addEventListener('click', (e) => {
      if (e.target.dataset.ev) return; // chip click handled separately
      openModal(null, cell.dataset.date);
    }));
  body.querySelectorAll('[data-ev]').forEach((chip) =>
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = events.find((x) => x.id === chip.dataset.ev);
      if (ev) openModal(ev, ev.event_date);
    }));
}

function openModal(event, dateIso) {
  document.getElementById('ev-e-title').textContent = '';
  document.getElementById('ev-id').value = event?.id || '';
  document.getElementById('ev-title').value = event?.title || '';
  document.getElementById('ev-date').value = event?.event_date || dateIso;
  document.getElementById('ev-category').value = event?.category || 'trading-day';
  document.getElementById('ev-notes').value = event?.notes || '';
  document.getElementById('ev-modal-title').textContent = event ? 'Edit Event' : 'Add Event';
  document.getElementById('ev-delete').style.display = event ? 'inline-flex' : 'none';
  document.getElementById('ev-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('ev-modal').style.display = 'none'; }

async function onSaveEvent(e) {
  e.preventDefault();
  const title = document.getElementById('ev-title').value.trim();
  if (!title) {
    document.getElementById('ev-e-title').textContent = 'Title is required.';
    return;
  }
  const payload = {
    id: document.getElementById('ev-id').value || null,
    title,
    event_date: document.getElementById('ev-date').value,
    category: document.getElementById('ev-category').value,
    notes: document.getElementById('ev-notes').value.trim(),
  };
  if (!payload.event_date) { toast('A date is required.', 'error'); return; }
  try {
    await saveEvent(session.user.id, payload);
    toast(payload.id ? 'Event updated.' : 'Event added.', 'success');
    closeModal();
    await reload();
  } catch (err) {
    toast('Save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function onDeleteEvent() {
  const id = document.getElementById('ev-id').value;
  if (!id || !confirm('Delete this event?')) return;
  try {
    await deleteEvent(id);
    toast('Event deleted.', 'success');
    closeModal();
    await reload();
  } catch (err) {
    toast('Delete failed.', 'error');
  }
}

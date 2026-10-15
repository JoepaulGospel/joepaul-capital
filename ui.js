// js/ui.js — shared UI helpers: sidebar, toast, formatting.
import { signOut } from './auth.js';
import { EVENT_CATEGORIES } from './db.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: 'index.html' },
  { id: 'calendar',  label: 'Calendar',  href: 'calendar.html' },
  { id: 'goals',     label: 'Goals',     href: 'goals.html' },
  { id: 'notes',     label: 'Notes',     href: 'notes.html' },
  { id: 'settings',  label: 'Settings',  href: 'settings.html' },
];

export function renderSidebar(active) {
  const host = document.getElementById('sidebar');
  if (!host) return;
  host.innerHTML = `
    <div class="sidebar-inner">
      <div class="brand">
        <div class="monogram">JC</div>
        <div>
          <div class="brand-name">Joepaul Capital</div>
          <div class="brand-sub">Terminal</div>
        </div>
      </div>
      <nav class="nav">
        ${NAV.map((n) => `
          <a href="${n.href}" class="nav-item ${n.id === active ? 'active' : ''}">
            <span class="nav-dot"></span>${n.label}
          </a>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="tagline">Discipline. Strategy. Freedom.</div>
        <div class="user-row">
          <span id="user-email" class="user-email"></span>
          <button id="sign-out-btn" class="btn-ghost btn-small">Sign out</button>
        </div>
      </div>
    </div>`;
  const btn = document.getElementById('sign-out-btn');
  if (btn) btn.addEventListener('click', signOut);
  const burger = document.getElementById('menu-btn');
  if (burger) burger.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  host.querySelectorAll('.nav-item').forEach((a) =>
    a.addEventListener('click', () => document.body.classList.remove('sidebar-open')));
}

export function setUserEmail(email) {
  const el = document.getElementById('user-email');
  if (el && email) el.textContent = email;
}

export function toast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function categoryMeta(id) {
  return EVENT_CATEGORIES.find((c) => c.id === id) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

export function defaultWeekLabel(d = new Date()) {
  const diff = (d.getDay() + 6) % 7; // days since Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() - diff);
  return `Week of ${mon.toISOString().slice(0, 10)}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

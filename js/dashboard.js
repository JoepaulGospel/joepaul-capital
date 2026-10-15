// js/dashboard.js
import { requireAuth } from './auth.js';
import {
  fetchCurrentState, fetchWeeklyHistory, fetchUpcomingEvents, fetchLatestNote,
  acknowledgeStartingValues,
} from './db.js';
import * as F from './finance.js';
import { renderSidebar, setUserEmail, toast, fmtDate, categoryMeta, escapeHtml } from './ui.js';

renderSidebar('dashboard');

const session = await requireAuth();
if (session) init(session);

async function init(session) {
  setUserEmail(session.user.email);
  try {
    const [state, history, events, note] = await Promise.all([
      fetchCurrentState(session.user.id),
      fetchWeeklyHistory(session.user.id),
      fetchUpcomingEvents(session.user.id, 5),
      fetchLatestNote(session.user.id),
    ]);
    renderState(state, history);
    renderEvents(events);
    renderNote(note);
    startCountdown(state.target_date);
  } catch (err) {
    console.error(err);
    toast('Could not load dashboard data. Check your connection and config.', 'error');
  }
}

function renderState(state, history) {
  const totalMade = F.getTotalMade(state.realized_profit, state.prop_payouts);
  const credited = F.getCreditedTowardGoal(state, state.count_deposits_toward_goal);
  const remaining = F.getRemaining(state.target_amount, credited);
  const progress = F.getProgressPct(credited, state.target_amount);
  const drawdown = F.getDrawdown(state.current_equity, state.peak_equity);
  const ret = F.getReturnPct(state.realized_profit, state.total_deposited);

  setText('c-deposited', F.formatUSD(state.total_deposited));
  setText('c-made', F.formatUSD(totalMade));
  setText('c-profit', F.formatUSD(state.realized_profit));
  setText('c-payouts', F.formatUSD(state.prop_payouts));
  setText('c-remaining', F.formatUSD(remaining));

  const progEl = document.getElementById('c-progress');
  progEl.textContent = F.formatPct(progress.raw, 2);
  progEl.className = 'card-value ' + (progress.exceeded ? 'value-green' : '');
  setText('c-progress-note', progress.exceeded
    ? 'Target exceeded — actual achievement shown (bar capped at 100%).'
    : 'Percentage of target achieved so far.');

  const bar = document.getElementById('goal-bar');
  bar.style.width = progress.pct + '%';
  if (progress.pct >= 100) bar.classList.add('complete');

  setText('goal-achieved', `${F.formatUSD(credited)} achieved`);
  setText('goal-target', `Target ${F.formatUSD(state.target_amount)}`);
  setText('crediting-method', state.count_deposits_toward_goal
    ? '+ deposits count toward the goal (change in Settings)'
    : '+ confirmed prop payouts count toward the goal (deposits excluded)');

  setText('p-made', F.formatPct(progress.raw, 2));
  setText('p-remaining', F.formatPct(Math.max(0, 100 - progress.raw), 2));
  const dd = document.getElementById('p-drawdown');
  dd.textContent = F.formatPct(drawdown, 2);
  dd.className = 'sp-value ' + (drawdown > 5 ? 'value-red' : drawdown > 0 ? 'value-red' : 'value-green');
  setText('p-return', ret === null ? '—' : F.formatPct(ret, 2));

  if (state.reporting_week) setText('reporting-week-label', `Current reporting week: ${state.reporting_week}`);
  if (state.weekly_notes) {
    setText('c-progress-note', `Latest weekly note: ${state.weekly_notes.slice(0, 120)}${state.weekly_notes.length > 120 ? '…' : ''}`);
  }

  renderChart(history);
  renderStartingBanner(state);
}

function renderStartingBanner(state) {
  const banner = document.getElementById('starting-banner');
  if (!banner || state.starting_values_acknowledged) return;
  banner.innerHTML = `
    <span><b>Starting values.</b> The figures shown are editable example defaults
    (deposited ${F.formatUSD(3100)}, target ${F.formatUSD(1800000)}). Replace them with your real numbers via a weekly update.</span>
    <span style="display:flex; gap:10px;">
      <a class="btn btn-gold btn-small" href="settings.html">Update my figures</a>
      <button class="btn btn-ghost btn-small" id="dismiss-banner">Dismiss</button>
    </span>`;
  banner.style.display = 'flex';
  banner.className = 'banner';
  document.getElementById('dismiss-banner').addEventListener('click', async () => {
    try {
      await acknowledgeStartingValues();
      banner.style.display = 'none';
    } catch (err) {
      toast('Could not dismiss banner.', 'error');
    }
  });
}

function renderEvents(events) {
  const host = document.getElementById('upcoming-events');
  if (!events.length) return;
  host.innerHTML = events.map((ev) => {
    const meta = categoryMeta(ev.category);
    return `<div class="sub-line">
      <span><span style="color:${meta.color};">●</span>&nbsp; ${escapeHtml(ev.title)}</span>
      <b>${fmtDate(ev.event_date)}</b>
    </div>`;
  }).join('');
}

function renderNote(note) {
  if (!note) return;
  document.getElementById('latest-note').innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif; font-size:20px; margin-bottom:6px;">${escapeHtml(note.title)}</div>
    <div class="muted" style="white-space:pre-wrap;">${escapeHtml((note.body || '').slice(0, 300))}</div>
    <div class="hint" style="margin-top:8px;">Updated ${fmtDate(note.updated_at)}</div>`;
}

/* ---------- equity chart (dependency-free SVG) ---------- */
function renderChart(history) {
  const host = document.getElementById('equity-chart');
  const points = [...history].reverse()
    .filter((r) => Number.isFinite(Number(r.current_equity)))
    .map((r) => ({ d: new Date(r.created_at), v: Number(r.current_equity) }));
  if (points.length < 2) {
    host.innerHTML = '<div class="empty-state">Chart appears after two or more weekly updates.</div>';
    return;
  }
  const W = 640, H = 220, P = 34;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${P},${H - P} ${line} ${x(points.length - 1).toFixed(1)},${H - P}`;
  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto;" role="img" aria-label="Equity history chart">
      <defs>
        <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#C5A56A" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#C5A56A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#eqg)"></polygon>
      <polyline points="${line}" fill="none" stroke="#C5A56A" stroke-width="2" stroke-linejoin="round"></polyline>
      ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="#101B2D" stroke="#C5A56A" stroke-width="2"><title>${fmtDate(p.d)} — ${F.formatUSD(p.v)}</title></circle>`).join('')}
      <text x="${P}" y="${P - 8}" fill="#F3F0E8" font-size="12" font-family="Inter">${F.formatUSD(max)}</text>
      <text x="${P}" y="${H - P + 16}" fill="rgba(243,240,232,0.5)" font-size="11" font-family="Inter">${F.formatUSD(min)}</text>
      <text x="${W - P}" y="${H - 8}" text-anchor="end" fill="rgba(243,240,232,0.5)" font-size="11" font-family="Inter">${fmtDate(points[points.length - 1].d)}</text>
      <text x="${P}" y="${H - 8}" fill="rgba(243,240,232,0.5)" font-size="11" font-family="Inter">${fmtDate(points[0].d)}</text>
    </svg>`;
}

/* ---------- countdown ---------- */
let countdownTimer = null;
function startCountdown(targetDate) {
  const host = document.getElementById('countdown');
  const note = document.getElementById('countdown-note');
  if (!targetDate) {
    host.innerHTML = '<div class="empty-state" style="flex:1;">No target date set. Choose one in Settings.</div>';
    note.textContent = '';
    return;
  }
  const target = new Date(targetDate + 'T00:00:00');
  note.textContent = `Target date: ${fmtDate(targetDate)}`;
  const tick = () => {
    const diff = target - new Date();
    if (diff <= 0) {
      host.innerHTML = '<div class="card-value value-green" style="flex:1;">Target date reached</div>';
      clearInterval(countdownTimer);
      return;
    }
    const days = Math.floor(diff / 86400000);
    const years = days > 365 ? Math.floor(days / 365) : 0;
    const months = days > 365 ? Math.floor((days % 365) / 30) : 0;
    const rest = diff - (years * 365 + months * 30) * 86400000;
    const units = [
      ...(years ? [['Years', years], ['Months', months]] : []),
      ['Days', days % (years ? 30 : 1e9)],
      ['Hours', Math.floor(rest / 3600000)],
      ['Minutes', Math.floor((rest % 3600000) / 60000)],
      ['Seconds', Math.floor((rest % 60000) / 1000)],
    ];
    host.innerHTML = units.map(([lab, num]) =>
      `<div class="count-unit"><div class="count-num">${String(num).padStart(2, '0')}</div><div class="count-lab">${lab}</div></div>`
    ).join('');
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

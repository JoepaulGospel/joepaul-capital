// js/goals.js — goal detail, milestones, countdown, pace projection.
import { requireAuth } from './auth.js';
import { fetchCurrentState, fetchWeeklyHistory } from './db.js';
import * as F from './finance.js';
import { renderSidebar, setUserEmail, toast, fmtDate } from './ui.js';

renderSidebar('goals');

const session = await requireAuth();
if (session) init(session);

async function init(session) {
  setUserEmail(session.user.email);
  try {
    const [state, history] = await Promise.all([
      fetchCurrentState(session.user.id),
      fetchWeeklyHistory(session.user.id),
    ]);
    render(state, history);
  } catch (err) {
    toast('Could not load goal data.', 'error');
  }
}

function render(state, history) {
  const credited = F.getCreditedTowardGoal(state, state.count_deposits_toward_goal);
  const remaining = F.getRemaining(state.target_amount, credited);
  const progress = F.getProgressPct(credited, state.target_amount);

  setText('g-target', F.formatUSD(state.target_amount));
  setText('g-achieved', F.formatUSD(credited));
  setText('g-remaining', F.formatUSD(remaining));
  setText('g-progress', F.formatPct(progress.raw, 2) + (progress.exceeded ? ' (target exceeded)' : ''));
  const bar = document.getElementById('g-bar');
  bar.style.width = progress.pct + '%';
  if (progress.pct >= 100) bar.classList.add('complete');
  setText('g-bar-pct', F.formatPct(progress.pct, 1));

  // milestones at 25 / 50 / 75 / 100%
  const target = F.toFiniteNumber(state.target_amount);
  const miles = [25, 50, 75, 100].map((p) => {
    const amt = target * p / 100;
    return { p, amt, hit: credited >= amt };
  });
  document.getElementById('g-milestones').innerHTML = miles.map((m) => `
    <div class="stat-pill">
      <span class="sp-label">${m.p}% — ${F.formatUSD(m.amt)}</span>
      <span class="sp-value ${m.hit ? 'value-green' : ''}">${m.hit ? '✓ Reached' : F.formatUSD(Math.max(0, m.amt - credited)) + ' to go'}</span>
    </div>`).join('');

  // pace projection
  const pace = F.getWeeklyPace(history, state.count_deposits_toward_goal);
  if (pace === null || pace <= 0) {
    setText('g-pace', '—');
    setText('g-weeks', '—');
    setText('g-pace-note', 'A projection appears after two or more weekly updates with growth between them.');
  } else {
    setText('g-pace', F.formatUSD(pace) + ' / wk');
    setText('g-weeks', '~' + Math.ceil(remaining / pace).toLocaleString('en-US'));
  }

  startCountdown(state.target_date);
}

let timer = null;
function startCountdown(targetDate) {
  const host = document.getElementById('g-countdown');
  const note = document.getElementById('g-countdown-note');
  if (!targetDate) {
    host.innerHTML = '<div class="empty-state" style="flex:1;">No target date set. Choose one in Settings.</div>';
    return;
  }
  const target = new Date(targetDate + 'T00:00:00');
  note.textContent = `Target date: ${fmtDate(targetDate)}`;
  const tick = () => {
    const diff = target - new Date();
    if (diff <= 0) {
      host.innerHTML = '<div class="card-value value-green" style="flex:1;">Target date reached</div>';
      clearInterval(timer);
      return;
    }
    const days = Math.floor(diff / 86400000);
    const years = days > 365 ? Math.floor(days / 365) : 0;
    const months = days > 365 ? Math.floor((days % 365) / 30) : 0;
    const rest = diff - (years * 365 + months * 30) * 86400000;
    const units = [
      ...(years ? [['Yrs', years], ['Mo', months]] : []),
      ['Days', days % (years ? 30 : 1e9)],
      ['Hrs', Math.floor(rest / 3600000)],
      ['Min', Math.floor((rest % 3600000) / 60000)],
      ['Sec', Math.floor((rest % 60000) / 1000)],
    ];
    host.innerHTML = units.map(([lab, num]) =>
      `<div class="count-unit"><div class="count-num">${String(num).padStart(2, '0')}</div><div class="count-lab">${lab}</div></div>`
    ).join('');
  };
  tick();
  timer = setInterval(tick, 1000);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

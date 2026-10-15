// js/finance.js — Pure financial calculation module.
// No DOM access, no network calls. Reused by every page and covered by tests.
// All functions are defensive: they never return NaN or Infinity.

export const STARTING_DEFAULTS = Object.freeze({
  totalDeposited: 3100,
  realizedProfit: 0,
  propPayouts: 0,
  currentEquity: 3100,
  peakEquity: 3100,
  targetAmount: 1800000, // USD
});

const strip = (value) => (typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value);

/** Parse any input into a finite number, or return the fallback. */
export function toFiniteNumber(value, fallback = 0) {
  const n = Number(strip(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Total profit made = realized trading profit + confirmed prop payouts.
 *  The two sources stay identifiable upstream; this only sums them.
 *  Never negative, never NaN. */
export function getTotalMade(realizedProfit, propPayouts) {
  return Math.max(0, toFiniteNumber(realizedProfit)) + Math.max(0, toFiniteNumber(propPayouts));
}

/** Amount credited toward the goal.
 *  Default method: profits + prop payouts count; deposits do NOT count
 *  (your own money is not profit). Configurable via countDepositsTowardGoal. */
export function getCreditedTowardGoal(
  { realizedProfit = 0, propPayouts = 0, totalDeposited = 0 } = {},
  countDepositsTowardGoal = false
) {
  const credited = getTotalMade(realizedProfit, propPayouts);
  return countDepositsTowardGoal
    ? credited + Math.max(0, toFiniteNumber(totalDeposited))
    : credited;
}

/** Remaining target, floored at zero. */
export function getRemaining(targetAmount, credited) {
  const t = toFiniteNumber(targetAmount);
  if (t <= 0) return 0;
  return Math.max(0, t - toFiniteNumber(credited));
}

/** Progress toward target as a percentage.
 *  Returns { pct (0–100, bar-safe), raw (actual, may exceed 100), exceeded }. */
export function getProgressPct(credited, targetAmount) {
  const t = toFiniteNumber(targetAmount);
  if (t <= 0) return { pct: 0, raw: 0, exceeded: false };
  const raw = (toFiniteNumber(credited) / t) * 100;
  return { pct: Math.min(100, Math.max(0, raw)), raw, exceeded: raw > 100 };
}

/** Simple profit-as-%-of-deposited-capital.
 *  This is NOT a money-weighted or time-weighted return — with deposits at
 *  different times it is only a rough measure. Returns null if no capital
 *  is deposited (division by zero is handled safely). */
export function getReturnPct(realizedProfit, totalDeposited) {
  const d = toFiniteNumber(totalDeposited);
  if (d <= 0) return null;
  return (Math.max(0, toFiniteNumber(realizedProfit)) / d) * 100;
}

/** Current drawdown from peak equity, in percent (0–100+).
 *  This is NOT a prop-firm daily drawdown limit — a separate metric.
 *  Returns 0 when peak is zero or missing. Never negative. */
export function getDrawdown(currentEquity, peakEquity) {
  const peak = toFiniteNumber(peakEquity);
  const current = toFiniteNumber(currentEquity);
  if (peak <= 0) return 0;
  return Math.max(0, ((peak - current) / peak) * 100);
}

/** Average credited-per-update pace from the weekly ledger.
 *  Expects newest-first order (as returned by fetchWeeklyHistory).
 *  Returns null when there is not enough data. Used for projections only. */
export function getWeeklyPace(weeklyUpdates, countDepositsTowardGoal = false) {
  if (!Array.isArray(weeklyUpdates) || weeklyUpdates.length < 2) return null;
  const oldest = weeklyUpdates[weeklyUpdates.length - 1];
  const newest = weeklyUpdates[0];
  const credited = (row) =>
    getCreditedTowardGoal(
      { realizedProfit: row.realized_profit, propPayouts: row.prop_payouts, totalDeposited: row.total_deposited },
      countDepositsTowardGoal
    );
  const delta = credited(newest) - credited(oldest);
  const weeks = Math.max(1, weeklyUpdates.length - 1);
  return delta / weeks;
}

export function formatUSD(value) {
  const n = toFiniteNumber(value, NaN);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(n);
}

export function formatPct(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Validate a financial input. Rejects non-numbers and negatives. */
export function validateAmount(value, { field = 'Amount', allowZero = true } = {}) {
  const n = Number(strip(value));
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a valid number.` };
  if (n < 0 || (!allowZero && n === 0)) {
    return { ok: false, error: `${field} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.` };
  }
  return { ok: true, value: n };
}

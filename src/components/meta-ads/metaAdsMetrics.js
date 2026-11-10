// Presentation-only normalization: missing metrics are not measured zeroes.
export const metricNumber = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
export const metricRows = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
export const spendUsd = row => metricNumber(row?.spend_usd ?? row?.spend);
export const spendFcfa = row => {
  const fcfa = metricNumber(row?.spend_fcfa), usd = spendUsd(row);
  return fcfa ?? (usd === null ? null : metricNumber(usd * 600));
};
export function sumMetric(rows, read) {
  if (!Array.isArray(rows)) return null;
  let total = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const value = metricNumber(read(row));
    if (value === null) return null;
    total += value;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
export const metricFcfa = value => { const n=metricNumber(value); return n === null ? '—' : Math.round(n).toLocaleString() + ' F'; };
export const metricCount = value => { const n=metricNumber(value); return n === null ? '—' : n.toLocaleString(); };
export const metricUsd = value => { const n=metricNumber(value); return n === null ? 'Donnée indisponible' : '~ $' + n.toFixed(2); };
export const attributionSpend = value => { const n=metricNumber(value); return n === null ? '—' : metricFcfa(n * 600) + ' (' + metricUsd(n) + ')'; };

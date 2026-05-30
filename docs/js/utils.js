export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

export const normalize = (s) =>
  (s == null ? '' : String(s)).trim().replace(/\s+/g, ' ').normalize('NFKC');

export const songKey = (title, artist) =>
  `${normalize(title).toLowerCase()}__${normalize(artist).toLowerCase()}`;

export const parseDate = (s) => {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const parseDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
};

export const fmtDate = (d) => {
  if (!d) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const fmtMonth = (d) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;

export const streamKey = (stream) =>
  [
    stream?.channel || '',
    stream?.dateRaw || fmtDate(stream?.date),
    stream?.index || '',
    stream?.url || '',
  ].join('|');

export const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const daysSince = (d) => {
  if (!d) return null;
  return Math.floor((TODAY - d) / 86400000);
};

export const daysClass = (d) => {
  if (d == null) return 'never';
  if (d <= 30) return 'fresh';
  if (d >= 180) return 'stale';
  return '';
};

export const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const escapeRegExp = (s) =>
  String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const debounce = (fn, ms = 150) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const groupBy = (arr, fn) => {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

export const sumBy = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

export const formatNumber = (n) => Number(n || 0).toLocaleString();

export const isLink = (el) => !!(el && el.closest && el.closest('a, button'));

export function highlightText(text, queries) {
  if (!queries || !queries.length) return escapeHtml(text);
  const escaped = escapeHtml(text);
  let result = escaped;
  for (const q of queries) {
    if (!q) continue;
    const re = new RegExp(escapeRegExp(escapeHtml(q)), 'gi');
    result = result.replace(re, (m) => `<mark class="hl">${m}</mark>`);
  }
  return result;
}

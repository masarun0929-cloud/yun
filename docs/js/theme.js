const KEY = 'sazanami-yun-songlist-theme';
const ORDER = ['auto', 'light', 'dark'];
const ICONS = { auto: '🌗', light: '☀️', dark: '🌙' };
const LABELS = { auto: 'auto', light: 'light', dark: 'dark' };

const subscribers = new Set();

export function getTheme() {
  return localStorage.getItem(KEY) || 'auto';
}

export function getResolvedTheme() {
  const t = getTheme();
  if (t !== 'auto') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(t) {
  if (!ORDER.includes(t)) t = 'auto';
  localStorage.setItem(KEY, t);
  apply();
  for (const fn of subscribers) fn(t, getResolvedTheme());
}

export function cycleTheme() {
  const cur = getTheme();
  const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
  setTheme(next);
}

function apply() {
  const t = getTheme();
  document.documentElement.setAttribute('data-theme', t);
  const iconEl = document.getElementById('theme-icon');
  const labelEl = document.getElementById('theme-label');
  if (iconEl) iconEl.textContent = ICONS[t];
  if (labelEl) labelEl.textContent = LABELS[t];
}

export function onThemeChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function initTheme() {
  apply();
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', cycleTheme);

  const mql = matchMedia('(prefers-color-scheme: dark)');
  if (mql.addEventListener) {
    mql.addEventListener('change', () => {
      if (getTheme() === 'auto') {
        for (const fn of subscribers) fn('auto', getResolvedTheme());
      }
    });
  }
}

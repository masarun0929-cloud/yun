import { CHANNELS, COMBINED_CHANNEL, DEFAULT_CHANNEL, SHOW_COMBINED_CHANNEL } from './config.js';

const VALID_TABS = new Set(['dashboard', 'ranking', 'songs', 'timeline', 'analytics']);
const VALID_CHANNELS = new Set([
  ...Object.values(CHANNELS).map((channel) => channel.id),
  ...(SHOW_COMBINED_CHANNEL ? [COMBINED_CHANNEL.id] : []),
]);
const DEFAULTS = {
  tab: 'dashboard',
  channel: DEFAULT_CHANNEL,
  q: '',
};

export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get('tab');
  const rawChannel = params.get('ch');
  return {
    tab: VALID_TABS.has(rawTab) ? rawTab : DEFAULTS.tab,
    channel: VALID_CHANNELS.has(rawChannel) ? rawChannel : DEFAULTS.channel,
    q: params.get('q') || DEFAULTS.q,
  };
}

export function writeUrlState(next = {}, options = {}) {
  const merged = { ...readUrlState(), ...next };
  const params = new URLSearchParams();
  if (merged.tab !== DEFAULTS.tab) params.set('tab', merged.tab);
  if (merged.channel !== DEFAULTS.channel) params.set('ch', merged.channel);
  if (merged.q) params.set('q', merged.q);
  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', url);
  return merged;
}

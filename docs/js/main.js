import { state } from './state.js';
import { loadAll } from './data.js?v=20260528-sazanami-5';
import { buildIndex } from './search.js';
import { initTheme, onThemeChange } from './theme.js?v=20260528-sazanami-3';
import { onRerenderNeeded, destroyAllCharts } from './charts.js?v=20260528-sazanami-3';
import { $, $$, escapeHtml, fmtDate, parseDateTime, daysSince, isLink, formatNumber, streamKey } from './utils.js?v=20260528-sazanami-5';
import { CHANNELS, COMBINED_CHANNEL, DEFAULT_CHANNEL, SHOW_AUDIENCE_SWITCH, SHOW_COMBINED_CHANNEL, SHOW_SONG_KEYS, SITE } from './config.js?v=20260528-sazanami-3';
import { readUrlState, writeUrlState } from './url-state.js';

initTheme();
applySiteConfig();

const VIEW_LOADERS = {
  dashboard: () => import('./views/dashboard.js?v=20260528-sazanami-3').then(m => m.renderDashboard),
  ranking:   () => import('./views/ranking.js?v=20260528-sazanami-3').then(m => m.renderRanking),
  songs:     () => import('./views/songs.js?v=20260528-sazanami-3').then(m => m.renderSongs),
  timeline:  () => import('./views/timeline.js?v=20260528-sazanami-3').then(m => m.renderTimeline),
  analytics: () => import('./views/analytics.js?v=20260528-sazanami-3').then(m => m.renderAnalytics),
};
const rendererCache = new Map();
let renderToken = 0;

function isValidTab(tab) {
  return Object.prototype.hasOwnProperty.call(VIEW_LOADERS, tab);
}

async function getRenderer(tab) {
  if (!rendererCache.has(tab)) rendererCache.set(tab, VIEW_LOADERS[tab]());
  try {
    return await rendererCache.get(tab);
  } catch (error) {
    rendererCache.delete(tab);
    throw error;
  }
}

async function renderTab(tab = state.activeTab) {
  if (!state.data || !isValidTab(tab)) return;
  const token = ++renderToken;
  try {
    const renderer = await getRenderer(tab);
    if (token !== renderToken || tab !== state.activeTab || !state.data) return;
    renderer();
  } catch (error) {
    console.error(`[${tab}] render failed`, error);
    const panel = $(`#panel-${tab}`);
    if (panel) {
      panel.innerHTML = `
        <div class="state-card">
          <div class="msg">表示に失敗しました</div>
          <div class="err-detail">${escapeHtml(error?.message || String(error))}</div>
        </div>
      `;
    }
  }
}

function activateTab(tab, options = {}) {
  if (!isValidTab(tab)) tab = 'dashboard';
  state.activeTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  if (options.updateUrl !== false) writeUrlState({ tab });
  renderTab(tab);
}

function getDataset(channelId) {
  if (!state.channelData) return null;
  if (SHOW_COMBINED_CHANNEL && channelId === COMBINED_CHANNEL.id) return state.channelData.combined;
  return state.channelData.channels[channelId] || null;
}

function switchChannel(channelId, options = {}) {
  const ds = getDataset(channelId);
  if (!ds) return;
  state.channel = channelId;
  updatePageTitle(channelId);
  state.data = ds;
  state.timelineFilter = null;
  state.timelineFocus = null;
  state.timelineLimit = 12;
  state.songsLimit = 100;
  if (options.resetSearch !== false) {
    state.songsQuery = '';
    state.songsGenre = 'all';
  }
  buildIndex(ds.songs);
  destroyAllCharts();
  $$('#channel-switch [data-channel]').forEach(b => b.classList.toggle('active', b.dataset.channel === channelId));
  updateMobileMenuLabel();
  if (options.updateUrl !== false) {
    writeUrlState({
      tab: state.activeTab,
      channel: channelId,
      q: state.songsQuery,
    });
  }
  renderHero();
  renderTab();
}

function switchAudience(audience) {
  if (!SHOW_AUDIENCE_SWITCH) {
    state.audience = 'listener';
    state.singerMode = false;
    document.body.dataset.audience = 'listener';
    updateMobileMenuLabel();
    if (state.data) renderTab();
    return;
  }
  state.audience = audience === 'singer' ? 'singer' : 'listener';
  state.singerMode = state.audience === 'singer';
  if (!state.singerMode) state.singerPreset = 'all';
  $$('.audience-switch [data-audience]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.audience === state.audience);
  });
  document.body.dataset.audience = state.audience;
  updateMobileMenuLabel();
  if (state.audience === 'singer') {
    state.songsLimit = 100;
    activateTab('songs');
  } else if (state.data) {
    renderTab();
  }
}

function updateMobileMenuLabel() {
  const label = $('#mobile-menu-label');
  if (!label) return;
  const channel = $('#channel-switch [data-channel].active')?.textContent?.trim() || CHANNELS[DEFAULT_CHANNEL]?.label || '';
  if (!SHOW_AUDIENCE_SWITCH) {
    label.textContent = channel;
    return;
  }
  const audience = $('#audience-switch [data-audience].active')?.textContent?.trim() || 'リスナー';
  label.textContent = `${channel} / ${audience}`;
}

function pageTitle(channelId = state.channel) {
  if (!SHOW_COMBINED_CHANNEL && Object.keys(CHANNELS).length === 1) {
    return `${SITE.creatorName}　${SITE.databaseName}`;
  }
  const label = SHOW_COMBINED_CHANNEL && channelId === COMBINED_CHANNEL.id
    ? ''
    : CHANNELS[channelId]?.label || '';
  return [SITE.creatorName, label, SITE.databaseName].filter(Boolean).join(' ');
}

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el && value) el.setAttribute(attr, value);
}

function renderOfficialLinks() {
  const nav = document.querySelector('.topbar-official-links');
  if (!nav) return;
  nav.setAttribute('aria-label', `${SITE.creatorName} 公式リンク`);
  nav.innerHTML = [
    '<span class="topbar-official-label">Official Channel</span>',
    ...SITE.officialLinks
      .filter((link) => link.url)
      .map((link) => `<a class="official-link ${escapeHtml(link.className || '')}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`),
  ].join('');
}

function renderChannelSwitch() {
  const switcher = $('#channel-switch');
  if (!switcher) return;
  const buttons = [
    ...Object.values(CHANNELS).map((channel) => ({ id: channel.id, label: channel.label })),
    ...(SHOW_COMBINED_CHANNEL ? [COMBINED_CHANNEL] : []),
  ];
  switcher.innerHTML = buttons.map((channel) =>
    `<button class="ch-btn${channel.id === DEFAULT_CHANNEL ? ' active' : ''}" data-channel="${escapeHtml(channel.id)}" type="button">${escapeHtml(channel.label)}</button>`
  ).join('');
}

function renderAudienceSwitch() {
  const switcher = $('#audience-switch');
  if (!switcher) return;
  switcher.hidden = !SHOW_AUDIENCE_SWITCH;
  switcher.setAttribute('aria-hidden', SHOW_AUDIENCE_SWITCH ? 'false' : 'true');
  if (!SHOW_AUDIENCE_SWITCH) {
    state.audience = 'listener';
    state.singerMode = false;
    document.body.dataset.audience = 'listener';
  }
}

function renderFooter() {
  const footer = document.querySelector('.site-footer p');
  if (!footer) return;
  const contact = SITE.contactUrl
    ? ` &nbsp;·&nbsp; <a href="${escapeHtml(SITE.contactUrl)}" target="_blank" rel="noopener">お問い合わせ</a>`
    : '';
  footer.innerHTML = `Made with <span class="heart">♡</span> for ${escapeHtml(SITE.fanLabel)}${contact}`;
}

function applySiteConfig() {
  const baseUrl = SITE.baseUrl ? SITE.baseUrl.replace(/\/$/, '') : '';
  const baseTitle = `${SITE.creatorName}　${SITE.databaseName}`;
  document.title = `${baseTitle}｜歌った曲リスト・ランキング・検索`;
  setMeta('meta[name="description"]', 'content', SITE.description);
  setMeta('link[rel="canonical"]', 'href', baseUrl ? `${baseUrl}/` : '');
  setMeta('meta[property="og:site_name"]', 'content', baseTitle);
  setMeta('meta[property="og:title"]', 'content', baseTitle);
  setMeta('meta[property="og:description"]', 'content', SITE.description);
  setMeta('meta[property="og:url"]', 'content', baseUrl ? `${baseUrl}/` : '');
  setMeta('meta[property="og:image"]', 'content', baseUrl ? `${baseUrl}/assets/site-icon.svg` : '');

  document.querySelector('.brand')?.setAttribute('aria-label', `${baseTitle} ホーム`);
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) brandTitle.innerHTML = `${escapeHtml(SITE.creatorName)} <span class="brand-dim">Database</span>`;
  const brandSub = document.querySelector('.brand-sub');
  if (brandSub) brandSub.textContent = SITE.editionLabel;
  const heroSub = document.querySelector('.hero-sub');
  if (heroSub) heroSub.textContent = SITE.tagline;

  renderChannelSwitch();
  renderAudienceSwitch();
  renderOfficialLinks();
  renderFooter();
  updatePageTitle(DEFAULT_CHANNEL);
}

function initMobileMenu() {
  const toggle = $('#mobile-menu-toggle');
  const checkbox = $('#mobile-menu-state');
  const menu = $('#topbar-actions');
  if (!toggle || !checkbox || !menu) return;
  const setOpen = (open) => {
    checkbox.checked = open;
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const close = () => setOpen(false);
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    requestAnimationFrame(() => setOpen(checkbox.checked));
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setOpen(!checkbox.checked);
  });
  checkbox.addEventListener('change', () => {
    setOpen(checkbox.checked);
  });
  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('is-open')) return;
    if (event.target.closest('#topbar-actions') || event.target.closest('#mobile-menu-toggle') || event.target.closest('#mobile-menu-state')) return;
    close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  updateMobileMenuLabel();
}

function initPageTopToast() {
  const button = $('#page-top-toast');
  if (!button) return;
  let ticking = false;
  const threshold = 420;
  const update = () => {
    ticking = false;
    const visible = window.scrollY > threshold;
    button.classList.toggle('is-visible', visible);
    button.setAttribute('aria-hidden', String(!visible));
  };
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  button.hidden = false;
  button.setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  update();
}

function refreshChannelButtons() {
  if (!state.channelData) return;
  for (const btn of $$('#channel-switch [data-channel]')) {
    const ch = btn.dataset.channel;
    const available = SHOW_COMBINED_CHANNEL && ch === COMBINED_CHANNEL.id
      ? !!state.channelData.combined
      : !!(state.channelData.channels && state.channelData.channels[ch]);
    btn.disabled = !available;
    if (!available) {
      btn.title = 'データを取得できませんでした';
    } else {
      btn.removeAttribute('title');
    }
  }
}

function filterTimelineBySong({ key, title, artist }) {
  const sameFilter = state.timelineFilter && state.timelineFilter.key === key;
  if (sameFilter && state.activeTab === 'timeline') {
    state.timelineFilter = null;
  } else {
    state.timelineFilter = { key, title, artist };
  }
  state.timelineFocus = null;
  state.timelineLimit = 12;
  activateTab('timeline');
  $('#panel-timeline').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToStreamFromDetail(song, ref) {
  state.timelineFilter = { key: song.key, title: song.title, artist: song.artist };
  state.timelineFocus = streamKey(ref);
  state.timelineLimit = 9999;
  activateTab('timeline');
  $('#panel-timeline').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function searchArtistFromDetail(song) {
  searchArtistName(song.artist || '');
}

function searchArtistName(artist) {
  const name = String(artist || '').replace(/"/g, '');
  state.songsQuery = name ? `artist:"${name}"` : '';
  state.songsLimit = 100;
  writeUrlState({ tab: 'songs', q: state.songsQuery });
  activateTab('songs', { updateUrl: false });
}

function findSong(key) {
  return (state.data?.songs || []).find(song => song.key === key) || null;
}

function youtubeVideoId(url) {
  const text = String(url || '');
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function youtubeThumb(url) {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

function youtubeThumbFallback(url) {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}

function youtubeThumbTiny(url) {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/default.jpg` : '';
}

function openSongDetail(key) {
  const song = findSong(key);
  const modal = $('#song-modal');
  const body = $('#song-modal-body');
  const title = $('#song-modal-title');
  if (!song || !modal || !body || !title) return;

  title.textContent = song.title;
  const refs = (song.streamRefs || []).slice(0, 8).map(ref => ({
    ...ref,
    thumbnail: youtubeThumb(ref.url),
    thumbnailFallback: youtubeThumbFallback(ref.url),
    thumbnailTiny: youtubeThumbTiny(ref.url),
    detailKey: streamKey(ref),
  }));
  const tags = [
    song.genre,
    ...(song.seasonTags || []),
    ...(song.moodTags || []),
    ...(song.singerTags || []),
  ].filter(Boolean);
  const detailStats = [
    `<div><strong>${song.count}</strong><span>歌唱回数</span></div>`,
    ...(SHOW_SONG_KEYS ? [`<div><strong>${song.displayKey || '—'}</strong><span>キー</span></div>`] : []),
    `<div><strong>${song.daysSinceLast ?? '—'}</strong><span>日前</span></div>`,
  ].join('');
  body.innerHTML = `
    <div class="song-detail-main">
      <div>
        <button class="song-detail-artist" type="button" data-detail-action="artist" data-songkey="${escapeHtml(song.key)}">${escapeHtml(song.artist)}</button>
        <div class="song-detail-tags">${tags.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join('')}</div>
      </div>
      <div class="song-detail-stats${SHOW_SONG_KEYS ? '' : ' no-key'}">
        ${detailStats}
      </div>
    </div>
    <div class="song-detail-actions">
      <button class="btn primary" type="button" data-detail-action="timeline" data-songkey="${escapeHtml(song.key)}">歌枠を見る</button>
      <button class="btn ghost" type="button" data-detail-action="close">閉じる</button>
    </div>
    <div class="song-detail-history">
      <h3>歌った歌枠</h3>
      ${refs.length ? refs.map(ref => `
        <div class="song-detail-stream">
          ${ref.thumbnail && ref.url
            ? `<a class="song-detail-thumb-link" href="${escapeHtml(ref.url)}" target="_blank" rel="noopener" aria-label="YouTubeで歌枠を開く"><img class="song-detail-thumb" src="${escapeHtml(ref.thumbnail)}" data-fallback="${escapeHtml(ref.thumbnailFallback)}" data-tiny="${escapeHtml(ref.thumbnailTiny)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
            : '<div class="song-detail-thumb placeholder"></div>'}
          <button class="song-detail-frame" type="button" data-detail-action="stream" data-songkey="${escapeHtml(song.key)}" data-streamkey="${escapeHtml(ref.detailKey)}">
            <span>${fmtDate(ref.date)}</span>
            <strong>${escapeHtml(ref.title || '配信')}</strong>
          </button>
        </div>
      `).join('') : '<p class="song-detail-empty">履歴未確認</p>'}
    </div>
  `;
  modal.hidden = false;
  $('#song-modal-close')?.focus();
}

function initSongModal() {
  const modal = $('#song-modal');
  const closeBtn = $('#song-modal-close');
  if (!modal || !closeBtn) return;
  const close = () => { modal.hidden = true; };
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
    const action = event.target.closest('[data-detail-action]');
    if (!action) return;
    event.stopPropagation();
    if (action.dataset.detailAction === 'close') close();
    if (action.dataset.detailAction === 'timeline') {
      const song = findSong(action.dataset.songkey);
      close();
      if (song) filterTimelineBySong(song);
    }
    if (action.dataset.detailAction === 'stream') {
      const song = findSong(action.dataset.songkey);
      const ref = song?.streamRefs?.find(item => streamKey(item) === action.dataset.streamkey);
      close();
      if (song && ref) jumpToStreamFromDetail(song, ref);
    }
    if (action.dataset.detailAction === 'artist') {
      const song = findSong(action.dataset.songkey);
      close();
      if (song) searchArtistFromDetail(song);
    }
  });
  modal.addEventListener('error', (event) => {
    const img = event.target.closest?.('.song-detail-thumb');
    if (!img) return;
    const next = img.dataset.fallback || img.dataset.tiny || '';
    if (next && img.src !== next) {
      img.src = next;
      if (img.dataset.fallback === next) {
        delete img.dataset.fallback;
      } else {
        delete img.dataset.tiny;
      }
      return;
    }
    img.closest('.song-detail-thumb-link')?.classList.add('thumb-missing');
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

function renderHero() {
  const { stats, streams } = state.data;
  const latest = streams[0]?.date || null;
  const dSinceLatest = daysSince(latest);
  const dataUpdatedAt = parseDateTime(stats.generatedAt) || stats.updateDate;
  const dataUpdatedDate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  if (dataUpdatedDate) dataUpdatedDate.setHours(0, 0, 0, 0);
  const dSinceUpdate = daysSince(dataUpdatedDate);
  const topCount = Math.max(0, ...(state.data.songs || []).map((song) => Number(song.count || 0)));
  const hasStreams = streams.length > 0;
  const chLabel = stats.channelLabel || stats.channelId || '';
  const chBadge = chLabel ? `<span class="badge accent" style="margin-right:8px;">${escapeHtml(chLabel)}</span>` : '';

  $('#updated-info').innerHTML =
    chBadge +
    `データ更新日：<strong>${fmtDate(dataUpdatedDate) || '—'}</strong>` +
    (dSinceUpdate != null ? ` <span class="badge">${dSinceUpdate}日前</span>` : '');

  $('#stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">総歌唱数</div>
      <div class="stat-value">${formatNumber(stats.total)}<span class="stat-unit">回</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">持ち曲数</div>
      <div class="stat-value">${formatNumber(stats.repertoire)}<span class="stat-unit">曲</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">歌枠回数</div>
      <div class="stat-value">${formatNumber(stats.streams)}<span class="stat-unit">回</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">1枠平均</div>
      <div class="stat-value">${stats.avgPerStream}<span class="stat-unit">曲</span></div>
    </div>
    <div class="stat-card accent">
      <div class="stat-label">${hasStreams ? '最新歌枠から' : '最高歌唱回数'}</div>
      <div class="stat-value">${hasStreams ? (dSinceLatest != null ? dSinceLatest : '—') : formatNumber(topCount)}<span class="stat-unit">${hasStreams ? '日' : '回'}</span></div>
    </div>
    <div class="stat-card gold">
      <div class="stat-label">${hasStreams ? '活動期間' : 'データ更新から'}</div>
      <div class="stat-value">${hasStreams ? activeDays(state.data) : (dSinceUpdate ?? '—')}<span class="stat-unit">日</span></div>
    </div>
  `;
}

function activeDays(data) {
  if (!data.streams.length) return '—';
  const first = data.streams[data.streams.length - 1].date;
  const last = data.streams[0].date;
  return Math.floor((last - first) / 86400000) + 1;
}

function showLoading() { $('#loading').hidden = false; $('#error').hidden = true; }
function hideLoading() { $('#loading').hidden = true; }
function showError(err) {
  $('#loading').hidden = true;
  $('#error').hidden = false;
  $('#err-detail').textContent = err && err.message ? err.message : String(err);
}

function updatePageTitle(mode) {
  const el = document.getElementById('page-title');
  if (!el) return;
  const title = pageTitle(mode);
  el.textContent = [SITE.heroIcon, title].filter(Boolean).join(' ');
  document.title = title;
}

function initHelpModal() {
  const modal = $('#help-modal');
  const openBtn = $('#help-btn');
  const closeBtn = $('#help-close');
  if (!modal || !openBtn || !closeBtn) return;

  const open = () => {
    modal.hidden = false;
    closeBtn.focus();
  };
  const close = () => {
    modal.hidden = true;
    openBtn.focus();
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

function initWelcomeTip() {
  const tip = $('#welcome-tip');
  const close = $('#welcome-close');
  if (!tip || !close) return;
  const storageKey = `${SITE.storagePrefix || 'songlist'}-welcome-tip-dismissed`;
  if (localStorage.getItem(storageKey) === '1') return;
  tip.hidden = false;
  close.addEventListener('click', () => {
    tip.hidden = true;
    localStorage.setItem(storageKey, '1');
  });
}

async function init() {
  showLoading();
  try {
    const channelData = await loadAll();
    state.channelData = channelData;
    state.lives = channelData.lives || [];
    state.liveStats = channelData.liveStats || {};
    const url = readUrlState();
    state.songsQuery = url.q;
    let initialChannel = url.channel || state.channel || DEFAULT_CHANNEL;
    if (!getDataset(initialChannel)) initialChannel = DEFAULT_CHANNEL;
    if (!getDataset(initialChannel)) {
      const fallback = Object.keys(channelData.channels)[0];
      if (fallback) initialChannel = fallback;
    }
    if (!getDataset(initialChannel)) throw new Error('No channel data could be loaded');
    refreshChannelButtons();
    hideLoading();
    switchChannel(initialChannel, { resetSearch: false, updateUrl: false });
    activateTab(url.tab, { updateUrl: false });
    switchAudience(SHOW_AUDIENCE_SWITCH ? state.audience : 'listener');
    for (const ch of Object.values(channelData.channels)) {
      if (ch.orphans.length) {
        console.warn(`[${ch.stats.channelLabel}] セトリ→リスト未マッチ: ${ch.orphans.length}件`, ch.orphans);
      }
    }
  } catch (e) {
    console.error(e);
    showError(e);
  }
}

function applyUrlState() {
  if (!state.channelData) return;
  const url = readUrlState();
  state.songsQuery = url.q;
  if (url.channel !== state.channel && getDataset(url.channel)) {
    switchChannel(url.channel, { resetSearch: false, updateUrl: false });
  }
  activateTab(url.tab, { updateUrl: false });
}

// Tab buttons
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// Channel switch
$$('.ch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.channel) return;
    if (btn.disabled) return;
    switchChannel(btn.dataset.channel);
  });
});

window.addEventListener('popstate', applyUrlState);

// Audience switch
$$('[data-audience]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!SHOW_AUDIENCE_SWITCH) return;
    switchAudience(btn.dataset.audience);
  });
});

// Global click → filter timeline by song
document.body.addEventListener('click', (e) => {
  const artist = e.target.closest('[data-artist-search]');
  if (artist) {
    e.preventDefault();
    e.stopPropagation();
    searchArtistName(artist.dataset.artistSearch || artist.textContent || '');
    return;
  }
  if (isLink(e.target)) return;
  const target = e.target.closest('[data-songkey]');
  if (!target) return;
  openSongDetail(target.dataset.songkey);
});

$('#retry-btn').addEventListener('click', init);
$('#reload-btn').addEventListener('click', init);
initHelpModal();
initSongModal();
initMobileMenu();
initPageTopToast();
initWelcomeTip();

// Re-render charts on theme change
onRerenderNeeded(() => {
  if (!state.data) return;
  destroyAllCharts();
  if (state.activeTab === 'dashboard' || state.activeTab === 'analytics') renderTab();
});

init();

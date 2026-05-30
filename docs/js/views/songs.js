import { state } from '../state.js';
import { $, escapeHtml, fmtDate, daysClass, debounce, highlightText } from '../utils.js';
import { search, matchReasons } from '../search.js';
import { writeUrlState } from '../url-state.js';
import { SHOW_SONG_KEYS, SITE } from '../config.js';

let searchInputEl, sortSelectEl, genreSelectEl, filterButtonsEl, genreChipsEl, listEl, countEl, moreBtnWrap;
const SETLIST_STORAGE_KEY = `${SITE.storagePrefix || 'songlist'}-setlist-v1`;
let currentFiltered = [];

export function renderSongs() {
  loadSetlist();
  const panel = $('#panel-songs');
  panel.innerHTML = `
    <div class="section-header">
      <h2>${state.singerMode ? '🎙 選曲ボード' : '🎵 全曲リスト'}</h2>
      <span class="count-pill" id="songs-count">—</span>
    </div>
    <div class="mobile-panel-switch">
      <button class="btn ghost active" type="button" data-mobile-panel-toggle="filters">絞り込み</button>
    </div>
    <div id="songs-filter-panel" class="mobile-panel mobile-panel-filters is-open">
      <div class="controls">
        <input id="songs-search" class="text-input" type="search" placeholder="🔍 曲名・アーティスト・artist:miwa などで検索" value="${escapeHtml(state.songsQuery)}">
        <select id="songs-sort" class="select-input">
          <option value="count-desc">回数（多）</option>
          <option value="count-asc">回数（少）</option>
          <option value="recent">最終披露（新）</option>
          <option value="oldest">最終披露（古）</option>
          <option value="title">曲名（あ→ん）</option>
          <option value="artist">アーティスト</option>
        </select>
        <select id="songs-genre" class="select-input genre-select" title="ジャンルで絞り込み">
          ${genreOptionsHtml()}
        </select>
      </div>
      <p class="search-help">
        ${state.singerMode
          ? '曲の＋セトリから追加できます。ランダム追加は現在の検索・絞り込み条件から選びます。'
          : 'タグを押すと、その条件で絞り込めます。曲を押すと詳細を開きます。'}
      </p>
      <div class="controls" id="songs-filters" style="margin-top:-8px;">
        <button class="btn ghost active" data-filter="all">すべて</button>
        <button class="btn ghost" data-filter="fresh">🟢 最近 (30日以内)</button>
        <button class="btn ghost" data-filter="stale">🟠 久しぶり (180日以上)</button>
        <button class="btn ghost" data-filter="never">⚪ 履歴未確認</button>
        ${state.singerMode ? '' : '<button class="btn primary" id="recommend-btn" type="button">おすすめ選曲</button>'}
      </div>
      ${state.singerMode ? `
        <div class="songs-tools">
          ${SHOW_SONG_KEYS ? '<button class="btn ghost" data-singer-preset="keyed" type="button">キー確認済み</button>' : ''}
          <button class="btn ghost" data-singer-preset="classic" type="button">定番</button>
          <button class="btn ghost" data-singer-preset="stale" type="button">久しぶり</button>
          <button class="btn ghost" data-singer-preset="rare" type="button">レア</button>
          <button class="btn ghost" id="compact-btn" type="button">表示: ${state.songsView === 'compact' ? 'コンパクト' : '詳細'}</button>
          <button class="btn primary" id="recommend-btn" type="button">おすすめ選曲</button>
          <button class="btn ghost" id="setlist-toggle-btn" type="button" aria-controls="setlist-planner" aria-expanded="${state.setlistExpanded ? 'true' : 'false'}">${state.setlistExpanded ? 'セトリ制作を閉じる' : 'セトリ制作を開く'}</button>
        </div>
      ` : ''}
      <div id="recommend-box" class="recommend-box" hidden></div>
    </div>
    ${state.singerMode ? '<div id="setlist-planner" class="setlist-planner mobile-panel mobile-panel-setlist"></div>' : ''}
    <div class="genre-strip" id="songs-genre-chips">${genreChipsHtml()}</div>
    <div id="songs-list" class="song-list"></div>
    <div class="timeline-controls" id="songs-more-wrap"></div>
  `;

  searchInputEl = $('#songs-search');
  sortSelectEl = $('#songs-sort');
  genreSelectEl = $('#songs-genre');
  filterButtonsEl = $('#songs-filters');
  genreChipsEl = $('#songs-genre-chips');
  listEl = $('#songs-list');
  countEl = $('#songs-count');
  moreBtnWrap = $('#songs-more-wrap');

  sortSelectEl.value = state.songsSort;
  genreSelectEl.value = genreExists(state.songsGenre) ? state.songsGenre : 'all';
  state.songsGenre = genreSelectEl.value;
  refreshFilterButtons();
  refreshGenreChips();

  const debounced = debounce(() => {
    state.songsQuery = searchInputEl.value;
    state.songsLimit = 100;
    writeUrlState({
      tab: 'songs',
      q: state.songsQuery,
    }, { replace: true });
    refresh();
  }, 120);
  searchInputEl.addEventListener('input', debounced);
  sortSelectEl.addEventListener('change', () => { state.songsSort = sortSelectEl.value; refresh(); });
  genreSelectEl.addEventListener('change', () => {
    state.songsGenre = genreSelectEl.value;
    state.songsLimit = 100;
    refreshGenreChips();
    refresh();
  });
  filterButtonsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    state.songsFilter = btn.dataset.filter;
    state.songsLimit = 100;
    refreshFilterButtons();
    refresh();
  });
  genreChipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-genre]');
    if (!btn) return;
    state.songsGenre = btn.dataset.genre;
    genreSelectEl.value = state.songsGenre;
    state.songsLimit = 100;
    refreshGenreChips();
    refresh();
  });
  for (const btn of panel.querySelectorAll('[data-singer-preset]')) {
    btn.addEventListener('click', () => {
      state.singerMode = true;
      state.singerPreset = state.singerPreset === btn.dataset.singerPreset ? 'all' : btn.dataset.singerPreset;
      state.songsLimit = 100;
      refresh();
    });
  }
  $('#compact-btn')?.addEventListener('click', () => {
    state.songsView = state.songsView === 'compact' ? 'comfortable' : 'compact';
    refresh();
  });
  $('#setlist-toggle-btn')?.addEventListener('click', () => toggleSetlistPlanner());
  $('#recommend-btn')?.addEventListener('click', () => showRecommendation());
  for (const btn of panel.querySelectorAll('[data-mobile-panel-toggle]')) {
    btn.addEventListener('click', () => toggleMobilePanel(btn.dataset.mobilePanelToggle));
  }
  panel.onclick = (e) => {
    const recommendDismiss = e.target.closest('[data-recommend-dismiss]');
    if (recommendDismiss) {
      e.preventDefault();
      e.stopPropagation();
      const box = $('#recommend-box');
      if (box) {
        box.hidden = true;
        box.innerHTML = '';
      }
      return;
    }
    const action = e.target.closest('[data-setlist-action]');
    if (action) {
      e.stopPropagation();
      handleSetlistAction(action);
      return;
    }
    const copySong = e.target.closest('[data-song-copy]');
    if (copySong) {
      e.preventDefault();
      e.stopPropagation();
      copySingleSong(copySong);
      return;
    }
    const artist = e.target.closest('[data-artist-search]');
    if (artist) {
      e.stopPropagation();
      const name = String(artist.dataset.artistSearch || '').replace(/"/g, '');
      state.songsQuery = `artist:"${name}"`;
      searchInputEl.value = state.songsQuery;
      state.songsLimit = 100;
      writeUrlState({ tab: 'songs', q: state.songsQuery });
      refresh();
      return;
    }
    const tag = e.target.closest('[data-tag-search]');
    if (!tag) return;
    e.stopPropagation();
    const type = tag.dataset.tagType || 'tag';
    state.songsQuery = `${type}:${tag.dataset.tagSearch}`;
    searchInputEl.value = state.songsQuery;
    state.songsLimit = 100;
    writeUrlState({ tab: 'songs', q: state.songsQuery });
    refresh();
  };
  panel.oninput = (e) => {
    if (e.target.id !== 'setlist-theme') return;
    state.setlist.theme = e.target.value;
    saveSetlist();
  };
  panel.onchange = (e) => {
    if (e.target.id !== 'setlist-copy-format') return;
    state.setlist.copyFormat = e.target.value;
    saveSetlist();
  };

  refresh();
}

function toggleMobilePanel(panelName) {
  const filters = $('#songs-filter-panel');
  const setlist = $('#setlist-planner');
  if (panelName === 'setlist' && !state.singerMode) {
    filters?.classList.add('is-open');
    setlist?.classList.remove('is-open');
    for (const btn of document.querySelectorAll('[data-mobile-panel-toggle]')) {
      btn.classList.toggle('active', btn.dataset.mobilePanelToggle === 'filters');
    }
    return;
  }
  if (state.singerMode) {
    filters?.classList.add('is-open');
    const target = filters;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    for (const btn of document.querySelectorAll('[data-mobile-panel-toggle]')) {
      btn.classList.toggle('active', btn.dataset.mobilePanelToggle === 'filters');
    }
    return;
  }
  const showSetlist = panelName === 'setlist';
  filters?.classList.toggle('is-open', !showSetlist);
  setlist?.classList.toggle('is-open', showSetlist);
  for (const btn of document.querySelectorAll('[data-mobile-panel-toggle]')) {
    btn.classList.toggle('active', btn.dataset.mobilePanelToggle === panelName);
  }
}

function toggleSetlistPlanner() {
  if (!state.singerMode) return;
  state.setlistExpanded = !state.setlistExpanded;
  renderSetlistPlanner();
  const wrap = $('#setlist-planner');
  if (state.setlistExpanded) {
    wrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function genreLabel(song) {
  return String(song.genre || '未分類').trim() || '未分類';
}

function genreCounts() {
  const counts = new Map();
  for (const song of state.data.songs || []) {
    const genre = genreLabel(song);
    counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
}

function genreExists(genre) {
  return genre === 'all' || genreCounts().some(([name]) => name === genre);
}

function genreOptionsHtml() {
  const options = [`<option value="all">全ジャンル</option>`];
  for (const [genre, count] of genreCounts()) {
    options.push(`<option value="${escapeHtml(genre)}">${escapeHtml(genre)} (${count})</option>`);
  }
  return options.join('');
}

function genreChipsHtml() {
  const chips = [`<button class="genre-chip" type="button" data-genre="all">全ジャンル</button>`];
  for (const [genre, count] of genreCounts()) {
    chips.push(`
      <button class="genre-chip" type="button" data-genre="${escapeHtml(genre)}">
        <span>${escapeHtml(genre)}</span><small>${count}</small>
      </button>
    `);
  }
  return chips.join('');
}

function refreshGenreChips() {
  for (const btn of genreChipsEl.querySelectorAll('[data-genre]')) {
    btn.classList.toggle('active', btn.dataset.genre === state.songsGenre);
  }
}

function refreshFilterButtons() {
  for (const btn of filterButtonsEl.querySelectorAll('[data-filter]')) {
    btn.classList.toggle('primary', btn.dataset.filter === state.songsFilter);
    btn.classList.toggle('ghost', btn.dataset.filter !== state.songsFilter);
  }
}

function applyGenreFilter(songs) {
  if (!state.songsGenre || state.songsGenre === 'all') return songs;
  return songs.filter(s => genreLabel(s) === state.songsGenre);
}

function applyTagFilter(songs) {
  switch (state.songsFilter) {
    case 'fresh':
      return songs.filter(s => s.daysSinceLast != null && s.daysSinceLast <= 30);
    case 'stale':
      return songs.filter(s => s.daysSinceLast != null && s.daysSinceLast >= 180);
    case 'never':
      return songs.filter(s => !s.lastSung);
    default:
      return songs;
  }
}

function applySingerMode(songs) {
  if (!state.singerMode) return songs;
  const base = songs.filter(s => s.lastSung);
  switch (state.singerPreset) {
    case 'keyed':
      return SHOW_SONG_KEYS ? base.filter(s => s.displayKey) : base;
    case 'classic':
      return base.filter(s => s.count >= 8);
    case 'stale':
      return base.filter(s => s.daysSinceLast >= 180);
    case 'rare':
      return base.filter(s => s.count <= 2);
    default:
      return base.filter(s =>
        (SHOW_SONG_KEYS && s.displayKey) || !state.data.stats.keyPublished || s.count >= 5 || s.daysSinceLast >= 120
      );
  }
}

function refresh() {
  const { songs } = state.data;
  const genreFiltered = applyGenreFilter(songs);
  const modeFiltered = applySingerMode(genreFiltered);
  const tagFiltered = applyTagFilter(modeFiltered);
  const { results, tokens } = search(state.songsQuery, tagFiltered);
  let filtered = state.songsQuery.trim()
    ? results.filter(s => tagFiltered.includes(s))
    : tagFiltered;

  filtered = sortSongs(filtered, state.songsSort, !!state.songsQuery.trim());
  currentFiltered = filtered;

  countEl.textContent = `${filtered.length} / ${songs.length}曲`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">該当する曲がありません 🐠</div>`;
    moreBtnWrap.innerHTML = '';
    return;
  }

  const limited = filtered.slice(0, state.songsLimit);
  listEl.classList.toggle('compact', state.songsView === 'compact');
  for (const btn of document.querySelectorAll('[data-singer-preset]')) {
    const active = state.singerMode && state.singerPreset === btn.dataset.singerPreset;
    btn.classList.toggle('primary', active);
    btn.classList.toggle('ghost', !active);
  }
  if ($('#compact-btn')) $('#compact-btn').textContent = `表示: ${state.songsView === 'compact' ? 'コンパクト' : '詳細'}`;
  listEl.innerHTML = limited.map(s => rowHtml(s, tokens)).join('');
  renderSetlistPlanner();

  if (state.songsLimit < filtered.length) {
    moreBtnWrap.innerHTML = `<button class="load-more-btn" id="songs-more">▼ もっと表示 (残り${filtered.length - state.songsLimit}曲)</button>`;
    $('#songs-more').addEventListener('click', () => {
      state.songsLimit += 200;
      refresh();
    });
  } else {
    moreBtnWrap.innerHTML = '';
  }
}

function showRecommendation() {
  const box = $('#recommend-box');
  const pool = sortSongs(
    applySingerMode(applyTagFilter(applyGenreFilter(state.data.songs)))
      .filter(song => song.lastSung && ((SHOW_SONG_KEYS && song.displayKey) || !state.data.stats.keyPublished || !SHOW_SONG_KEYS)),
    'oldest',
    false
  );
  if (!pool.length) {
    box.hidden = false;
    box.innerHTML = `<div class="empty-state">条件に合うおすすめ候補がありません</div>`;
    return;
  }
  const candidates = pool.slice(0, Math.min(80, pool.length));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  box.hidden = false;
  box.innerHTML = `
    <div class="recommend-card" data-songkey="${escapeHtml(pick.key)}" data-songtitle="${escapeHtml(pick.title)}" data-songartist="${escapeHtml(pick.artist)}">
      <div>
        <div class="recommend-label">今日の候補</div>
        <strong>${escapeHtml(pick.title)}</strong>
        <span>/ ${escapeHtml(pick.artist)}</span>
      </div>
      <div class="recommend-meta">
        <span>${pick.count}回</span>
        <span>${pick.daysSinceLast ?? '—'}日前</span>
        ${SHOW_SONG_KEYS && pick.displayKey ? `<span>キー ${escapeHtml(pick.displayKey)}</span>` : ''}
      </div>
      <button class="recommend-dismiss" type="button" data-recommend-dismiss aria-label="おすすめ選曲を閉じる">×</button>
    </div>
  `;
}

function loadSetlist() {
  try {
    const raw = localStorage.getItem(SETLIST_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.setlist.theme = String(saved.theme || '');
    state.setlist.copyFormat = saved.copyFormat === 'timestamp' ? 'timestamp' : 'simple';
    state.setlist.items = Array.isArray(saved.items) ? saved.items : [];
  } catch (_) {
    state.setlist.items = [];
  }
}

function saveSetlist() {
  localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(state.setlist));
}

function songByKey(key) {
  return (state.data.songs || []).find(song => song.key === key) || null;
}

function addToSetlist(song) {
  if (!song) return;
  state.setlist.items.push({
    key: song.key,
    title: song.title,
    artist: song.artist,
    displayKey: song.displayKey || '',
    genre: song.genre || '',
    moodTags: song.moodTags || [],
    seasonTags: song.seasonTags || [],
    daysSinceLast: song.daysSinceLast,
  });
  saveSetlist();
  renderSetlistPlanner('追加しました');
}

function hydrateSetlistItem(item) {
  const song = songByKey(item.key);
  return song ? { ...item, ...song } : item;
}

function handleSetlistAction(action) {
  const act = action.dataset.setlistAction;
  const index = Number(action.dataset.index);
  if (act === 'add') addToSetlist(songByKey(action.dataset.songkey));
  if (act === 'remove') state.setlist.items.splice(index, 1);
  if (act === 'up' && index > 0) {
    [state.setlist.items[index - 1], state.setlist.items[index]] = [state.setlist.items[index], state.setlist.items[index - 1]];
  }
  if (act === 'down' && index < state.setlist.items.length - 1) {
    [state.setlist.items[index + 1], state.setlist.items[index]] = [state.setlist.items[index], state.setlist.items[index + 1]];
  }
  if (act === 'random') addRandomToSetlist();
  if (act === 'copy') copySetlist();
  if (act === 'clear' && confirm('セトリを空にしますか？')) state.setlist.items = [];
  saveSetlist();
  if (!['add', 'random', 'copy'].includes(act)) renderSetlistPlanner();
}

function addRandomToSetlist() {
  const existing = new Set(state.setlist.items.map(item => item.key));
  const pool = (currentFiltered.length ? currentFiltered : state.data.songs)
    .filter(song => song.key && !existing.has(song.key));
  if (!pool.length) {
    renderSetlistPlanner('追加できる候補がありません');
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  addToSetlist(pick);
}

function setlistItems() {
  return state.setlist.items.map(hydrateSetlistItem);
}

function setlistBalance(items) {
  const topCounts = (fn) => {
    const map = new Map();
    for (const item of items) {
      for (const value of fn(item)) {
        if (!value) continue;
        map.set(value, (map.get(value) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  };
  return {
    genres: topCounts(item => [item.genre || '未分類']),
    moods: topCounts(item => item.moodTags || []),
    keys: SHOW_SONG_KEYS ? items.filter(item => item.displayKey).length : 0,
    stale: items.filter(item => item.daysSinceLast >= 180).length,
  };
}

function renderSetlistPlanner(message = '') {
  const wrap = $('#setlist-planner');
  if (!wrap) return;
  updateSetlistToggle();
  wrap.hidden = !state.singerMode || !state.setlistExpanded;
  wrap.classList.toggle('is-open', state.singerMode && state.setlistExpanded);
  if (!state.singerMode) {
    wrap.innerHTML = '';
    return;
  }
  const items = setlistItems();
  const balance = setlistBalance(items);
  const minutes = items.length * 5;
  wrap.innerHTML = `
    <div class="setlist-head">
      <div>
        <div class="recommend-label">Setlist Builder</div>
        <h3>今日のセトリ</h3>
      </div>
      <div class="setlist-total">${items.length}曲 / 約${minutes}分</div>
    </div>
    <input id="setlist-theme" class="text-input setlist-theme" type="text" placeholder="歌枠テーマメモ" value="${escapeHtml(state.setlist.theme)}">
    <div class="setlist-balance">
      ${balanceChip('ジャンル', balance.genres)}
      ${balanceChip('雰囲気', balance.moods)}
      ${SHOW_SONG_KEYS ? `<span>キー ${balance.keys}/${items.length}</span>` : ''}
      <span>久しぶり ${balance.stale}</span>
    </div>
    <div class="setlist-items">
      ${items.length ? items.map((item, i) => setlistItemHtml(item, i)).join('') : '<div class="setlist-empty">曲の「＋セトリ」かランダム追加から作れます</div>'}
    </div>
    <div class="setlist-actions">
      <select id="setlist-copy-format" class="select-input">
        <option value="simple"${state.setlist.copyFormat === 'simple' ? ' selected' : ''}>曲名 / アーティスト</option>
        <option value="timestamp"${state.setlist.copyFormat === 'timestamp' ? ' selected' : ''}>タイムスタンプ入力用</option>
      </select>
      <button class="btn ghost" type="button" data-setlist-action="random">ランダム追加</button>
      <button class="btn primary" type="button" data-setlist-action="copy">コピー</button>
      <button class="btn ghost" type="button" data-setlist-action="clear">クリア</button>
      ${message ? `<span class="setlist-message">${escapeHtml(message)}</span>` : ''}
    </div>
  `;
}

function balanceChip(label, rows) {
  if (!rows.length) return `<span>${label} —</span>`;
  return `<span>${label} ${rows.map(([name, count]) => `${escapeHtml(name)} ${count}`).join(' / ')}</span>`;
}

function setlistItemHtml(item, index) {
  return `
    <div class="setlist-item">
      <div class="setlist-no">${index + 1}</div>
      <div class="setlist-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.artist)}${SHOW_SONG_KEYS && item.displayKey ? ` · key ${escapeHtml(item.displayKey)}` : ''}</span>
      </div>
      <div class="setlist-move">
        <button type="button" data-setlist-action="up" data-index="${index}" aria-label="上へ">↑</button>
        <button type="button" data-setlist-action="down" data-index="${index}" aria-label="下へ">↓</button>
        <button type="button" data-setlist-action="remove" data-index="${index}" aria-label="削除">×</button>
      </div>
    </div>
  `;
}

function formatSetlistText() {
  const items = setlistItems();
  const lines = [];
  if (state.setlist.theme) lines.push(`# ${state.setlist.theme}`, '');
  items.forEach((item) => {
    if (state.setlist.copyFormat === 'timestamp') {
      lines.push(`00:00 ${item.title} / ${item.artist}`);
    } else {
      lines.push(`${item.title} / ${item.artist}`);
    }
  });
  return lines.join('\n');
}

async function copySetlist() {
  const text = formatSetlistText();
  if (!text.trim()) {
    renderSetlistPlanner('コピーする曲がありません');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    renderSetlistPlanner('コピーしました');
  } catch (_) {
    renderSetlistPlanner('コピーに失敗しました');
  }
}

async function copySingleSong(button) {
  const song = songByKey(button.dataset.songkey);
  if (!song) return;
  const text = `${song.title} / ${song.artist}`;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'コピー済み';
    button.classList.add('copied');
  } catch (_) {
    button.textContent = '失敗';
  }
  window.setTimeout(() => {
    button.textContent = original || 'コピー';
    button.classList.remove('copied');
  }, 1200);
}

function sortSongs(songs, sort, isFuzzy) {
  const cmpDate = (a, b, dir) => {
    const av = a.lastSung ? a.lastSung.getTime() : (dir === 'desc' ? -Infinity : Infinity);
    const bv = b.lastSung ? b.lastSung.getTime() : (dir === 'desc' ? -Infinity : Infinity);
    return dir === 'desc' ? bv - av : av - bv;
  };
  const list = [...songs];
  switch (sort) {
    case 'count-asc': list.sort((a, b) => a.count - b.count || a.title.localeCompare(b.title, 'ja')); break;
    case 'recent':    list.sort((a, b) => cmpDate(a, b, 'desc')); break;
    case 'oldest':    list.sort((a, b) => cmpDate(a, b, 'asc')); break;
    case 'title':     list.sort((a, b) => a.title.localeCompare(b.title, 'ja')); break;
    case 'artist':    list.sort((a, b) => a.artist.localeCompare(b.artist, 'ja') || b.count - a.count); break;
    case 'count-desc':
    default:          if (!isFuzzy) list.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ja')); break;
  }
  return list;
}

function rowHtml(song, tokens) {
  const rankClass = song.rank === 1 ? 'r1' : song.rank === 2 ? 'r2' : song.rank === 3 ? 'r3' : '';
  const lastHtml = song.lastSung
    ? `<div>${fmtDate(song.lastSung)}</div><span class="badge ${daysClass(song.daysSinceLast)}">${song.daysSinceLast}日前</span>`
    : `<div>履歴未確認</div><span class="badge never">要確認</span>`;
  const titleHtml = highlightText(song.title, tokens);
  const artistHtml = highlightText(song.artist, tokens);
  const reasons = matchReasons(song, state.songsQuery);
  return `
    <div class="song-row" data-songkey="${escapeHtml(song.key)}" data-songtitle="${escapeHtml(song.title)}" data-songartist="${escapeHtml(song.artist)}" title="クリックで曲詳細を表示">
      <div class="rank ${rankClass}">${song.rank}</div>
      <div class="info">
        <div class="title">${titleHtml}</div>
        <button class="artist artist-search-btn" type="button" data-artist-search="${escapeHtml(song.artist)}">${artistHtml}</button>
        <div class="song-meta-line">
          <span class="genre-badge">${escapeHtml(genreLabel(song))}</span>
          ${tagBadges(song)}
          ${reasons.map(reason => `<span class="match-badge">${escapeHtml(reason)}一致</span>`).join('')}
          ${state.singerMode ? `<button class="tag-badge tag-click" type="button" data-setlist-action="add" data-songkey="${escapeHtml(song.key)}">＋セトリ</button>` : ''}
          ${state.singerMode ? `<button class="tag-badge song-copy-btn" type="button" data-song-copy data-songkey="${escapeHtml(song.key)}">コピー</button>` : ''}
        </div>
        ${keyHtml(song)}
      </div>
      <div class="song-row-side">
        <div class="count">${song.count}<small>回</small></div>
        <div class="last">${lastHtml}</div>
      </div>
    </div>
  `;
}

function updateSetlistToggle() {
  const btn = $('#setlist-toggle-btn');
  if (!btn) return;
  const items = state.setlist.items.length;
  btn.setAttribute('aria-expanded', state.setlistExpanded ? 'true' : 'false');
  btn.textContent = state.setlistExpanded
    ? `セトリ制作を閉じる${items ? ` (${items})` : ''}`
    : `セトリ制作を開く${items ? ` (${items})` : ''}`;
}

function tagBadges(song) {
  const tags = [
    ...(song.seasonTags || []).map(tag => ({ tag, type: 'season' })),
    ...(song.moodTags || []).map(tag => ({ tag, type: 'mood' })),
    ...(state.singerMode ? (song.singerTags || []).map(tag => ({ tag, type: 'tag' })) : []),
  ].slice(0, state.songsView === 'compact' ? 2 : 5);
  return tags.map(({ tag, type }) => `
    <button class="tag-badge tag-click" type="button" data-tag-type="${type}" data-tag-search="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
  `).join('');
}

function keyHtml(song) {
  if (!SHOW_SONG_KEYS) return '';
  if (!state.singerMode) return '';
  if (!state.data?.stats?.keyPublished) return '';
  const key = String(song.displayKey || '').trim();
  if (!key) {
    return `<div class="song-key-line"><span class="song-key-empty">キー未登録</span></div>`;
  }
  return `
    <div class="song-key-line">
      <button type="button" class="song-key-badge" title="統合集計 T/U列のキー">
        <span>キー</span><strong>${escapeHtml(key)}</strong>
      </button>
    </div>
  `;
}

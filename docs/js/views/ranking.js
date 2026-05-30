import { state } from '../state.js';
import { $, escapeHtml, fmtDate, daysClass } from '../utils.js';
import { RANKING_LIST_LIMIT } from '../config.js';

export function renderRanking() {
  const { songs } = state.data;
  const sorted = [...songs].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ja'));

  const top3 = sorted.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const limit = state.rankingLimit;
  const rest = sorted.slice(3, limit);

  const panel = $('#panel-ranking');
  panel.innerHTML = `
    <div class="section-header">
      <h2>🏆 歌唱回数ランキング</h2>
      <span class="count-pill">${songs.length}曲中</span>
    </div>
    <div class="podium">
      ${top3.map((s, i) => podiumCard(s, i, medals[i])).join('')}
    </div>
    <div class="song-list">
      ${rest.map(rowHtml).join('')}
    </div>
    ${limit < sorted.length ? `
      <div class="timeline-controls">
        <button class="load-more-btn" id="rank-more">▼ もっと表示 (残り${sorted.length - limit}曲)</button>
      </div>` : ''}
  `;

  const more = $('#rank-more');
  if (more) {
    more.addEventListener('click', () => {
      state.rankingLimit += 50;
      renderRanking();
    });
  }
}

function podiumCard(s, i, medal) {
  return `
    <div class="podium-card rank-${i + 1}" data-songkey="${escapeHtml(s.key)}" data-songtitle="${escapeHtml(s.title)}" data-songartist="${escapeHtml(s.artist)}" title="クリックで配信タイムラインに絞り込み">
      <div class="podium-medal">${medal}</div>
      <div class="song-title">${escapeHtml(s.title)}</div>
      <button class="song-artist artist-search-btn" type="button" data-artist-search="${escapeHtml(s.artist)}">${escapeHtml(s.artist)}</button>
      <div class="count-big">${s.count}<small>回</small></div>
      <div class="last-sung">${s.lastSung ? `最終: ${fmtDate(s.lastSung)} (${s.daysSinceLast}日前)` : '未披露'}</div>
    </div>
  `;
}

function rowHtml(song) {
  const rankClass = song.rank === 1 ? 'r1' : song.rank === 2 ? 'r2' : song.rank === 3 ? 'r3' : '';
  const lastHtml = song.lastSung
    ? `<div>${fmtDate(song.lastSung)}</div><span class="badge ${daysClass(song.daysSinceLast)}">${song.daysSinceLast}日前</span>`
    : `<div>未披露</div><span class="badge never">—</span>`;
  return `
    <div class="song-row" data-songkey="${escapeHtml(song.key)}" data-songtitle="${escapeHtml(song.title)}" data-songartist="${escapeHtml(song.artist)}" title="クリックで配信タイムラインに絞り込み">
      <div class="rank ${rankClass}">${song.rank}</div>
      <div class="info">
        <div class="title">${escapeHtml(song.title)}</div>
        <button class="artist artist-search-btn" type="button" data-artist-search="${escapeHtml(song.artist)}">${escapeHtml(song.artist)}</button>
      </div>
      <div class="song-row-side">
        <div class="count">${song.count}<small>回</small></div>
        <div class="last">${lastHtml}</div>
      </div>
    </div>
  `;
}

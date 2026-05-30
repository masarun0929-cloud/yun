import { state } from '../state.js';
import { $, escapeHtml, fmtDate, monthKey, fmtMonth } from '../utils.js';
import { TOP_ARTISTS_LIMIT } from '../config.js';
import { createChart, chartCanvas, getColors } from '../charts.js?v=20260528-sazanami-3';

export function renderAnalytics() {
  const { songs, streams, artists } = state.data;

  const panel = $('#panel-analytics');
  panel.innerHTML = `
    <div class="section-header">
      <h2>📈 アナリティクス</h2>
      <span class="count-pill">${streams.length}枠 × ${songs.length}曲を分析</span>
    </div>

    <div class="dashboard-grid">

      <div class="card col-6">
        <div class="card-title">📚 持ち曲の累積成長 <span class="pill">初披露ベース</span></div>
        ${chartCanvas('chart-growth')}
      </div>

      <div class="card col-6">
        <div class="card-title">🎤 1枠あたりの曲数 <span class="pill">時系列</span></div>
        ${chartCanvas('chart-songs-per-stream')}
      </div>

      <div class="card col-6">
        <div class="card-title">📅 曜日分布 <span class="pill">配信日</span></div>
        ${chartCanvas('chart-dow', { class: 'short' })}
      </div>

      <div class="card col-6">
        <div class="card-title">📊 歌唱回数の分布 <span class="pill">ヒストグラム</span></div>
        ${chartCanvas('chart-histogram', { class: 'short' })}
      </div>

      <div class="card col-12">
        <div class="card-title">👥 アーティスト別 歌唱合計 <span class="pill">TOP${TOP_ARTISTS_LIMIT}</span></div>
        <div id="artist-bar-list" class="bar-list"></div>
      </div>

      <div class="card col-6">
        <div class="card-title">🌟 久しぶりに歌われた曲 <span class="pill">前回から長かったTOP10</span></div>
        <div id="comeback-list"></div>
      </div>

      <div class="card col-6">
        <div class="card-title">⏳ 1回しか歌われていない曲 <span class="pill">${songs.filter(s => s.count === 1).length}曲</span></div>
        <div id="oneshot-list"></div>
      </div>

    </div>
  `;

  drawGrowth(songs);
  drawSongsPerStream(streams);
  drawDow(streams);
  drawHistogram(songs);
  renderArtistBars(artists);
  renderComebacks(songs);
  renderOneShots(songs);
}

function drawGrowth(songs) {
  const c = getColors();
  // by first-sung month
  const byMonth = new Map();
  for (const s of songs) {
    if (!s.firstSung) continue;
    const k = monthKey(s.firstSung);
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  const keys = Array.from(byMonth.keys()).sort();
  if (!keys.length) return;
  const labels = [];
  const data = [];
  let total = 0;
  // fill gaps
  let cur = parseMonthKey(keys[0]);
  const end = parseMonthKey(keys[keys.length - 1]);
  while (cur <= end) {
    const k = monthKey(cur);
    total += byMonth.get(k) || 0;
    labels.push(fmtMonth(cur));
    data.push(total);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  createChart('chart-growth', 'line', {
    labels,
    datasets: [{
      label: '累積持ち曲数',
      data,
      borderColor: c.chartBlueLine,
      backgroundColor: c.chartBlueFill,
      pointBackgroundColor: c.chartBlueBorder,
      pointBorderColor: c.chartBlueLine,
      tension: 0.25,
      fill: true,
      pointRadius: 2,
      borderWidth: 1.8,
    }],
  });
}

function parseMonthKey(k) {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function drawSongsPerStream(streams) {
  const c = getColors();
  const sorted = [...streams].sort((a, b) => a.date - b.date);
  createChart('chart-songs-per-stream', 'line', {
    labels: sorted.map(s => fmtDate(s.date)),
    datasets: [{
      label: '曲数',
      data: sorted.map(s => s.songs.length),
      borderColor: c.chartPinkLine,
      backgroundColor: c.chartPinkFill,
      pointBackgroundColor: c.chartPinkBorder,
      pointBorderColor: c.chartPinkLine,
      tension: 0.2,
      fill: true,
      pointRadius: 1.5,
      borderWidth: 1.5,
    }],
  }, {
    scales: { x: { ticks: { maxTicksLimit: 8 } } },
  });
}

function drawDow(streams) {
  const c = getColors();
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  const counts = new Array(7).fill(0);
  const songs = new Array(7).fill(0);
  for (const s of streams) {
    counts[s.dayOfWeek] += 1;
    songs[s.dayOfWeek] += s.songs.length;
  }
  createChart('chart-dow', 'bar', {
    labels,
    datasets: [
      {
        label: '配信回数',
        data: counts,
        backgroundColor: c.chartBlue,
        borderColor: c.chartBlueBorder,
        borderWidth: 1,
        yAxisID: 'y',
        borderRadius: 6,
      },
      {
        label: '歌唱数',
        data: songs,
        backgroundColor: c.chartPink,
        borderColor: c.chartPinkBorder,
        borderWidth: 1,
        yAxisID: 'y2',
        borderRadius: 6,
      },
    ],
  }, {
    scales: {
      y: { position: 'left', title: { display: true, text: '配信', color: c.inkMute, font: { size: 10 } } },
      y2: { position: 'right', title: { display: true, text: '歌唱', color: c.inkMute, font: { size: 10 } }, grid: { display: false }, beginAtZero: true },
    },
  });
}

function drawHistogram(songs) {
  const c = getColors();
  const bins = [
    { label: '1回',    range: [1, 1] },
    { label: '2回',    range: [2, 2] },
    { label: '3回',    range: [3, 3] },
    { label: '4-5回',  range: [4, 5] },
    { label: '6-10回', range: [6, 10] },
    { label: '11-20回',range: [11, 20] },
    { label: '21回〜', range: [21, Infinity] },
  ];
  const counts = bins.map(b => songs.filter(s => s.count >= b.range[0] && s.count <= b.range[1]).length);
  createChart('chart-histogram', 'bar', {
    labels: bins.map(b => b.label),
    datasets: [{
      label: '曲数',
      data: counts,
      backgroundColor: c.chartBlue,
      borderColor: c.chartBlueBorder,
      borderWidth: 1,
      borderRadius: 6,
    }],
  }, { plugins: { legend: { display: false } } });
}

function renderArtistBars(artists) {
  const top = artists.slice(0, TOP_ARTISTS_LIMIT);
  const max = top[0]?.totalCount || 1;
  $('#artist-bar-list').innerHTML = top.map((a, i) => {
    const pct = Math.round((a.totalCount / max) * 100);
    return `
      <div class="bar-row">
        <div class="bar-rank">${i + 1}</div>
        <div class="bar-content">
          <div class="bar-label">${escapeHtml(a.artist)} <span style="color:var(--ink-mute);font-size:11px;">（${a.songCount}曲）</span></div>
          <div class="bar-bar accent" style="width:${pct}%;"></div>
        </div>
        <div class="bar-value">${a.totalCount}</div>
      </div>
    `;
  }).join('');
}

function renderComebacks(songs) {
  // for each song with >=2 plays, find max gap between consecutive sing dates
  const candidates = [];
  for (const s of songs) {
    if (s.dates.length < 2) continue;
    const sorted = [...s.dates].sort((a, b) => a - b);
    let maxGap = 0;
    let gapStart = null, gapEnd = null;
    for (let i = 1; i < sorted.length; i++) {
      const g = Math.floor((sorted[i] - sorted[i - 1]) / 86400000);
      if (g > maxGap) {
        maxGap = g;
        gapStart = sorted[i - 1];
        gapEnd = sorted[i];
      }
    }
    candidates.push({ song: s, maxGap, gapStart, gapEnd });
  }
  candidates.sort((a, b) => b.maxGap - a.maxGap);
  const top = candidates.slice(0, 10);
  $('#comeback-list').innerHTML = top.length ? top.map((c, i) => `
    <div class="activity-row" data-songkey="${escapeHtml(c.song.key)}" data-songtitle="${escapeHtml(c.song.title)}" data-songartist="${escapeHtml(c.song.artist)}" style="cursor:pointer;" title="クリックで配信タイムラインに絞り込み">
      <span class="a-date">${c.maxGap}日</span>
      <span class="a-title">${escapeHtml(c.song.title)} <span style="color:var(--ink-mute);">/ ${escapeHtml(c.song.artist)}</span></span>
      <span class="a-meta">${fmtDate(c.gapStart)}→${fmtDate(c.gapEnd)}</span>
    </div>
  `).join('') : `<div class="empty-state">該当データなし</div>`;
}

function renderOneShots(songs) {
  const oneshots = songs.filter(s => s.count === 1)
    .sort((a, b) => (b.lastSung?.getTime() || 0) - (a.lastSung?.getTime() || 0))
    .slice(0, 10);
  $('#oneshot-list').innerHTML = oneshots.length ? oneshots.map(s => `
    <div class="activity-row" data-songkey="${escapeHtml(s.key)}" data-songtitle="${escapeHtml(s.title)}" data-songartist="${escapeHtml(s.artist)}" style="cursor:pointer;" title="クリックで配信タイムラインに絞り込み">
      <span class="a-date">${s.lastSung ? fmtDate(s.lastSung) : '—'}</span>
      <span class="a-title">${escapeHtml(s.title)} <span style="color:var(--ink-mute);">/ ${escapeHtml(s.artist)}</span></span>
      <span class="a-meta">${s.daysSinceLast != null ? s.daysSinceLast + '日前' : '—'}</span>
    </div>
  `).join('') : `<div class="empty-state">該当データなし</div>`;
}

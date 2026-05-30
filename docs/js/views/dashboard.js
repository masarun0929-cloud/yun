import { state } from '../state.js';
import { $, escapeHtml, fmtDate, monthKey, fmtMonth, daysClass } from '../utils.js';
import { chartCanvas } from '../charts.js';

let chartRenderToken = 0;

function afterInitialPaint(fn) {
  const run = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: 2500 });
    } else {
      window.setTimeout(fn, 1200);
    }
  };
  if (document.readyState === 'complete') {
    window.setTimeout(run, 500);
  } else {
    window.addEventListener('load', () => window.setTimeout(run, 500), { once: true });
  }
}

function whenChartVisible(id, fn) {
  const target = document.getElementById(id)?.parentElement;
  if (!target || !('IntersectionObserver' in window)) {
    afterInitialPaint(fn);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    afterInitialPaint(fn);
  }, { rootMargin: '160px 0px', threshold: 0.01 });
  observer.observe(target);
}

export function renderDashboard() {
  const { stats, songs, streams } = state.data;
  const sorted = [...songs].sort((a, b) => b.count - a.count);
  const top5 = sorted.slice(0, 5);

  const recent = streams.slice(0, 5);
  const heatmap = buildHeatmap(streams);
  const monthly = buildMonthly(streams);
  const newSongs = countNewSongsThisMonth(songs);
  const stalePicks = songs.filter(s => s.daysSinceLast >= 180).sort((a, b) => b.count - a.count).slice(0, 5);
  const recentPicks = songs.filter(s => s.daysSinceLast != null && s.daysSinceLast <= 30).sort((a, b) => b.count - a.count).slice(0, 5);
  const monthlyHits = periodHits(streams, 'month');
  const yearlyHits = periodHits(streams, 'year');

  const panel = $('#panel-dashboard');
  panel.innerHTML = `
    <div class="dashboard-grid">

      <div class="card col-8">
        <div class="card-title">📅 配信ヒートマップ <span class="pill">直近1年</span></div>
        ${renderHeatmap(heatmap)}
      </div>

      <div class="card col-4">
        <div class="card-title">📈 今月の活動</div>
        <div style="display:grid;gap:10px;">
          <div class="activity-row">
            <span class="a-date">配信</span>
            <span class="a-meta">今月の歌枠数</span>
            <strong>${countStreamsThisMonth(streams)}回</strong>
          </div>
          <div class="activity-row">
            <span class="a-date">歌唱</span>
            <span class="a-meta">今月の総歌唱数</span>
            <strong>${countSongsThisMonth(streams)}曲</strong>
          </div>
          <div class="activity-row">
            <span class="a-date">新曲</span>
            <span class="a-meta">今月の初披露曲数</span>
            <strong>${newSongs}曲</strong>
          </div>
          <div class="activity-row">
            <span class="a-date">最終</span>
            <span class="a-meta">最新歌枠から</span>
            <strong>${streams[0] ? Math.floor((Date.now() - streams[0].date.getTime()) / 86400000) + '日前' : '—'}</strong>
          </div>
        </div>
      </div>

      <div class="card col-8">
        <div class="card-title">🎶 月別 歌唱数 / 歌枠数 <span class="pill">時系列</span></div>
        ${chartCanvas('chart-monthly', { class: '' })}
      </div>

      <div class="card col-4">
        <div class="card-title">🏆 TOP5 楽曲</div>
        <div class="bar-list">
          ${top5.map((s, i) => topBarRow(s, i, top5[0].count)).join('')}
        </div>
      </div>

      <div class="card col-6">
        <div class="card-title">🗳 今月のよく歌われた曲 <span class="pill">軽量版</span></div>
        <div class="bar-list">
          ${monthlyHits.length ? monthlyHits.slice(0, 5).map((s, i) => topBarRow(s, i, monthlyHits[0].count)).join('') : '<div class="empty-state">今月の歌唱履歴なし</div>'}
        </div>
      </div>

      <div class="card col-6">
        <div class="card-title">🗳 今年のよく歌われた曲 <span class="pill">軽量版</span></div>
        <div class="bar-list">
          ${yearlyHits.length ? yearlyHits.slice(0, 5).map((s, i) => topBarRow(s, i, yearlyHits[0].count)).join('') : '<div class="empty-state">今年の歌唱履歴なし</div>'}
        </div>
      </div>

      <div class="card col-6">
        <div class="card-title">💤 久しぶり候補 <span class="pill">180日以上</span></div>
        <div class="bar-list">
          ${stalePicks.length ? stalePicks.map((s, i) => topBarRow(s, i, stalePicks[0].count)).join('') : '<div class="empty-state">候補なし</div>'}
        </div>
      </div>

      <div class="card col-6">
        <div class="card-title">✨ 最近歌った定番 <span class="pill">30日以内</span></div>
        <div class="bar-list">
          ${recentPicks.length ? recentPicks.map((s, i) => topBarRow(s, i, recentPicks[0].count)).join('') : '<div class="empty-state">候補なし</div>'}
        </div>
      </div>

      <div class="card col-12">
        <div class="card-title">📺 直近の歌枠 <span class="pill">最新${recent.length}件</span></div>
        ${recent.map(s => `
          <div class="activity-row">
            <span class="a-date">${fmtDate(s.date)}</span>
            <span class="a-title">${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || '配信')}</a>` : escapeHtml(s.title)}</span>
            <span class="a-meta">🎤 ${s.songs.length}曲</span>
          </div>
        `).join('')}
      </div>

    </div>
  `;

  const token = ++chartRenderToken;
  whenChartVisible('chart-monthly', () => {
    if (token !== chartRenderToken || state.activeTab !== 'dashboard') return;
    drawMonthlyChart(monthly);
  });
}

function periodHits(streams, period) {
  const now = new Date();
  const month = monthKey(now);
  const year = now.getFullYear();
  const counts = new Map();
  for (const stream of streams) {
    const inPeriod = period === 'month'
      ? stream.monthKey === month
      : stream.date && stream.date.getFullYear() === year;
    if (!inPeriod) continue;
    for (const song of stream.songs || []) {
      if (!counts.has(song.key)) {
        counts.set(song.key, { ...song, count: 0 });
      }
      counts.get(song.key).count += 1;
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ja'));
}

function topBarRow(s, i, max) {
  const pct = Math.round((s.count / max) * 100);
  return `
    <div class="bar-row clickable" data-songkey="${escapeHtml(s.key)}" data-songtitle="${escapeHtml(s.title)}" data-songartist="${escapeHtml(s.artist)}" title="クリックで配信タイムラインに絞り込み">
      <div class="bar-rank">${i + 1}</div>
      <div class="bar-content">
        <div class="bar-label">${escapeHtml(s.title)} <span style="color:var(--ink-mute);font-size:11px;">/ ${escapeHtml(s.artist)}</span></div>
        <div class="bar-bar" style="width:${pct}%;"></div>
      </div>
      <div class="bar-value">${s.count}</div>
    </div>
  `;
}

function countStreamsThisMonth(streams) {
  const now = new Date();
  const ym = monthKey(now);
  return streams.filter(s => s.monthKey === ym).length;
}
function countSongsThisMonth(streams) {
  const now = new Date();
  const ym = monthKey(now);
  return streams.filter(s => s.monthKey === ym).reduce((n, s) => n + s.songs.length, 0);
}
function countNewSongsThisMonth(songs) {
  const now = new Date();
  const ym = monthKey(now);
  return songs.filter(s => s.firstSung && monthKey(s.firstSung) === ym).length;
}

function buildMonthly(streams) {
  const months = new Map();
  for (const s of streams) {
    if (!months.has(s.monthKey)) months.set(s.monthKey, { key: s.monthKey, date: new Date(s.date.getFullYear(), s.date.getMonth(), 1), streams: 0, songs: 0 });
    const m = months.get(s.monthKey);
    m.streams += 1;
    m.songs += s.songs.length;
  }
  // fill gaps
  const all = Array.from(months.values()).sort((a, b) => a.date - b.date);
  if (!all.length) return [];
  const out = [];
  let cur = new Date(all[0].date);
  const end = new Date(all[all.length - 1].date);
  while (cur <= end) {
    const k = monthKey(cur);
    out.push(months.get(k) || { key: k, date: new Date(cur), streams: 0, songs: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

async function drawMonthlyChart(monthly) {
  const { createChart, getColors } = await import('../charts.js?v=20260528-sazanami-3');
  const c = getColors();
  createChart('chart-monthly', 'bar', {
    labels: monthly.map(m => fmtMonth(m.date)),
    datasets: [
      {
        type: 'line',
        label: '歌枠数',
        data: monthly.map(m => m.streams),
        borderColor: c.chartPinkLine,
        backgroundColor: c.chartPinkFill,
        pointBackgroundColor: c.chartPinkBorder,
        pointBorderColor: c.chartPinkLine,
        yAxisID: 'y2',
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        borderWidth: 1.8,
      },
      {
        label: '歌唱数',
        data: monthly.map(m => m.songs),
        backgroundColor: c.chartBlue,
        borderColor: c.chartBlueBorder,
        borderWidth: 1,
        yAxisID: 'y',
        borderRadius: 4,
      },
    ],
  }, {
    scales: {
      y:  { position: 'left',  title: { display: true, text: '歌唱数', color: c.inkMute, font: { size: 10 } } },
      y2: { position: 'right', title: { display: true, text: '歌枠数', color: c.inkMute, font: { size: 10 } }, grid: { display: false }, beginAtZero: true },
    },
  });
}

function buildHeatmap(streams) {
  // last 365 days
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 364);
  const cellByISO = new Map();
  for (const s of streams) {
    if (s.date < start || s.date > today) continue;
    const k = isoDate(s.date);
    cellByISO.set(k, (cellByISO.get(k) || 0) + s.songs.length);
  }
  const cells = [];
  // pad to align with Sunday at top
  const startDow = start.getDay();
  const cur = new Date(start); cur.setDate(cur.getDate() - startDow);
  for (let i = 0; i < 53 * 7; i++) {
    const inRange = cur >= start && cur <= today;
    cells.push({
      date: new Date(cur),
      value: inRange ? (cellByISO.get(isoDate(cur)) || 0) : -1,
      inRange,
      iso: isoDate(cur),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function heatLevel(v) {
  if (v <= 0) return '';
  if (v < 8) return 'l1';
  if (v < 16) return 'l2';
  if (v < 25) return 'l3';
  return 'l4';
}

function renderHeatmap(cells) {
  const dow = ['日','月','火','水','木','金','土'];
  const rowsHtml = dow.map(d => `<div>${d}</div>`).join('');
  const cellsHtml = cells.map(c => {
    if (!c.inRange) return `<div class="heatmap-cell" style="visibility:hidden"></div>`;
    const lvl = heatLevel(c.value);
    return `<div class="heatmap-cell ${lvl}" title="${c.iso}: ${c.value}曲"></div>`;
  }).join('');
  return `
    <div class="heatmap-flex">
      <div class="heatmap-row-labels">${rowsHtml}</div>
      <div class="heatmap-wrap"><div class="heatmap">${cellsHtml}</div></div>
    </div>
    <div class="heatmap-legend">
      少なめ
      <div class="scale">
        <div class="heatmap-cell"></div>
        <div class="heatmap-cell l1"></div>
        <div class="heatmap-cell l2"></div>
        <div class="heatmap-cell l3"></div>
        <div class="heatmap-cell l4"></div>
      </div>
      多め
    </div>
  `;
}

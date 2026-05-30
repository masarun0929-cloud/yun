import { initTheme } from './theme.js';
import { $, fmtDate, formatNumber } from './utils.js';
import { SITE } from './config.js';

initTheme();
applySiteConfig();

const adminToken = $('#admin-token');
if (adminToken) {
  adminToken.value = localStorage.getItem('adminToken') || '';
  adminToken.addEventListener('input', () => localStorage.setItem('adminToken', adminToken.value));
}

function applySiteConfig() {
  const baseTitle = `${SITE.creatorName}　${SITE.databaseName}`;
  document.title = `歌枠管理｜${baseTitle}`;
  document.querySelector('.brand')?.setAttribute('aria-label', `${baseTitle} ホーム`);
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).replaceAll('/', '-');
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3]);
  date.setHours(0, 0, 0, 0);
  return date;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function setBadge(ok, text) {
  const badge = $('#api-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle('accent', ok);
}

function stat(label, value, unit = '') {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}<span class="stat-unit">${unit}</span></div>
    </div>
  `;
}

function statusRow(label, value, tone = '') {
  return `<div class="admin-status-row ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

function songKey(song) {
  return `${song.title || ''} / ${song.artist || ''}`;
}

async function adminApi(path, body) {
  const res = await fetch(`/api/admin/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': adminToken?.value || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function streamFormData() {
  return {
    channelCode: $('#channel')?.value || 'new',
    streamedOn: $('#streamed-on')?.value || '',
    sourceIndex: $('#source-index')?.value || '',
    title: $('#stream-title')?.value || '',
    url: $('#stream-url')?.value || '',
    songsText: $('#songs-text')?.value || '',
  };
}

function liveFormData() {
  return {
    performedOn: $('#live-performed-on')?.value || '',
    sourceIndex: $('#live-source-index')?.value || '',
    title: $('#live-title')?.value || '',
    songsText: $('#live-songs-text')?.value || '',
  };
}

function renderPreview(rows) {
  $('#preview-box').innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>#</th><th>曲</th><th>歌手</th><th>キー</th><th>ジャンル</th><th>判定</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.position}</td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.artist || '')}</td>
              <td>${escapeHtml(row.displayKey || '')}</td>
              <td>${escapeHtml(row.genre || '')}</td>
              <td>${escapeHtml(row.match)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSongMeta(rows) {
  $('#song-meta-box').innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>曲</th><th>歌手</th><th>キー</th><th>ジャンル</th><th></th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-song-id="${row.id}">
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.artist || '')}</td>
              <td><input class="admin-compact-input" data-field="displayKey" value="${escapeHtml(row.display_key || '')}"></td>
              <td><input class="admin-compact-input" data-field="genre" value="${escapeHtml(row.genre || '')}"></td>
              <td><button class="btn ghost" type="button" data-save-meta>保存</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function collectIssues(data) {
  const issues = [];
  const datasets = [
    ...Object.entries(data.channels || {}),
    ['combined', data.combined],
  ].filter(([, dataset]) => dataset);

  for (const [scope, dataset] of datasets) {
    for (const song of dataset.songs || []) {
      if (song.count > 0 && (!song.streamRefs || !song.streamRefs.length)) {
        issues.push({ type: '履歴未確認', place: scope, detail: songKey(song) });
      }
      if (!song.genre || song.genre === '未分類') {
        issues.push({ type: 'ジャンル未分類', place: scope, detail: songKey(song) });
      }
      if (dataset.stats?.keyPublished && !song.displayKey) {
        issues.push({ type: 'キー未登録', place: scope, detail: songKey(song) });
      }
    }
    for (const stream of dataset.streams || []) {
      if (stream.songCount && stream.songs && stream.songCount !== stream.songs.length) {
        issues.push({
          type: '曲数不一致',
          place: `${scope} 第${stream.index}枠`,
          detail: `${fmtDate(parseDate(stream.date))}: 表示${stream.songs.length} / 記録${stream.songCount}`,
        });
      }
    }
  }
  return issues;
}

function renderSync(data, elapsed) {
  const stats = data.combined?.stats || {};
  const update = parseDate(stats.updateDate);
  const now = new Date();
  const ageDays = update ? Math.floor((now - update) / 86400000) : null;
  const newestStream = parseDate(stats.newestStream || stats.updateDate);
  const rows = [
    statusRow('API応答', `${formatNumber(elapsed)}ms`, elapsed < 3000 ? 'ok' : 'warn'),
    statusRow('更新日', fmtDate(update), ageDays != null && ageDays <= 3 ? 'ok' : 'warn'),
    statusRow('更新から', ageDays == null ? '-' : `${ageDays}日`, ageDays != null && ageDays <= 3 ? 'ok' : 'warn'),
    statusRow('最新歌枠日', fmtDate(newestStream), 'ok'),
  ];
  $('#sync-status').innerHTML = rows.join('');
  const ok = elapsed < 3000 && (ageDays == null || ageDays <= 3);
  $('#sync-badge').textContent = ok ? '良好' : '要確認';
  $('#sync-badge').classList.toggle('accent', ok);
}

function renderQuality(data) {
  const issues = collectIssues(data);
  const severe = issues.filter((issue) => ['履歴未確認', '曲数不一致'].includes(issue.type)).length;
  const summary = new Map();
  for (const issue of issues) summary.set(issue.type, (summary.get(issue.type) || 0) + 1);
  $('#quality-summary').innerHTML = [
    statusRow('履歴未確認', formatNumber(summary.get('履歴未確認') || 0), (summary.get('履歴未確認') || 0) ? 'warn' : 'ok'),
    statusRow('曲数不一致', formatNumber(summary.get('曲数不一致') || 0), (summary.get('曲数不一致') || 0) ? 'warn' : 'ok'),
    statusRow('ジャンル未分類', formatNumber(summary.get('ジャンル未分類') || 0), (summary.get('ジャンル未分類') || 0) ? 'warn' : 'ok'),
    statusRow('キー未登録', formatNumber(summary.get('キー未登録') || 0), 'ok'),
  ].join('');
  $('#quality-badge').textContent = severe ? '要確認' : '良好';
  $('#quality-badge').classList.toggle('accent', !severe);
  $('#issue-count').textContent = `${issues.length}件`;
  $('#quality-rows').innerHTML = issues.slice(0, 100).map((issue) => `
    <tr>
      <td>${escapeHtml(issue.type)}</td>
      <td>${escapeHtml(issue.place)}</td>
      <td>${escapeHtml(issue.detail)}</td>
    </tr>
  `).join('') || '<tr><td colspan="3">大きな問題は見つかりませんでした</td></tr>';
}

async function loadChannels() {
  try {
    const data = await adminApi('channels');
    $('#channel').innerHTML = data.channels.map((channel) => (
      `<option value="${escapeHtml(channel.code)}">${escapeHtml(channel.name)}</option>`
    )).join('');
  } catch (error) {
    $('#channel').innerHTML = '';
    $('#stream-status').textContent = `チャンネル取得に失敗しました: ${error.message || String(error)}`;
  }
}

async function loadStatus() {
  setBadge(false, '確認中');
  $('#api-detail').textContent = '/api/data を読み込んでいます。';
  $('#channel-rows').innerHTML = '<tr><td colspan="5">読み込み中</td></tr>';
  $('#sync-status').innerHTML = '<div class="admin-note">確認中</div>';
  $('#quality-summary').innerHTML = '<div class="admin-note">確認中</div>';
  $('#quality-rows').innerHTML = '<tr><td colspan="3">読み込み中</td></tr>';

  const started = performance.now();
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const elapsed = Math.round(performance.now() - started);
    const stats = data.combined?.stats || {};

    setBadge(true, '正常');
    $('#api-stats').innerHTML = [
      stat('曲数', formatNumber(stats.repertoire), '曲'),
      stat('歌枠', formatNumber(stats.streams), '枠'),
      stat('応答', formatNumber(elapsed), 'ms'),
    ].join('');
    $('#api-detail').textContent = `最新データ: ${fmtDate(parseDate(stats.updateDate))} / APIキャッシュは最大約1分です。`;
    renderSync(data, elapsed);
    renderQuality(data);

    const channels = Object.values(data.channels || {});
    $('#channel-rows').innerHTML = channels.map((channel) => {
      const s = channel.stats || {};
      return `
        <tr>
          <td>${escapeHtml(s.channelLabel || s.channelId || '-')}</td>
          <td>${formatNumber(s.repertoire)}</td>
          <td>${formatNumber(s.streams)}</td>
          <td>${formatNumber(s.total)}</td>
          <td>${fmtDate(parseDate(s.updateDate))}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5">チャンネルデータがありません</td></tr>';
  } catch (error) {
    setBadge(false, 'エラー');
    $('#api-stats').innerHTML = [stat('曲数', '-'), stat('歌枠', '-'), stat('応答', '-')].join('');
    $('#api-detail').textContent = `API確認に失敗しました: ${error.message || String(error)}`;
    $('#channel-rows').innerHTML = '<tr><td colspan="5">取得できませんでした</td></tr>';
    $('#sync-status').innerHTML = '<div class="admin-note">取得できませんでした</div>';
    $('#quality-summary').innerHTML = '<div class="admin-note">取得できませんでした</div>';
    $('#quality-rows').innerHTML = '<tr><td colspan="3">取得できませんでした</td></tr>';
  }
}

function initManagement() {
  const streamedOn = $('#streamed-on');
  if (streamedOn && !streamedOn.value) streamedOn.valueAsDate = new Date();
  const liveOn = $('#live-performed-on');
  if (liveOn && !liveOn.value) liveOn.valueAsDate = new Date();
  adminToken?.addEventListener('change', loadChannels);
  loadChannels();

  $('#preview-stream')?.addEventListener('click', async () => {
    $('#stream-status').textContent = 'プレビュー中...';
    try {
      const data = await adminApi('preview-stream', streamFormData());
      renderPreview(data.songs);
      $('#stream-status').textContent = `${data.songs.length}曲を確認しました。`;
    } catch (error) {
      $('#stream-status').textContent = error.message || String(error);
    }
  });

  $('#submit-stream')?.addEventListener('click', async () => {
    if (!confirm('この歌枠をD1に登録します。よろしいですか？')) return;
    $('#stream-status').textContent = '登録中...';
    try {
      const data = await adminApi('streams', streamFormData());
      $('#stream-status').textContent = `登録しました: stream_id=${data.streamId}, ${data.songCount}曲。必要なら静的データ生成を開始してください。`;
      $('#preview-box').innerHTML = '';
      loadStatus();
    } catch (error) {
      $('#stream-status').textContent = error.message || String(error);
    }
  });

  $('#submit-live')?.addEventListener('click', async () => {
    if (!confirm('このリアルライブ情報をD1に登録します。よろしいですか？')) return;
    $('#live-status').textContent = '登録中...';
    try {
      const data = await adminApi('live-events', liveFormData());
      $('#live-status').textContent = `登録しました: live_id=${data.liveId}, ${data.songCount}曲。必要なら静的データ生成を開始してください。`;
    } catch (error) {
      $('#live-status').textContent = error.message || String(error);
    }
  });

  $('#search-songs')?.addEventListener('click', async () => {
    $('#meta-status').textContent = '検索中...';
    try {
      const data = await adminApi(`songs/search?q=${encodeURIComponent($('#song-query').value)}`);
      renderSongMeta(data.songs);
      $('#meta-status').textContent = `${data.songs.length}件`;
    } catch (error) {
      $('#meta-status').textContent = error.message || String(error);
    }
  });

  $('#song-meta-box')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-meta]');
    if (!button) return;
    const row = button.closest('[data-song-id]');
    $('#meta-status').textContent = '保存中...';
    try {
      await adminApi('songs/metadata', {
        songId: row.dataset.songId,
        displayKey: row.querySelector('[data-field="displayKey"]').value,
        genre: row.querySelector('[data-field="genre"]').value,
      });
      $('#meta-status').textContent = '保存しました。必要なら静的データ生成を開始してください。';
    } catch (error) {
      $('#meta-status').textContent = error.message || String(error);
    }
  });

  $('#sync-keys')?.addEventListener('click', async () => {
    if (!confirm('SpreadsheetからD1のキー/ジャンルを同期します。よろしいですか？')) return;
    $('#meta-status').textContent = '同期中...';
    try {
      const data = await adminApi('key-reference/sync-url', { url: $('#key-sheet-url').value });
      $('#meta-status').textContent = `同期しました: updated=${data.updated}, skipped=${data.skipped}`;
    } catch (error) {
      $('#meta-status').textContent = error.message || String(error);
    }
  });

  $('#sync-key-csv')?.addEventListener('click', async () => {
    const file = $('#key-csv-file').files[0];
    if (!file) {
      $('#meta-status').textContent = 'CSVファイルを選んでください';
      return;
    }
    if (!confirm('CSVからD1のキー/ジャンルを同期します。よろしいですか？')) return;
    $('#meta-status').textContent = 'CSV同期中...';
    try {
      const data = await adminApi('key-reference/import-csv', { csvText: await file.text() });
      $('#meta-status').textContent = `同期しました: updated=${data.updated}, skipped=${data.skipped}`;
    } catch (error) {
      $('#meta-status').textContent = error.message || String(error);
    }
  });

  $('#generate-static-data')?.addEventListener('click', async () => {
    if (!confirm('GitHub Actionsで静的データ生成を開始します。よろしいですか？')) return;
    $('#static-status').textContent = 'GitHub Actionsを起動中...';
    try {
      const data = await adminApi('static-data/generate', {});
      $('#static-status').textContent = `起動しました: ${data.owner}/${data.repo} / ${data.workflow}\nGitHub Actions完了後、Pagesへ自動反映されます。`;
    } catch (error) {
      $('#static-status').textContent = error.message || String(error);
    }
  });
}

$('#refresh-status')?.addEventListener('click', loadStatus);
initManagement();
loadStatus();

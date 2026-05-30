function normalize(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').normalize('NFKC');
}

function normalizedKey(value) {
  return normalize(value).toLowerCase();
}

function cleanMetadata(value) {
  const text = normalize(value);
  if (!text || ['#REF!', '#N/A', 'N/A', 'NULL'].includes(text.toUpperCase())) return '';
  return text;
}

function cleanDisplayKey(value) {
  const text = cleanMetadata(value).replace(/^＋/, '+').replace(/^－/, '-');
  if (!text) return '';
  if (text === '原キー') return text;
  if (/^[+-]\d{1,2}$/.test(text)) return text;
  return '';
}

function songKey(title, artist) {
  return `${normalizedKey(title)}__${normalizedKey(artist)}`;
}

function todayIso() {
  return new Date().toISOString();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function assertAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return;
  if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
    const error = new Error('Invalid admin token');
    error.status = 401;
    throw error;
  }
}

function splitSongLine(raw) {
  const text = String(raw || '').trim();
  const parts = text.split('|').map((part) => part.trim());
  const songText = parts[0] || '';
  for (const sep of [' / ', '／', '/']) {
    const index = songText.lastIndexOf(sep);
    if (index >= 0) {
      return {
        title: normalize(songText.slice(0, index)),
        artist: normalize(songText.slice(index + sep.length)),
        displayKey: cleanDisplayKey(parts[1] || ''),
        genre: cleanMetadata(parts[2] || ''),
        raw: text,
      };
    }
  }
  return {
    title: normalize(songText),
    artist: '',
    displayKey: cleanDisplayKey(parts[1] || ''),
    genre: cleanMetadata(parts[2] || ''),
    raw: text,
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0]) rows.push(row);
  return rows;
}

function csvObjects(text) {
  const rows = parseCsv(text);
  const headers = (rows.shift() || []).map((header) => normalize(header));
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}

function fixedIntegratedRows(text) {
  return parseCsv(text)
    .map((row) => ({
      title: row[19] || '',
      artist: row[20] || '',
      displayKey: row[21] || '',
      genre: row[23] || '',
    }))
    .filter((row) => normalize(row.title) && (cleanDisplayKey(row.displayKey) || cleanMetadata(row.genre)));
}

function spreadsheetCsvUrl(value) {
  const raw = normalize(value);
  if (!raw) return '';
  if (/output=csv|tqx=out:csv/.test(raw)) return raw;
  const match = raw.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) return raw;
  const gidMatch = raw.match(/[?#&]gid=(\d+)/) || raw.match(/#gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

async function select(env, sql, params = []) {
  const stmt = env.DB.prepare(sql);
  const result = params.length ? await stmt.bind(...params).all() : await stmt.all();
  return result.results || [];
}

async function selectOne(env, sql, params = []) {
  return (await select(env, sql, params))[0] || null;
}

async function execute(env, sql, params = []) {
  const stmt = env.DB.prepare(sql);
  const result = params.length ? await stmt.bind(...params).run() : await stmt.run();
  return result.meta || {};
}

async function getChannels(env) {
  return select(env, 'SELECT id, code, name FROM channels ORDER BY sort_order ASC, id ASC');
}

async function buildSongMaps(env) {
  const rows = await select(env, `
    SELECT songs.id, songs.title, songs.normalized_title, songs.song_key, songs.display_key, songs.genre, artists.name AS artist
    FROM songs
    LEFT JOIN artists ON artists.id = songs.artist_id
    ORDER BY songs.id ASC
  `);
  const byKey = new Map();
  const byTitle = new Map();
  for (const row of rows) {
    byKey.set(row.song_key, row);
    if (!byTitle.has(row.normalized_title)) byTitle.set(row.normalized_title, []);
    byTitle.get(row.normalized_title).push(row);
  }
  return { byKey, byTitle };
}

function resolveExistingSong(parsed, maps) {
  const key = songKey(parsed.title, parsed.artist);
  const exact = maps.byKey.get(key);
  if (exact) return { key, song: exact, match: 'exact' };
  const titleMatches = maps.byTitle.get(normalizedKey(parsed.title)) || [];
  if (titleMatches.length === 1) return { key, song: titleMatches[0], match: 'title' };
  return { key, song: null, match: titleMatches.length > 1 ? 'ambiguous' : 'new' };
}

async function previewStream(env, input) {
  const maps = await buildSongMaps(env);
  const lines = String(input.songsText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const parsed = splitSongLine(line);
    const resolved = resolveExistingSong(parsed, maps);
    return {
      position: index + 1,
      raw: parsed.raw,
      title: parsed.title,
      artist: parsed.artist,
      key: resolved.key,
      match: resolved.match,
      songId: resolved.song?.id || null,
      existingTitle: resolved.song?.title || '',
      existingArtist: resolved.song?.artist || '',
      displayKey: parsed.displayKey || resolved.song?.display_key || '',
      genre: parsed.genre || resolved.song?.genre || '',
    };
  });
}

async function upsertArtist(env, name) {
  const artistName = normalize(name || '(不明)') || '(不明)';
  const normalizedName = normalizedKey(artistName);
  const existing = await selectOne(env, 'SELECT id FROM artists WHERE normalized_name = ?', [normalizedName]);
  if (existing) return existing.id;
  const meta = await execute(env, 'INSERT INTO artists (name, normalized_name, created_at) VALUES (?, ?, ?)', [
    artistName,
    normalizedName,
    todayIso(),
  ]);
  return meta.last_row_id;
}

async function updateSongMetadata(env, songId, displayKey, genre) {
  await execute(env, `
    UPDATE songs
    SET display_key = COALESCE(NULLIF(?, ''), display_key),
        genre = COALESCE(NULLIF(?, ''), genre)
    WHERE id = ?
  `, [normalize(displayKey), normalize(genre), songId]);
}

async function upsertSong(env, title, artist, metadata = {}) {
  const cleanTitle = normalize(title);
  const cleanArtist = normalize(artist || '(不明)') || '(不明)';
  const key = songKey(cleanTitle, cleanArtist === '(不明)' ? '' : cleanArtist);
  const existing = await selectOne(env, 'SELECT id FROM songs WHERE song_key = ?', [key]);
  if (existing) {
    await updateSongMetadata(env, existing.id, metadata.displayKey, metadata.genre);
    return { id: existing.id, key, created: false };
  }
  const artistId = await upsertArtist(env, cleanArtist);
  const meta = await execute(env, `
    INSERT INTO songs (title, normalized_title, artist_id, song_key, display_key, genre, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [cleanTitle, normalizedKey(cleanTitle), artistId, key, normalize(metadata.displayKey), normalize(metadata.genre), todayIso()]);
  return { id: meta.last_row_id, key, created: true };
}

async function nextSourceIndex(env, channelId) {
  const row = await selectOne(env, 'SELECT COALESCE(MAX(source_index), 0) + 1 AS next_index FROM streams WHERE channel_id = ?', [channelId]);
  return row?.next_index || 1;
}

async function nextLiveSourceIndex(env) {
  const row = await selectOne(env, 'SELECT COALESCE(MAX(source_index), 0) + 1 AS next_index FROM live_events');
  return row?.next_index || 1;
}

async function addStream(env, input) {
  const channel = await selectOne(env, 'SELECT id, code, name FROM channels WHERE code = ?', [input.channelCode]);
  if (!channel) throw new Error(`Unknown channel: ${input.channelCode}`);
  const streamedOn = normalize(input.streamedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(streamedOn)) throw new Error('配信日は YYYY-MM-DD で入力してください');
  const lines = String(input.songsText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('曲リストが空です');

  const url = normalize(input.url);
  const title = normalize(input.title);
  const urlKey = url || `${channel.code}:${streamedOn}:${title}`;
  const sourceIndex = Number(input.sourceIndex) || await nextSourceIndex(env, channel.id);
  const now = todayIso();
  let stream = await selectOne(env, 'SELECT id FROM streams WHERE channel_id = ? AND streamed_on = ? AND url_key = ?', [
    channel.id,
    streamedOn,
    urlKey,
  ]);

  if (stream) {
    const oldRows = await select(env, 'SELECT song_id FROM stream_songs WHERE stream_id = ? AND song_id IS NOT NULL', [stream.id]);
    for (const oldRow of oldRows) {
      await execute(env, `
        UPDATE song_channel_stats
        SET sing_count = CASE WHEN sing_count > 0 THEN sing_count - 1 ELSE 0 END,
            updated_at = ?
        WHERE song_id = ? AND channel_id = ?
      `, [now, oldRow.song_id, channel.id]);
    }
    await execute(env, 'UPDATE streams SET source_index = ?, title = ?, url = ?, song_count = ? WHERE id = ?', [
      sourceIndex,
      title,
      url,
      lines.length,
      stream.id,
    ]);
    await execute(env, 'DELETE FROM stream_songs WHERE stream_id = ?', [stream.id]);
  } else {
    const meta = await execute(env, `
      INSERT INTO streams (channel_id, source_index, streamed_on, title, url, song_count, created_at, url_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [channel.id, sourceIndex, streamedOn, title, url, lines.length, now, urlKey]);
    stream = { id: meta.last_row_id };
  }

  const insertedSongs = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = splitSongLine(lines[index]);
    const song = await upsertSong(env, parsed.title, parsed.artist, parsed);
    await execute(env, `
      INSERT INTO stream_songs (stream_id, song_id, position, raw_text, title_snapshot, artist_snapshot, song_key_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [stream.id, song.id, index + 1, parsed.raw, parsed.title, parsed.artist, song.key, now]);
    await execute(env, `
      INSERT INTO song_channel_stats (song_id, channel_id, sing_count, source_index, created_at, updated_at)
      VALUES (?, ?, 1, NULL, ?, ?)
      ON CONFLICT(song_id, channel_id) DO UPDATE SET
        sing_count = sing_count + 1,
        updated_at = excluded.updated_at
    `, [song.id, channel.id, now, now]);
    insertedSongs.push({ position: index + 1, title: parsed.title, artist: parsed.artist, created: song.created });
  }

  return { streamId: stream.id, channel: channel.code, streamedOn, songCount: insertedSongs.length, songs: insertedSongs };
}

async function addLiveEvent(env, input) {
  const performedOn = normalize(input.performedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn)) throw new Error('ライブ日は YYYY-MM-DD で入力してください');
  const title = normalize(input.title);
  if (!title) throw new Error('ライブ名称を入力してください');

  const lines = String(input.songsText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sourceIndex = Number(input.sourceIndex) || await nextLiveSourceIndex(env);
  const now = todayIso();
  const maps = await buildSongMaps(env);

  let live = await selectOne(env, 'SELECT id FROM live_events WHERE performed_on = ? AND title = ?', [performedOn, title]);
  if (live) {
    await execute(env, 'UPDATE live_events SET source_index = ?, song_count = ? WHERE id = ?', [sourceIndex, lines.length, live.id]);
    await execute(env, 'DELETE FROM live_event_songs WHERE live_event_id = ?', [live.id]);
  } else {
    const meta = await execute(env, `
      INSERT INTO live_events (source_index, performed_on, title, song_count, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [sourceIndex, performedOn, title, lines.length, now]);
    live = { id: meta.last_row_id };
  }

  const songs = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = splitSongLine(lines[index]);
    const resolved = resolveExistingSong(parsed, maps);
    let songId = resolved.song?.id || null;
    let key = resolved.song?.song_key || resolved.key;
    let titleSnapshot = resolved.song?.title || parsed.title;
    let artistSnapshot = resolved.song?.artist || parsed.artist;
    if (!songId) {
      const song = await upsertSong(env, parsed.title, parsed.artist, parsed);
      songId = song.id;
      key = song.key;
      titleSnapshot = parsed.title;
      artistSnapshot = parsed.artist;
    }
    await execute(env, `
      INSERT INTO live_event_songs (live_event_id, song_id, position, raw_text, title_snapshot, artist_snapshot, song_key_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [live.id, songId, index + 1, parsed.raw, titleSnapshot, artistSnapshot, key, now]);
    songs.push({ position: index + 1, title: titleSnapshot, artist: artistSnapshot });
  }

  return { liveId: live.id, performedOn, title, songCount: songs.length, songs };
}

async function searchSongs(env, query) {
  const q = `%${normalize(query.q || '')}%`;
  return select(env, `
    SELECT songs.id, songs.title, artists.name AS artist, songs.display_key, songs.genre
    FROM songs
    LEFT JOIN artists ON artists.id = songs.artist_id
    WHERE songs.title LIKE ? OR artists.name LIKE ? OR songs.display_key LIKE ? OR songs.genre LIKE ?
    ORDER BY songs.title ASC
    LIMIT 80
  `, [q, q, q, q]);
}

async function saveSongMetadata(env, input) {
  const songId = Number(input.songId);
  if (!songId) throw new Error('songId is required');
  await execute(env, 'UPDATE songs SET display_key = ?, genre = ? WHERE id = ?', [
    normalize(input.displayKey),
    normalize(input.genre),
    songId,
  ]);
  return { ok: true };
}

function pickColumn(columns, candidates) {
  const normalized = columns.map((name) => ({ name, key: normalizedKey(name).replace(/[\s_-]/g, '') }));
  for (const candidate of candidates) {
    const key = normalizedKey(candidate).replace(/[\s_-]/g, '');
    const found = normalized.find((column) => column.key === key);
    if (found) return found.name;
  }
  for (const candidate of candidates) {
    const key = normalizedKey(candidate).replace(/[\s_-]/g, '');
    const found = normalized.find((column) => column.key.includes(key));
    if (found) return found.name;
  }
  return null;
}

async function importKeyReferenceCsv(env, input) {
  const csvText = String(input.csvText || '');
  const rows = csvObjects(csvText);
  if (!rows.length) throw new Error('CSVが空です');
  const names = Object.keys(rows[0]);
  const titleCol = pickColumn(names, ['title', 'song_title', '曲名', '楽曲名']);
  const artistCol = pickColumn(names, ['artist', 'artist_name', '歌手', 'アーティスト']);
  const keyCol = pickColumn(names, ['キー', 'display_key', 'key', 'song_key_text']);
  const genreCol = pickColumn(names, ['genre', 'ジャンル']);
  const fixedRows = !titleCol || (!keyCol && !genreCol) ? fixedIntegratedRows(csvText) : [];
  if ((!titleCol || (!keyCol && !genreCol)) && !fixedRows.length) throw new Error(`CSVの列を判定できません: ${names.join(', ')}`);
  let updated = 0;
  let skipped = 0;
  const sourceRows = fixedRows.length ? fixedRows : rows.map((row) => ({
    title: row[titleCol],
    artist: artistCol ? row[artistCol] : '',
    displayKey: keyCol ? row[keyCol] : '',
    genre: genreCol ? row[genreCol] : '',
  }));
  for (const row of sourceRows) {
    const title = normalize(row.title);
    const artist = normalize(row.artist);
    const displayKey = cleanDisplayKey(row.displayKey);
    const genre = cleanMetadata(row.genre);
    if (!title || (!displayKey && !genre)) {
      skipped += 1;
      continue;
    }
    const exactKey = songKey(title, artist);
    let song = artist ? await selectOne(env, 'SELECT id FROM songs WHERE song_key = ?', [exactKey]) : null;
    if (!song) {
      const matches = await select(env, 'SELECT id FROM songs WHERE normalized_title = ?', [normalizedKey(title)]);
      song = matches.length === 1 ? matches[0] : null;
    }
    if (!song) {
      skipped += 1;
      continue;
    }
    await updateSongMetadata(env, song.id, displayKey, genre);
    updated += 1;
  }
  return {
    updated,
    skipped,
    detectedColumns: fixedRows.length ? { title: 'T', artist: 'U', key: 'V', genre: 'X' } : { title: titleCol, artist: artistCol, key: keyCol, genre: genreCol },
  };
}

async function syncKeyReferenceUrl(env, input) {
  const url = spreadsheetCsvUrl(input.url || env.KEY_REFERENCE_CSV_URL || '');
  if (!url) throw new Error('Spreadsheet URL or KEY_REFERENCE_CSV_URL is required');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Spreadsheet CSV fetch failed: HTTP ${response.status}`);
  return importKeyReferenceCsv(env, { csvText: await response.text() });
}

async function triggerStaticDataWorkflow(env) {
  const token = env.GITHUB_ACTIONS_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_ACTIONS_TOKEN is missing');
  const owner = env.GITHUB_OWNER || 'masarun0929-cloud';
  const repo = env.GITHUB_REPO || 'issiki-is';
  const workflow = env.GITHUB_STATIC_WORKFLOW || 'update-static-data.yml';
  const ref = env.GITHUB_STATIC_REF || 'main';
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'isshiki-izu-songlist-admin',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      ref,
      inputs: {
        source: 'cloudflare-admin',
        requested_at: todayIso(),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Actions dispatch failed: HTTP ${response.status} ${text}`);
  }
  return { ok: true, owner, repo, workflow, ref, requestedAt: todayIso() };
}

async function route(request, env, path) {
  if (!env.DB) throw new Error('D1 binding DB is missing');
  if (request.method === 'GET' && path === 'health') return { ok: true };
  if (request.method === 'GET' && path === 'channels') return { channels: await getChannels(env) };
  if (request.method === 'GET' && path === 'songs/search') {
    const url = new URL(request.url);
    return { songs: await searchSongs(env, { q: url.searchParams.get('q') || '' }) };
  }
  if (request.method === 'POST' && path === 'preview-stream') return { songs: await previewStream(env, await readJson(request)) };
  if (request.method === 'POST' && path === 'streams') return addStream(env, await readJson(request));
  if (request.method === 'POST' && path === 'live-events') return addLiveEvent(env, await readJson(request));
  if (request.method === 'POST' && path === 'songs/metadata') return saveSongMetadata(env, await readJson(request));
  if (request.method === 'POST' && path === 'key-reference/import-csv') return importKeyReferenceCsv(env, await readJson(request));
  if (request.method === 'POST' && path === 'key-reference/sync-url') return syncKeyReferenceUrl(env, await readJson(request));
  if (request.method === 'POST' && path === 'static-data/generate') return triggerStaticDataWorkflow(env);
  const error = new Error('Not found');
  error.status = 404;
  throw error;
}

export async function onRequest({ request, env, params }) {
  try {
    assertAdmin(request, env);
    const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
    return json(await route(request, env, path));
  } catch (error) {
    return json({ error: error.message || String(error) }, error.status || 500);
  }
}


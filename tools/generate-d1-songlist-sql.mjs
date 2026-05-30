import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(root, 'docs', 'songlist.csv');
const genrePath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(root, 'docs', 'genre.csv');
const setlistPath = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.resolve(root, 'docs', 'setlist.csv');
const outputPath = process.argv[5]
  ? path.resolve(process.argv[5])
  : path.resolve(root, 'd1', 'generated', 'songlist_seed.sql');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
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
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function normalize(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').normalize('NFKC');
}

function normalizedKey(value) {
  return normalize(value).toLowerCase();
}

function normalizeLookupText(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[~〜～]/g, '')
    .replace(/[()（）［］\[\]「」『』"“”'.。．]/g, '');
}

function normalizeAliasTitle(value) {
  return normalizeLookupText(value)
    .replace(/丸の内/g, '丸ノ内')
    .replace(/^ダダダ天使$/, 'ダダダダ天使')
    .replace(/pianover\.?/g, '')
    .replace(/pianoversion/g, '');
}

function toNumber(value) {
  const num = Number(normalize(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function sqlString(value) {
  return `'${String(value == null ? '' : value).replace(/'/g, "''")}'`;
}

function songKey(title, artist) {
  return `${normalizedKey(title)}__${normalizedKey(artist)}`;
}

function normalizeDate(raw) {
  const value = normalize(raw);
  const match = value.match(/^(\d{4})\/(\d{1,3})\/(\d{1,2})$/);
  if (!match) return value.replaceAll('/', '-');
  const year = match[1];
  let month = match[2];
  const day = match[3];
  if (Number(month) > 12 && month.length === 3) month = month.slice(0, 2);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function splitSongRaw(raw) {
  const value = normalize(raw);
  const match = value.match(/^(.*?)\s+\/\s+(.*?)$/);
  if (!match) return { title: value, artist: '(不明)' };
  return {
    title: normalize(match[1]),
    artist: normalize(match[2]) || '(不明)',
  };
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

function loadGenreMap() {
  if (!fs.existsSync(genrePath)) return new Map();
  const rows = parseCsv(fs.readFileSync(genrePath, 'utf8'));
  const map = new Map();
  for (const row of rows.slice(1)) {
    const title = normalize(row[0]);
    const artist = normalize(row[1]);
    const genre = normalize(row[2]);
    if (!title || !artist || !genre) continue;
    map.set(songKey(title, artist), genre);
    map.set(`${normalizeLookupText(title)}__${normalizeLookupText(artist)}`, genre);
  }
  return map;
}

const genreMap = loadGenreMap();

function genreFor(title, artist) {
  return genreMap.get(songKey(title, artist))
    || genreMap.get(`${normalizeLookupText(title)}__${normalizeLookupText(artist)}`)
    || '';
}

function loadSongs() {
  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
  const songsByKey = new Map();

  for (const row of rows.slice(2)) {
    const sourceIndex = toNumber(row[0]);
    const title = normalize(row[1]);
    const artist = normalize(row[3]) || '(不明)';
    const count = toNumber(row[4]);
    if (!title) continue;

    const key = songKey(title, artist);
    const current = songsByKey.get(key);
    if (current) {
      current.singCount += count;
      if (!current.sourceIndex && sourceIndex) current.sourceIndex = sourceIndex;
      continue;
    }

    songsByKey.set(key, {
      sourceIndex,
      title,
      artist,
      normalizedTitle: normalizedKey(title),
      normalizedArtist: normalizedKey(artist),
      songKey: key,
      genre: genreFor(title, artist),
      singCount: count,
    });
  }

  return [...songsByKey.values()];
}

const songs = loadSongs();
const songByKey = new Map(songs.map((song) => [song.songKey, song]));
const songByTitleArtist = new Map(songs.map((song) => [
  `${normalizeLookupText(song.title)}__${normalizeLookupText(song.artist)}`,
  song,
]));
const songByTitle = new Map();
let nextVersionSourceIndex = Math.max(0, ...songs.map((song) => song.sourceIndex || 0)) + 1;

function indexSong(song) {
  songByKey.set(song.songKey, song);
  songByTitleArtist.set(`${normalizeLookupText(song.title)}__${normalizeLookupText(song.artist)}`, song);
  const title = normalizeLookupText(song.title);
  if (!songByTitle.has(title)) songByTitle.set(title, []);
  if (!songByTitle.get(title).includes(song)) songByTitle.get(title).push(song);
}

for (const song of songs) indexSong(song);

function ensureVersionSong(parsed, baseSong) {
  const artist = parsed.artist && parsed.artist !== '(不明)' ? parsed.artist : baseSong.artist;
  const key = songKey(parsed.title, artist);
  const existing = songByKey.get(key);
  if (existing) {
    existing.singCount += 1;
    return existing;
  }
  const song = {
    sourceIndex: nextVersionSourceIndex++,
    title: parsed.title,
    artist,
    normalizedTitle: normalizedKey(parsed.title),
    normalizedArtist: normalizedKey(artist),
    songKey: key,
    genre: baseSong.genre || genreFor(baseSong.title, baseSong.artist),
    singCount: 1,
  };
  songs.push(song);
  indexSong(song);
  return song;
}

function resolveSong(raw) {
  const parsed = splitSongRaw(raw);
  const directKey = songKey(parsed.title, parsed.artist);
  if (songByKey.has(directKey)) return { song: songByKey.get(directKey), parsed };
  const lookupKey = `${normalizeLookupText(parsed.title)}__${normalizeLookupText(parsed.artist)}`;
  if (songByTitleArtist.has(lookupKey)) return { song: songByTitleArtist.get(lookupKey), parsed };
  const titleMatches = songByTitle.get(normalizeLookupText(parsed.title)) || [];
  if (titleMatches.length === 1) return { song: titleMatches[0], parsed };
  const titleKey = normalizeLookupText(parsed.title);
  const aliasTitleKey = normalizeAliasTitle(parsed.title);
  const aliasTitleMatches = aliasTitleKey !== titleKey ? (songByTitle.get(aliasTitleKey) || []) : [];
  if (aliasTitleMatches.length === 1) {
    const baseSong = aliasTitleMatches[0];
    if (!parsed.artist || parsed.artist === '(不明)' || normalizeLookupText(parsed.artist) === normalizeLookupText(baseSong.artist)) {
      return { song: baseSong, parsed };
    }
    return { song: ensureVersionSong(parsed, baseSong), parsed };
  }
  return { song: null, parsed };
}

function loadStreams() {
  if (!fs.existsSync(setlistPath)) return [];
  const rows = parseCsv(fs.readFileSync(setlistPath, 'utf8'));
  const dates = rows[1] || [];
  const titles = rows[2] || [];
  const urls = rows[3] || [];
  const counts = rows[4] || [];
  const streams = [];

  for (let col = 1; col < dates.length; col += 1) {
    const date = normalizeDate(dates[col]);
    const title = normalize(titles[col]);
    const url = normalize(urls[col]);
    if (!date && !title && !url) continue;

    const streamSongs = [];
    for (let row = 5; row < rows.length; row += 1) {
      const raw = normalize(rows[row]?.[col]);
      if (!raw) continue;
      const { song, parsed } = resolveSong(raw);
      streamSongs.push({
        position: streamSongs.length + 1,
        songKey: song?.songKey || songKey(parsed.title, parsed.artist),
        title: song?.title || parsed.title,
        artist: song?.artist || parsed.artist,
        raw,
        matched: !!song,
      });
    }

    streams.push({
      sourceIndex: col,
      date,
      title,
      url,
      urlKey: youtubeVideoId(url) || `stream-${col}`,
      songCount: toNumber(counts[col]) || streamSongs.length,
      songs: streamSongs,
    });
  }
  return streams;
}

const streams = loadStreams();
const artists = [...new Map([
  ...songs.map((song) => [song.normalizedArtist, song.artist]),
  ...streams.flatMap((stream) => stream.songs.map((song) => [normalizedKey(song.artist || '(不明)'), song.artist || '(不明)'])),
]).entries()]
  .map(([normalizedName, name]) => ({ normalizedName, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

const lines = [
  '-- Generated from sazanami-yun CSV files.',
  '-- Run d1/schema.sql first, then this seed SQL.',
  'BEGIN TRANSACTION;',
  '',
  "INSERT INTO channels (code, name, sort_order) VALUES ('new', '歌った曲リスト', 1)",
  'ON CONFLICT(code) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order;',
  '',
];

for (const artist of artists) {
  lines.push(
    `INSERT INTO artists (name, normalized_name) VALUES (${sqlString(artist.name)}, ${sqlString(artist.normalizedName)})`,
    'ON CONFLICT(normalized_name) DO UPDATE SET name = excluded.name;'
  );
}

lines.push('');

for (const song of songs) {
  lines.push(
    `INSERT INTO songs (title, normalized_title, artist_id, song_key, genre) VALUES (${sqlString(song.title)}, ${sqlString(song.normalizedTitle)}, (SELECT id FROM artists WHERE normalized_name = ${sqlString(song.normalizedArtist)}), ${sqlString(song.songKey)}, ${sqlString(song.genre)})`,
    'ON CONFLICT(song_key) DO UPDATE SET',
    '  title = excluded.title,',
    '  normalized_title = excluded.normalized_title,',
    '  artist_id = excluded.artist_id,',
    '  genre = excluded.genre;'
  );
}

lines.push('');

for (const song of songs) {
  lines.push(
    `INSERT INTO song_channel_stats (song_id, channel_id, sing_count, source_index, updated_at) VALUES ((SELECT id FROM songs WHERE song_key = ${sqlString(song.songKey)}), (SELECT id FROM channels WHERE code = 'new'), ${song.singCount}, ${song.sourceIndex || 'NULL'}, CURRENT_TIMESTAMP)`,
    'ON CONFLICT(song_id, channel_id) DO UPDATE SET',
    '  sing_count = excluded.sing_count,',
    '  source_index = excluded.source_index,',
    '  updated_at = CURRENT_TIMESTAMP;'
  );
}

lines.push('');

for (const stream of streams) {
  const streamSelector = `(SELECT id FROM streams WHERE channel_id = (SELECT id FROM channels WHERE code = 'new') AND streamed_on = ${sqlString(stream.date)} AND url_key = ${sqlString(stream.urlKey)})`;
  lines.push(
    `INSERT INTO streams (channel_id, source_index, streamed_on, title, url, url_key, song_count) VALUES ((SELECT id FROM channels WHERE code = 'new'), ${stream.sourceIndex}, ${sqlString(stream.date)}, ${sqlString(stream.title)}, ${sqlString(stream.url)}, ${sqlString(stream.urlKey)}, ${stream.songCount})`,
    'ON CONFLICT(channel_id, streamed_on, url_key) DO UPDATE SET',
    '  source_index = excluded.source_index,',
    '  title = excluded.title,',
    '  url = excluded.url,',
    '  song_count = excluded.song_count;',
    `DELETE FROM stream_songs WHERE stream_id = ${streamSelector};`
  );
  for (const song of stream.songs) {
    lines.push(
      `INSERT INTO stream_songs (stream_id, song_id, position, raw_text, title_snapshot, artist_snapshot, song_key_snapshot) VALUES (${streamSelector}, (SELECT id FROM songs WHERE song_key = ${sqlString(song.songKey)}), ${song.position}, ${sqlString(song.raw)}, ${sqlString(song.title)}, ${sqlString(song.artist)}, ${sqlString(song.songKey)});`
    );
  }
}

lines.push('', 'COMMIT;', '');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

const unmatched = streams.reduce((sum, stream) => sum + stream.songs.filter((song) => !song.matched).length, 0);
const unmatchedDetails = streams.flatMap((stream) =>
  stream.songs
    .filter((song) => !song.matched)
    .map((song) => `${stream.sourceIndex}:${song.position} ${stream.date} ${song.raw}`)
);
console.log(`Generated ${outputPath}`);
console.log(`Songs: ${songs.length}`);
console.log(`Artists: ${artists.length}`);
console.log(`Streams: ${streams.length}`);
console.log(`Stream songs: ${streams.reduce((sum, stream) => sum + stream.songs.length, 0)}`);
console.log(`Unmatched stream songs: ${unmatched}`);
if (unmatchedDetails.length) {
  console.log(`Unmatched details: ${unmatchedDetails.join(' | ')}`);
}

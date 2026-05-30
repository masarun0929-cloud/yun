import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const siteTitle = 'さざなみゆん　歌唱データベース';
const csvPath = path.resolve(root, 'docs', 'songlist.csv');
const genreCsvPath = path.resolve(root, 'docs', 'genre.csv');
const setlistCsvPath = path.resolve(root, 'docs', 'setlist.csv');
const dataDir = path.resolve(root, 'docs', 'data');

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

function clean(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  const num = Number(clean(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function makeKey(title, artist) {
  return `${title}__${artist}`.toLowerCase();
}

function normalizeLookupText(value) {
  return clean(value)
    .normalize('NFKC')
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

function normalizeDate(raw) {
  const value = clean(raw);
  const match = value.match(/^(\d{4})\/(\d{1,3})\/(\d{1,2})$/);
  if (!match) return { dateRaw: value, date: value.replaceAll('/', '-') };
  const year = match[1];
  let month = match[2];
  const day = match[3];
  if (Number(month) > 12 && month.length === 3) {
    month = month.slice(0, 2);
  }
  return {
    dateRaw: `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`,
    date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
  };
}

function splitSongRaw(raw) {
  const value = clean(raw);
  const match = value.match(/^(.*?)\s+\/\s+(.*?)$/);
  if (!match) {
    return { title: value, artist: '(不明)' };
  }
  return {
    title: clean(match[1]),
    artist: clean(match[2]) || '(不明)',
  };
}

function songToGenre(title, artist) {
  const text = `${title} ${artist}`.toLowerCase();
  if (/初音ミク|鏡音|巡音|flower|vocaloid|deco\*27|kanaria|ナユタン|wowaka|ピノキオピー|ハチ/.test(text)) return 'ボカロ';
  if (/yoasobi|ado|米津|ヨルシカ|ずっと真夜中|official髭男|mrs\.?|king gnu|vaundy|back number|西野カナ/.test(text)) return 'J-POP';
  if (/アニメ|残酷な天使|god knows|butter-fly|unravel|only my railgun|アイドル/.test(text)) return 'アニソン';
  return '未分類';
}

function loadGenreMap() {
  if (!fs.existsSync(genreCsvPath)) return new Map();
  const genreRows = parseCsv(fs.readFileSync(genreCsvPath, 'utf8'));
  const map = new Map();
  for (const row of genreRows.slice(1)) {
    const title = clean(row[0]);
    const artist = clean(row[1]);
    const genre = clean(row[2]);
    if (!title || !artist || !genre) continue;
    map.set(makeKey(title, artist), genre);
    map.set(`${normalizeLookupText(title)}__${normalizeLookupText(artist)}`, genre);
  }
  return map;
}

function summaryNumber(summaryRow, preferredIndex, fallbackStart = 4) {
  const preferred = toNumber(summaryRow[preferredIndex]);
  if (preferred) return preferred;
  for (let index = fallbackStart; index < summaryRow.length; index += 1) {
    const value = toNumber(summaryRow[index]);
    if (value) return value;
  }
  return 0;
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8')).filter((row) => row.some((cell) => clean(cell)));
const summary = rows[0] || [];
const updateRaw = clean(summary[3]) || '2026/05/17';
const updateDate = updateRaw.replaceAll('/', '-');
const total = toNumber(summary[4]);
const repertoire = toNumber(summary[10]) || toNumber(summary[7]) || summaryNumber(summary, 5);
const streamCount = toNumber(summary[11]) || toNumber(summary[8]) || summaryNumber(summary, 6);
const avgPerStream = toNumber(summary[12]) || toNumber(summary[9]) || toNumber(summary[7]);
const genreMap = loadGenreMap();

const songs = rows.slice(2)
  .map((row) => {
    const sourceIndex = toNumber(row[0]);
    const title = clean(row[1]);
    const reading = clean(row[2]);
    const artist = clean(row[3]) || '(不明)';
    const count = toNumber(row[4]);
    if (!title) return null;
    const genre = genreMap.get(makeKey(title, artist))
      || genreMap.get(`${normalizeLookupText(title)}__${normalizeLookupText(artist)}`)
      || songToGenre(title, artist);
    return {
      sourceIndex,
      title,
      reading,
      artist,
      count,
      key: makeKey(title, artist),
      displayKey: '',
      keyText: '',
      genre,
      genreText: genre,
      channels: ['new'],
    };
  })
  .filter(Boolean);

const songByKey = new Map(songs.map((song) => [song.key, song]));
const songByTitleArtist = new Map(songs.map((song) => [
  `${normalizeLookupText(song.title)}__${normalizeLookupText(song.artist)}`,
  song,
]));
const songByTitle = new Map();
let nextVersionSourceIndex = Math.max(0, ...songs.map((song) => song.sourceIndex || 0)) + 1;

function indexSong(song) {
  songByKey.set(song.key, song);
  songByTitleArtist.set(`${normalizeLookupText(song.title)}__${normalizeLookupText(song.artist)}`, song);
  const titleKey = normalizeLookupText(song.title);
  if (!songByTitle.has(titleKey)) songByTitle.set(titleKey, []);
  if (!songByTitle.get(titleKey).includes(song)) songByTitle.get(titleKey).push(song);
}

for (const song of songs) indexSong(song);

function ensureVersionSong(parsed, baseSong) {
  const artist = parsed.artist && parsed.artist !== '(不明)' ? parsed.artist : baseSong.artist;
  const key = makeKey(parsed.title, artist);
  const existing = songByKey.get(key);
  if (existing) {
    existing.count += 1;
    return existing;
  }
  const song = {
    sourceIndex: nextVersionSourceIndex++,
    title: parsed.title,
    reading: '',
    artist,
    count: 1,
    key,
    displayKey: '',
    keyText: '',
    genre: baseSong.genre || songToGenre(parsed.title, artist),
    genreText: baseSong.genre || songToGenre(parsed.title, artist),
    channels: ['new'],
  };
  songs.push(song);
  indexSong(song);
  return song;
}

function resolveSong(raw) {
  const parsed = splitSongRaw(raw);
  const directKey = makeKey(parsed.title, parsed.artist);
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
  if (!fs.existsSync(setlistCsvPath)) return [];
  const setlistRows = parseCsv(fs.readFileSync(setlistCsvPath, 'utf8'));
  const dates = setlistRows[1] || [];
  const titles = setlistRows[2] || [];
  const urls = setlistRows[3] || [];
  const counts = setlistRows[4] || [];
  const streams = [];

  for (let col = 1; col < dates.length; col += 1) {
    const dateCell = clean(dates[col]);
    const title = clean(titles[col]);
    const url = clean(urls[col]);
    if (!dateCell && !title && !url) continue;

    const { dateRaw, date } = normalizeDate(dateCell);
    const streamSongs = [];
    for (let row = 5; row < setlistRows.length; row += 1) {
      const raw = clean(setlistRows[row]?.[col]);
      if (!raw) continue;
      const { song, parsed } = resolveSong(raw);
      streamSongs.push({
        key: song?.key || makeKey(parsed.title, parsed.artist),
        title: song?.title || parsed.title,
        artist: song?.artist || parsed.artist,
        raw,
      });
    }

    streams.push({
      index: col,
      channel: 'new',
      dateRaw,
      date,
      title,
      url,
      songCount: toNumber(counts[col]) || streamSongs.length,
      songs: streamSongs,
    });
  }

  return streams;
}

function loadLives() {
  return [];
}

const streamItems = loadStreams();
const liveItems = loadLives();
const generatedAt = new Date().toISOString();

const stats = {
  title: siteTitle,
  updateText: `更新日：${updateRaw}`,
  updateDate,
  total: total || songs.reduce((sum, song) => sum + song.count, 0),
  repertoire: songs.length || repertoire,
  streams: streamItems.length || streamCount,
  avgPerStream,
  channelId: 'new',
  channelLabel: '歌った曲リスト',
  keyPublished: false,
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'songs.json'), `${JSON.stringify({
  generatedAt,
  channels: { new: songs },
}, null, 2)}\n`);
fs.writeFileSync(path.join(dataDir, 'streams.json'), `${JSON.stringify({
  generatedAt,
  channels: { new: streamItems },
}, null, 2)}\n`);
fs.writeFileSync(path.join(dataDir, 'lives.json'), `${JSON.stringify({
  generatedAt,
  stats: {
    totalLives: liveItems.length,
    totalSongs: liveItems.reduce((sum, live) => sum + live.songs.length, 0),
    latestDate: liveItems[0]?.date || '',
  },
  lives: liveItems,
}, null, 2)}\n`);
fs.writeFileSync(path.join(dataDir, 'meta.json'), `${JSON.stringify({
  generatedAt,
  channels: { new: stats },
  combined: stats,
}, null, 2)}\n`);

console.log(`Converted ${songs.length} songs, ${streamItems.length} streams, and ${liveItems.length} lives`);

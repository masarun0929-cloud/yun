import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'data');
const REQUIRED_ENV = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID'];

function normalize(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').normalize('NFKC');
}

function monthKey(dateText) {
  return dateText ? String(dateText).slice(0, 7) : '';
}

function originalKeywords() {
  return String(process.env.ORIGINAL_GENRE_KEYWORDS || 'さざなみゆん,ゆん,Sazanami Yun')
    .split(',')
    .map((item) => normalize(item).toLowerCase())
    .filter(Boolean);
}

function inferGenre(title, artist) {
  const text = `${normalize(title)} ${normalize(artist)}`.toLowerCase();
  if (!text.trim()) return '未分類';
  if (originalKeywords().some((keyword) => text.includes(keyword))) return 'オリジナル';
  if (/(初音ミク|鏡音|巡音|gumi|可不|flower|vocaloid|deco\*27|kanaria|ナユタン|wowaka|ピノキオピー|ハチ|neru|orangestar|かいりきベア|みきとp|n-buna|syudou|すりぃ|いよわ)/i.test(text)) return 'ボカロ';
  if (/(残酷な天使|god knows|butter-fly|unravel|only my railgun|アイドル|花の塔|おジャ魔女|ムーンライト伝説|創聖のアクエリオン|コネクト|炎|勇者|青のすみか)/i.test(text)) return 'アニソン';
  if (/(=love|fruits zipper|cutie street|akb48|b小町|しぐれうい|アイドル|ファンサ)/i.test(text)) return 'アイドル';
  if (/(童謡|唱歌|アンパンマン|ハム太郎|崖の上のポニョ|勇気100%)/i.test(text)) return '童謡・唱歌';
  return 'J-POP';
}

async function d1(sql, params = []) {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((item) => item.message).join('; ') || JSON.stringify(payload);
    throw new Error(`D1 query failed: ${message}`);
  }
  const result = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  if (result?.success === false) throw new Error(`D1 SQL failed: ${JSON.stringify(result)}`);
  return result?.results || [];
}

const select = (table, orderBy) => d1(`SELECT * FROM ${table} ORDER BY ${orderBy}`);

function assignRanks(songs) {
  const sorted = [...songs].sort((a, b) => b.count - a.count);
  let previousCount = null;
  let previousRank = 0;
  sorted.forEach((song, index) => {
    if (previousCount !== null && song.count === previousCount) {
      song.rank = previousRank;
    } else {
      song.rank = index + 1;
      previousRank = song.rank;
    }
    previousCount = song.count;
  });
}

function deriveArtists(songs) {
  const byArtist = new Map();
  for (const song of songs) {
    const artist = song.artist || '(不明)';
    if (!byArtist.has(artist)) byArtist.set(artist, { artist, songs: [], totalCount: 0, songCount: 0 });
    const item = byArtist.get(artist);
    item.songs.push(song);
    item.totalCount += song.count;
    item.songCount += 1;
  }
  return Array.from(byArtist.values()).sort((a, b) => b.totalCount - a.totalCount);
}

function buildDataset(channel, tables) {
  const statsBySong = new Map(
    tables.song_channel_stats
      .filter((row) => row.channel_id === channel.id)
      .map((row) => [row.song_id, row]),
  );
  const artistsById = new Map(tables.artists.map((row) => [row.id, row]));
  const songsById = new Map(tables.songs.map((row) => [row.id, row]));
  const streamSongsByStreamId = new Map();
  for (const row of tables.stream_songs) {
    if (!streamSongsByStreamId.has(row.stream_id)) streamSongsByStreamId.set(row.stream_id, []);
    streamSongsByStreamId.get(row.stream_id).push(row);
  }
  for (const rows of streamSongsByStreamId.values()) rows.sort((a, b) => a.position - b.position);

  const streams = tables.streams
    .filter((row) => row.channel_id === channel.id)
    .map((stream) => {
      const date = stream.streamed_on;
      const streamSongs = (streamSongsByStreamId.get(stream.id) || []).map((row) => {
        const song = songsById.get(row.song_id);
        return {
          title: normalize(song?.title || row.title_snapshot),
          artist: normalize(artistsById.get(song?.artist_id)?.name || row.artist_snapshot),
          key: song?.song_key || row.song_key_snapshot,
          raw: row.raw_text || '',
        };
      });
      const jsDate = new Date(`${date}T00:00:00`);
      return {
        index: stream.source_index || 0,
        channel: channel.code,
        dateRaw: date ? date.replaceAll('-', '/') : '',
        date,
        title: normalize(stream.title),
        url: stream.url || '',
        songCount: stream.song_count || streamSongs.length,
        songs: streamSongs,
        monthKey: monthKey(date),
        year: date ? Number(date.slice(0, 4)) : null,
        month: date ? Number(date.slice(5, 7)) : null,
        dayOfWeek: Number.isNaN(jsDate.getTime()) ? null : jsDate.getDay(),
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const songs = Array.from(statsBySong.values()).map((stat) => {
    const song = songsById.get(stat.song_id);
    const artist = artistsById.get(song?.artist_id);
    const displayKey = normalize(song?.display_key || '');
    const genre = normalize(song?.genre || '') || inferGenre(song?.title, artist?.name);
    return {
      sourceIndex: stat.source_index || 0,
      title: normalize(song?.title),
      artist: normalize(artist?.name),
      count: stat.sing_count || 0,
      key: song?.song_key || '',
      displayKey,
      keyText: displayKey,
      genre,
      genreText: genre,
      channels: [channel.code],
      dates: [],
      streamRefs: [],
      lastSung: null,
      firstSung: null,
      daysSinceLast: null,
      rank: 0,
    };
  });

  assignRanks(songs);
  const total = songs.reduce((sum, song) => sum + song.count, 0);
  const newestStream = streams[0]?.date || null;
  return {
    stats: {
      title: channel.name,
      updateText: newestStream ? `更新日：${newestStream.replaceAll('-', '/')}` : '',
      updateDate: newestStream,
      total,
      repertoire: songs.length,
      streams: streams.length,
      avgPerStream: streams.length ? Math.round((total / streams.length) * 10) / 10 : 0,
      channelId: channel.code,
      channelLabel: channel.name,
      keyPublished: tables.songs.some((row) => normalize(row.display_key || '')),
    },
    songs,
    streams,
    orphans: [],
    artists: deriveArtists(songs),
  };
}

function mergeChannels(datasets) {
  const songMap = new Map();
  const streams = [];
  for (const dataset of datasets) {
    for (const song of dataset.songs) {
      const existing = songMap.get(song.key);
      if (existing) {
        existing.count += song.count;
        existing.channels = Array.from(new Set([...existing.channels, ...song.channels]));
      } else {
        songMap.set(song.key, { ...song, channels: [...song.channels], dates: [], streamRefs: [] });
      }
    }
    streams.push(...dataset.streams);
  }
  streams.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const songs = Array.from(songMap.values());
  assignRanks(songs);
  const total = datasets.reduce((sum, dataset) => sum + dataset.stats.total, 0);
  const newestStream = streams[0]?.date || null;
  return {
    stats: {
      title: '全期間',
      updateText: newestStream ? `更新日：${newestStream.replaceAll('-', '/')}` : '',
      updateDate: newestStream,
      total,
      repertoire: songs.length,
      streams: datasets.reduce((sum, dataset) => sum + dataset.stats.streams, 0),
      avgPerStream: streams.length ? Math.round((total / streams.length) * 10) / 10 : 0,
      channelId: 'all',
      channelLabel: '全期間',
      keyPublished: datasets.some((dataset) => dataset.stats.keyPublished),
    },
    songs,
    streams,
    orphans: [],
    artists: deriveArtists(songs),
  };
}

function buildLives(tables) {
  return {
    stats: { totalLives: 0, totalSongs: 0, latestDate: '' },
    lives: [],
  };
}

async function main() {
  const [channels, artists, songs, streams, streamSongs, songChannelStats] = await Promise.all([
    select('channels', 'sort_order ASC, id ASC'),
    select('artists', 'id ASC'),
    select('songs', 'id ASC'),
    select('streams', 'channel_id ASC, streamed_on DESC, id ASC'),
    select('stream_songs', 'stream_id ASC, position ASC, id ASC'),
    select('song_channel_stats', 'channel_id ASC, song_id ASC'),
  ]);
  const tables = { artists, songs, streams, stream_songs: streamSongs, song_channel_stats: songChannelStats };
  const channelDatasets = Object.fromEntries(channels.map((channel) => [channel.code, buildDataset(channel, tables)]));
  const combined = mergeChannels(Object.values(channelDatasets));
  const liveData = buildLives(tables);
  const generatedAt = new Date().toISOString();

  const split = {
    meta: { generatedAt, channels: Object.fromEntries(Object.entries(channelDatasets).map(([code, dataset]) => [code, dataset.stats])), combined: combined.stats },
    songs: { generatedAt, channels: Object.fromEntries(Object.entries(channelDatasets).map(([code, dataset]) => [code, dataset.songs])) },
    streams: { generatedAt, channels: Object.fromEntries(Object.entries(channelDatasets).map(([code, dataset]) => [code, dataset.streams])) },
    lives: { generatedAt, stats: liveData.stats, lives: liveData.lives },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, value] of Object.entries(split)) {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(value)}\n`, 'utf8');
  }
  console.log(`Generated docs/data from D1: ${combined.stats.repertoire} songs, ${combined.stats.streams} streams`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

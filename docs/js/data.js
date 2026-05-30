import { daysSince } from './utils.js';
import { SHOW_SONG_KEYS } from './config.js';

const STATIC_URLS = {
  meta: '/data/meta.json',
  songs: '/data/songs.json',
  streams: '/data/streams.json',
  lives: '/data/lives.json',
};
const FALLBACK_URL = '/api/data';

function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim().replaceAll('/', '-');
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3]);
  date.setHours(0, 0, 0, 0);
  return date;
}

function assignRanks(songs) {
  const sorted = [...songs].sort((a, b) => b.count - a.count);
  let prev = null;
  let prevRank = 0;
  sorted.forEach((song, i) => {
    if (prev !== null && song.count === prev) {
      song.rank = prevRank;
    } else {
      song.rank = i + 1;
      prevRank = song.rank;
    }
    prev = song.count;
  });
}

function deriveArtists(songs) {
  const byArtist = new Map();
  for (const song of songs) {
    const artist = song.artist || '(不明)';
    if (!byArtist.has(artist)) {
      byArtist.set(artist, { artist, songs: [], totalCount: 0, songCount: 0 });
    }
    const item = byArtist.get(artist);
    item.songs.push(song);
    item.totalCount += song.count;
    item.songCount += 1;
  }
  return Array.from(byArtist.values()).sort((a, b) => b.totalCount - a.totalCount);
}

function mergeChannels(datasets, baseStats = {}) {
  const songMap = new Map();
  const streams = [];
  for (const dataset of datasets) {
    for (const song of dataset.songs || []) {
      const existing = songMap.get(song.key);
      if (existing) {
        existing.count += song.count;
        existing.channels = Array.from(new Set([...existing.channels, ...song.channels]));
        if (!existing.displayKey && song.displayKey) {
          existing.displayKey = song.displayKey;
          existing.keyText = song.displayKey;
        }
        if (!existing.genre || existing.genre === '未分類') {
          existing.genre = song.genre || existing.genre;
          existing.genreText = existing.genre;
        }
      } else {
        songMap.set(song.key, {
          ...song,
          channels: [...song.channels],
          dates: [],
          streamRefs: [],
        });
      }
    }
    streams.push(...(dataset.streams || []));
  }

  streams.sort((a, b) => (b.date || 0) - (a.date || 0));
  const refsBySongKey = new Map();
  for (const stream of streams) {
    for (const song of stream.songs || []) {
      if (!refsBySongKey.has(song.key)) refsBySongKey.set(song.key, []);
      refsBySongKey.get(song.key).push(stream);
    }
  }

  for (const song of songMap.values()) {
    const refs = refsBySongKey.get(song.key) || [];
    const dates = refs.map((stream) => stream.date).filter(Boolean).sort((a, b) => b - a);
    song.streamRefs = refs;
    song.dates = dates;
    song.lastSung = dates[0] || null;
    song.firstSung = dates[dates.length - 1] || null;
    song.daysSinceLast = daysSince(song.lastSung);
  }

  const songs = Array.from(songMap.values());
  assignRanks(songs);
  const total = datasets.reduce((sum, dataset) => sum + (dataset.stats?.total || 0), 0);
  const newestStream = streams[0]?.date || null;
  const stats = {
    title: '全期間',
    updateText: newestStream ? `更新日：${fmtApiDate(newestStream)}` : '',
    updateDate: newestStream,
    total,
    repertoire: songs.length,
    streams: datasets.reduce((sum, dataset) => sum + (dataset.stats?.streams || 0), 0),
    avgPerStream: streams.length ? Math.round((total / streams.length) * 10) / 10 : 0,
    channelId: 'all',
    channelLabel: '全期間',
    keyPublished: datasets.some((dataset) => dataset.stats?.keyPublished),
    ...baseStats,
  };
  if (typeof stats.updateDate === 'string') stats.updateDate = parseApiDate(stats.updateDate);
  return { stats, songs, streams, orphans: [], artists: deriveArtists(songs) };
}

function fmtApiDate(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function inferSeasonTags(song) {
  const text = `${song.title || ''} ${song.artist || ''}`.toLowerCase();
  const tags = [];
  const push = (name, re) => { if (re.test(text)) tags.push(name); };
  push('春', /春|桜|さくら|卒業|花に亡霊|春泥棒|桜ノ雨|桜流し|チェリー/);
  push('夏', /夏|サマー|花火|海|青と夏|夏色|君と夏フェス|夏祭り|金魚花火|打上花火/);
  push('秋', /秋|紅葉|月|十五夜|金木犀|晩餐歌/);
  push('冬', /冬|雪|クリスマス|白い|粉雪|スノー|snow|ジングル|メリクリ|雪の華/);
  push('雨', /雨|レイン|rain|傘|カプチーノ|rain stops/);
  push('夜', /夜|月|星|スター|midnight|ナイト|夜明け|夜に|夜もすがら|ベテルギウス/);
  push('恋愛', /恋|愛|好き|ラブ|love|告白|プロポーズ|ダーリン|貴方|あなた|恋人/);
  push('イベント', /バレンタイン|クリスマス|ハロウィン|誕生日|birthday|ジングル|チョコ/);
  return Array.from(new Set(tags));
}

function inferMoodTags(song) {
  const text = `${song.title || ''} ${song.artist || ''} ${song.genre || ''}`.toLowerCase();
  const tags = [];
  const push = (name, re) => { if (re.test(text)) tags.push(name); };
  push('盛り上がる', /ロキ|ヒバナ|チュルリラ|天使|お願い|革命|メルト|アイドル|うまぴょい|サンバ|夏色|おジャ魔女|only my railgun|internet/);
  push('しっとり', /雨|夜|月|花に亡霊|少女レイ|たばこ|猫|lemon|裸の心|水平線|勿忘|ベテルギウス|糸|奏|炎|雪の華/);
  push('かわいい', /可愛|かわいい|kawaii|恋愛サーキュレーション|白金ディスコ|だだだだ|だいしきゅー|きゅうくらりん|おじゃま虫|バレンタイン|sweets parade/);
  push('かっこいい', /残響散歌|brave shine|i beg you|名前のない怪物|unravel|asphyxia|踊|怪物|インフェルノ|革命|ch4nge|g4l|overdose/);
  push('懐かしい', /secret base|butter-fly|タッチ|ムーンライト伝説|god knows|創聖|アクエリオン|ラムのラブソング|チェリー|そばかす|残酷な天使/);
  if (!tags.length && /ボカロ|アニソン|アイドル/.test(text)) tags.push(song.genre);
  return Array.from(new Set(tags));
}

function singerTags(song) {
  const tags = [];
  if (SHOW_SONG_KEYS && song.displayKey) tags.push('キー確認済み');
  if (song.count >= 10) tags.push('定番');
  if (song.daysSinceLast != null && song.daysSinceLast >= 180) tags.push('久しぶり候補');
  if (song.count <= 1) tags.push('レア');
  return tags;
}

function trendLabel(song) {
  if (!song.lastSung) return '履歴未確認';
  if (song.daysSinceLast <= 30) return '最近';
  if (song.daysSinceLast >= 365) return '超久しぶり';
  if (song.daysSinceLast >= 180) return '久しぶり';
  if (song.count <= 1) return 'レア';
  if (song.count >= 10) return '定番';
  return '通常';
}

function hydrateDataset(dataset) {
  if (!dataset) return null;

  dataset.stats = dataset.stats || {};
  dataset.stats.updateDate = parseApiDate(dataset.stats.updateDate);
  dataset.stats.keyPublished = !!dataset.stats.keyPublished;
  dataset.songs = dataset.songs || [];
  dataset.streams = dataset.streams || [];
  dataset.orphans = dataset.orphans || [];
  dataset.artists = dataset.artists || [];

  for (const stream of dataset.streams) {
    stream.date = parseApiDate(stream.date);
    stream.monthKey = stream.monthKey || (
      stream.date
        ? `${stream.date.getFullYear()}-${String(stream.date.getMonth() + 1).padStart(2, '0')}`
        : ''
    );
    stream.year = stream.year || stream.date?.getFullYear() || null;
    stream.month = stream.month || (stream.date ? stream.date.getMonth() + 1 : null);
    stream.dayOfWeek = stream.dayOfWeek ?? (stream.date ? stream.date.getDay() : null);
    stream.songs = stream.songs || [];
  }
  dataset.streams.sort((a, b) => (b.date || 0) - (a.date || 0));

  const songByKey = new Map();
  for (const song of dataset.songs) {
    song.displayKey = song.displayKey || '';
    song.keyText = song.keyText || song.displayKey;
    song.genre = song.genre || '未分類';
    song.genreText = song.genreText || song.genre;
    song.channels = Array.isArray(song.channels) ? song.channels : Array.from(song.channels || []);
    song.count = Number(song.count || 0);
    songByKey.set(song.key, song);
  }

  for (const stream of dataset.streams) {
    stream.songs = (stream.songs || []).map((item) => {
      const song = songByKey.get(item.key);
      return {
        title: item.title || song?.title || '',
        artist: item.artist || song?.artist || '',
        key: item.key || song?.key || '',
        raw: item.raw || '',
      };
    });
  }

  const refsBySongKey = new Map();
  for (const stream of dataset.streams) {
    for (const song of stream.songs) {
      if (!refsBySongKey.has(song.key)) refsBySongKey.set(song.key, []);
      refsBySongKey.get(song.key).push(stream);
    }
  }

  for (const song of dataset.songs) {
    const refs = refsBySongKey.get(song.key) || [];
    const dates = refs.map((stream) => stream.date).filter(Boolean).sort((a, b) => b - a);
    song.seasonTags = inferSeasonTags(song);
    song.seasonText = song.seasonTags.join(' ');
    song.moodTags = inferMoodTags(song);
    song.moodText = song.moodTags.join(' ');
    song.streamRefs = refs;
    song.dates = dates;
    song.lastSung = dates[0] || null;
    song.firstSung = dates[dates.length - 1] || null;
    song.daysSinceLast = daysSince(song.lastSung);
    song.trend = trendLabel(song);
    song.singerTags = singerTags(song);
    song.tagText = [
      song.seasonText,
      song.moodText,
      song.singerTags.join(' '),
      song.trend,
    ].filter(Boolean).join(' ');
  }
  assignRanks(dataset.songs);
  dataset.artists = deriveArtists(dataset.songs);

  return dataset;
}

function hydratePayload(payload) {
  const channels = payload.channels || {};
  for (const key of Object.keys(channels)) {
    channels[key] = hydrateDataset(channels[key]);
  }
  const combined = payload.combined?.songs
    ? hydrateDataset(payload.combined)
    : mergeChannels(Object.values(channels), payload.combined?.stats || {});
  return {
    channels,
    combined,
    lives: hydrateLives(payload.lives || []),
    liveStats: payload.liveStats || {},
  };
}

function hydrateLives(lives) {
  return (lives || [])
    .map((live) => ({
      ...live,
      date: parseApiDate(live.date),
      songs: (live.songs || []).map((song, index) => ({
        position: song.position || index + 1,
        title: song.title || '',
        artist: song.artist || '',
        key: song.key || '',
        raw: song.raw || '',
      })),
    }))
    .sort((a, b) => (b.date || 0) - (a.date || 0));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadStaticSplit() {
  const [meta, songs, streams, lives] = await Promise.all([
    fetchJson(STATIC_URLS.meta),
    fetchJson(STATIC_URLS.songs),
    fetchJson(STATIC_URLS.streams),
    fetchJson(STATIC_URLS.lives).catch(() => ({ lives: [], stats: {} })),
  ]);
  const channels = {};
  const codes = new Set([
    ...Object.keys(meta.channels || {}),
    ...Object.keys(songs.channels || {}),
    ...Object.keys(streams.channels || {}),
  ]);
  for (const code of codes) {
    channels[code] = {
      stats: { ...(meta.channels?.[code] || {}), generatedAt: meta.generatedAt || '' },
      songs: songs.channels?.[code] || [],
      streams: streams.channels?.[code] || [],
      orphans: [],
      artists: [],
    };
  }
  return hydratePayload({
    channels,
    combined: { stats: { ...(meta.combined || {}), generatedAt: meta.generatedAt || '' } },
    lives: lives.lives || [],
    liveStats: lives.stats || {},
  });
}

async function loadFallbackApi() {
  const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error ? `: ${body.error}` : '';
    } catch (_) {
      detail = `: HTTP ${res.status}`;
    }
    throw new Error(`${FALLBACK_URL}${detail}`);
  }
  return hydratePayload(await res.json());
}

export async function loadAll() {
  try {
    return await loadStaticSplit();
  } catch (staticError) {
    try {
      return await loadFallbackApi();
    } catch (fallbackError) {
      throw new Error(`APIからデータを取得できませんでした: ${staticError.message}; ${fallbackError.message}`);
    }
  }
}

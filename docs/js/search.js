import { normalize } from './utils.js';
import { SHOW_SONG_KEYS } from './config.js';

const fuseOptions = {
  keys: [
    { name: 'title', weight: 0.65 },
    { name: 'artist', weight: 0.35 },
    { name: 'genreText', weight: 0.18 },
    { name: 'tagText', weight: 0.14 },
    ...(SHOW_SONG_KEYS ? [{ name: 'keyText', weight: 0.1 }] : []),
  ],
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 1,
  includeScore: true,
};

let fuse = null;
let fuseCtor = null;
let fusePromise = null;
let songRef = null;
let indexToken = 0;

function loadFuse() {
  if (fuseCtor) return Promise.resolve(fuseCtor);
  if (!fusePromise) {
    fusePromise = import('fuse').then((module) => {
      fuseCtor = module.default;
      return fuseCtor;
    });
  }
  return fusePromise;
}

export function buildIndex(songs) {
  songRef = songs;
  fuse = null;
  const token = ++indexToken;
  const build = () => {
    loadFuse()
      .then((Fuse) => {
        if (token === indexToken && songRef === songs) fuse = new Fuse(songs, fuseOptions);
      })
      .catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(build, { timeout: 3000 });
  } else {
    window.setTimeout(build, 1500);
  }
}

const FIELD_RE = /(?<key>title|artist|genre|tag|mood|season|key|count|last|days)\s*(?<op>:|<=|>=|=|<|>)\s*(?<val>"[^"]*"|\S+)/gi;

function parseQuery(raw) {
  const filters = [];
  let rest = raw;
  rest = rest.replace(FIELD_RE, (m, key, op, val, ..._args) => {
    let v = val;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    filters.push({ key: key.toLowerCase(), op: op || ':', val: v });
    return ' ';
  });
  rest = rest.trim().replace(/\s+/g, ' ');
  const tokens = rest ? rest.split(' ') : [];
  return { tokens, filters };
}

function applyFieldFilters(songs, filters) {
  return songs.filter(song => {
    for (const f of filters) {
      const v = f.val;
      switch (f.key) {
        case 'title': {
          if (!normalize(song.title).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'artist': {
          if (!normalize(song.artist).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'genre': {
          if (!normalize(song.genreText || song.genre).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'key': {
          if (!SHOW_SONG_KEYS) return false;
          if (!normalize(song.keyText).toLowerCase().split(/\s+/).includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'tag': {
          if (!normalize(song.tagText).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'mood': {
          if (!normalize(song.moodText).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'season': {
          if (!normalize(song.seasonText).toLowerCase().includes(normalize(v).toLowerCase())) return false;
          break;
        }
        case 'count': {
          const n = parseFloat(v);
          if (Number.isNaN(n)) return false;
          if (!cmp(song.count, f.op, n)) return false;
          break;
        }
        case 'days': {
          const n = parseFloat(v);
          if (Number.isNaN(n)) return false;
          const d = song.daysSinceLast == null ? Infinity : song.daysSinceLast;
          if (!cmp(d, f.op, n)) return false;
          break;
        }
        case 'last': {
          if (v === 'never' || v === 'untouched') {
            if (song.lastSung) return false;
          } else if (v === 'fresh') {
            if (song.daysSinceLast == null || song.daysSinceLast > 30) return false;
          } else if (v === 'stale') {
            if (song.daysSinceLast == null || song.daysSinceLast < 180) return false;
          } else {
            const days = parseInt(String(v).replace(/d$/i, ''), 10);
            if (!Number.isNaN(days)) {
              const d = song.daysSinceLast == null ? Infinity : song.daysSinceLast;
              if (!cmp(d, f.op === ':' ? '<=' : f.op, days)) return false;
            }
          }
          break;
        }
      }
    }
    return true;
  });
}

function cmp(a, op, b) {
  switch (op) {
    case '>':  return a >  b;
    case '<':  return a <  b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '=':
    case ':':  return a == b;
  }
  return true;
}

export function search(rawQuery, fallbackSongs) {
  const songs = songRef || fallbackSongs || [];
  const q = (rawQuery || '').trim();
  if (!q) return { results: songs, tokens: [] };
  const { tokens, filters } = parseQuery(q);
  let pool = applyFieldFilters(songs, filters);
  if (!tokens.length) return { results: pool, tokens: [] };
  const phrase = tokens.join(' ');
  if (!fuseCtor) {
    loadFuse()
      .then((Fuse) => {
        if (!fuse && songRef) fuse = new Fuse(songRef, fuseOptions);
      })
      .catch(() => {});
    const needle = normalize(phrase).toLowerCase();
    return {
      results: pool.filter((song) => [
        song.title,
        song.artist,
        song.genreText || song.genre,
        song.tagText,
        ...(SHOW_SONG_KEYS ? [song.keyText] : []),
      ].some((value) => normalize(value).toLowerCase().includes(needle))),
      tokens,
    };
  }
  const fuseLocal = (pool === songs && fuse)
    ? fuse
    : new fuseCtor(pool, fuseOptions);
  const fuseResults = fuseLocal.search(phrase);
  return { results: fuseResults.map(r => r.item), tokens };
}

export function matchReasons(song, query) {
  const q = normalize(query).toLowerCase();
  if (!q) return [];
  const { tokens, filters } = parseQuery(q);
  const reasons = [];
  for (const f of filters) {
    if (!reasons.includes(f.key)) reasons.push(f.key);
  }
  const phrase = tokens.join(' ');
  if (phrase) {
    const contains = (value) => normalize(value).toLowerCase().includes(phrase);
    if (contains(song.title)) reasons.push('曲名');
    if (contains(song.artist)) reasons.push('アーティスト');
    if (contains(song.genreText || song.genre)) reasons.push('ジャンル');
    if (contains(song.tagText)) reasons.push('タグ');
    if (SHOW_SONG_KEYS && contains(song.keyText)) reasons.push('キー');
  }
  return Array.from(new Set(reasons)).slice(0, 4);
}

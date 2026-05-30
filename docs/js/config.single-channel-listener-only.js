// Single-channel template for listener mode only.
// To use it, copy this file over docs/js/config.js, then edit the placeholder values.
export const SITE = {
  creatorName: 'replace_with_vtuber_name',
  databaseName: '歌唱データベース',
  heroIcon: '🎙',
  tagline: '~ Singing Stream Analytics ~',
  editionLabel: 'Single Channel Edition',
  baseUrl: 'https://your-songlist.pages.dev',
  description: 'replace_with_vtuber_nameさんの歌った曲リスト、ランキング、歌枠タイムラインをまとめたファンメイド歌唱データベース。',
  fanLabel: 'replace_with_fan_label',
  contactUrl: 'https://example.com/contact',
  storagePrefix: 'replace-with-songlist',
  officialLinks: [
    { label: 'YouTube', url: 'https://www.youtube.com/@replace_with_channel_id', className: 'youtube' },
    { label: 'X', url: 'https://x.com/replace_with_x_id', className: 'x-link' },
  ],
};

export const SHEET_ID = 'replace_with_google_spreadsheet_id';

export const CHANNELS = {
  new: {
    id: 'new',
    label: 'メインch',
    listGid: '0',
    setlistGid: 'replace_with_main_setlist_gid',
  },
};

export const DEFAULT_CHANNEL = 'new';
export const COMBINED_CHANNEL = {
  id: 'all',
  label: '全期間',
};
export const SHOW_COMBINED_CHANNEL = false;
export const SHOW_AUDIENCE_SWITCH = false;
export const SHOW_SONG_KEYS = false;

export const ORIGINAL_GENRE_KEYWORDS = ['replace_with_vtuber_name', 'replace_with_unit_name'];

export const LIST_GID = CHANNELS.new.listGid;
export const SETLIST_GID = CHANNELS.new.setlistGid;

export const TIMELINE_INITIAL = 12;
export const TIMELINE_STEP = 12;
export const RANKING_LIST_LIMIT = 50;
export const TOP_ARTISTS_LIMIT = 20;
export const ACTIVITY_RECENT_LIMIT = 5;

export const DAYS_FRESH = 30;
export const DAYS_STALE = 180;

export const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

export const gvizUrl = (gid) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&_t=${Date.now()}`;

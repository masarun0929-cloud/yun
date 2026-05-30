create table if not exists channels (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists artists (
  id bigserial primary key,
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists songs (
  id bigserial primary key,
  title text not null,
  normalized_title text not null,
  artist_id bigint references artists(id) on delete set null,
  song_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists streams (
  id bigserial primary key,
  channel_id bigint not null references channels(id) on delete cascade,
  source_index integer,
  streamed_on date not null,
  title text,
  url text,
  url_key text not null default '',
  song_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(channel_id, streamed_on, url_key)
);

create table if not exists stream_songs (
  id bigserial primary key,
  stream_id bigint not null references streams(id) on delete cascade,
  song_id bigint references songs(id) on delete set null,
  position integer not null,
  raw_text text,
  title_snapshot text not null,
  artist_snapshot text,
  song_key_snapshot text not null,
  created_at timestamptz not null default now(),
  unique(stream_id, position)
);

create table if not exists song_channel_stats (
  song_id bigint not null references songs(id) on delete cascade,
  channel_id bigint not null references channels(id) on delete cascade,
  sing_count integer not null default 0,
  source_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_id, channel_id)
);

create index if not exists idx_songs_artist_id
  on songs(artist_id);

create index if not exists idx_streams_channel_date
  on streams(channel_id, streamed_on desc);

create index if not exists idx_stream_songs_stream_id
  on stream_songs(stream_id);

create index if not exists idx_stream_songs_song_id
  on stream_songs(song_id);

create index if not exists idx_song_channel_stats_channel_id
  on song_channel_stats(channel_id);

insert into channels (code, name, sort_order)
values
  ('new', 'メインch', 1),
  ('old', 'サブch', 2)
on conflict (code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order;

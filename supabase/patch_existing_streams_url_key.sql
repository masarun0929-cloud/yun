alter table streams
  add column if not exists url_key text not null default '';

update streams
set url_key = coalesce(url, '')
where url_key = '';

drop index if exists idx_streams_unique_channel_date_url;

create unique index if not exists idx_streams_unique_channel_date_url_key
  on streams(channel_id, streamed_on, url_key);

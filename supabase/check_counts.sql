select 'channels' as table_name, count(*) from channels
union all
select 'artists' as table_name, count(*) from artists
union all
select 'songs' as table_name, count(*) from songs
union all
select 'streams' as table_name, count(*) from streams
union all
select 'stream_songs' as table_name, count(*) from stream_songs
union all
select 'song_channel_stats' as table_name, count(*) from song_channel_stats;

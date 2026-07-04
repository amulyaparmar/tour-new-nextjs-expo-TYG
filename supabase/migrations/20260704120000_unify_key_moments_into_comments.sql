-- Unify user key moments into session_comments as kind = 'key_moment'
alter table session_comments
  add column if not exists kind text not null default 'comment'
  check (kind in ('comment', 'key_moment'));

create index if not exists session_comments_kind_idx on session_comments (session_id, kind, timestamp_sec);

-- Migrate any rows from the short-lived key moments table, then drop it
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'session_key_moments'
  ) then
    insert into session_comments (session_id, author_name, body, timestamp_sec, kind, created_at, updated_at)
    select session_id, author_name, label, timestamp_sec, 'key_moment', created_at, updated_at
    from session_key_moments;

    drop table session_key_moments;
  end if;
end $$;

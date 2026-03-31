alter table public.thoughts
add column if not exists status text not null default 'neutral';

update public.thoughts
set status = 'neutral'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thoughts_status_check'
  ) then
    alter table public.thoughts
    add constraint thoughts_status_check
    check (status in ('positive', 'neutral', 'negative'));
  end if;
end $$;

create index if not exists thoughts_status_date_idx
on public.thoughts (status, date desc);

create index if not exists thoughts_tag_lower_idx
on public.thoughts (lower(tag));

create index if not exists profiles_is_public_idx
on public.profiles (is_public);

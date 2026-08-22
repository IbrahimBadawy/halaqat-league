-- الإشراف على المجتمع: هوية الناشر (جهاز + حساب اختياري) وقائمة المحظورين.
-- الحذف والحظر عبر بوابة live-write (أدمن/مشرف فقط) — RLS يبقى مقفولًا.

alter table public.posts add column author_device text;
alter table public.posts add column author_user uuid
  references public.profiles (id) on delete set null;
create index posts_author_user_idx on public.posts (author_user);

create table public.banned_posters (
  id uuid primary key default gen_random_uuid(),
  device_key text,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null default 'إساءة',
  banned_username text, -- لقطة اسم وقت الحظر (للعرض حتى لو حُذف الحساب)
  created_at timestamptz not null default now()
);
create index banned_posters_device_idx on public.banned_posters (device_key);
create index banned_posters_user_idx on public.banned_posters (user_id);

alter table public.banned_posters enable row level security;

-- هل الحساب الحالي أدمن أو مشرف في أي دوري (أو مدير المنصة)؟
create or replace function public.is_moderator_anywhere()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select is_platform_admin from public.profiles
              where id = (select auth.uid())), false)
    or exists (
      select 1 from public.league_members lm
      where lm.user_id = (select auth.uid())
        and lm.status = 'active'
        and lm.roles && array['admin', 'moderator']
    );
$$;
revoke execute on function public.is_moderator_anywhere() from public, anon;
grant execute on function public.is_moderator_anywhere() to authenticated;

create policy "moderators read" on public.banned_posters
  for select to authenticated using (public.is_moderator_anywhere());

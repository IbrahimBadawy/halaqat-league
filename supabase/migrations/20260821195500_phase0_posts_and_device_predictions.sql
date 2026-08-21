-- المرحلة 0 — مجتمع مشترك وتوقعات بمفتاح جهاز (قبل الحسابات):
-- القراءة عامة، والكتابة تبقى حصريًا عبر بوابة live-write (service-role + PIN)

-- منشورات المجتمع: بلا حسابات بعد — اسم الكاتب نص حر، والإعجابات عدّاد بسيط
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  author_name text not null,
  text text not null,
  likes int not null default 0,
  created_at timestamptz not null default now()
);
create index posts_league_created_idx on public.posts (league_id, created_at desc);
alter table public.posts enable row level security;
create policy "public read" on public.posts for select to anon, authenticated using (true);

-- التوقعات تخمينات لعبة عامة — قراءتها للعرض والتجميع
create policy "phase0 public read" on public.predictions
  for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.posts, public.predictions;

-- زيادة إعجابات منشور ذريًا — تُستدعى من بوابة live-write فقط (service_role)
create or replace function public.bump_post_likes(p_post uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts set likes = likes + 1 where id = p_post;
$$;
revoke execute on function public.bump_post_likes(uuid) from public, anon, authenticated;
grant execute on function public.bump_post_likes(uuid) to service_role;

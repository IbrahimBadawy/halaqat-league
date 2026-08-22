-- الحسابات والانضمام للفرق:
-- 1) تغيير كلمة المرور الإجباري أول دخول (وبعد كل reset من الأدمن)
-- 2) نوع الحساب عند التسجيل الذاتي (زائر/لاعب)
-- 3) كود انضمام لكل فريق (مرئي للكابتن والأدمن فقط) + طلبات انضمام يقررها الكابتن

alter table public.profiles
  add column must_change_password boolean not null default false;
alter table public.profiles
  add column account_type text not null default 'fan'
  check (account_type in ('fan', 'player', 'staff'));

-- كل الحسابات الحالية سُلّمت كلماتها خارجيًا — تغيير إجباري عند أول دخول
update public.profiles set must_change_password = true, account_type = 'staff';

-- كود الانضمام في جدول منفصل حتى لا يظهر مع جدول teams العام
create table public.team_join_codes (
  team_id uuid primary key references public.teams (id) on delete cascade,
  code text unique not null
);
alter table public.team_join_codes enable row level security;
create policy "captain or admin read" on public.team_join_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id and t.captain_id = (select auth.uid())
    )
    or public.has_league_role(
      (select t.league_id from public.teams t where t.id = team_id),
      array['admin']
    )
  );

-- أكواد لفرق الدوري الحالي
insert into public.team_join_codes (team_id, code)
select id, upper(substr(md5(random()::text || id::text), 1, 6)) from public.teams;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz
);
-- طلب معلق واحد لكل مستخدم في كل مرة
create unique index join_requests_one_pending on public.join_requests (user_id)
  where status = 'pending';
create index join_requests_team_idx on public.join_requests (team_id);
create index join_requests_decider_idx on public.join_requests (decided_by);

alter table public.join_requests enable row level security;
-- يقرأ الطلب: صاحبه، كابتن الفريق، أدمن الدوري (الكتابة عبر البوابة فقط)
create policy "requester or captain or admin read" on public.join_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.captain_id = (select auth.uid())
    )
    or public.has_league_role(
      (select t.league_id from public.teams t where t.id = team_id),
      array['admin']
    )
  );

alter publication supabase_realtime add table public.join_requests;

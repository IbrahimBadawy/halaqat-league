-- دوري الحلقات — المخطط الأولي (المرحلة 0)
-- المبادئ من المواصفة §7/§8.4: النتيجة تُشتق من الأحداث (match_events.value)،
-- الترتيب يُحسب ولا يُخزن، matches تحمل دائمًا (اليوم المنطقي + الفترة + الملعب)،
-- الأطراف قد تكون placeholders (1A, W_semi_1) تُحل لاحقًا، RLS على كل جدول.

-- ————— الحسابات والعضوية —————

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  position text,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  slogan text,
  season text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  -- settings: rules (نقاط/مدد/كسر تعادل/إيقافات) + features + theme + slogans + match_days + slots
  settings jsonb not null default '{}'::jsonb,
  rules_text text,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  roles text[] not null default '{fan}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user_idx on public.league_members (user_id);

-- ————— الملاعب —————

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  notes text,
  -- all_slots=true: متاح دائمًا. false: الإتاحة من venue_availability فقط
  all_slots boolean not null default true,
  unique (league_id, name)
);

create table public.venue_availability (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  date date not null,
  slot text not null,
  unique (venue_id, date, slot)
);

-- ————— الفرق واللاعبون —————

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  short_code text not null, -- A1..B5 (رمز الموقع في المجموعة — يطابق الـ seed والواجهة)
  name text not null,
  group_code text,
  captain_id uuid references public.profiles (id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (league_id, short_code)
);
create index teams_captain_idx on public.teams (captain_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id), -- يُربط عند تفعيل الحسابات
  code text not null, -- معرف الـ seed (A1-4) للتوافق مع الواجهة الحالية
  shirt_number int not null,
  name text not null,
  position text not null default 'لاعب',
  created_at timestamptz not null default now(),
  unique (team_id, shirt_number),
  unique (team_id, code)
);
create index players_user_idx on public.players (user_id);

-- ————— هيكل البطولة والجدول —————

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  type text not null check (type in ('groups', 'round_robin', 'knockout', 'playoff')),
  order_no int not null,
  legs int not null default 1,
  config jsonb not null default '{}'::jsonb,
  unique (league_id, order_no)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  name text not null,
  unique (stage_id, name)
);

create table public.group_teams (
  group_id uuid not null references public.groups (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  seed_no int,
  primary key (group_id, team_id)
);
create index group_teams_team_idx on public.group_teams (team_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  group_id uuid references public.groups (id),
  code text not null, -- m1..m24 (يطابق الـ seed والواجهة)
  stage_kind text not null default 'group'
    check (stage_kind in ('group', 'semi_1', 'semi_2', 'third_place', 'final')),
  round_no int not null default 1, -- رقم الليلة
  match_day date not null, -- اليوم المنطقي: ما بعد منتصف الليل يتبع ليلته
  slot text not null,
  venue_id uuid not null references public.venues (id),
  home_side text not null, -- كود فريق أو placeholder (1A, W_semi_1...)
  away_side text not null,
  home_team_id uuid references public.teams (id), -- يُملأ عند حسم الطرف
  away_team_id uuid references public.teams (id),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'live', 'half_time', 'finished', 'approved',
               'postponed', 'cancelled', 'walkover')
  ),
  home_score int, -- كاش للعرض فقط — مصدر الحقيقة match_events
  away_score int,
  home_pens int,
  away_pens int,
  winner_team_id uuid references public.teams (id),
  duration_override_minutes int,
  locked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (league_id, code)
);
create index matches_stage_idx on public.matches (stage_id);
create index matches_group_idx on public.matches (group_id);
create index matches_venue_idx on public.matches (venue_id);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);
create index matches_winner_idx on public.matches (winner_team_id);
create index matches_day_idx on public.matches (league_id, match_day);

create table public.match_officials (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('referee', 'recorder', 'assistant')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  primary key (match_id, user_id, role)
);
create index match_officials_user_idx on public.match_officials (user_id);

create table public.match_lineups (
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  is_starter boolean not null default false,
  primary key (match_id, player_id)
);
create index match_lineups_team_idx on public.match_lineups (team_id);
create index match_lineups_player_idx on public.match_lineups (player_id);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  player_id uuid references public.players (id),
  secondary_player_id uuid references public.players (id), -- صانع الهدف أو البديل الداخل
  type text not null,
  subtype text,
  minute int not null default 1,
  period text not null default 'first' check (period in ('first', 'second', 'extra')),
  value int not null default 1, -- قيمة الهدف — كارت "الهدف بهدفين" يجعلها 2
  note text,
  meta jsonb not null default '{}'::jsonb,
  linked_to uuid references public.match_events (id) on delete cascade, -- طرد الإنذار الثاني
  power_card text, -- اسم الكارت المطبق أثره على هذا الحدث
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  edited_reason text,
  deleted_at timestamptz,
  deleted_reason text
);
create index match_events_match_idx on public.match_events (match_id);
create index match_events_team_idx on public.match_events (team_id);
create index match_events_player_idx on public.match_events (player_id);
create index match_events_secondary_idx on public.match_events (secondary_player_id);
create index match_events_linked_idx on public.match_events (linked_to);
create index match_events_creator_idx on public.match_events (created_by);

create table public.match_reports (
  match_id uuid primary key references public.matches (id) on delete cascade,
  motm_player_id uuid references public.players (id),
  referee_notes text,
  recorder_signed_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz
);
create index match_reports_motm_idx on public.match_reports (motm_player_id);
create index match_reports_approver_idx on public.match_reports (approved_by);

-- ————— الترتيب (تعديلات النقاط — الترتيب نفسه يُحسب ولا يُخزن) —————

create table public.standing_adjustments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  points int not null,
  reason text not null,
  source text not null default 'manual' check (source in ('card', 'discipline', 'manual')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index standing_adjustments_league_idx on public.standing_adjustments (league_id);
create index standing_adjustments_team_idx on public.standing_adjustments (team_id);

-- ————— كروت القوة —————

create table public.power_card_templates (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  icon text,
  description text,
  rarity text,
  effect_type text not null,
  params jsonb not null default '{}'::jsonb,
  usage_window text not null default 'live',
  max_per_match int not null default 1,
  unique (league_id, name)
);

create table public.team_cards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  template_id uuid not null references public.power_card_templates (id) on delete cascade,
  quantity int not null default 1,
  acquired_from text not null default 'initial',
  unique (team_id, template_id)
);
create index team_cards_template_idx on public.team_cards (template_id);

create table public.card_usages (
  id uuid primary key default gen_random_uuid(),
  team_card_id uuid not null references public.team_cards (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  requested_by uuid references public.profiles (id),
  status text not null default 'applied' check (
    status in ('requested', 'approved', 'rejected', 'applied', 'countered', 'cancelled')
  ),
  minute int,
  effect_snapshot jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index card_usages_team_card_idx on public.card_usages (team_card_id);
create index card_usages_match_idx on public.card_usages (match_id);
create index card_usages_requester_idx on public.card_usages (requested_by);

-- ————— التوقعات —————

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  device_key text, -- توقعات بلا حساب (المرحلة 0)
  home int not null,
  away int not null,
  points_awarded int,
  created_at timestamptz not null default now()
);
create unique index predictions_user_unique on public.predictions (match_id, user_id)
  where user_id is not null;
create unique index predictions_device_unique on public.predictions (match_id, device_key)
  where device_key is not null;
create index predictions_league_idx on public.predictions (league_id);
create index predictions_user_idx on public.predictions (user_id);

-- ————— سجل التدقيق —————

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  actor_role text, -- للمرحلة 0 (قبل الحسابات): الدور المحلي وقت الفعل
  action text not null,
  entity text not null,
  entity_id text,
  detail text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_league_idx on public.audit_log (league_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ————— دالة الصلاحيات + RLS —————

create or replace function public.has_league_role(p_league uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = p_league
      and lm.user_id = (select auth.uid())
      and lm.status = 'active'
      and lm.roles && p_roles
  );
$$;

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.venues enable row level security;
alter table public.venue_availability enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.stages enable row level security;
alter table public.groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.matches enable row level security;
alter table public.match_officials enable row level security;
alter table public.match_lineups enable row level security;
alter table public.match_events enable row level security;
alter table public.match_reports enable row level security;
alter table public.standing_adjustments enable row level security;
alter table public.power_card_templates enable row level security;
alter table public.team_cards enable row level security;
alter table public.card_usages enable row level security;
alter table public.predictions enable row level security;
alter table public.audit_log enable row level security;

-- قراءة عامة: منصة مجتمعية — الجداول العامة مقروءة للزائر
create policy "public read" on public.leagues for select to anon, authenticated using (true);
create policy "public read" on public.venues for select to anon, authenticated using (true);
create policy "public read" on public.venue_availability for select to anon, authenticated using (true);
create policy "public read" on public.teams for select to anon, authenticated using (true);
create policy "public read" on public.players for select to anon, authenticated using (true);
create policy "public read" on public.stages for select to anon, authenticated using (true);
create policy "public read" on public.groups for select to anon, authenticated using (true);
create policy "public read" on public.group_teams for select to anon, authenticated using (true);
create policy "public read" on public.matches for select to anon, authenticated using (true);
create policy "public read" on public.match_lineups for select to anon, authenticated using (true);
create policy "public read" on public.match_events for select to anon, authenticated using (true);
create policy "public read" on public.match_reports for select to anon, authenticated using (true);
create policy "public read" on public.standing_adjustments for select to anon, authenticated using (true);
create policy "public read" on public.power_card_templates for select to anon, authenticated using (true);
create policy "public read" on public.team_cards for select to anon, authenticated using (true);
create policy "public read" on public.card_usages for select to anon, authenticated using (true);

-- profiles: القراءة للمسجلين، وكل مستخدم يدير صفه
create policy "authenticated read" on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- league_members: القراءة للمسجلين، الإدارة للأدمن
create policy "authenticated read" on public.league_members for select to authenticated using (true);
create policy "admin write" on public.league_members for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));

-- كتابة كيانات الدوري: أدمن الدوري فقط
create policy "admin write" on public.leagues for all to authenticated
  using (public.has_league_role(id, array['admin']))
  with check (public.has_league_role(id, array['admin']));
create policy "admin write" on public.venues for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));
create policy "admin write" on public.venue_availability for all to authenticated
  using (public.has_league_role((select v.league_id from public.venues v where v.id = venue_id), array['admin']))
  with check (public.has_league_role((select v.league_id from public.venues v where v.id = venue_id), array['admin']));
create policy "admin write" on public.teams for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));
create policy "admin write" on public.players for all to authenticated
  using (public.has_league_role((select t.league_id from public.teams t where t.id = team_id), array['admin']))
  with check (public.has_league_role((select t.league_id from public.teams t where t.id = team_id), array['admin']));
create policy "admin write" on public.stages for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));
create policy "admin write" on public.groups for all to authenticated
  using (public.has_league_role((select s.league_id from public.stages s where s.id = stage_id), array['admin']))
  with check (public.has_league_role((select s.league_id from public.stages s where s.id = stage_id), array['admin']));
create policy "admin write" on public.group_teams for all to authenticated
  using (public.has_league_role((select s.league_id from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id), array['admin']))
  with check (public.has_league_role((select s.league_id from public.groups g join public.stages s on s.id = g.stage_id where g.id = group_id), array['admin']));
create policy "admin write" on public.power_card_templates for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));
create policy "admin write" on public.team_cards for all to authenticated
  using (public.has_league_role((select t.league_id from public.teams t where t.id = team_id), array['admin']))
  with check (public.has_league_role((select t.league_id from public.teams t where t.id = team_id), array['admin']));

-- المباريات: الأدمن يدير، والطاقم (حكم/مسجل) يحدّث الحالة والنتيجة
create policy "admin insert" on public.matches for insert to authenticated
  with check (public.has_league_role(league_id, array['admin']));
create policy "admin delete" on public.matches for delete to authenticated
  using (public.has_league_role(league_id, array['admin']));
create policy "staff update" on public.matches for update to authenticated
  using (public.has_league_role(league_id, array['admin', 'referee', 'recorder']))
  with check (public.has_league_role(league_id, array['admin', 'referee', 'recorder']));

create policy "admin write" on public.match_officials for all to authenticated
  using (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin']))
  with check (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin']));

create policy "staff write" on public.match_lineups for all to authenticated
  using (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']))
  with check (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']));

create policy "staff write" on public.match_events for all to authenticated
  using (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']))
  with check (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']));

create policy "staff write" on public.match_reports for all to authenticated
  using (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']))
  with check (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']));

create policy "staff write" on public.card_usages for all to authenticated
  using (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']))
  with check (public.has_league_role((select m.league_id from public.matches m where m.id = match_id), array['admin', 'referee', 'recorder']));

-- تعديلات النقاط: أدمن فقط
create policy "admin write" on public.standing_adjustments for all to authenticated
  using (public.has_league_role(league_id, array['admin']))
  with check (public.has_league_role(league_id, array['admin']));

-- التوقعات: كل مستخدم يدير توقعاته فقط
create policy "read own" on public.predictions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own" on public.predictions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own" on public.predictions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- سجل التدقيق: يكتبه الطاقم، ويقرؤه أدمن الدوري فقط
create policy "admin read" on public.audit_log for select to authenticated
  using (league_id is not null and public.has_league_role(league_id, array['admin', 'moderator']));
create policy "staff insert" on public.audit_log for insert to authenticated
  with check (league_id is not null and public.has_league_role(league_id, array['admin', 'moderator', 'referee', 'recorder']));

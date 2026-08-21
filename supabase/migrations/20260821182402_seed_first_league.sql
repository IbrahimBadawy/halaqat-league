-- بذر الدوري الحقيقي: دوري الحلقات — صيف 2026
-- المصدر: data/first-league.json (نفس الأكواد m1..m24 وA1..B5 المستخدمة في الواجهة)

do $$
declare
  v_league uuid;
  v_stage_groups uuid;
  v_stage_ko uuid;
  v_group_a uuid;
  v_group_b uuid;
  v_team record;
  v_n int;
  f jsonb;
  i int := 0;
  v_group uuid;
  v_stage uuid;
  fixtures jsonb := $j$[
    {"day":"2026-08-21","slot":"23:00","venue":"ملعب 1","home":"A1","away":"A2"},
    {"day":"2026-08-21","slot":"23:20","venue":"ملعب 1","home":"B1","away":"B2"},
    {"day":"2026-08-21","slot":"23:40","venue":"ملعب 1","home":"A1","away":"A3"},
    {"day":"2026-08-21","slot":"00:00","venue":"ملعب 1","home":"B1","away":"B3"},
    {"day":"2026-08-21","slot":"00:20","venue":"ملعب 1","home":"A4","away":"A5"},
    {"day":"2026-08-21","slot":"00:40","venue":"ملعب 1","home":"B4","away":"B5"},
    {"day":"2026-08-28","slot":"23:00","venue":"ملعب 1","home":"A2","away":"A3"},
    {"day":"2026-08-28","slot":"23:20","venue":"ملعب 1","home":"B2","away":"B3"},
    {"day":"2026-08-28","slot":"23:40","venue":"ملعب 1","home":"A2","away":"A4"},
    {"day":"2026-08-28","slot":"00:00","venue":"ملعب 1","home":"B2","away":"B4"},
    {"day":"2026-08-28","slot":"00:20","venue":"ملعب 1","home":"A1","away":"A5"},
    {"day":"2026-08-28","slot":"00:40","venue":"ملعب 1","home":"B1","away":"B5"},
    {"day":"2026-09-04","slot":"23:00","venue":"ملعب 1","home":"A1","away":"A4"},
    {"day":"2026-09-04","slot":"23:20","venue":"ملعب 1","home":"B1","away":"B4"},
    {"day":"2026-09-04","slot":"23:40","venue":"ملعب 1","home":"A3","away":"A4"},
    {"day":"2026-09-04","slot":"23:40","venue":"ملعب 2","home":"A2","away":"A5"},
    {"day":"2026-09-04","slot":"00:00","venue":"ملعب 1","home":"B3","away":"B4"},
    {"day":"2026-09-04","slot":"00:00","venue":"ملعب 2","home":"B2","away":"B5"},
    {"day":"2026-09-04","slot":"00:20","venue":"ملعب 1","home":"A3","away":"A5"},
    {"day":"2026-09-04","slot":"00:40","venue":"ملعب 1","home":"B3","away":"B5"},
    {"day":"2026-09-11","slot":"23:00","venue":"ملعب 1","stage":"semi_1","home":"1A","away":"2B"},
    {"day":"2026-09-11","slot":"23:00","venue":"ملعب 2","stage":"semi_2","home":"1B","away":"2A"},
    {"day":"2026-09-11","slot":"00:00","venue":"ملعب 1","stage":"third_place","home":"L_semi_1","away":"L_semi_2"},
    {"day":"2026-09-11","slot":"00:30","venue":"ملعب 1","stage":"final","home":"W_semi_1","away":"W_semi_2","dur":30}
  ]$j$::jsonb;
begin
  -- الدوري
  insert into public.leagues (slug, name, slogan, season, status, starts_at, ends_at, settings)
  values (
    'halaqat-summer-2026',
    'دوري الحلقات — صيف 2026',
    'التحدي يبدأ .. والبطولة لنا',
    'صيف 2026',
    'active',
    date '2026-08-21',
    date '2026-09-11',
    jsonb_build_object(
      'timezone', 'Africa/Cairo',
      'rules', jsonb_build_object(
        'points', jsonb_build_object('win', 3, 'draw', 1, 'loss', 0),
        'halves', 2, 'half_minutes', 8, 'slot_minutes', 20,
        'final_duration_override_minutes', 30,
        'substitutions', 'unlimited',
        'tiebreakers', jsonb_build_array('points','head_to_head','goal_difference','goals_for','fair_play','draw'),
        'yellow_cards_for_suspension', 2,
        'red_card_suspension_matches', 1
      ),
      'features', jsonb_build_object('power_cards', true, 'social', true, 'competitions', true, 'fans', false),
      'theme', jsonb_build_object('bg', '#070E24', 'surface', '#0F1B3F', 'gold', '#E0B24A', 'shield', '#1E40AF'),
      'match_days', jsonb_build_array('2026-08-21','2026-08-28','2026-09-04','2026-09-11'),
      'slots', jsonb_build_array('23:00','23:20','23:40','00:00','00:20','00:40'),
      'slogans', jsonb_build_array('فريق واحد .. هدف واحد','شغف لا ينتهي','روح المنافسة')
    )
  )
  returning id into v_league;

  -- الملاعب: ملعب 1 دائم، ملعب 2 بإتاحة محددة
  insert into public.venues (league_id, name, all_slots) values (v_league, 'ملعب 1', true);
  insert into public.venues (league_id, name, all_slots) values (v_league, 'ملعب 2', false);
  insert into public.venue_availability (venue_id, date, slot)
  select v.id, x.d, x.s
  from public.venues v,
       (values (date '2026-09-04', '23:40'), (date '2026-09-04', '00:00'),
               (date '2026-09-11', '23:00')) as x (d, s)
  where v.league_id = v_league and v.name = 'ملعب 2';

  -- المراحل والمجموعات
  insert into public.stages (league_id, type, order_no, legs, config)
  values (v_league, 'groups', 1, 1, '{"groups": 2, "qualify_per_group": 2}'::jsonb)
  returning id into v_stage_groups;
  insert into public.stages (league_id, type, order_no, legs, config)
  values (v_league, 'knockout', 2, 1, '{"third_place": true}'::jsonb)
  returning id into v_stage_ko;
  insert into public.groups (stage_id, name) values (v_stage_groups, 'A') returning id into v_group_a;
  insert into public.groups (stage_id, name) values (v_stage_groups, 'B') returning id into v_group_b;

  -- الفرق العشرة + لاعبون وهميون (7 لكل فريق، القميص 1 = الحارس)
  for v_team in
    select * from (values
      ('A', 'A1', 'فؤش'), ('A', 'A2', 'زيد'), ('A', 'A3', 'غراب'),
      ('A', 'A4', 'لوكاكو'), ('A', 'A5', 'أحمد طارق'),
      ('B', 'B1', 'صعيدي'), ('B', 'B2', 'جدو'), ('B', 'B3', 'نعمان'),
      ('B', 'B4', 'الشيوخ'), ('B', 'B5', 'سلامة')
    ) as t (grp, code, name)
  loop
    insert into public.teams (league_id, short_code, name, group_code)
    values (v_league, v_team.code, v_team.name, v_team.grp);
    insert into public.group_teams (group_id, team_id, seed_no)
    select case v_team.grp when 'A' then v_group_a else v_group_b end,
           t.id, substring(v_team.code from 2)::int
    from public.teams t where t.league_id = v_league and t.short_code = v_team.code;
    for v_n in 1..7 loop
      insert into public.players (team_id, code, shirt_number, name, position)
      select t.id, v_team.code || '-' || v_n, v_n,
             case when v_n = 1 then 'الحارس' else 'لاعب ' || v_n end,
             case when v_n = 1 then 'حارس' else 'لاعب' end
      from public.teams t where t.league_id = v_league and t.short_code = v_team.code;
    end loop;
  end loop;

  -- المباريات m1..m24 (اليوم المنطقي + الفترة + الملعب دائمًا)
  for f in select * from jsonb_array_elements(fixtures) loop
    i := i + 1;
    if coalesce(f->>'stage', 'group') = 'group' then
      v_stage := v_stage_groups;
      v_group := case when left(f->>'home', 1) = 'A' then v_group_a else v_group_b end;
    else
      v_stage := v_stage_ko;
      v_group := null;
    end if;
    insert into public.matches (
      league_id, stage_id, group_id, code, stage_kind, round_no, match_day, slot,
      venue_id, home_side, away_side, home_team_id, away_team_id, duration_override_minutes
    )
    values (
      v_league,
      v_stage,
      v_group,
      'm' || i,
      coalesce(f->>'stage', 'group'),
      case f->>'day'
        when '2026-08-21' then 1 when '2026-08-28' then 2
        when '2026-09-04' then 3 else 4
      end,
      (f->>'day')::date,
      f->>'slot',
      (select v.id from public.venues v where v.league_id = v_league and v.name = f->>'venue'),
      f->>'home',
      f->>'away',
      (select t.id from public.teams t where t.league_id = v_league and t.short_code = f->>'home'),
      (select t.id from public.teams t where t.league_id = v_league and t.short_code = f->>'away'),
      (f->>'dur')::int
    );
  end loop;

  -- كروت القوة الأربعة + رصيد كارت واحد من كل نوع لكل فريق
  insert into public.power_card_templates (league_id, name, icon, description, rarity, effect_type, params, usage_window)
  values
    (v_league, 'الهدف بهدفين', '⚡', 'الهدف التالي لفريقك يُحتسب بهدفين', 'rare',
     'goal_multiplier', '{"multiplier": 2, "scope": "next_goal"}'::jsonb, 'live'),
    (v_league, 'وقت إضافي', '⏱️', 'إضافة 3 دقائق لزمن المباراة', 'common',
     'extra_time', '{"minutes": 3}'::jsonb, 'live'),
    (v_league, 'الدرع', '🛡️', 'إلغاء إنذار واحد للاعب من فريقك', 'common',
     'shield', '{"cancels": "yellow_card"}'::jsonb, 'live'),
    (v_league, 'تبديل إضافي', '🔁', 'تبديل إضافي فوق الحد المسموح', 'common',
     'extra_substitution', '{"count": 1}'::jsonb, 'live');

  insert into public.team_cards (team_id, template_id, quantity, acquired_from)
  select t.id, pct.id, 1, 'initial'
  from public.teams t
  cross join public.power_card_templates pct
  where t.league_id = v_league and pct.league_id = v_league;
end $$;

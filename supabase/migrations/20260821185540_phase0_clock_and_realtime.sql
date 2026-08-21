-- المرحلة 0 — بنية البث الحي (بدون أي فتح للكتابة: الكتابة تمر حصريًا عبر
-- Edge Function بصلاحية service-role مع تحقق PIN، وRLS يبقى مقفولًا كما هو)

-- حالة ساعة المباراة (period/running/seconds/runningSince) تُبث لكل الأجهزة
alter table public.matches add column clock jsonb;

-- بث تغييرات الجداول الحية عبر Supabase Realtime
alter publication supabase_realtime add table
  public.matches,
  public.match_events,
  public.match_lineups,
  public.match_reports,
  public.standing_adjustments,
  public.card_usages,
  public.audit_log;

-- سجل التدقيق يظهر في صفحتي الإشعارات والأدمن داخل التطبيق (المرحلة 0):
-- محتواه أحداث عامة أصلًا (أهداف/اعتمادات/تغيير مواعيد) — قراءة فقط
create policy "phase0 public read" on public.audit_log
  for select to anon, authenticated using (true);

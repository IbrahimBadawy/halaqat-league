-- الدالة تلزم سياسات RLS للمستخدمين المسجلين فقط — تُسحب من anon وpublic.
-- (تبقى لـ authenticated لأن سياسات الكتابة تستدعيها بصلاحيات المستخدم نفسه)
revoke execute on function public.has_league_role(uuid, text[]) from anon, public;

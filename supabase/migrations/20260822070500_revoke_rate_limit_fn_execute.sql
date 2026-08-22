-- دالة trigger لا يُفترض أن تُستدعى عبر REST — تُسحب من الأدوار العامة
-- (الـ trigger نفسه يعمل بصلاحية المالك بغض النظر عن هذا)
revoke execute on function public.enforce_post_rate_limit() from public, anon, authenticated;

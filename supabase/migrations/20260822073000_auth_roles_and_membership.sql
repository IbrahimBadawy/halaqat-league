-- المصادقة الحقيقية: اسم المستخدم يُربط ببريد داخلي صوري (المواصفة §8)،
-- والدور يأتي من league_members.roles لا من مبدّل محلي.

-- علم مدير المنصة (super admin) — فوق أدمن الدوري
alter table public.profiles add column is_platform_admin boolean not null default false;

-- الملفات الشخصية والعضويات مقروءة للجميع: التطبيق يعرض «المسجّل المُسنَد»
-- و«الحكم» للجمهور، ولا تحوي بيانات حساسة (لا بريد ولا هاتف)
drop policy if exists "authenticated read" on public.profiles;
create policy "public read" on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists "authenticated read" on public.league_members;
create policy "public read" on public.league_members
  for select to anon, authenticated using (true);

-- إنشاء الملف الشخصي تلقائيًا مع كل حساب جديد (اسم المستخدم من الميتاداتا)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- حد معدل بسيط للمنشورات العامة (النشر بلا حساب في المرحلة 0):
-- 5 منشورات في الدقيقة على مستوى الدوري كله + منع التكرار الحرفي المتتالي.
-- يمنع إغراق الفيد ليلة المباراة دون الحاجة لحسابات أو CAPTCHA.

create or replace function public.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
  last_text text;
begin
  select count(*) into recent
  from public.posts
  where league_id = new.league_id
    and created_at > now() - interval '1 minute';
  if recent >= 5 then
    raise exception 'rate_limited: too many posts, try again shortly'
      using errcode = 'check_violation';
  end if;

  select text into last_text
  from public.posts
  where league_id = new.league_id
  order by created_at desc
  limit 1;
  if last_text is not null and last_text = new.text then
    raise exception 'duplicate_post: identical to the previous post'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_post_rate_limit();

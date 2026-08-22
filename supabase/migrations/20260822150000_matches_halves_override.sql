-- عدد أشواط مخصص لكل مباراة (1 أو 2) — NULL = افتراضي الدوري في rules.halves
alter table public.matches
  add column if not exists halves_override int
  check (halves_override in (1, 2));

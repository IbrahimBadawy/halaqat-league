-- بث تغييرات الفرق واللاعبين والدوريات (تعيين كابتن، قبول لاعب، دوري جديد)
alter publication supabase_realtime add table
  public.teams,
  public.players,
  public.leagues,
  public.team_join_codes;

# ملاحظة ترتيب الترحيلات

الترحيلات المطبقة على السحابة بين 2026-08-22 07:30 و08:00 (بالترتيب):

1. `20260822073000_auth_roles_and_membership.sql`
2. `20260822074500_accounts_teams_join_flow.sql` (اسمها على السحابة `accounts_teams_join_flow`)
3. `20260822075500_realtime_membership_tables.sql` (اسمها على السحابة `realtime_membership_tables`)

الأرقام المحلية تقريبية — المرجع الحقيقي هو جدول `supabase_migrations.schema_migrations` على المشروع.

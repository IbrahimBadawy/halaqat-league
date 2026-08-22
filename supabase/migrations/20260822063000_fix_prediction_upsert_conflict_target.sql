-- الفهرس الجزئي لا يصلح هدفًا لـ ON CONFLICT (يتطلب WHERE مطابقًا)، فكان
-- upsert التوقعات يفشل دائمًا. فهرس كامل على (match_id, device_key) يعمل
-- للحالتين: NULLs متمايزة افتراضيًا في Postgres فلا تتعارض صفوف المستخدمين.
drop index if exists public.predictions_device_unique;
create unique index predictions_device_unique
  on public.predictions (match_id, device_key);

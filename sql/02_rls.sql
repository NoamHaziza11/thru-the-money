-- ============================================================
-- Thru The Money — 02_rls.sql
-- הפעלת RLS + מדיניות אחידה: auth.uid() = user_id
-- הרצה אחרי 01_schema.sql. בטוח להרצה חוזרת.
-- ============================================================

alter table public.user_settings     enable row level security;
alter table public.categories        enable row level security;
alter table public.recurring_rules   enable row level security;
alter table public.transactions      enable row level security;
alter table public.monthly_summaries enable row level security;

-- הערה: (select auth.uid()) ולא auth.uid() — Postgres מריץ את זה פעם אחת
-- לכל שאילתה במקום פעם לכל שורה. הבדל ממשי בביצועים ברשימות ארוכות.

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings','categories','recurring_rules','transactions','monthly_summaries'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using ((select auth.uid()) = user_id)
    $f$, t || '_select_own', t);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $f$, t || '_insert_own', t);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $f$, t || '_update_own', t);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using ((select auth.uid()) = user_id)
    $f$, t || '_delete_own', t);
  end loop;
end $$;

-- בדיקה: אמור להחזיר 20 שורות (5 טבלאות × 4 מדיניות)
-- select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, policyname;

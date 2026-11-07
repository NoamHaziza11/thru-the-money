-- ============================================================
-- Thru The Money — 05_push_subscriptions.sql
-- תזכורות מהאפליקציה (Web Push). טבלה חדשה + שתי פונקציות.
-- לא נוגע בשום טבלה קיימת ולא מוחק כלום. בטוח להרצה חוזרת.
-- הרצה: Supabase Dashboard → SQL Editor → הדבק → Run
-- ============================================================

-- ------------------------------------------------------------
-- push_subscriptions — מכשיר אחד = שורה אחת.
-- endpoint/p256dh/auth הם מה שהדפדפן נותן כשמאשרים התראות. הם לא
-- סיסמה, והם מאפשרים רק לשלוח התראה למכשיר הזה.
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  lang       text        not null default 'he' check (lang in ('he','en')),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- אותו דפוס בדיוק כמו בשאר הטבלאות (02_rls.sql): כל משתמש רואה ומשנה רק את שלו
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- push_targets / push_drop — נקראות רק מהפונקציה המתוזמנת ב-Netlify.
--
-- הן דורשות את PUSH_CRON_SECRET, שיושב רק ב-Netlify. כאן שמור רק ה-hash
-- שלו (SHA-256), כך שהקובץ הזה לא חושף את הסוד.
-- push_targets מחזירה רק כתובות התראה ושפה, ושום נתון כספי.
-- ------------------------------------------------------------
create or replace function public.push_targets(p_secret text)
returns table (endpoint text, p256dh text, auth text, lang text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
     <> '20c1acea1fab8bc0726ea08a7f541c6cc3adb54424dad958c534c7576e30d895' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth, s.lang from public.push_subscriptions s;
end $$;

-- מוחקת מנוי שהמכשיר כבר לא מכיר (אחרי מחיקת האפליקציה וכו')
create or replace function public.push_drop(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
     <> '20c1acea1fab8bc0726ea08a7f541c6cc3adb54424dad958c534c7576e30d895' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.push_subscriptions s where s.endpoint = p_endpoint;
end $$;

revoke all on function public.push_targets(text) from public;
revoke all on function public.push_drop(text, text) from public;
grant execute on function public.push_targets(text) to anon, authenticated;
grant execute on function public.push_drop(text, text) to anon, authenticated;

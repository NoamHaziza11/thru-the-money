-- ============================================================
-- Thru The Money — 01_schema.sql
-- טבלאות בלבד. אין RLS כאן (ראה 02_rls.sql).
-- הרצה: Supabase Dashboard → SQL Editor → הדבק → Run
-- בטוח להרצה חוזרת (idempotent).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- user_settings — שורה אחת לכל משתמש
-- ------------------------------------------------------------
create table if not exists public.user_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  currency        text        not null default 'USD',
  locale          text        not null default 'he-IL',
  timezone        text        not null default 'America/Los_Angeles',
  month_start_day smallint    not null default 1 check (month_start_day between 1 and 28),
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- categories — קטגוריות המשתמש
-- ------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null check (length(btrim(name)) between 1 and 40),
  kind        text        not null check (kind in ('income','expense')),
  icon        text        not null default '📌',
  color       text        not null default '#6B7472',
  sort_order  integer     not null default 0,
  is_archived boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- שם קטגוריה ייחודי לכל משתמש בתוך אותו סוג (מונע כפילויות בטעות)
create unique index if not exists categories_user_kind_name_uidx
  on public.categories (user_id, kind, lower(btrim(name)));

-- אינדקס לשליפת רשת הקטגוריות במסך ההזנה
create index if not exists categories_user_kind_sort_idx
  on public.categories (user_id, kind, sort_order)
  where is_archived = false;

-- ------------------------------------------------------------
-- recurring_rules — תנועות קבועות
-- ------------------------------------------------------------
create table if not exists public.recurring_rules (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users(id) on delete cascade,
  kind              text          not null check (kind in ('income','expense')),
  amount            numeric(12,2) not null check (amount > 0),
  category_id       uuid          references public.categories(id) on delete set null,
  note              text,
  day_of_month      smallint      not null check (day_of_month between 1 and 31),
  start_on          date          not null default (now() at time zone 'America/Los_Angeles')::date,
  end_on            date,
  is_active         boolean       not null default true,
  last_generated_on date,
  created_at        timestamptz   not null default now(),
  constraint recurring_rules_dates_chk check (end_on is null or end_on >= start_on)
);

create index if not exists recurring_rules_user_active_idx
  on public.recurring_rules (user_id)
  where is_active = true;

-- ------------------------------------------------------------
-- transactions — הלב של המערכת
-- כל סכום חיובי. הכיוון נקבע ע"י kind בלבד.
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  kind         text          not null check (kind in ('income','expense')),
  amount       numeric(12,2) not null check (amount > 0),
  category_id  uuid          references public.categories(id) on delete set null,
  note         text,
  occurred_on  date          not null default (now() at time zone 'America/Los_Angeles')::date,
  source       text          not null default 'manual' check (source in ('manual','recurring')),
  recurring_id uuid          references public.recurring_rules(id) on delete set null,
  created_at   timestamptz   not null default now()
);

-- שליפת מסך "היום" ורשימות לפי חודש
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc, created_at desc);

-- אגרגציה לפי קטגוריה (עוגה, טבלת קטגוריות)
create index if not exists transactions_user_cat_idx
  on public.transactions (user_id, category_id, occurred_on);

-- רשת ביטחון: כלל קבוע לא ייצור יותר מתנועה אחת לאותו חודש,
-- גם אם האפליקציה נטענת בו-זמנית משני מכשירים.
-- ה-::timestamp הכרחי: בלעדיו Postgres בוחר את גרסת date_trunc
-- התלויה באזור זמן, וכזו אסור לשים באינדקס (חייב IMMUTABLE).
create unique index if not exists transactions_recurring_month_uidx
  on public.transactions (recurring_id, (date_trunc('month', occurred_on::timestamp)))
  where recurring_id is not null;

-- ------------------------------------------------------------
-- monthly_summaries — דוחות חודשיים שנשמרו (כולל טקסט ה-AI)
-- ------------------------------------------------------------
create table if not exists public.monthly_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  period_year  smallint    not null check (period_year between 2000 and 2100),
  period_month smallint    not null check (period_month between 1 and 12),
  totals       jsonb       not null default '{}'::jsonb,
  ai_text      text,
  generated_at timestamptz not null default now(),
  constraint monthly_summaries_period_uniq unique (user_id, period_year, period_month)
);

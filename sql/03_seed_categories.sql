-- ============================================================
-- Thru The Money — 03_seed_categories.sql
-- קטגוריות ברירת מחדל + שורת user_settings לכל משתמש חדש.
--
-- למה פונקציה ולא INSERT פשוט: לקטגוריה יש user_id, ובזמן הרצת
-- הקובץ עוד אין משתמש. הפונקציה רצה אוטומטית בהרשמה,
-- ובסוף הקובץ יש שורה שממלאת גם משתמשים שכבר קיימים.
-- בטוח להרצה חוזרת — לא ייווצרו כפילויות.
-- ============================================================

create or replace function public.seed_defaults_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.categories (user_id, name, kind, icon, color, sort_order)
  values
    -- ---------- הכנסות ----------
    (p_user_id, 'ג''ובים',        'income',  '💼', '#0E5C4A', 10),
    (p_user_id, 'טיפים',          'income',  '💵', '#0E5C4A', 20),
    (p_user_id, 'בונוס',          'income',  '🎁', '#0E5C4A', 30),
    (p_user_id, 'הכנסה אחרת',     'income',  '➕', '#6B7472', 40),

    -- ---------- הוצאות ----------
    (p_user_id, 'דלק',            'expense', '⛽', '#C6421F', 10),
    (p_user_id, 'כלים וחלקים',    'expense', '🔧', '#C6421F', 20),
    (p_user_id, 'רכב ותחזוקה',    'expense', '🚚', '#C6421F', 30),
    (p_user_id, 'אוכל',           'expense', '🍔', '#F0B429', 40),
    (p_user_id, 'קניות',          'expense', '🛒', '#F0B429', 50),
    (p_user_id, 'שכר דירה',       'expense', '🏠', '#1B2021', 60),
    (p_user_id, 'חשבונות',        'expense', '💡', '#1B2021', 70),
    (p_user_id, 'טלפון ואינטרנט', 'expense', '📱', '#1B2021', 80),
    (p_user_id, 'ביטוח',          'expense', '🛡️', '#1B2021', 90),
    (p_user_id, 'בריאות',         'expense', '💊', '#6B7472', 100),
    (p_user_id, 'בילויים',        'expense', '🎬', '#6B7472', 110),
    (p_user_id, 'הוצאה אחרת',     'expense', '📌', '#6B7472', 120)
  on conflict do nothing;
end $$;

-- ------------------------------------------------------------
-- טריגר: כל משתמש חדש מקבל את ברירות המחדל אוטומטית
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_defaults_for_user(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- מילוי למשתמשים שכבר קיימים (למשל אם נרשמת לפני הרצת הקובץ)
-- ------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.seed_defaults_for_user(u.id);
  end loop;
end $$;

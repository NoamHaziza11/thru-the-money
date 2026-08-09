-- ============================================================
-- Thru The Money — 04_category_translations.sql
-- מוסיף עמודת name_en לתרגום שמות קטגוריות (לצורך ממשק דו-לשוני),
-- וממלא תרגום לברירות המחדל הקיימות. שדה חדש בלבד — לא נוגע בשום
-- נתון קיים, לא מוחק כלום. בטוח להרצה חוזרת (idempotent).
-- הרצה: Supabase Dashboard → SQL Editor → הדבק → Run
-- ============================================================

alter table public.categories add column if not exists name_en text;

-- תרגום לברירות המחדל שכבר קיימות אצלך (מ-03_seed_categories.sql).
-- קטגוריות שתוסיף בעצמך דרך ממשק "ניהול קטגוריות" ימלאו את name_en
-- ישירות בטופס — אין להן שורה כאן.
update public.categories set name_en = 'Jobs'                  where name = 'ג''ובים'         and name_en is null;
update public.categories set name_en = 'Tips'                  where name = 'טיפים'           and name_en is null;
update public.categories set name_en = 'Bonus'                 where name = 'בונוס'           and name_en is null;
update public.categories set name_en = 'Other income'          where name = 'הכנסה אחרת'      and name_en is null;

update public.categories set name_en = 'Fuel'                  where name = 'דלק'             and name_en is null;
update public.categories set name_en = 'Tools & Parts'         where name = 'כלים וחלקים'     and name_en is null;
update public.categories set name_en = 'Vehicle & Maintenance' where name = 'רכב ותחזוקה'     and name_en is null;
update public.categories set name_en = 'Food'                  where name = 'אוכל'            and name_en is null;
update public.categories set name_en = 'Shopping'              where name = 'קניות'           and name_en is null;
update public.categories set name_en = 'Rent'                  where name = 'שכר דירה'        and name_en is null;
update public.categories set name_en = 'Bills'                 where name = 'חשבונות'         and name_en is null;
update public.categories set name_en = 'Phone & Internet'      where name = 'טלפון ואינטרנט'  and name_en is null;
update public.categories set name_en = 'Insurance'             where name = 'ביטוח'           and name_en is null;
update public.categories set name_en = 'Health'                where name = 'בריאות'          and name_en is null;
update public.categories set name_en = 'Entertainment'         where name = 'בילויים'         and name_en is null;
update public.categories set name_en = 'Other expense'         where name = 'הוצאה אחרת'      and name_en is null;

-- עדכון פונקציית הזריעה — כדי שגם משתמש עתידי (אם יתווסף) יקבל
-- מיד שמות באנגלית, לא רק עברית.
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

  insert into public.categories (user_id, name, name_en, kind, icon, color, sort_order)
  values
    -- ---------- הכנסות ----------
    (p_user_id, 'ג''ובים',        'Jobs',                  'income',  '💼', '#0E5C4A', 10),
    (p_user_id, 'טיפים',          'Tips',                  'income',  '💵', '#0E5C4A', 20),
    (p_user_id, 'בונוס',          'Bonus',                 'income',  '🎁', '#0E5C4A', 30),
    (p_user_id, 'הכנסה אחרת',     'Other income',          'income',  '➕', '#6B7472', 40),

    -- ---------- הוצאות ----------
    (p_user_id, 'דלק',            'Fuel',                  'expense', '⛽', '#C6421F', 10),
    (p_user_id, 'כלים וחלקים',    'Tools & Parts',         'expense', '🔧', '#C6421F', 20),
    (p_user_id, 'רכב ותחזוקה',    'Vehicle & Maintenance', 'expense', '🚚', '#C6421F', 30),
    (p_user_id, 'אוכל',           'Food',                  'expense', '🍔', '#F0B429', 40),
    (p_user_id, 'קניות',          'Shopping',              'expense', '🛒', '#F0B429', 50),
    (p_user_id, 'שכר דירה',       'Rent',                  'expense', '🏠', '#1B2021', 60),
    (p_user_id, 'חשבונות',        'Bills',                 'expense', '💡', '#1B2021', 70),
    (p_user_id, 'טלפון ואינטרנט', 'Phone & Internet',      'expense', '📱', '#1B2021', 80),
    (p_user_id, 'ביטוח',          'Insurance',             'expense', '🛡️', '#1B2021', 90),
    (p_user_id, 'בריאות',         'Health',                'expense', '💊', '#6B7472', 100),
    (p_user_id, 'בילויים',        'Entertainment',         'expense', '🎬', '#6B7472', 110),
    (p_user_id, 'הוצאה אחרת',     'Other expense',         'expense', '📌', '#6B7472', 120)
  on conflict do nothing;
end $$;

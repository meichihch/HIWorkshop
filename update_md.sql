-- 新增「上傳 .md 檔」功能用：把文字內容的上限從 600 字放寬到 2 萬字
-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上 → Run
alter table public.responses drop constraint if exists responses_body_check;
alter table public.responses add constraint responses_body_check check (char_length(body) <= 20000);

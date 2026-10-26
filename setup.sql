-- =====================================================================
-- 幸福力即時互動牆 — Supabase 資料庫設定
-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上全部 → Run
-- ⚠️ 執行前，先把下面 '1234' 改成你自己的講師密碼（PIN）
-- =====================================================================

-- 1. 學生的回覆 ---------------------------------------------------------
create table if not exists public.responses (
  id         uuid primary key default gen_random_uuid(),
  q          text not null check (char_length(q) <= 40),          -- 題目代號
  name       text not null check (char_length(name) between 1 and 30),
  body       text check (char_length(body) <= 600),               -- 文字內容
  choice     text check (char_length(choice) <= 120),             -- 投票選項／回饋類型
  tag        text check (char_length(tag) <= 40),                 -- 組別
  photo      text check (char_length(photo) <= 600),              -- 照片網址
  parent     uuid references public.responses(id) on delete cascade, -- 「加碼」留言
  likes      int  not null default 0,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists responses_q_idx on public.responses (q, created_at);

-- 2. 按讚（同一個名字對同一則只能按一次）-------------------------------
create table if not exists public.likes (
  response_id uuid not null references public.responses(id) on delete cascade,
  voter       text not null check (char_length(voter) between 1 and 30),
  created_at  timestamptz not null default now(),
  primary key (response_id, voter)
);

-- 3. 現場狀態（目前題目、是否顯示問卷對照、是否顯示姓名）---------------
create table if not exists public.room_state (
  id           int primary key default 1 check (id = 1),
  current_q    text,
  show_compare boolean not null default false,
  show_names   boolean not null default false,
  reveal       boolean not null default false,              -- 「揭曉」：同理題先收集不顯示
  updated_at   timestamptz not null default now()
);
alter table public.room_state add column if not exists reveal boolean not null default false;
insert into public.room_state (id) values (1) on conflict do nothing;

-- 4. 講師密碼（學生讀不到這張表）---------------------------------------
create table if not exists public.host_secret (
  id  int primary key default 1 check (id = 1),
  pin text not null
);
insert into public.host_secret (id, pin) values (1, '1234')      -- ← 改成你的密碼
on conflict (id) do update set pin = excluded.pin;

-- 5. 權限（Row Level Security）------------------------------------------
alter table public.responses   enable row level security;
alter table public.likes       enable row level security;
alter table public.room_state  enable row level security;
alter table public.host_secret enable row level security;   -- 沒有任何 policy = 誰都讀不到

drop policy if exists "read responses"  on public.responses;
drop policy if exists "add responses"   on public.responses;
drop policy if exists "read likes"      on public.likes;
drop policy if exists "add likes"       on public.likes;
drop policy if exists "read state"      on public.room_state;

create policy "read responses" on public.responses for select to anon, authenticated using (true);
create policy "add responses"  on public.responses for insert to anon, authenticated
  with check (hidden = false and likes = 0);
create policy "read likes"     on public.likes     for select to anon, authenticated using (true);
create policy "add likes"      on public.likes     for insert to anon, authenticated with check (true);
create policy "read state"     on public.room_state for select to anon, authenticated using (true);

-- 6. 按讚時自動加總 -------------------------------------------------------
create or replace function public.bump_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.responses set likes = likes + 1 where id = new.response_id;
  return new;
end $$;
drop trigger if exists likes_bump on public.likes;
create trigger likes_bump after insert on public.likes
  for each row execute function public.bump_likes();

-- 7. 講師專用功能（都要帶密碼）------------------------------------------
create or replace function public.host_check(p_pin text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.host_secret where pin = p_pin);
$$;

drop function if exists public.host_set(text, text, boolean, boolean);
create or replace function public.host_set(p_pin text, p_current text, p_compare boolean, p_names boolean, p_reveal boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.host_check(p_pin) then raise exception 'wrong pin'; end if;
  update public.room_state
     set current_q = p_current, show_compare = p_compare, show_names = p_names, reveal = p_reveal, updated_at = now()
   where id = 1;
end $$;

create or replace function public.host_hide(p_pin text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.host_check(p_pin) then raise exception 'wrong pin'; end if;
  update public.responses set hidden = p_hidden where id = p_id;
end $$;

create or replace function public.host_clear(p_pin text, p_q text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.host_check(p_pin) then raise exception 'wrong pin'; end if;
  delete from public.responses where q = p_q;
end $$;

grant execute on function public.host_check(text) to anon, authenticated;
grant execute on function public.host_set(text, text, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.host_hide(text, uuid, boolean) to anon, authenticated;
grant execute on function public.host_clear(text, text) to anon, authenticated;

-- 8. 即時更新（Realtime）------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.responses;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.likes;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.room_state; exception when duplicate_object then null; end;
end $$;

-- 9. 照片上傳空間 --------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;
drop policy if exists "anyone uploads photos" on storage.objects;
create policy "anyone uploads photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos');

-- 完成！看到 "Success. No rows returned" 就代表設定好了。

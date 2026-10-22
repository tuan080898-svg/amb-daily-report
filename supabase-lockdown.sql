-- =====================================================================
-- KHÓA DỮ LIỆU NHẠY CẢM (đây là bản mẫu: ký hiệu khóa trong hàm amb_key_check được thay bằng khóa thật khi tạo file gửi Sếp; KHÔNG lưu khóa thật vào mã nguồn)
-- Chạy MỘT LẦN trong Supabase -> SQL Editor, SAU KHI đã đặt biến AMB_SECRET trên Vercel và app đã chạy lại.
--
-- Sau khi chạy:
--  * Giá vốn (cogs_entries), cấu hình phí (pnl_config), lãi lỗ (pnl_imports): chỉ máy chủ của app (có khóa) mới đọc/ghi được.
--  * Bảng tài khoản (users): người ngoài chỉ đọc được các cột không bí mật; không thêm/sửa/xóa được; không đọc được cột mật khẩu.
--  * File giá vốn / lãi lỗ cũ trong kho lưu trữ pnl-data: người ngoài không còn đọc được.
-- Hoàn tác: chạy file 3-HOAN-TAC.sql.
-- =====================================================================

-- 1) Hàm kiểm tra khóa: chỉ đúng khi yêu cầu mang header x-db-key đúng (máy chủ của app tự gửi)
create or replace function public.amb_key_check()
returns boolean
language sql
stable
as $f$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-db-key', '') = '__DB_KEY__';
$f$;
grant execute on function public.amb_key_check() to anon, authenticated;

-- 2) Xóa các chính sách cũ (đang mở cho mọi người) của các bảng nhạy cảm
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('cogs_entries', 'pnl_config', 'pnl_imports', 'users')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Giá vốn, cấu hình phí, lãi lỗ: chỉ máy chủ có khóa
alter table public.cogs_entries enable row level security;
alter table public.pnl_config enable row level security;
alter table public.pnl_imports enable row level security;
create policy cost_server_only on public.cogs_entries for all using (public.amb_key_check()) with check (public.amb_key_check());
create policy cost_server_only on public.pnl_config for all using (public.amb_key_check()) with check (public.amb_key_check());
create policy cost_server_only on public.pnl_imports for all using (public.amb_key_check()) with check (public.amb_key_check());

-- 4) Tài khoản: đọc công khai các cột không bí mật; thêm/sửa/xóa chỉ máy chủ có khóa; cột mật khẩu không ai ngoài máy chủ đọc được
alter table public.users enable row level security;
create policy users_read on public.users for select using (true);
create policy users_insert_server on public.users for insert with check (public.amb_key_check());
create policy users_update_server on public.users for update using (public.amb_key_check()) with check (public.amb_key_check());
create policy users_delete_server on public.users for delete using (public.amb_key_check());
revoke select on public.users from anon, authenticated;
grant select (id, email, name, role, assigned_shops) on public.users to anon, authenticated;

-- Hàm đăng nhập: máy chủ gọi hàm này để lấy cả mật khẩu (đã mã hóa) của đúng một email; không có khóa thì trả rỗng
create or replace function public.amb_login_row(p_email text)
returns table (id text, email text, name text, role text, assigned_shops text[], password text)
language plpgsql
security definer
set search_path = public
as $f$
begin
  if not public.amb_key_check() then
    return;
  end if;
  return query
    select u.id::text, u.email::text, u.name::text, u.role::text, u.assigned_shops, u.password::text
    from public.users u
    where lower(trim(u.email)) = lower(trim(p_email))
    limit 5;
end;
$f$;
revoke all on function public.amb_login_row(text) from public;
grant execute on function public.amb_login_row(text) to anon, authenticated;

-- 5) File giá vốn / lãi lỗ cũ trong kho lưu trữ pnl-data: đóng lại; chỉ còn mở các file checklist (app vẫn dùng)
drop policy if exists "pnl_select" on storage.objects;
drop policy if exists "pnl_insert" on storage.objects;
drop policy if exists "pnl_update" on storage.objects;
drop policy if exists "pnl_delete" on storage.objects;
create policy "pnl_select" on storage.objects for select using (bucket_id = 'pnl-data' and name like 'checklist%');
create policy "pnl_insert" on storage.objects for insert with check (bucket_id = 'pnl-data' and name like 'checklist%');
create policy "pnl_update" on storage.objects for update using (bucket_id = 'pnl-data' and name like 'checklist%') with check (bucket_id = 'pnl-data' and name like 'checklist%');
create policy "pnl_delete" on storage.objects for delete using (bucket_id = 'pnl-data' and name like 'checklist%');

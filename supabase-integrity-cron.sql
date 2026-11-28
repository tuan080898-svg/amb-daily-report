-- =====================================================================
-- INTEGRITY: TỰ BÁO VÀO LARK NGAY KHI CÓ LỜI CAM KẾT QUÁ HẠN
-- Supabase gọi app 10 phút một lần; lời nào vừa quá hạn và chưa báo thì app gửi vào nhóm Lark (mỗi lời một lần).
-- Chạy NGUYÊN FILE trong Supabase -> SQL Editor. Không phải sửa hay dán khóa nào:
-- cơ sở dữ liệu tự sinh khóa gọi lịch, chỉ máy chủ của app (có x-db-key) đọc được để đối chiếu.
-- Cần hàm public.amb_key_check() (đã tạo ở file khóa dữ liệu trước đó). Chạy lại nhiều lần được.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.amb_cron_token (
  id int primary key check (id = 1),
  token text not null
);
alter table public.amb_cron_token enable row level security;
revoke all on public.amb_cron_token from anon, authenticated;
grant select on public.amb_cron_token to anon;
drop policy if exists cron_token_server_read on public.amb_cron_token;
create policy cron_token_server_read on public.amb_cron_token for select using (public.amb_key_check());

insert into public.amb_cron_token (id, token)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- Cùng tên thì cập nhật lịch cũ, không tạo trùng.
-- Chỉ muốn nhận tin từ 7h đến 23h (giờ VN) thì đổi '*/10 * * * *' thành '*/10 0-15 * * *'.
select cron.schedule(
  'integrity-qua-han',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://amb-daily-report-epj2.vercel.app/api/integrity/overdue',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select token from public.amb_cron_token where id = 1)),
    timeout_milliseconds := 30000
  );
  $$
);

-- KIỂM TRA (chờ khoảng 10 phút rồi chạy riêng): status_code 200 là đúng
-- select status_code, content, created from net._http_response order by created desc limit 5;

-- TẮT (chạy riêng khi không muốn tự báo nữa):
-- select cron.unschedule('integrity-qua-han');

-- =====================================================================
-- INTEGRITY: TỰ BÁO VÀO LARK NGAY KHI CÓ LỜI CAM KẾT QUÁ HẠN
-- Supabase gọi app 10 phút một lần; lời nào vừa quá hạn và chưa báo thì app gửi vào nhóm Lark (mỗi lời một lần).
-- Chạy trong Supabase -> SQL Editor.
-- TRƯỚC KHI CHẠY: thay DAN_CRON_SECRET_VAO_DAY bằng đúng giá trị biến CRON_SECRET trên Vercel.
-- Không lưu giá trị thật vào file này, không gửi vào khung chat.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Chạy lại lệnh này với cùng tên sẽ cập nhật lịch cũ, không tạo trùng
select cron.schedule(
  'integrity-qua-han',
  '*/10 * * * *',          -- 10 phút một lần. Chỉ muốn nhận tin từ 7h đến 23h (giờ VN): '*/10 0-15 * * *'
  $$
  select net.http_get(
    url := 'https://amb-daily-report-epj2.vercel.app/api/integrity/overdue',
    headers := jsonb_build_object('Authorization', 'Bearer DAN_CRON_SECRET_VAO_DAY'),
    timeout_milliseconds := 30000
  );
  $$
);

-- KIỂM TRA (chờ khoảng 10 phút rồi chạy): status_code 200 là đúng, 401 là sai CRON_SECRET
-- select status_code, content, created from net._http_response order by created desc limit 5;

-- TẮT (chạy riêng khi không muốn tự báo nữa):
-- select cron.unschedule('integrity-qua-han');

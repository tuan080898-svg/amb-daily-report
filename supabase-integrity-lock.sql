-- =====================================================================
-- KHÓA DỮ LIỆU INTEGRITY (tùy chọn, chạy sau khi đã chạy file khóa dữ liệu nhạy cảm trước đó)
-- Lời cam kết của từng người nằm trong kho lưu trữ sku-data, thư mục integrity/.
-- Sau khi chạy: chỉ máy chủ của app (có khóa x-db-key) đọc/ghi được thư mục này, người ngoài không
-- đọc hay sửa được lời cam kết bằng khóa công khai. Không đụng tới các file khác trong sku-data.
-- Cần hàm public.amb_key_check() (đã tạo ở file khóa trước). Chạy trong Supabase -> SQL Editor.
-- =====================================================================

drop policy if exists integrity_server_only on storage.objects;
create policy integrity_server_only on storage.objects
  as restrictive
  for all
  using (bucket_id <> 'sku-data' or name not like 'integrity/%' or public.amb_key_check())
  with check (bucket_id <> 'sku-data' or name not like 'integrity/%' or public.amb_key_check());

-- HOÀN TÁC (chạy riêng nếu trang Integrity báo lỗi lưu/đọc sau khi khóa):
-- drop policy if exists integrity_server_only on storage.objects;

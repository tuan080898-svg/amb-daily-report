-- =====================================================================
-- KHÓA DỮ LIỆU ĐỐI CHIẾU SỔ KHO (tùy chọn, chạy sau khi đã chạy file khóa dữ liệu nhạy cảm trước đó)
-- Dữ liệu đối chiếu (có đánh giá từng nhân sự kho) nằm trong kho lưu trữ sku-data, thư mục doichieu/.
-- Sau khi chạy: chỉ máy chủ của app (có khóa x-db-key) đọc/ghi được thư mục này. Người cầm khóa công khai không đọc được.
-- Không đụng tới các file khác trong sku-data (phiếu xuất kho, bảng quy đổi SKU... vẫn như cũ).
-- Cần hàm public.amb_key_check() (đã tạo ở file khóa trước). Chạy trong Supabase -> SQL Editor.
-- Hoàn tác: xóa chính sách bằng dòng ở cuối file.
-- =====================================================================

drop policy if exists doichieu_server_only on storage.objects;
create policy doichieu_server_only on storage.objects
  as restrictive
  for all
  using (bucket_id <> 'sku-data' or name not like 'doichieu/%' or public.amb_key_check())
  with check (bucket_id <> 'sku-data' or name not like 'doichieu/%' or public.amb_key_check());

-- HOÀN TÁC (chạy riêng nếu trang Đối chiếu sổ kho báo lỗi lưu/đọc sau khi khóa):
-- drop policy if exists doichieu_server_only on storage.objects;

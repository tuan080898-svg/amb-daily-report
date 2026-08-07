# Brief: App Báo Cáo Doanh Số Hàng Ngày (Shopee + TikTok Shop)

## 1. Bối cảnh & Mục tiêu

Hiện tại đang quản lý **10 shop Shopee + 4 shop TikTok Shop** bằng file Excel, mỗi tháng một sheet dạng "Bảng kết quả theo ngày" (target doanh thu, doanh thu thực tế, chi phí quảng cáo, đơn huỷ, đơn hoàn, cảnh báo màu...). Với 14 shop, việc duy trì nhiều sheet không hiệu quả.

**Mục tiêu**: xây một web app đơn giản để nhân viên phụ trách từng shop **tự điền báo cáo hàng ngày**, dữ liệu đổ về **1 nguồn duy nhất** (database), có dashboard tổng hợp cho quản lý xem toàn bộ 14 shop.

## 2. Yêu cầu chức năng

### 2.1. Đăng nhập / phân quyền
- Mỗi nhân viên có 1 tài khoản (email/password).
- Mỗi tài khoản được gán 1 hoặc nhiều shop phụ trách (1 nhân viên có thể phụ trách nhiều shop).
- Nhân viên chỉ nhìn thấy và nhập liệu cho (các) shop được gán.
- Có 1 tài khoản admin/quản lý xem được toàn bộ 14 shop.

### 2.2. Form nhập báo cáo hàng ngày
Nhân viên chọn ngày (mặc định hôm nay) + shop (nếu phụ trách nhiều shop), nhập các trường:

| Trường | Loại | Ghi chú |
|---|---|---|
| Ngày | date | mặc định hôm nay |
| Shop | select | tự lọc theo shop được gán |
| Target doanh thu | số | có thể tự động lấy từ cấu hình tháng, cho sửa nếu cần |
| Doanh thu thực tế | số | nhập tay |
| Chi phí quảng cáo | số | nhập tay |
| Tổng đơn | số | nhập tay |
| Đơn huỷ | số | nhập tay |
| Số đơn hoàn/thht | số | nhập tay |
| Ghi chú | text | tuỳ chọn |

- Cho phép sửa lại báo cáo đã nhập trong ngày (tránh nhập sai không sửa được).
- Validate: không cho nhập số âm, không cho bỏ trống các trường bắt buộc.

### 2.3. Tính toán tự động (không cho nhập tay)
- `%đạt target` = Doanh thu thực tế / Target doanh thu
- `%mkt/doanh thu` = Chi phí quảng cáo / Doanh thu thực tế
- `%hoàn/huỷ` = (Đơn huỷ + Số đơn hoàn) / Tổng đơn
- **Cảnh báo doanh số**: Xanh nếu %đạt target ≥ 100%, Vàng nếu 70–99%, Đỏ nếu < 70%
- **Cảnh báo ads**: Xanh nếu %mkt/doanh thu ≤ ngưỡng cảnh báo (vd 18%, lấy từ cấu hình), Vàng nếu vượt nhẹ, Đỏ nếu vượt nhiều (mức cụ thể sẽ chốt lại theo logic đang dùng trong Excel)

### 2.4. Dashboard tổng hợp (cho quản lý)
- Xem theo ngày / tuần / tháng, lọc theo shop hoặc kênh (Shopee/TikTok).
- Bảng tổng hợp toàn bộ 14 shop trong ngày, sort theo shop bị cảnh báo đỏ lên đầu.
- Biểu đồ doanh thu thực tế vs target theo thời gian.
- Xuất Excel/CSV để đối chiếu với Power BI hiện có.

### 2.5. Cấu hình shop & target
- Trang admin để tạo/sửa danh sách shop (tên, kênh, người phụ trách).
- Trang admin để nhập target tháng cho từng shop, hệ thống tự chia target ngày (target tháng / số ngày trong tháng), cho sửa tay từng ngày nếu cần.

## 3. Cấu trúc dữ liệu đề xuất (thay cho việc dùng nhiều sheet)

**Bảng `shops`**
```
id | ten_shop | kenh (Shopee/Tiktok) | nguoi_phu_trach | target_thang_mac_dinh
```

**Bảng `daily_reports`**
```
id | ngay | shop_id | target_doanh_thu | doanh_thu_thuc_te | chi_phi_quang_cao |
tong_don | don_huy | so_don_hoan | ghi_chu | nguoi_nhap | thoi_gian_nhap
```

(Các cột %đạt target, %mkt, %hoàn/huỷ, cảnh báo đỏ/vàng/xanh **không lưu trong DB**, tính runtime ở tầng hiển thị/API.)

**Bảng `users`**
```
id | email | ten | vai_tro (nhan_vien/admin) | danh_sach_shop_phu_trach
```

## 4. Đề xuất công nghệ (để Claude Code scaffold)

- **Frontend**: Next.js (React) + Tailwind
- **Backend/DB**: Supabase (Postgres có sẵn Auth, dễ deploy, free tier đủ dùng cho quy mô 14 shop)
- **Deploy**: Vercel (free) cho frontend, Supabase free tier cho DB/Auth
- **Xuất dữ liệu**: API/export CSV để đồng bộ sang Power BI đang dùng

## 5. Thứ tự triển khai (MVP trước)

1. Tạo schema 3 bảng trên trong Supabase
2. Trang đăng nhập + phân quyền theo shop
3. Form nhập báo cáo hàng ngày (chỉ shop được gán)
4. Trang danh sách báo cáo đã nhập trong tháng + cho sửa lại
5. Dashboard tổng hợp toàn bộ 14 shop + cảnh báo màu
6. Trang admin cấu hình shop & target tháng
7. Xuất CSV/kết nối Power BI

## 6. Ghi chú thêm cho Claude Code khi bắt đầu

- Giữ nguyên logic tính %đạt target / %mkt / %hoàn huỷ và ngưỡng cảnh báo đỏ-vàng-xanh giống file Excel hiện tại (số ngày trong tháng, % chi phí MKT cho phép, ngưỡng % MKT cảnh báo là các thông số cấu hình được, không hardcode).
- Ưu tiên làm xong luồng nhập liệu + dashboard cơ bản chạy được trước, phần đẹp/UI tinh chỉnh sau.
- Không cần AI/anomaly detection ở bản đầu tiên — để riêng cho giai đoạn sau khi đã có data ổn định.

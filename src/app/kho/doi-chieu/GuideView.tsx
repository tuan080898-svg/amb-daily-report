'use client';

import { cardCls } from './shared';

export default function GuideView() {
  var h3 = 'text-sm font-semibold text-gray-200 mt-4 mb-1';
  var ul = 'list-disc pl-5 space-y-1 text-sm text-gray-300';
  var ol = 'list-decimal pl-5 space-y-1 text-sm text-gray-300';
  return (
    <div className={cardCls}>
      <h2 className="text-base font-semibold text-gray-100">Quy trình mỗi ngày</h2>
      <p className="text-sm text-gray-400 mt-1">Kho ghi sổ đến chuyến cuối trong ngày. Sáng hôm sau người đối chiếu xuất báo cáo Sapo của ngày hôm trước (lúc đó ngày đã đóng, số liệu chuẩn) rồi đối chiếu, lưu trước 10h.</p>

      <h3 className={h3}>Thủ kho: ghi sổ</h3>
      <ol className={ol}>
        <li>Mỗi ngày một trang, kẻ cột: Mã hàng | mỗi người xuất một cột | Nhập | Ghi chú | Lỗi (Hàng nhập, Hàng trả, Nhân sự). Ai xuất hàng thì ghi số vào cột có tên mình. Tên cột ghi giống tên trong danh sách nhân sự (tab Lịch sử và cài đặt) để báo cáo cộng đúng người. Có thể in mẫu trang sổ ở tab đó.</li>
        <li>Hàng lỗi ghi vào 3 cột Lỗi: lỗi từ hàng nhập về, lỗi do khách trả, lỗi do nhân sự làm hỏng. Ghi rõ lý do ở Ghi chú; lỗi do nhân sự thì ghi tên người làm hỏng.</li>
        <li>Ghi ngay lúc xuất kho trên Sapo (đóng gói, dán nhãn). Đơn sỉ, hàng gửi KOL vẫn ghi vào cột của người xuất, chú thích ở Ghi chú. Hàng nhập, hàng hoàn và hủy giao về kho ghi cột Nhập.</li>
        <li>Ghi mã, không ghi tên. Chỉ ghi số xuất nhập trong ngày, không ghi tồn.</li>
        <li>Combo theo số lượng (vd GH083-5 = 5 túi): ghi mã lẻ kèm tổng số cái, hoặc ghi mã combo đều được. Bộ (GH043-1, GH043-2, GH048-2, GH069-6/7/8…): ghi đúng mã bộ. Biến thể màu, mùi, size: ghi riêng từng mã.</li>
        <li>Ghi sai thì gạch một nét, ghi lại bên cạnh, không viết đè.</li>
        <li>Sau chuyến lấy hàng cuối: ký tên, chụp ảnh trang sổ gửi người đối chiếu.</li>
      </ol>

      <h3 className={h3}>Người đối chiếu: so với Sapo</h3>
      <ol className={ol}>
        <li>Sáng hôm sau: tải báo cáo xuất nhập tồn Sapo của ngày hôm trước (Từ ngày = Đến ngày). Không xuất báo cáo trong lúc kho còn đang xuất hàng.</li>
        <li>Gửi ảnh sổ vào Claude kèm câu lệnh ở bước 2, copy bảng trả về.</li>
        <li>Trên trang này: chọn ngày, tải file Sapo ở bước 1, bấm Dán bảng ở bước 3, so nhanh với ảnh.</li>
        <li>Mã báo đỏ thì hỏi lại kho, ghi nguyên nhân vào cột Ghi chú.</li>
        <li>Bấm Lưu phiên đối chiếu. Dữ liệu lưu chung trên hệ thống, không cần sao lưu thủ công.</li>
      </ol>

      <h3 className={h3}>Đọc kết quả</h3>
      <ul className={ul}>
        <li><b>Lệch số</b>: sổ và Sapo đều có mã nhưng số khác nhau.</li>
        <li><b>Thiếu trong sổ</b>: Sapo có phát sinh, sổ không ghi.</li>
        <li><b>Mã không có trên Sapo</b>: ghi sai mã, hoặc mã combo/bộ chưa khai báo thành phần.</li>
        <li><b>Có tách từ bộ</b>: số ở cột Sổ gồm cả phần tách từ các bộ đó. <b>Mã ghi 2 dòng trong sổ</b>: mã xuất hiện ở hai dòng, đã cộng lại, kiểm tra xem có ghi trùng không.</li>
        <li>Lệch hôm trước, bù hôm sau thường là đơn ghi nhận lệch ngày. Xem “Lũy kế lệch theo mã” ở tab Lịch sử trước khi kết luận mất hàng.</li>
      </ul>

      <h3 className={h3}>Báo cáo</h3>
      <ul className={ul}>
        <li>Tab Báo cáo tổng hợp các ngày đã lưu theo tháng: tỷ lệ lệch xuất, tỷ lệ mã lệch, tỷ lệ hàng hỏng (3 loại lỗi) và đánh giá từng nhân sự.</li>
        <li>Đánh giá: Tốt khi lệch ước tính ≤ 1% và lỗi ≤ 0,5% sản lượng; Đạt khi ≤ 3% và ≤ 1%; còn lại Cần xem lại. Lệch ước tính chỉ là chỉ báo, không phải kết luận lỗi của một người.</li>
        <li>Trang này chỉ admin xem được vì có đánh giá từng nhân sự.</li>
      </ul>

      <h3 className={h3}>Kiểm kê</h3>
      <ul className={ul}>
        <li>Cuối tuần: đếm thực tế các mã bán chạy và các mã còn lệch.</li>
        <li>Cuối tháng: đếm toàn bộ mã còn tồn.</li>
        <li>Hai người đếm, ký biên bản; quản lý duyệt rồi mới chỉnh tồn trên Sapo.</li>
      </ul>
    </div>
  );
}

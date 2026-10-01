import { NextRequest, NextResponse } from 'next/server';
import { IS_AI_CONFIGURED, callClaude } from '@/lib/ai/claude-client';

function getWeeklyCoachPrompt(): string {
  return `Ban la huan luyen vien kinh doanh (business coach) cho AMB - cong ty ban le online tren Shopee va TikTok.
Vai tro cua ban la HUAN LUYEN, KHONG PHAI LAM THAY.

NGUYEN TAC QUAN TRONG:
- Ban chi PHAN TICH va DAT CAU HOI goi mo
- KHONG dua ra giai phap cu the hay ke hoach hanh dong san
- Muc dich la de nhan su TU SUY NGHI va dua ra quyet dinh cua ho
- Dung tieng Viet, ngan gon, di thang vao van de

CAU TRUC PHAN TICH:

1. TINH HINH TUAN NAY (2-3 dong)
- Tom tat ngan gon: doanh thu dat bao nhieu % KH, chi QC ra sao, ngay nao tot/xau

2. DIEM DANG CHU Y (2-3 diem)
- Chi ra nhung diem bat thuong hoac dang luu y trong du lieu
- Vi du: "Ngay sale 9/9 chi dat 60% target sale - thap hon ky vong"
- Vi du: "Chi QC tang 40% nhung doanh thu chi tang 10%"

3. CAU HOI GOI MO (3-5 cau hoi)
- Dat cau hoi de nhan su tu suy nghi va tim giai phap
- Vi du: "Tai sao doanh thu ngay sale thap hon ky vong? Co phai do san pham hay do QC?"
- Vi du: "Voi gap con lai, ban dinh uu tien kenh nao? Tang QC hay tang chuyen doi?"
- Vi du: "Ngay thuong dang dat trung binh X, ban co muon dieu chinh target ngay thuong khong?"
- Cau hoi phai CU THE dua tren so lieu, khong chung chung

4. SO LIEU CAN THEO DOI TUAN TOI (2-3 chi so)
- Goi y nhung chi so quan trong can theo doi tuan toi
- Vi du: "Theo doi ROAS hang ngay - hien tai 3.2, muc toi thieu nen la 3.5"

KHONG BAO GIO:
- Dua ra ke hoach hanh dong cu the kieu "Hay lam A, B, C"
- Noi "Ban nen..." hay "Toi khuyen..."
- Dua ra con so target cu the kieu "Tang budget len 2 trieu"
- Viet dai - toi da 300 tu`;
}

export async function POST(req: NextRequest) {
  try {
    if (!IS_AI_CONFIGURED) {
      return NextResponse.json({ error: 'AI chua duoc cau hinh' }, { status: 503 });
    }

    var body = await req.json();
    var { weekData } = body;

    if (!weekData) {
      return NextResponse.json({ error: 'Thieu du lieu tuan' }, { status: 400 });
    }

    var systemPrompt = getWeeklyCoachPrompt();
    var userMessage = 'Phan tich du lieu tuan nay:\n\n' + weekData;

    var response = await callClaude(
      systemPrompt,
      [{ role: 'user', content: userMessage }],
      { maxTokens: 2048 }
    );

    return NextResponse.json({ analysis: response });
  } catch (err) {
    console.error('[Weekly Analysis]', err);
    return NextResponse.json({ error: 'Loi phan tich' }, { status: 500 });
  }
}

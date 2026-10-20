// Đơn tay lên bằng Sapo (CSKH gửi tặng / gửi bù, khách sỉ, KOL KOC...) -> phiếu xuất kho.
// Dữ liệu đến từ nút trên thanh dấu trang chạy NGAY TRONG trang Sapo của nhân sự (đã đăng nhập sẵn): nút đọc đơn
// rồi gửi sang cửa sổ app. Không dùng khóa API, không đưa mật khẩu hay khóa nào vào app.

import type { PxkItem } from './pxk';

export interface SapoOrder {
  code: string; // mã đơn Sapo, vd SON158862
  createdAt: string; // ISO
  source: string; // CSKH, Khách Sỉ, KOL KOC, Web...
  wh: 'HN' | 'HCM' | ''; // kho xuất
  cust: string;
  note: string;
  tags: string[];
  status: string;
  items: PxkItem[];
}

// Mã kho trên Sapo (xem sapo-sync): Chi nhánh Hà Nội / Chi nhánh HCM
export var SAPO_LOCATIONS: Record<string, 'HN' | 'HCM'> = { '654872': 'HN', '781060': 'HCM' };

// Cho phép nhận dữ liệu từ trang Sapo của công ty: https://<tên>.mysapogo.com
export function isSapoOrigin(origin: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.mysapogo\.com$/i.test(origin);
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Dữ liệu từ ngoài vào là dữ liệu không tin cậy: chỉ giữ chuỗi/số đúng kiểu, cắt độ dài, bỏ đơn lỗi.
export function parseSapoPayload(raw: unknown): { orders: SapoOrder[]; skipped: number } {
  var arr: unknown[] = [];
  var obj = raw as { orders?: unknown } | unknown[] | null;
  if (Array.isArray(obj)) arr = obj;
  else if (obj && typeof obj === 'object' && Array.isArray((obj as { orders?: unknown }).orders)) arr = (obj as { orders: unknown[] }).orders;
  var out: SapoOrder[] = [];
  var skipped = 0;
  var seen = new Set<string>();
  arr.slice(0, 2000).forEach(function(x) {
    var o = x as Record<string, unknown>;
    var code = o && str(o.c, 60);
    if (!code || seen.has(code) || !Array.isArray(o.i)) { skipped++; return; }
    var items: PxkItem[] = [];
    (o.i as unknown[]).slice(0, 200).forEach(function(li) {
      var l = li as unknown[];
      if (!Array.isArray(l)) return;
      var qty = Number(l[1]);
      if (!isFinite(qty) || qty <= 0) return;
      items.push({ sku: str(l[0], 60), qty: qty, name: str(l[2], 200) });
    });
    if (items.length === 0) { skipped++; return; }
    seen.add(code);
    out.push({
      code: code,
      createdAt: str(o.t, 40),
      source: str(o.s, 60) || 'Khác',
      wh: SAPO_LOCATIONS[String(o.w)] || '',
      cust: str(o.u, 80),
      note: str(o.n, 200),
      tags: Array.isArray(o.g) ? (o.g as unknown[]).map(function(t) { return str(t, 40); }).filter(function(t) { return !!t; }).slice(0, 10) : [],
      status: str(o.st, 30),
      items: items,
    });
  });
  out.sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
  return { orders: out, skipped: skipped };
}

// Đoạn mã chạy trong trang Sapo (nút trên thanh dấu trang). Chỉ ĐỌC Sapo; không sửa gì trên Sapo.
// Mở cửa sổ app -> đọc đơn tay 3 ngày gần nhất (mọi nguồn trừ Shopee và TikTok Shop, bỏ đơn đã hủy) -> gửi sang app khi app báo sẵn sàng.
var BOOKMARKLET_SRC = '(function(){var APP=__APP__;var DAYS=3;if(location.hostname.indexOf("mysapogo.com")<0){alert("Hãy bấm nút này khi đang ở trang Sapo.");return;}' +
  'var w=window.open(APP+"/kho/phieu-xuat#sapo","amb_pxk");var payload=null,ready=false;' +
  'function send(){if(w&&ready&&payload){w.postMessage({type:"amb-sapo-orders",payload:payload},APP);bar("Đã gửi "+payload.orders.length+" đơn sang app. Quay lại cửa sổ app để lập phiếu.",1);}}' +
  'window.addEventListener("message",function(e){if(e.origin===APP&&e.data&&e.data.type==="amb-ready"){ready=true;send();}});' +
  'var el=document.createElement("div");el.style.cssText="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;color:#fff;padding:10px;font:14px Arial,sans-serif;text-align:center";document.body.appendChild(el);' +
  'function bar(t,done){el.textContent="AMB: "+t;if(done)setTimeout(function(){el.remove();},6000);}' +
  'if(!w){bar("Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up cho trang Sapo rồi bấm lại.",1);return;}' +
  'bar("Đang lấy đơn tay từ Sapo...");' +
  '(async function(){try{var vn=new Date(Date.now()+7*3600000);var min=new Date(Date.UTC(vn.getUTCFullYear(),vn.getUTCMonth(),vn.getUTCDate())-7*3600000-(DAYS-1)*86400000).toISOString().slice(0,19)+"Z";' +
  'var sr=(await(await fetch("/admin/order_sources.json?limit=50",{credentials:"include"})).json()).order_sources||[];var names={};sr.forEach(function(s){names[s.id]=s.name;});' +
  'var out=[];for(var k=0;k<sr.length;k++){var s=sr[k];if(s.name==="Shopee"||s.name==="TiktokShop")continue;' +
  'for(var p=1;p<=8;p++){var j=await(await fetch("/admin/orders.json?limit=250&page="+p+"&source_id="+s.id+"&created_on_min="+min,{credentials:"include"})).json();var os=j.orders||[];' +
  'os.forEach(function(o){if(o.status==="cancelled")return;out.push({c:o.code,t:o.created_on,s:names[o.source_id]||"",w:o.location_id,u:(o.customer_data&&o.customer_data.name)||"",n:o.note||"",g:o.tags||[],st:o.status,' +
  'i:(o.order_line_items||[]).map(function(l){return[l.sku||"",l.quantity,l.product_name?(l.product_name+(l.variant_name&&l.variant_name!==l.product_name?" - "+l.variant_name:"")):""];})});});if(os.length<250)break;}}' +
  'payload={v:1,orders:out};if(ready)send();else bar("Đã đọc "+out.length+" đơn. Đang chờ cửa sổ app...");}catch(err){bar("Lỗi đọc Sapo: "+err.message,1);}})();})();';

export function buildSapoBookmarklet(appOrigin: string): string {
  return 'javascript:' + encodeURIComponent(BOOKMARKLET_SRC.replace('__APP__', JSON.stringify(appOrigin)));
}

export var SAPO_SOURCE_COLORS: Record<string, string> = {
  'CSKH': 'bg-sky-500/15 text-sky-300',
  'Khách Sỉ': 'bg-violet-500/15 text-violet-300',
  'KOL KOC': 'bg-fuchsia-500/15 text-fuchsia-300',
  'FBS': 'bg-amber-500/15 text-amber-300',
};

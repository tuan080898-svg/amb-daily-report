import { BookingSnapshot, BookingLive, ContactRow, ScheduleRow, UNKNOWN_STAFF, splitProducts, stageOf, toVnDate, STAGE } from './booking';

const LARK_API = 'https://open.larksuite.com/open-apis';

// Các bảng trong Lark Base booking (ID bảng không phải bí mật; mã Base lấy từ biến môi trường LARK_BOOKING_BASE_TOKEN)
const CONTACT_TABLES: Array<{ staff: string; tableId: string }> = [
  { staff: 'Trinh', tableId: 'tbl6PSI3URTQOlFs' },
  { staff: 'Chang Hana', tableId: 'tblDbg3Y7f6jBwnw' },
  { staff: 'Giang', tableId: 'tblM6rvvjm7VJqu9' },
  { staff: 'Yến Chi', tableId: 'tblFRO1bpGqsctG2' },
  { staff: 'Chi', tableId: 'tblQqnDqH9ZUzNxx' },
];
const SCHEDULE_TABLE = 'tblDJoTW5McLCHt2';

// Cột cần đọc. Mỗi cột có danh sách tên ứng viên (đề phòng bị đổi tên trên Lark); cột ngày có thể dò theo kiểu dữ liệu ngày.
interface ColSpec { key: string; names: string[]; dateType?: boolean; optional?: boolean }
const CONTACT_COLS: ColSpec[] = [
  { key: 'date', names: ['Ngày', 'Ngày liên hệ'], dateType: true },
  { key: 'status', names: ['Trạng thái'] },
  { key: 'code', names: ['Mã KOCs', 'Mã KOC'], optional: true },
  { key: 'name', names: ['Tên'], optional: true },
  { key: 'product', names: ['Sản phẩm'], optional: true },
];
const SCHEDULE_COLS: ColSpec[] = [
  { key: 'date', names: ['Ngày hẹn lên', 'Ngày hẹn', 'Ngày'], dateType: true },
  { key: 'code', names: ['Mã KOCs', 'Mã KOC'], optional: true },
  { key: 'name', names: ['Tên'], optional: true },
  { key: 'product', names: ['Sản phẩm'], optional: true },
  { key: 'aired', names: ['Tích onair', 'Tích on air'] },
  { key: 'staff', names: ['Người phụ trách'], optional: true },
];

interface LarkRecord { record_id: string; fields: Record<string, unknown> }

let cachedToken = { token: '', expiresAt: 0 };

async function getTenantToken(): Promise<string> {
  if (cachedToken.token && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetch(LARK_API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID || '', app_secret: process.env.LARK_APP_SECRET || '' }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Lark token error: ' + json.msg);
  cachedToken = { token: json.tenant_access_token, expiresAt: Date.now() + (json.expire - 60) * 1000 };
  return cachedToken.token;
}

// API tìm kiếm bọc cột công thức/tra cứu dạng {type, value}; bỏ lớp bọc rồi nối thành chuỗi
function flat(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(flat).filter(Boolean).join(',');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('value' in o && 'type' in o) return flat(o.value);
    if (typeof o.text === 'string') return o.text;
    if (typeof o.link === 'string') return o.link;
    if (typeof o.name === 'string') return o.name;
    return '';
  }
  return String(v);
}

function sleep(ms: number): Promise<void> { return new Promise(function(r) { setTimeout(r, ms); }); }

function norm(x: string): string { return x.normalize('NFC').trim().toLowerCase(); }

async function resolveColumns(baseToken: string, tableId: string, specs: ColSpec[]): Promise<Record<string, string>> {
  const token = await getTenantToken();
  const res = await fetch(LARK_API + '/bitable/v1/apps/' + baseToken + '/tables/' + tableId + '/fields?page_size=100', { headers: { Authorization: 'Bearer ' + token } });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Lark ' + tableId + ' (danh sách cột): ' + json.msg);
  const fields: Array<{ field_name: string; type: number }> = json.data.items || [];
  const out: Record<string, string> = {};
  specs.forEach(function(spec) {
    let found: string | undefined;
    for (let i = 0; i < spec.names.length && !found; i++) {
      const m = fields.find(function(f) { return norm(f.field_name) === norm(spec.names[i]); });
      if (m) found = m.field_name;
    }
    if (!found && spec.dateType) {
      const m = fields.find(function(f) { return f.type === 5 && norm(f.field_name).indexOf('ngay') === 0; }) ||
        fields.find(function(f) { return f.type === 5 && /^ng[aà]y/.test(norm(f.field_name)); }) ||
        fields.find(function(f) { return f.type === 5; });
      if (m) found = m.field_name;
    }
    if (found) out[spec.key] = found;
    else if (!spec.optional) throw new Error('Bảng ' + tableId + ' không còn cột "' + spec.names[0] + '" (có thể đã bị đổi tên trên Lark)');
  });
  return out;
}

interface LarkFilter { conjunction: 'and'; conditions: Array<{ field_name: string; operator: string; value: string[] }> }

async function fetchTable(baseToken: string, tableId: string, fieldNames: string[], filter?: LarkFilter): Promise<LarkRecord[]> {
  const items: LarkRecord[] = [];
  let pageToken: string | undefined;
  do {
    const url = LARK_API + '/bitable/v1/apps/' + baseToken + '/tables/' + tableId + '/records/search?page_size=500' +
      (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
    let json: { code: number; msg?: string; data?: { items?: LarkRecord[]; has_more?: boolean; page_token?: string } } | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const token = await getTenantToken();
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(filter ? { field_names: fieldNames, filter: filter } : { field_names: fieldNames }),
      });
      json = await res.json();
      if (json && json.code === 0) break;
      const rateLimited = res.status === 429 || (json && (json.code === 99991400 || json.code === 1254290));
      if (!rateLimited || attempt === 4) throw new Error('Lark ' + tableId + ': ' + (json ? json.msg : 'HTTP ' + res.status));
      await sleep(1500 * attempt);
    }
    const data = json!.data || {};
    (data.items || []).forEach(function(it) { items.push(it); });
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return items;
}

// Lọc các dòng có ngày từ liveFrom trở đi (lùi thêm 1 ngày cho chắc, dòng thừa được bỏ sau khi đọc)
function sinceFilter(dateField: string, liveFrom: string): LarkFilter {
  const ms = Date.parse(liveFrom + 'T00:00:00+07:00') - 86400000;
  return { conjunction: 'and', conditions: [{ field_name: dateField, operator: 'isGreater', value: ['ExactDate', String(ms)] }] };
}

interface ReadResult {
  staff: string[];
  products: string[];
  kocs: string[];
  contacts: ContactRow[];
  schedules: ScheduleRow[];
  skippedNoDate: number;
  tables: Array<{ name: string; rows: number }>;
}

// Đọc các bảng booking từ Lark. Không truyền opts = đọc toàn bộ. Có liveFrom = chỉ đọc các dòng từ ngày đó trở đi,
// dùng từ điển (nhân sự, sản phẩm, KOC) của bản lưu sẵn để mã số khớp nhau khi ghép.
async function readBooking(opts: { base?: BookingSnapshot; liveFrom?: string }): Promise<ReadResult> {
  const baseToken = process.env.LARK_BOOKING_BASE_TOKEN || '';
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) throw new Error('Chưa cấu hình LARK_APP_ID / LARK_APP_SECRET');
  if (!baseToken) throw new Error('Chưa cấu hình LARK_BOOKING_BASE_TOKEN');
  const liveFrom = opts.liveFrom;

  const results = await Promise.all([
    Promise.all(CONTACT_TABLES.map(async function(t) {
      const cols = await resolveColumns(baseToken, t.tableId, CONTACT_COLS);
      const filter = liveFrom ? sinceFilter(cols.date, liveFrom) : undefined;
      return { cols: cols, records: await fetchTable(baseToken, t.tableId, Object.values(cols), filter) };
    })),
    (async function() {
      const cols = await resolveColumns(baseToken, SCHEDULE_TABLE, SCHEDULE_COLS);
      const filter = liveFrom ? sinceFilter(cols.date, liveFrom) : undefined;
      return { cols: cols, records: await fetchTable(baseToken, SCHEDULE_TABLE, Object.values(cols), filter) };
    })(),
  ]);
  const contactTables = results[0];
  const scheduleRecords = results[1].records;
  const scheduleCols = results[1].cols;

  const base = opts.base;
  const staff: string[] = base ? base.staff.slice() : CONTACT_TABLES.map(function(t) { return t.staff; });
  const products: string[] = base ? base.products.slice() : [];
  const kocs: string[] = base ? base.kocs.slice() : [];
  const productIdx = new Map<string, number>();
  const kocIdx = new Map<string, number>();
  products.forEach(function(n, i) { productIdx.set(n, i); });
  kocs.forEach(function(k, i) { kocIdx.set(k, i); });
  let skippedNoDate = 0;

  function productIds(raw: string | string[]): number[] {
    return splitProducts(raw).map(function(name) {
      let i = productIdx.get(name);
      if (i === undefined) { i = products.length; products.push(name); productIdx.set(name, i); }
      return i;
    });
  }
  function kocId(name: string, code: string, fallback: string): number {
    const key = (name.replace(/^@/, '').trim().toLowerCase()) || code.trim().toLowerCase() || fallback;
    let i = kocIdx.get(key);
    if (i === undefined) { i = kocs.length; kocs.push(key); kocIdx.set(key, i); }
    return i;
  }
  const tooOld = function(date: string): boolean { return !!liveFrom && date < liveFrom; };

  const contacts: ContactRow[] = [];
  contactTables.forEach(function(tbl, ti) {
    const c = tbl.cols;
    tbl.records.forEach(function(rec) {
      const f = rec.fields;
      const stage = stageOf(flat(f[c.status]));
      if (stage === STAGE.NONE) return;
      const date = toVnDate(f[c.date]);
      if (!date) { skippedNoDate++; return; }
      if (tooOld(date)) return;
      const pv = c.product ? f[c.product] : '';
      const rawProducts = Array.isArray(pv) ? (pv as unknown[]).map(flat) : flat(pv);
      contacts.push([date, ti, stage, kocId(c.name ? flat(f[c.name]) : '', c.code ? flat(f[c.code]) : '', 'c-' + rec.record_id), productIds(rawProducts)]);
    });
  });

  const schedules: ScheduleRow[] = [];
  scheduleRecords.forEach(function(rec) {
    const f = rec.fields;
    const sc = scheduleCols;
    const date = toVnDate(f[sc.date]);
    if (!date) { skippedNoDate++; return; }
    if (tooOld(date)) return;
    const rawStaff = sc.staff ? flat(f[sc.staff]).trim() : '';
    const sName = rawStaff || UNKNOWN_STAFF;
    let si = staff.indexOf(sName);
    if (si < 0) { si = staff.length; staff.push(sName); }
    const aired = flat(f[sc.aired]).trim() ? 1 : 0;
    schedules.push([date, si, aired, kocId(sc.name ? flat(f[sc.name]) : '', sc.code ? flat(f[sc.code]) : '', 's-' + rec.record_id), productIds(sc.product ? flat(f[sc.product]) : '')]);
  });

  return {
    staff: staff,
    products: products,
    kocs: kocs,
    contacts: contacts,
    schedules: schedules,
    skippedNoDate: skippedNoDate,
    tables: CONTACT_TABLES.map(function(t, i) { return { name: t.staff, rows: contactTables[i].records.length }; }).concat([{ name: 'Lịch ON AIR', rows: scheduleRecords.length }]),
  };
}

// Đọc toàn bộ (làm bản lưu sẵn cho phần lịch sử)
export async function buildBookingSnapshot(): Promise<BookingSnapshot> {
  const r = await readBooking({});
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    staff: r.staff,
    products: r.products,
    kocs: r.kocs,
    contacts: r.contacts,
    schedules: r.schedules,
    meta: { contactRows: r.contacts.length, scheduleRows: r.schedules.length, skippedNoDate: r.skippedNoDate, tables: r.tables },
  };
}

// Đọc trực tiếp phần mới (từ liveFrom trở đi) để ghép lên bản lưu sẵn
export async function buildBookingLive(base: BookingSnapshot, liveFrom: string): Promise<BookingLive> {
  const r = await readBooking({ base: base, liveFrom: liveFrom });
  return { generatedAt: new Date().toISOString(), baseGeneratedAt: base.generatedAt, liveFrom: liveFrom, staff: r.staff, products: r.products, contacts: r.contacts, schedules: r.schedules };
}

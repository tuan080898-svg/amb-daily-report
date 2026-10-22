import type { UserOptions, RowInput } from 'jspdf-autotable';
import { fmtDate, fmtDateTime, fmtTime, pxkBatchQty, slipWarnings, splitShopeeName, summarizePxk, PXK_PLATFORM_LABELS, type PxkBatch, type PxkDaySummary } from './pxk';

// Tải phiếu xuất kho về máy dưới dạng file PDF (khổ A4, giống bản in).
// Thư viện PDF và font tiếng Việt (DejaVu Sans) chỉ được tải khi bấm "Tải về".

var fontCache: { regular: string; bold: string } | null = null;

async function loadFontBase64(url: string): Promise<string> {
  var res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được font ' + url + ' (HTTP ' + res.status + ')');
  var bytes = new Uint8Array(await res.arrayBuffer());
  var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache;
  var both = await Promise.all([loadFontBase64('/fonts/DejaVuSans.ttf'), loadFontBase64('/fonts/DejaVuSans-Bold.ttf')]);
  fontCache = { regular: both[0], bold: both[1] };
  return fontCache;
}

function shorten(t: string): string {
  return t.length > 80 ? t.slice(0, 78).trim() + '…' : t;
}

export function pxkPdfFileName(batches: PxkBatch[]): string {
  if (batches.length === 1) return batches[0].id + '.pdf';
  return 'Phieu-xuat-kho-' + batches[0].printDate + '-' + batches.length + '-phieu.pdf';
}

var LEFT = 10, RIGHT = 200, MAXY = 284;

// Tạo tài liệu PDF A4 đã nạp font tiếng Việt, kèm các hàm vẽ bảng dùng chung
async function openPdf(title: string) {
  var jspdf = await import('jspdf');
  var autoTable = (await import('jspdf-autotable')).default;
  var fonts = await loadFonts();
  var doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title: title });
  var tableBase: UserOptions = {
    theme: 'grid',
    margin: { left: LEFT, right: 210 - RIGHT, top: 14, bottom: 14 },
    styles: { font: 'DejaVu', fontSize: 8.5, cellPadding: 1.6, lineColor: [136, 136, 136], lineWidth: 0.2, textColor: [17, 17, 17], valign: 'middle' },
    headStyles: { fillColor: [238, 238, 238], textColor: [17, 17, 17], fontStyle: 'bold', halign: 'center', fontSize: 8 },
  };
  function table(opts: UserOptions) { autoTable(doc, Object.assign({}, tableBase, opts)); }
  function lastY(): number {
    var d = doc as unknown as { lastAutoTable?: { finalY: number } };
    return d.lastAutoTable ? d.lastAutoTable.finalY : 30;
  }
  function heading(text: string, y: number) {
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 17, 17);
    doc.text(text, LEFT, y);
  }
  function signatures(y0: number) {
    var ys = y0; if (ys > MAXY - 30) { doc.addPage(); ys = 24; }
    var cols = [['Người lập phiếu', 30], ['Người nhặt hàng', 105], ['Người kiểm hàng', 180]] as Array<[string, number]>;
    cols.forEach(function(c) { doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.setTextColor(17, 17, 17); doc.text(c[0], c[1], ys, { align: 'center' }); doc.setFont('DejaVu', 'normal'); doc.setFontSize(7.5); doc.setTextColor(102, 102, 102); doc.text('(ký, ghi rõ họ tên)', c[1], ys + 4, { align: 'center' }); doc.setTextColor(17, 17, 17); });
  }
  function finish(fileName: string) {
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(85, 85, 85);
      doc.text('Trang ' + p + '/' + total, RIGHT, 291, { align: 'right' });
    }
    doc.save(fileName);
  }
  return { doc: doc, table: table, lastY: lastY, heading: heading, signatures: signatures, finish: finish };
}

export async function downloadPxkPdf(batches: PxkBatch[], opts: { showOrders: boolean }): Promise<void> {
  if (batches.length === 0) return;
  var pdf = await openPdf(batches.length === 1 ? 'Phiếu xuất kho ' + batches[0].id : 'Phiếu xuất kho ' + batches.length + ' phiếu');
  var doc = pdf.doc, table = pdf.table, lastY = pdf.lastY, heading = pdf.heading;

  batches.forEach(function(batch, bi) {
    if (bi > 0) doc.addPage();
    var sum = summarizePxk(batch.orders);
    var shopee = batch.platform === 'shopee';
    var whLabel = batch.warehouse === 'HN' ? 'Kho Hà Nội · ' : batch.warehouse === 'HCM' ? 'Kho HCM · ' : '';

    // Đầu phiếu
    doc.setTextColor(17, 17, 17);
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(14);
    doc.text('PHIẾU XUẤT KHO — ' + PXK_PLATFORM_LABELS[batch.platform].toUpperCase(), LEFT, 16);
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(68, 68, 68);
    doc.text(whLabel + (batch.shop ? 'SHOP NHÂN SỰ (bán riêng, không thuộc công ty) · ' : '') + 'Mã phiếu: ' + batch.id, LEFT, 21.5);
    doc.setTextColor(17, 17, 17);
    doc.text('Ngày in phiếu: ' + fmtDateTime(batch), RIGHT, 14, { align: 'right' });
    doc.text('Số đơn: ' + sum.orderCount + ' · Tổng SL: ' + sum.totalQty, RIGHT, 19, { align: 'right' });
    if (batch.createdBy) { doc.setTextColor(68, 68, 68); doc.text('Người lập: ' + batch.createdBy, RIGHT, 24, { align: 'right' }); doc.setTextColor(17, 17, 17); }
    doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6); doc.line(LEFT, 26, RIGHT, 26);

    var y = 31;
    // Khung cảnh báo
    var warns = slipWarnings(batch, sum);
    if (warns.length > 0) {
      doc.setFont('DejaVu', 'bold'); doc.setFontSize(8.5);
      var wrapped: string[] = [];
      warns.forEach(function(w) { wrapped = wrapped.concat(doc.splitTextToSize('⚠ ' + w, RIGHT - LEFT - 5) as string[]); });
      var boxH = wrapped.length * 4 + 3;
      doc.setFillColor(255, 240, 240); doc.setDrawColor(204, 0, 0); doc.setLineWidth(0.5);
      doc.rect(LEFT, y - 3, RIGHT - LEFT, boxH, 'FD');
      doc.setTextColor(153, 0, 0);
      doc.text(wrapped, LEFT + 2.5, y + 1);
      doc.setTextColor(17, 17, 17);
      y += boxH + 3;
    }

    // Bảng 1: tổng hợp theo SKU
    heading('1. Tổng hợp theo SKU', y);
    var head1: string[]; var body1: RowInput[] = []; var warnFrom = sum.skuLines.length;
    if (shopee) {
      head1 = ['#', 'SKU', 'Tên sản phẩm', 'Phân loại hàng', 'SL', 'Order SN'];
      sum.skuLines.forEach(function(l, i) { body1.push([i + 1, l.sku, shorten(l.name || '—') + (l.pack ? ' — GÓI SẴN' : ''), l.variation, l.qty, l.orderIds.join('\n')]); });
      sum.unresolved.forEach(function(u, i) { var sp = splitShopeeName(u.name); body1.push([sum.skuLines.length + i + 1, 'chưa có SKU', shorten(sp.name), sp.variation, u.qty, u.orderIds.join('\n')]); });
      body1.push([{ content: 'Tổng cộng', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, { content: String(sum.totalQty), styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } }, '']);
    } else {
      head1 = ['#', 'SKU', 'Tên sản phẩm', 'Số đơn', 'Số lượng'];
      sum.skuLines.forEach(function(l, i) { body1.push([i + 1, l.sku, (l.name || '—') + (l.pack ? ' — GÓI SẴN' : ''), l.orders, l.qty]); });
      sum.unresolved.forEach(function(u, i) { body1.push([sum.skuLines.length + i + 1, '(chưa có SKU)', u.name, u.orders, u.qty]); });
      body1.push([{ content: 'Tổng cộng', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, { content: String(sum.totalQty), styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } }]);
    }
    table({
      startY: y + 2, head: [head1], body: body1,
      columnStyles: shopee
        ? { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 22, font: 'DejaVu', fontSize: 7.5 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 30 }, 4: { cellWidth: 11, halign: 'center', fontStyle: 'bold', fontSize: 10 }, 5: { cellWidth: 38, fontSize: 6.5 } }
        : { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 34, fontSize: 8 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 22, halign: 'center', fontStyle: 'bold', fontSize: 10 } },
      didParseCell: function(data) {
        if (data.section === 'body' && data.row.index >= warnFrom && data.row.index < warnFrom + sum.unresolved.length) data.cell.styles.fillColor = [255, 243, 205];
      },
    });

    // Bảng 2: quy ra sản phẩm gốc
    var next = 2;
    if (sum.hasCombo && sum.productLines.length > 0) {
      var y2 = lastY() + 7; if (y2 > MAXY - 25) { doc.addPage(); y2 = 18; }
      heading('2. Quy ra sản phẩm gốc cần nhặt', y2);
      table({
        startY: y2 + 2, head: [['#', 'SKU', 'Sản phẩm', 'Số lượng', 'Đã nhặt']],
        body: sum.productLines.map(function(p, i) { return [i + 1, p.skus || '—', p.product, p.qty, '']; }),
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 38, fontSize: 7.5 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 22, halign: 'center', fontStyle: 'bold', fontSize: 10 }, 4: { cellWidth: 20 } },
      });
      next = 3;
    }

    // Chữ ký
    var ys = lastY() + 12; if (ys > MAXY - 30) { doc.addPage(); ys = 24; }
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.setTextColor(17, 17, 17);
    var cols = [['Người lập phiếu', 30], ['Người nhặt hàng', 105], ['Người kiểm hàng', 180]] as Array<[string, number]>;
    cols.forEach(function(c) { doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.text(c[0], c[1], ys, { align: 'center' }); doc.setFont('DejaVu', 'normal'); doc.setFontSize(7.5); doc.setTextColor(102, 102, 102); doc.text('(ký, ghi rõ họ tên)', c[1], ys + 4, { align: 'center' }); doc.setTextColor(17, 17, 17); });

    // Danh sách từng đơn
    if (opts.showOrders) {
      doc.addPage();
      heading(next + '. Danh sách từng đơn (để kiểm tra)', 18);
      table({
        startY: 20, head: [['#', 'Mã đơn hàng', 'Sản phẩm × SL', 'SL', 'Đủ']],
        body: batch.orders.map(function(o, i) {
          return [i + 1, o.orderId, o.items.map(function(it) { return (it.sku || it.name || '?') + ' × ' + it.qty + (it.packFrom ? ' (gói sẵn, từ ' + it.packFrom + ')' : '') + (it.noteFrom ? ' (đọc từ ghi chú)' : ''); }).join(', ') + (o.note ? '\nGhi chú: ' + o.note : ''), o.items.reduce(function(s, x) { return s + x.qty; }, 0), ''];
        }),
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 40, fontSize: 7.5 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 12 } },
      });
    }
  });

  pdf.finish(pxkPdfFileName(batches));
}

// Phiếu tổng hợp cuối ngày: gộp mọi phiếu trong ngày thành một phiếu tên sản phẩm + tổng số lượng
export async function downloadPxkDayPdf(sum: PxkDaySummary): Promise<void> {
  if (sum.batches.length === 0) return;
  var pdf = await openPdf('Phiếu tổng hợp xuất kho ' + sum.label);
  var doc = pdf.doc, table = pdf.table, lastY = pdf.lastY, heading = pdf.heading;
  var stamp = fmtTime(new Date().toISOString());

  doc.setTextColor(17, 17, 17);
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(14);
  doc.text('PHIẾU TỔNG HỢP XUẤT KHO — ' + sum.label, LEFT, 16);
  if (sum.scope) { doc.setFontSize(10); doc.text(sum.scope.toUpperCase(), LEFT, 21); doc.setFontSize(14); }
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(68, 68, 68);
  doc.text('Tổng hợp từ ' + sum.batches.length + ' phiếu xuất kho ' + (sum.isRange ? 'trong kỳ' : 'trong ngày'), LEFT, sum.scope ? 25 : 21.5);
  doc.setTextColor(17, 17, 17);
  doc.text('Lập lúc: ' + stamp, RIGHT, 14, { align: 'right' });
  doc.text('Số đơn: ' + (sum.shopeeOrders + sum.tiktokOrders + sum.sapoOrders) + ' (Shopee ' + sum.shopeeOrders + ' · TikTok ' + sum.tiktokOrders + ' · ngoài sàn ' + sum.sapoOrders + ')', RIGHT, 19, { align: 'right' });
  doc.text('Tổng SL: ' + sum.totalQty, RIGHT, 24, { align: 'right' });
  doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6); doc.line(LEFT, 26, RIGHT, 26);

  var y = 31;
  if (sum.warnings.length > 0) {
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(8.5);
    var wrapped: string[] = [];
    sum.warnings.forEach(function(w) { wrapped = wrapped.concat(doc.splitTextToSize('⚠ ' + w, RIGHT - LEFT - 5) as string[]); });
    var boxH = wrapped.length * 4 + 3;
    doc.setFillColor(255, 240, 240); doc.setDrawColor(204, 0, 0); doc.setLineWidth(0.5);
    doc.rect(LEFT, y - 3, RIGHT - LEFT, boxH, 'FD');
    doc.setTextColor(153, 0, 0);
    doc.text(wrapped, LEFT + 2.5, y + 1);
    doc.setTextColor(17, 17, 17);
    y += boxH + 3;
  }

  if (sum.isRange) {
    heading('1. Theo từng ngày', y);
    var dayBody: RowInput[] = sum.byDay.map(function(d, i) { return [i + 1, fmtDate(d.date), d.batches, d.orders, d.qty]; });
    dayBody.push([{ content: 'Tổng cộng', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, { content: String(sum.batches.length), styles: { halign: 'center', fontStyle: 'bold' } }, { content: String(sum.shopeeOrders + sum.tiktokOrders + sum.sapoOrders), styles: { halign: 'center', fontStyle: 'bold' } }, { content: String(sum.byDay.reduce(function(s, d) { return s + d.qty; }, 0)), styles: { halign: 'center', fontStyle: 'bold' } }]);
    table({
      startY: y + 2, head: [['#', 'Ngày', 'Số phiếu', 'Số đơn', 'SL']], body: dayBody,
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto', halign: 'center' }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: 24, halign: 'center' }, 4: { cellWidth: 24, halign: 'center' } },
    });
  } else {
    heading('1. Các phiếu trong ngày', y);
    table({
      startY: y + 2, head: [['#', 'Mã phiếu', 'Sàn', 'Giờ lập', 'Người lập', 'Số đơn', 'SL']],
      body: sum.batches.map(function(b, i) { return [i + 1, b.id, PXK_PLATFORM_LABELS[b.platform] + (b.shop ? '\nShop nhân sự' : ''), fmtTime(b.createdAt), b.createdBy, b.orders.length, pxkBatchQty(b)]; }),
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 44, fontSize: 8 }, 2: { cellWidth: 24 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 'auto' }, 5: { cellWidth: 18, halign: 'center' }, 6: { cellWidth: 18, halign: 'center' } },
    });
  }

  var y2 = lastY() + 8; if (y2 > MAXY - 25) { doc.addPage(); y2 = 18; }
  heading('2. Tổng hợp sản phẩm cần xuất ' + (sum.isRange ? 'trong kỳ' : 'trong ngày'), y2);
  var sumShopee = sum.rows.reduce(function(s, r) { return s + r.shopee; }, 0);
  var sumTiktok = sum.rows.reduce(function(s, r) { return s + r.tiktok; }, 0);
  var sumSapo = sum.rows.reduce(function(s, r) { return s + r.sapo; }, 0);
  var body: RowInput[] = sum.rows.map(function(r, i) {
    return [i + 1, r.note ? r.name + '\n(' + r.note + ')' : r.name, r.skus || '—', r.shopee || '', r.tiktok || '', r.sapo || '', r.total, ''];
  });
  body.push([{ content: 'Tổng cộng', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: String(sumShopee), styles: { halign: 'center', fontStyle: 'bold' } }, { content: String(sumTiktok), styles: { halign: 'center', fontStyle: 'bold' } }, { content: String(sumSapo), styles: { halign: 'center', fontStyle: 'bold' } }, { content: String(sum.totalQty), styles: { halign: 'center', fontStyle: 'bold', fontSize: 10 } }, '']);
  table({
    startY: y2 + 2, head: [['#', 'Tên sản phẩm', 'SKU', 'Shopee', 'TikTok', 'Ngoài sàn', 'Tổng SL', 'Đã xuất']], body: body,
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 34, fontSize: 7.5 }, 3: { cellWidth: 17, halign: 'center' }, 4: { cellWidth: 17, halign: 'center' }, 5: { cellWidth: 19, halign: 'center' }, 6: { cellWidth: 20, halign: 'center', fontStyle: 'bold', fontSize: 10 }, 7: { cellWidth: 16 } },
    didParseCell: function(data) {
      if (data.section === 'body' && data.row.index < sum.rows.length && sum.rows[data.row.index].note) data.cell.styles.fillColor = [255, 243, 205];
    },
  });

  pdf.signatures(lastY() + 14);
  pdf.finish('Phieu-tong-hop-' + sum.fileKey + (sum.scope ? '-' + sum.scope.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') : '') + '.pdf');
}

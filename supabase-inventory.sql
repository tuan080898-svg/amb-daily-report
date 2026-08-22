-- =============================================
-- SUPABASE INVENTORY - CHẠY 1 LẦN DUY NHẤT
-- Xóa bảng cũ (nếu có) rồi tạo lại từ đầu
-- =============================================

-- 1. Xóa bảng cũ
DROP TABLE IF EXISTS inventory_transactions;
DROP TABLE IF EXISTS inventory_configs;

-- 2. Tạo bảng cấu hình tồn kho
CREATE TABLE inventory_configs (
  product TEXT NOT NULL,
  warehouse TEXT NOT NULL DEFAULT 'HCM',
  initial_stock INTEGER DEFAULT 0,
  alert_threshold INTEGER DEFAULT 10,
  PRIMARY KEY (product, warehouse)
);

-- 3. Tạo bảng giao dịch kho
CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'import',
  note TEXT DEFAULT '',
  warehouse TEXT DEFAULT 'HCM'
);

-- 4. Index cho truy vấn nhanh
CREATE INDEX idx_inv_tx_product ON inventory_transactions (product);
CREATE INDEX idx_inv_tx_date ON inventory_transactions (date);
CREATE INDEX idx_inv_tx_warehouse ON inventory_transactions (warehouse);

-- 5. Cấp quyền cho anon + authenticated roles
GRANT ALL ON inventory_configs TO anon, authenticated;
GRANT ALL ON inventory_transactions TO anon, authenticated;

-- 6. Bật RLS + tạo policy cho phép đọc/ghi
ALTER TABLE inventory_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_configs_all" ON inventory_configs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_transactions_all" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);

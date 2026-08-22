-- Bảng cấu hình tồn kho (tồn đầu, ngưỡng cảnh báo)
CREATE TABLE IF NOT EXISTS inventory_configs (
  product TEXT NOT NULL,
  warehouse TEXT NOT NULL DEFAULT 'HCM',
  initial_stock INTEGER DEFAULT 0,
  alert_threshold INTEGER DEFAULT 10,
  PRIMARY KEY (product, warehouse)
);

-- Bảng giao dịch kho (nhập, xuất, bán, kiểm kho)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'import',
  note TEXT DEFAULT '',
  warehouse TEXT DEFAULT 'HCM'
);

-- Index cho truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions (product);
CREATE INDEX IF NOT EXISTS idx_inv_tx_date ON inventory_transactions (date);
CREATE INDEX IF NOT EXISTS idx_inv_tx_warehouse ON inventory_transactions (warehouse);

-- ============================================
-- Migration: PnL / COGS / Checklist → PostgreSQL
-- Chạy SQL này trên Supabase SQL Editor
-- ============================================

-- 1. Bảng giá vốn (COGS)
CREATE TABLE IF NOT EXISTS cogs_entries (
  sku text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  cost integer NOT NULL DEFAULT 0
);

-- 2. Cấu hình PnL (tỷ lệ phí sàn, vận hành)
CREATE TABLE IF NOT EXISTS pnl_config (
  id integer PRIMARY KEY DEFAULT 1,
  shopee_fee_rate numeric NOT NULL DEFAULT 34,
  tiktok_fee_rate numeric NOT NULL DEFAULT 34,
  opex_rate numeric NOT NULL DEFAULT 16
);
INSERT INTO pnl_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 3. PnL imports (daily_data lưu JSONB)
CREATE TABLE IF NOT EXISTS pnl_imports (
  id text PRIMARY KEY,
  shop_id text NOT NULL,
  shop_name text NOT NULL,
  channel text NOT NULL,
  date_from text NOT NULL,
  date_to text NOT NULL,
  daily_data jsonb NOT NULL DEFAULT '[]',
  imported_at text NOT NULL
);

-- 4. Checklist tasks
CREATE TABLE IF NOT EXISTS checklist_tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  deadline text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

-- 5. Checklist entries
CREATE TABLE IF NOT EXISTS checklist_entries (
  date text NOT NULL,
  task_id text NOT NULL,
  user_id text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (date, task_id, user_id)
);

-- RLS policies (cho phép anon key truy cập)
ALTER TABLE cogs_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for cogs_entries" ON cogs_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pnl_config" ON pnl_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pnl_imports" ON pnl_imports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for checklist_tasks" ON checklist_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for checklist_entries" ON checklist_entries FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PnL Module — Tạo Storage Bucket
-- Chạy trong Supabase SQL Editor
-- =============================================

-- 1. Tạo bucket pnl-data
INSERT INTO storage.buckets (id, name, public)
VALUES ('pnl-data', 'pnl-data', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies cho bucket pnl-data (dùng anon key)
CREATE POLICY "pnl_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'pnl-data');

CREATE POLICY "pnl_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pnl-data');

CREATE POLICY "pnl_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'pnl-data')
  WITH CHECK (bucket_id = 'pnl-data');

CREATE POLICY "pnl_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'pnl-data');

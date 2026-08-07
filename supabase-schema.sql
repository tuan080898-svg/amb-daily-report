-- =============================================
-- AMB Daily Report — Supabase Schema (FULL RESET)
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- Xoá tất cả bảng cũ (nếu có)
drop table if exists daily_reports cascade;
drop table if exists monthly_kpis cascade;
drop table if exists monthly_plans cascade;
drop table if exists app_config cascade;
drop table if exists shops cascade;
drop table if exists users cascade;

-- 1. Bảng users
create table users (
  id text primary key,
  email text unique not null,
  name text not null,
  role text not null default 'employee',
  assigned_shops text[] default '{}',
  password text not null,
  created_at timestamptz default now()
);

-- 2. Bảng shops
create table shops (
  id text primary key,
  name text not null,
  channel text not null,
  region text not null,
  assigned_to text[] default '{}',
  default_monthly_target bigint default 0,
  created_at timestamptz default now()
);

-- 3. Bảng daily_reports
create table daily_reports (
  id text primary key,
  date text not null,
  shop_id text not null references shops(id) on delete cascade,
  target_revenue bigint default 0,
  actual_revenue bigint default 0,
  ad_spend bigint default 0,
  total_orders int default 0,
  cancelled_orders int default 0,
  returned_orders int default 0,
  note text default '',
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz,
  unique(shop_id, date)
);

-- 4. Bảng monthly_kpis
create table monthly_kpis (
  shop_id text not null references shops(id) on delete cascade,
  month text not null,
  kpi_amount bigint default 0,
  primary key (shop_id, month)
);

-- 5. Bảng monthly_plans
create table monthly_plans (
  shop_id text not null references shops(id) on delete cascade,
  month text not null,
  regular_day_target bigint default 0,
  sale_double_day_target bigint default 0,
  sale_fixed_day_target bigint default 0,
  total_mkt_budget bigint default 0,
  regular_day_mkt bigint default 0,
  sale_day_mkt bigint default 0,
  daily_overrides jsonb default '{}',
  primary key (shop_id, month)
);

-- 6. Bảng app_config
create table app_config (
  id int primary key default 1,
  ads_threshold_green numeric default 0.10,
  ads_threshold_yellow numeric default 0.16,
  cancel_return_threshold_yellow numeric default 0.05,
  cancel_return_threshold_red numeric default 0.10
);

insert into app_config (id) values (1);

-- =============================================
-- RLS + Policies
-- =============================================
alter table users enable row level security;
alter table shops enable row level security;
alter table daily_reports enable row level security;
alter table monthly_kpis enable row level security;
alter table monthly_plans enable row level security;
alter table app_config enable row level security;

create policy "users_open" on users for all using (true) with check (true);
create policy "shops_open" on shops for all using (true) with check (true);
create policy "reports_open" on daily_reports for all using (true) with check (true);
create policy "kpis_open" on monthly_kpis for all using (true) with check (true);
create policy "plans_open" on monthly_plans for all using (true) with check (true);
create policy "config_open" on app_config for all using (true) with check (true);

-- =============================================
-- Seed: Users
-- =============================================
insert into users (id, email, name, role, assigned_shops, password) values
  ('admin', 'admin@amb.com.vn', 'Phạm Cao Tuấn', 'admin', '{}', 'admin123'),
  ('uyen', 'uyen@amb.com.vn', 'Uyên', 'employee', '{sp1,sp6,sp8}', '123456'),
  ('thuhoai', 'thuhoai@amb.com.vn', 'Thu Hoài', 'employee', '{sp2,sp10,sp11}', '123456'),
  ('tuananh', 'tuananh@amb.com.vn', 'Tuấn Anh', 'employee', '{sp3}', '123456'),
  ('van', 'van@amb.com.vn', 'Vân', 'employee', '{sp4,sp7}', '123456'),
  ('truong', 'truong@amb.com.vn', 'Trường', 'employee', '{sp5}', '123456'),
  ('hailinh', 'hailinh@amb.com.vn', 'Hải Linh', 'employee', '{sp9}', '123456'),
  ('minh', 'minh@amb.com.vn', 'Minh', 'employee', '{tt1}', '123456'),
  ('ngat', 'ngat@amb.com.vn', 'Ngát', 'employee', '{tt2,tt3}', '123456');

-- =============================================
-- Seed: Shops
-- =============================================
insert into shops (id, name, channel, region, assigned_to, default_monthly_target) values
  ('sp1', 'Green Home', 'Shopee', 'HCM', '{uyen}', 300000000),
  ('sp2', 'Ecohome AMB', 'Shopee', 'HCM', '{thuhoai}', 250000000),
  ('sp3', 'Hana Mart', 'Shopee', 'HCM', '{tuananh}', 200000000),
  ('sp6', 'AMBBIO HOME', 'Shopee', 'HCM', '{uyen}', 280000000),
  ('sp8', 'Glory Smile', 'Shopee', 'HCM', '{uyen}', 180000000),
  ('sp10', 'AMB MALL HCM', 'Shopee', 'HCM', '{thuhoai}', 350000000),
  ('sp11', 'AMBI HOME', 'Shopee', 'HCM', '{thuhoai}', 220000000),
  ('sp4', 'Công nghệ Xanh', 'Shopee', 'HN', '{van}', 260000000),
  ('sp5', 'Gia dụng xanh', 'Shopee', 'HN', '{truong}', 310000000),
  ('sp7', 'Tiện ích xanh', 'Shopee', 'HN', '{van}', 190000000),
  ('sp9', 'AMB MALL HN', 'Shopee', 'HN', '{hailinh}', 320000000),
  ('tt1', 'Đồ gia dụng Hana', 'TikTok', 'HN', '{minh}', 400000000),
  ('tt2', 'Công nghệ xanh AMB', 'TikTok', 'HN', '{ngat}', 350000000),
  ('tt3', 'AMB Việt Nam', 'TikTok', 'HCM', '{ngat}', 280000000);

-- Indexes
create index idx_reports_shop_date on daily_reports(shop_id, date);
create index idx_reports_date on daily_reports(date);
create index idx_kpis_month on monthly_kpis(month);
create index idx_plans_month on monthly_plans(month);

-- =====================================================================
-- HOÀN TÁC việc khóa dữ liệu (trả về như trước: mở cho khóa công khai của app).
-- Chỉ chạy khi sau khi khóa app báo lỗi và cần khôi phục gấp. Chạy trong Supabase -> SQL Editor.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('cogs_entries', 'pnl_config', 'pnl_imports', 'users')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy cogs_open on public.cogs_entries for all using (true) with check (true);
create policy pnl_config_open on public.pnl_config for all using (true) with check (true);
create policy pnl_imports_open on public.pnl_imports for all using (true) with check (true);

grant select on public.users to anon, authenticated;
create policy users_select on public.users for select using (true);
create policy users_insert on public.users for insert with check (true);
create policy users_update on public.users for update using (true) with check (true);

drop policy if exists "pnl_select" on storage.objects;
drop policy if exists "pnl_insert" on storage.objects;
drop policy if exists "pnl_update" on storage.objects;
drop policy if exists "pnl_delete" on storage.objects;
create policy "pnl_select" on storage.objects for select using (bucket_id = 'pnl-data');
create policy "pnl_insert" on storage.objects for insert with check (bucket_id = 'pnl-data');
create policy "pnl_update" on storage.objects for update using (bucket_id = 'pnl-data') with check (bucket_id = 'pnl-data');
create policy "pnl_delete" on storage.objects for delete using (bucket_id = 'pnl-data');

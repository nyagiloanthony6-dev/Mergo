-- Private bucket for packing lists, commercial invoices, BLs.
-- Object paths are "<company_id>/<container|bl>/<id>/<file>", so the first
-- folder must equal the caller's company.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_tenant_read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_company_id()::text);

create policy "documents_tenant_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_company_id()::text);

create policy "documents_tenant_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_company_id()::text);

-- =====================================================================
-- IDK Fiscal — Migration 0008: Storage bucket privado para certificados
-- Wave 1.2b — Bucket `certificates`, policies de acesso por org via path.
-- =====================================================================

-- Bucket privado (5MB limite, mime application/x-pkcs12)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificates', 'certificates', false,
  5 * 1024 * 1024,
  array['application/x-pkcs12','application/pkcs12','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helper: extrai org_id do prefixo "org_<uuid>/..."
create or replace function public.cert_path_org_id(p_path text)
returns uuid
language sql
immutable
as $$
  select case
    when p_path ~ '^org_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
    then (regexp_match(p_path, '^org_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'))[1]::uuid
    else null::uuid
  end;
$$;

revoke all on function public.cert_path_org_id(text) from public;
grant execute on function public.cert_path_org_id(text) to authenticated, anon;

-- SELECT: membros da org dona do path podem listar/baixar.
-- INSERT/UPDATE/DELETE: bloqueados para usuarios (so service_role escreve via wrappers).
drop policy if exists certificates_objects_select on storage.objects;
create policy certificates_objects_select on storage.objects
for select to authenticated
using (
  bucket_id = 'certificates'
  and public.is_org_member(public.cert_path_org_id(name))
);

drop policy if exists certificates_objects_insert on storage.objects;
create policy certificates_objects_insert on storage.objects
for insert to authenticated
with check (false);

drop policy if exists certificates_objects_update on storage.objects;
create policy certificates_objects_update on storage.objects
for update to authenticated
using (false)
with check (false);

drop policy if exists certificates_objects_delete on storage.objects;
create policy certificates_objects_delete on storage.objects
for delete to authenticated
using (false);

comment on function public.cert_path_org_id(text) is
  'Extrai organization_id do prefixo "org_<uuid>/" usado em paths do bucket certificates.';

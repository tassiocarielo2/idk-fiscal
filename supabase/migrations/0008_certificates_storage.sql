-- =====================================================================
-- IDK Fiscal — Migration 0008: Storage bucket "certificates"
-- Wave 1.2b — bucket privado para .pfx, RLS por path org_<id>/branch_<id>/<file>
-- =====================================================================

-- Cria o bucket se ainda nao existir. Privado (public=false).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificates',
  'certificates',
  false,
  10 * 1024 * 1024, -- 10MB
  array['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Helper: extrai org_id e branch_id do path "org_<uuid>/branch_<uuid>/<arq>"
-- ---------------------------------------------------------------------
create or replace function storage.cert_path_org(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when p_name ~ '^org_[0-9a-f-]{36}/'
      then substring(p_name from '^org_([0-9a-f-]{36})/')::uuid
    else null
  end;
$$;

create or replace function storage.cert_path_branch(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when p_name ~ '^org_[0-9a-f-]{36}/branch_[0-9a-f-]{36}/'
      then substring(p_name from '/branch_([0-9a-f-]{36})/')::uuid
    else null
  end;
$$;

-- ---------------------------------------------------------------------
-- RLS policies em storage.objects para o bucket "certificates"
-- ---------------------------------------------------------------------
-- SELECT: members da org da filial (respeitando branch_scope)
drop policy if exists "certificates_select_member" on storage.objects;
create policy "certificates_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'certificates'
  and storage.cert_path_org(name) is not null
  and public.is_org_member(storage.cert_path_org(name))
  and (
    storage.cert_path_branch(name) is null
    or public.is_branch_member(storage.cert_path_branch(name))
  )
);

-- INSERT/UPDATE/DELETE: bloqueado para authenticated.
-- Apenas service_role escreve via /api/certificates/upload.
-- (RLS forced em storage.objects ja existe por padrao.)

comment on function storage.cert_path_org(text) is
  'Extrai org_id do path padrao do bucket certificates.';
comment on function storage.cert_path_branch(text) is
  'Extrai branch_id do path padrao do bucket certificates.';

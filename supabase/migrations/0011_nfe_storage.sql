-- =====================================================================
-- IDK Fiscal — Migration 0011: Storage bucket "nfe"
-- Wave 1.3 — bucket privado para XML assinado, procNFe e (Wave 1.4) DANFE.
-- Path: org_<id>/branch_<id>/<chave_acesso><suffix>.{xml|pdf}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nfe',
  'nfe',
  false,
  5 * 1024 * 1024,
  array['application/xml', 'text/xml', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helpers
create or replace function storage.nfe_path_org(p_name text)
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

create or replace function storage.nfe_path_branch(p_name text)
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

drop policy if exists "nfe_select_member" on storage.objects;
create policy "nfe_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'nfe'
  and storage.nfe_path_org(name) is not null
  and public.is_org_member(storage.nfe_path_org(name))
  and (
    storage.nfe_path_branch(name) is null
    or public.is_branch_member(storage.nfe_path_branch(name))
  )
);

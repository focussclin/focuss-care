-- =============================================================================
-- Tags de pacientes: segmentação administrativa tenant-scoped
-- =============================================================================
--
-- NÃO APLICADA. Revisar no Supabase antes de executar.
--
-- Tags não são dados clínicos. Ainda assim carregam contexto operacional de
-- pacientes e nunca podem atravessar clínicas. O vínculo guarda clinic_id e
-- usa referências compostas para impedir associação cruzada no banco.
-- =============================================================================

begin;

create table if not exists public.patient_tags (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default 'blue'
    check (color in ('blue', 'violet', 'green', 'amber', 'rose', 'slate')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create unique index if not exists patient_tags_clinic_name_idx
  on public.patient_tags (clinic_id, lower(name));

create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

create table if not exists public.patient_tag_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, patient_id, tag_id),
  foreign key (patient_id, clinic_id)
    references public.patients(id, clinic_id)
    on delete cascade,
  foreign key (tag_id, clinic_id)
    references public.patient_tags(id, clinic_id)
    on delete cascade
);

create index if not exists patient_tag_links_patient_idx
  on public.patient_tag_links (clinic_id, patient_id, created_at);

create index if not exists patient_tag_links_tag_idx
  on public.patient_tag_links (clinic_id, tag_id, created_at desc);

alter table public.patient_tags enable row level security;
alter table public.patient_tag_links enable row level security;

drop policy if exists "patient_tags_select" on public.patient_tags;
create policy "patient_tags_select"
  on public.patient_tags
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "patient_tags_insert" on public.patient_tags;
create policy "patient_tags_insert"
  on public.patient_tags
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "patient_tag_links_select" on public.patient_tag_links;
create policy "patient_tag_links_select"
  on public.patient_tag_links
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "patient_tag_links_insert" on public.patient_tag_links;
create policy "patient_tag_links_insert"
  on public.patient_tag_links
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "patient_tag_links_delete" on public.patient_tag_links;
create policy "patient_tag_links_delete"
  on public.patient_tag_links
  for delete
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

create or replace function public.add_patient_tag(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_name text,
  p_color text,
  p_created_by uuid
)
returns public.patient_tags
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_tag public.patient_tags;
begin
  if p_clinic_id is distinct from public.current_clinic_id() then
    raise exception 'CLINIC_SCOPE' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) > 40 then
    raise exception 'INVALID_TAG_NAME' using errcode = '22023';
  end if;

  if p_color not in ('blue', 'violet', 'green', 'amber', 'rose', 'slate') then
    raise exception 'INVALID_TAG_COLOR' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients
     where id = p_patient_id
       and clinic_id = p_clinic_id
       and deleted_at is null
  ) then
    raise exception 'PATIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.patient_tags (clinic_id, name, color, created_by)
  values (p_clinic_id, v_name, p_color, p_created_by)
  on conflict do nothing;

  select * into v_tag
    from public.patient_tags
   where clinic_id = p_clinic_id
     and lower(name) = lower(v_name);

  insert into public.patient_tag_links (clinic_id, patient_id, tag_id)
  values (p_clinic_id, p_patient_id, v_tag.id)
  on conflict (clinic_id, patient_id, tag_id) do nothing;

  return v_tag;
end;
$$;

revoke all on function public.add_patient_tag(uuid, uuid, text, text, uuid) from public;
grant execute on function public.add_patient_tag(uuid, uuid, text, text, uuid) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('patient_tags', 'patient_tag_links');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('patient_tags', 'patient_tag_links');
-- Depois: npm run db:types

-- =============================================================================
-- Cofre de credenciais de integrações por clínica
-- =============================================================================
--
-- As credenciais são cifradas pela aplicação antes de chegar nesta tabela.
-- A chave de cifragem fica apenas no ambiente do servidor
-- (INTEGRATION_ENCRYPTION_KEY); nunca é armazenada no banco.
--
-- Esta tabela não é para tokens de deploy (GitHub, Cloudflare, VPS ou
-- Hostinger). Esses segredos pertencem ao ambiente de infraestrutura e devem
-- ser configurados no provedor de hospedagem.

begin;

create table if not exists public.clinic_integration_credentials (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null check (
    provider in (
      'brevo',
      'evolution',
      'deepseek',
      'google_calendar',
      'outlook_calendar'
    )
  ),
  encrypted_payload text not null,
  key_version smallint not null default 1 check (key_version > 0),
  configured_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, provider)
);

create index if not exists clinic_integration_credentials_clinic_idx
  on public.clinic_integration_credentials (clinic_id, provider);

alter table public.clinic_integration_credentials enable row level security;

-- Somente owner/admin podem saber se uma integração está configurada. O
-- payload cifrado continua fora do SELECT normal da aplicação.
drop policy if exists "clinic_integration_credentials_select" on public.clinic_integration_credentials;
create policy "clinic_integration_credentials_select"
  on public.clinic_integration_credentials
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  );

drop policy if exists "clinic_integration_credentials_insert" on public.clinic_integration_credentials;
create policy "clinic_integration_credentials_insert"
  on public.clinic_integration_credentials
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  );

drop policy if exists "clinic_integration_credentials_update" on public.clinic_integration_credentials;
create policy "clinic_integration_credentials_update"
  on public.clinic_integration_credentials
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  )
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  );

-- Sem DELETE: substituir a credencial é uma rotação. A linha permanece para
-- manter rastreabilidade mínima de quando a integração foi configurada.

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--  where oid = 'public.clinic_integration_credentials'::regclass;
-- select provider, count(*) from public.clinic_integration_credentials
--  group by provider;

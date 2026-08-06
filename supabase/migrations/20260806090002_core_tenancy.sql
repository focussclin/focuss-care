-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0002 — Tabelas núcleo de tenancy
-- =============================================================================
-- clinics ......... raiz do tenant. TODA tabela de negócio referencia esta.
-- profiles ........ identidade da PESSOA (global, 1:1 com auth.users).
-- memberships ..... vínculo pessoa × clínica + papel. É a fonte de verdade.
-- invitations ..... convites pendentes.
-- professionals ... dados profissionais NO CONTEXTO de uma clínica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gatilho utilitário: mantém updated_at
-- -----------------------------------------------------------------------------
create or replace function private.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- clinics — a raiz do tenant
-- -----------------------------------------------------------------------------
create table if not exists public.clinics (
  id           uuid primary key default gen_random_uuid(),
  slug         extensions.citext not null unique,
  trade_name   text   not null,                       -- nome fantasia
  legal_name   text,                                  -- razão social
  cnpj         text unique,                           -- somente dígitos
  status       public.clinic_status not null default 'trial',
  timezone     text not null default 'America/Sao_Paulo',
  locale       text not null default 'pt-BR',
  logo_url     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint clinics_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  constraint clinics_cnpj_digits check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

create trigger set_updated_at before update on public.clinics
  for each row execute function private.tg_set_updated_at();

comment on table public.clinics is 'Raiz do tenant. clinic_id em qualquer tabela aponta para cá.';
comment on column public.clinics.timezone is 'Agenda é sempre renderizada neste fuso; timestamps são armazenados em UTC.';

-- -----------------------------------------------------------------------------
-- profiles — identidade da pessoa (NÃO é escopada por clínica)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  email             extensions.citext not null,
  phone             text,
  avatar_url        text,
  active_clinic_id  uuid references public.clinics(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function private.tg_set_updated_at();

comment on table public.profiles is
  'Uma linha por usuário autenticado. Deliberadamente SEM clinic_id: a mesma pessoa pode atender em várias clínicas.';
comment on column public.profiles.active_clinic_id is
  'Clínica selecionada no momento. Alimenta o claim do JWT; trocar exige refresh de sessão.';

-- Cria o profile automaticamente no signup
create or replace function private.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.tg_handle_new_user();

-- -----------------------------------------------------------------------------
-- memberships — vínculo pessoa × clínica. Fonte de verdade da autorização.
-- -----------------------------------------------------------------------------
create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         public.membership_role not null,
  status       public.membership_status not null default 'active',
  invited_by   uuid references public.profiles(id) on delete set null,
  invited_at   timestamptz,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (clinic_id, user_id)
);

create index if not exists memberships_user_active_idx
  on public.memberships (user_id) where status = 'active';
create index if not exists memberships_clinic_idx
  on public.memberships (clinic_id, status);

-- Toda clínica precisa de exatamente um owner ativo.
create unique index if not exists memberships_single_owner_idx
  on public.memberships (clinic_id) where role = 'owner' and status = 'active';

create trigger set_updated_at before update on public.memberships
  for each row execute function private.tg_set_updated_at();

comment on table public.memberships is
  'Fonte de verdade do vínculo. O JWT é apenas cache desta tabela — em caso de divergência, esta tabela vence.';

-- -----------------------------------------------------------------------------
-- invitations — convite por e-mail
-- -----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  email       extensions.citext not null,
  role        public.membership_role not null,
  token_hash  text not null unique,      -- guardamos o HASH, nunca o token
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint invitations_role_not_owner check (role <> 'owner')
);

create unique index if not exists invitations_pending_idx
  on public.invitations (clinic_id, email)
  where accepted_at is null and revoked_at is null;

comment on column public.invitations.token_hash is
  'SHA-256 do token enviado por e-mail. Vazamento do banco não permite aceitar convites.';

-- -----------------------------------------------------------------------------
-- professionals — o profissional NO CONTEXTO de uma clínica
-- -----------------------------------------------------------------------------
-- Decisão: escopado por clínica, com duplicação intencional dos dados de
-- conselho. Se o Dr. X atende em duas clínicas, existem duas linhas. Isso é o
-- correto para isolamento: a Clínica A não deve conseguir descobrir nada sobre
-- a atuação do Dr. X na Clínica B.
-- user_id é NULO quando o profissional não possui login (agenda operada pela
-- recepção) — caso real e comum.
-- -----------------------------------------------------------------------------
create table if not exists public.professionals (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  display_name    text not null,
  council_type    public.council_type,
  council_number  text,
  council_state   char(2),
  specialties     text[] not null default '{}',
  agenda_color    text,                          -- cor no calendário
  default_slot_minutes smallint not null default 30,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  unique (clinic_id, user_id),
  constraint professionals_slot_positive check (default_slot_minutes between 5 and 480),
  constraint professionals_council_complete check (
    (council_type is null and council_number is null and council_state is null)
    or (council_type is not null and council_number is not null and council_state is not null)
  )
);

create index if not exists professionals_clinic_active_idx
  on public.professionals (clinic_id) where is_active and deleted_at is null;

create trigger set_updated_at before update on public.professionals
  for each row execute function private.tg_set_updated_at();

comment on table public.professionals is
  'Escopado por clínica de propósito. Mesmo profissional em duas clínicas = duas linhas independentes.';

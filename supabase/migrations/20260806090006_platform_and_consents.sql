-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0006 — Plataforma SaaS, consentimentos, RPCs
-- =============================================================================

do $$ begin
  create type public.subscription_status as enum
    ('trialing','active','past_due','canceled','incomplete');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- plans — catálogo público
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id                text primary key,               -- 'trial','starter','pro','clinic'
  name              text not null,
  price_cents       integer not null default 0,
  currency          char(3) not null default 'BRL',
  max_professionals integer,                        -- null = ilimitado
  max_patients      integer,
  storage_mb        integer,
  ai_tokens_month   bigint,                         -- teto de IA por ciclo
  features          jsonb not null default '{}'::jsonb,
  is_public         boolean not null default true,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

insert into public.plans (id, name, price_cents, max_professionals, max_patients, storage_mb, ai_tokens_month, sort_order, is_public)
values
  ('trial',   'Avaliação', 0,      2,    100,    1024,   200000, 0, false),
  ('starter', 'Starter',   14900,  3,    1000,   5120,   500000, 1, true),
  ('pro',     'Pro',       34900,  10,   10000,  25600,  2000000, 2, true),
  ('clinic',  'Clínica',   79900,  null, null,   102400, 8000000, 3, true)
on conflict (id) do nothing;

alter table public.plans enable row level security;
create policy plans_select on public.plans
  for select to authenticated using (is_public or true);
-- Sem escrita pelo cliente: catálogo é gerido pela plataforma.

-- -----------------------------------------------------------------------------
-- subscriptions — uma por clínica
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null unique references public.clinics(id) on delete cascade,
  plan_id                  text not null references public.plans(id),
  status                   public.subscription_status not null default 'trialing',
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  provider                 text,      -- 'asaas' | 'stripe' | ...
  provider_subscription_id text,
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger set_updated_at before update on public.subscriptions
  for each row execute function private.tg_set_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscriptions force  row level security;

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

-- Sem escrita pelo cliente: assinatura muda por webhook do provedor de pagamento,
-- executado no servidor. Cliente que edita a própria assinatura é cliente que
-- se promove ao plano Clínica de graça.

-- -----------------------------------------------------------------------------
-- clinic_settings — configuração operacional
-- -----------------------------------------------------------------------------
create table if not exists public.clinic_settings (
  clinic_id            uuid primary key references public.clinics(id) on delete cascade,
  business_hours       jsonb   not null default '{}'::jsonb,
  appointment_defaults jsonb   not null default '{}'::jsonb,
  notification_prefs   jsonb   not null default '{}'::jsonb,
  branding             jsonb   not null default '{}'::jsonb,
  ai_enabled           boolean not null default false,   -- opt-in explícito
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger set_updated_at before update on public.clinic_settings
  for each row execute function private.tg_set_updated_at();

alter table public.clinic_settings enable row level security;
alter table public.clinic_settings force  row level security;

create policy clinic_settings_select on public.clinic_settings
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy clinic_settings_update on public.clinic_settings
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- -----------------------------------------------------------------------------
-- consents — LGPD
-- -----------------------------------------------------------------------------
create table if not exists public.consents (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid references public.clinics(id) on delete cascade,  -- null = consentimento de plataforma
  subject_type     text not null check (subject_type in ('user','patient')),
  subject_id       uuid not null,
  purpose          public.consent_purpose not null,
  document_version text not null,     -- versão do texto aceito
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  ip               inet,
  user_agent       text
);

create index if not exists consents_subject_idx
  on public.consents (subject_type, subject_id, purpose, granted_at desc);

alter table public.consents enable row level security;

create policy consents_select on public.consents
  for select to authenticated
  using (
    (subject_type = 'user' and subject_id = (select auth.uid()))
    or (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  );

comment on table public.consents is
  'Append-only. Revogar é preencher revoked_at, nunca apagar a linha: é preciso provar o que foi consentido e quando.';

-- =============================================================================
-- RPCs — operações que a RLS sozinha não consegue expressar
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_clinic: cria clínica + owner + settings + assinatura, atomicamente.
-- Sem isto, um erro no meio deixaria clínica órfã sem dono — inacessível e
-- invisível, mas ocupando o slug.
-- -----------------------------------------------------------------------------
create or replace function public.create_clinic(
  p_trade_name text,
  p_slug       text
)
returns public.clinics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_clinic public.clinics;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  insert into public.clinics (slug, trade_name)
  values (lower(trim(p_slug)), trim(p_trade_name))
  returning * into v_clinic;

  insert into public.memberships (clinic_id, user_id, role, status, accepted_at)
  values (v_clinic.id, v_user, 'owner', 'active', now());

  insert into public.clinic_settings (clinic_id) values (v_clinic.id);

  insert into public.subscriptions (clinic_id, plan_id, status, trial_ends_at)
  values (v_clinic.id, 'trial', 'trialing', now() + interval '14 days');

  update public.profiles set active_clinic_id = v_clinic.id where id = v_user;

  return v_clinic;
end;
$$;

revoke execute on function public.create_clinic(text, text) from anon;
grant  execute on function public.create_clinic(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- accept_invitation: o convidado ainda NÃO é membro, então nenhuma policy de
-- memberships o deixaria inserir. Daí a RPC.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_email extensions.citext;
  v_inv   public.invitations;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_user;

  select * into v_inv
  from public.invitations i
  where i.token_hash  = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.accepted_at is null
    and i.revoked_at  is null
    and i.expires_at  > now()
  for update;

  if v_inv.id is null then
    raise exception 'Convite inválido ou expirado' using errcode = '22023';
  end if;

  -- O convite é para um e-mail específico. Sem esta checagem, qualquer pessoa
  -- com o link entra na clínica.
  if v_inv.email <> v_email then
    raise exception 'Convite emitido para outro e-mail' using errcode = '42501';
  end if;

  insert into public.memberships (clinic_id, user_id, role, status, invited_by, invited_at, accepted_at)
  values (v_inv.clinic_id, v_user, v_inv.role, 'active', v_inv.created_by, v_inv.created_at, now())
  on conflict (clinic_id, user_id)
    do update set status = 'active', role = excluded.role, accepted_at = now(), revoked_at = null;

  update public.invitations set accepted_at = now() where id = v_inv.id;
  update public.profiles set active_clinic_id = v_inv.clinic_id where id = v_user;

  return v_inv.clinic_id;
end;
$$;

revoke execute on function public.accept_invitation(text) from anon;
grant  execute on function public.accept_invitation(text) to authenticated;

-- -----------------------------------------------------------------------------
-- switch_clinic: troca a clínica ativa. O JWT só reflete a mudança após o
-- refresh da sessão — o cliente DEVE chamar supabase.auth.refreshSession()
-- logo em seguida, senão continua vendo a clínica anterior.
-- -----------------------------------------------------------------------------
create or replace function public.switch_clinic(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_active_member(p_clinic_id) then
    raise exception 'Sem vínculo ativo com esta clínica' using errcode = '42501';
  end if;
  update public.profiles set active_clinic_id = p_clinic_id where id = v_user;
end;
$$;

revoke execute on function public.switch_clinic(uuid) from anon;
grant  execute on function public.switch_clinic(uuid) to authenticated;

-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0001 — Extensões, schemas e tipos
-- =============================================================================
-- Executar em ordem. Cada migration é idempotente onde possível.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto    with schema extensions;  -- gen_random_uuid, digest
create extension if not exists citext      with schema extensions;  -- e-mail/slug case-insensitive
create extension if not exists pg_trgm     with schema extensions;  -- busca de paciente por nome
create extension if not exists btree_gist  with schema extensions;  -- exclusão de agenda sobreposta (Onda 2)

-- -----------------------------------------------------------------------------
-- Schema privado: objetos internos que NÃO devem ser expostos pelo PostgREST.
-- O PostgREST só expõe schemas listados em "Exposed schemas"; deixe apenas
-- `public` (e `graphql_public`) lá. Nada em `private` vira endpoint HTTP.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.clinic_status as enum (
    'trial',       -- período de avaliação
    'active',      -- assinatura em dia
    'past_due',    -- pagamento atrasado, acesso degradado
    'suspended',   -- bloqueada (inadimplência ou violação)
    'canceled'     -- encerrada; dados retidos pelo prazo legal
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_role as enum (
    'owner',         -- dono da clínica; único que gerencia assinatura
    'admin',         -- gestão completa, sem assinatura
    'professional',  -- médico/dentista/psicólogo: agenda + prontuário
    'receptionist',  -- agenda + cadastro; SEM conteúdo clínico
    'finance'        -- financeiro; SEM conteúdo clínico
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum (
    'invited',    -- convite enviado, ainda não aceito
    'active',
    'suspended',  -- acesso temporariamente bloqueado
    'revoked'     -- desligado; mantido para trilha de auditoria
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.council_type as enum (
    'CRM','CRO','CRP','CREFITO','CRN','CRF','COREN','CREF','CRFa','OUTRO'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_purpose as enum (
    'terms_of_service',
    'privacy_policy',
    'health_data_processing',   -- LGPD art. 11 — dado sensível
    'marketing_communication',
    'ai_assisted_processing'    -- opt-in explícito para IA sobre dado clínico
  );
exception when duplicate_object then null; end $$;

comment on type public.membership_role is
  'Papel do usuário DENTRO de uma clínica. Um mesmo usuário pode ter papéis diferentes em clínicas diferentes.';

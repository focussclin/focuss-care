-- =============================================================================
-- Focuss Care · Onda 4 (Operação e IA) · 0020 — Camada de IA
-- =============================================================================
-- TRÊS RISCOS QUE ESTA MIGRATION EXISTE PARA CONTER:
--
-- 1. VAZAMENTO NA BUSCA VETORIAL
--    `order by embedding <=> query limit 5` sem filtro de tenant devolve
--    trecho de prontuário de outra clínica. E é silencioso: nenhum erro,
--    resposta plausível, dado errado. Por isso a função de busca é
--    SECURITY INVOKER (a RLS se aplica) E filtra clinic_id explicitamente.
--    Fazê-la SECURITY DEFINER "para funcionar" é abrir o vazamento.
--
-- 2. CUSTO INVISÍVEL
--    IA é custo variável. Sem medição por clínica, come a margem do plano sem
--    aparecer em lugar nenhum. Toda chamada é registrada com tokens e custo.
--
-- 3. MODELO INVENTANDO FATO
--    Preço, horário e disponibilidade vêm de tool/banco, nunca do modelo.
--    O schema não impõe isso — a camada de aplicação impõe — mas o registro
--    de tools chamadas em ai_messages permite auditar quando não veio.
-- =============================================================================

create extension if not exists vector with schema extensions;

do $$ begin
  create type public.ai_feature as enum (
    'patient_chat',        -- atendimento ao paciente
    'staff_assistant',     -- assistente da equipe
    'record_summary',      -- resumo de prontuário
    'smart_scheduling',
    'financial_analysis',
    'report_generation',
    'embedding'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_role as enum ('system','user','assistant','tool');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Helper genérico de partição mensal
-- -----------------------------------------------------------------------------
create or replace function private.ensure_month_partition(p_parent text, p_month date)
returns void
language plpgsql
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('%s_%s', p_parent, to_char(v_start, 'YYYY_MM'));
begin
  if to_regclass('public.' || v_name) is null then
    execute format(
      'create table public.%I partition of public.%I for values from (%L) to (%L)',
      v_name, p_parent, v_start, v_end
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- document_embeddings — base de conhecimento vetorial, por clínica
-- -----------------------------------------------------------------------------
create table if not exists public.document_embeddings (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  source_type text not null,        -- 'medical_record' | 'service' | 'faq' | 'clinic_doc' | 'policy'
  source_id   uuid,
  patient_id  uuid references public.patients(id) on delete cascade,
  chunk_index smallint not null default 0,
  content     text not null,
  embedding   extensions.vector(1024),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  unique (clinic_id, source_type, source_id, chunk_index)
);

comment on column public.document_embeddings.embedding is
  'Dimensão 1024 (voyage-3). Trocar de modelo de embedding exige migration e reindexação — não é configuração.';
comment on column public.document_embeddings.patient_id is
  'Preenchido quando o trecho vem de prontuário. É o que permite restringir a busca a um paciente e barrar quem não tem acesso clínico.';

create index if not exists document_embeddings_clinic_idx
  on public.document_embeddings (clinic_id, source_type);
create index if not exists document_embeddings_source_idx
  on public.document_embeddings (clinic_id, source_id);

-- HNSW para similaridade por cosseno.
create index if not exists document_embeddings_hnsw_idx
  on public.document_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ★ A função de busca. SECURITY INVOKER não é detalhe: é o que faz a RLS valer.
create or replace function public.search_clinic_knowledge(
  p_embedding      extensions.vector(1024),
  p_source_types   text[] default null,
  p_patient_id     uuid   default null,
  p_limit          int    default 8,
  p_min_similarity real   default 0.0
)
returns table (
  id          uuid,
  source_type text,
  source_id   uuid,
  content     text,
  similarity  real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.source_type,
    e.source_id,
    e.content,
    (1 - (e.embedding operator(extensions.<=>) p_embedding))::real as similarity
  from public.document_embeddings e
  where e.clinic_id = (select public.current_clinic_id())
    and (p_source_types is null or e.source_type = any (p_source_types))
    and (p_patient_id  is null or e.patient_id is null or e.patient_id = p_patient_id)
    and (1 - (e.embedding operator(extensions.<=>) p_embedding)) >= p_min_similarity
  order by e.embedding operator(extensions.<=>) p_embedding
  limit least(coalesce(p_limit, 8), 50);
$$;

revoke execute on function public.search_clinic_knowledge(extensions.vector, text[], uuid, int, real) from anon;
grant  execute on function public.search_clinic_knowledge(extensions.vector, text[], uuid, int, real) to authenticated;

comment on function public.search_clinic_knowledge is
  'SECURITY INVOKER de propósito: a RLS de document_embeddings se aplica, inclusive a regra de que trecho de prontuário exige acesso clínico. Trocar para DEFINER faz a busca vazar entre clínicas.';

-- -----------------------------------------------------------------------------
-- ai_conversations / ai_messages — assistente interno
-- -----------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  feature    public.ai_feature not null default 'staff_assistant',
  title      text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations (clinic_id, user_id, updated_at desc) where not is_archived;

create trigger set_updated_at before update on public.ai_conversations
  for each row execute function private.tg_set_updated_at();

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            public.ai_role not null,
  content         jsonb not null,          -- blocos de conteúdo, como a API devolve
  model           text,
  tool_calls      jsonb,                   -- quais tools o modelo chamou
  input_tokens    integer,
  output_tokens   integer,
  stop_reason     text,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (clinic_id, conversation_id, created_at);

comment on column public.ai_messages.tool_calls is
  'Registro de quais ferramentas o modelo chamou. É o que permite auditar se um preço citado veio do banco ou foi inventado pelo modelo.';

-- -----------------------------------------------------------------------------
-- ai_usage_log — medição de custo por clínica (particionada)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage_log (
  id                    bigint generated always as identity,
  clinic_id             uuid not null,
  user_id               uuid,
  feature               public.ai_feature not null,
  model                 text not null,
  conversation_id       uuid,
  input_tokens          integer not null default 0,
  output_tokens         integer not null default 0,
  cache_read_tokens     integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd_micros       bigint  not null default 0,   -- 1e-6 USD
  latency_ms            integer,
  was_error             boolean not null default false,
  occurred_at           timestamptz not null default now(),

  primary key (id, occurred_at)
) partition by range (occurred_at);

create index if not exists ai_usage_log_clinic_idx
  on public.ai_usage_log (clinic_id, occurred_at desc);
create index if not exists ai_usage_log_feature_idx
  on public.ai_usage_log (clinic_id, feature, occurred_at desc);

do $$
declare i int;
begin
  for i in -1 .. 12 loop
    perform private.ensure_month_partition(
      'ai_usage_log', (date_trunc('month', now()) + (i || ' month')::interval)::date);
  end loop;
end $$;

comment on table public.ai_usage_log is
  'Sem esta tabela, IA vira custo variável invisível que come a margem do plano. Toda chamada entra aqui, inclusive as que falharam.';
comment on column public.ai_usage_log.cache_read_tokens is
  'Leitura de cache custa ~0,1x. Se este número vier sempre zero em prompts repetidos, há invalidador silencioso no prefixo — data, UUID ou nome de usuário no prompt de sistema.';

-- -----------------------------------------------------------------------------
-- Quota do plano
-- -----------------------------------------------------------------------------
create or replace function public.ai_usage_current_period()
returns table (used_tokens bigint, limit_tokens bigint, remaining_tokens bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select coalesce(sum(input_tokens + output_tokens), 0)::bigint as used
    from public.ai_usage_log
    where clinic_id = public.current_clinic_id()
      and occurred_at >= date_trunc('month', now())
  ), l as (
    select coalesce(p.ai_tokens_month, 0)::bigint as lim
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.clinic_id = public.current_clinic_id()
  )
  select u.used,
         coalesce(l.lim, 0),
         greatest(coalesce(l.lim, 0) - u.used, 0)
  from u left join l on true;
$$;

revoke execute on function public.ai_usage_current_period() from anon;
grant  execute on function public.ai_usage_current_period() to authenticated;

comment on function public.ai_usage_current_period() is
  'Consultada ANTES de chamar o modelo. Quota verificada só na UI é quota decorativa.';

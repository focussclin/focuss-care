-- =============================================================================
-- APLICAR TUDO — as dez migrations pendentes de 09/08/2026, na ordem segura
-- =============================================================================
--
-- GERADO a partir dos arquivos individuais. Nao edite este arquivo: edite o
-- original e gere de novo. Ele existe para transformar dez colagens no editor
-- SQL do Supabase em UMA.
--
-- Cada bloco abaixo tem `begin`/`commit` proprio, entao uma falha reverte APENAS
-- a migration que falhou — as anteriores permanecem aplicadas. Isso e proposital:
-- uma transacao unica para as dez faria um erro no fim desfazer tudo.
--
-- ORDEM: `purchases` referencia `inventory_items`. Invertida, falha com 42P01.
-- As demais sao independentes entre si.
--
-- DUAS TABELAS JA EXISTEM no schema remoto, e os blocos delas NAO criam nada:
--
--  * `patient_documents` — o bloco aplica policies, indices e as policies de
--    `storage.objects`. As policies atuais serao SUBSTITUIDAS; confira antes:
--      select policyname, cmd from pg_policies where tablename = 'patient_documents';
--
--  * `notifications` — o bloco so acrescenta a policy de INSERT.
--
-- O bucket `patient-documents` foi criado em 09/08/2026. O bloco de documentos
-- faz `on conflict (id) do update`, entao ele NORMALIZA as configuracoes do
-- bucket para as declaradas ali (10 MB e a lista de MIME de la).
--
-- INDICES REPETIDOS sao esperados: varios blocos criam
-- `patients_id_clinic_id_key` e afins, todos com `if not exists`, porque cada
-- um precisa do alvo para as proprias chaves compostas.
--
-- DEPOIS DE APLICAR: `npm run db:types`, remover os shims de tipos em
-- `*/infrastructure/*Database.ts`, habilitar os itens em `navigation.ts` e
-- limpar as entradas de `BUILT_BUT_HIDDEN` em `src/app/reachableRoutes.test.ts`.
-- =============================================================================


-- ===========================================================================
-- 20260809_rooms.sql — Salas e recursos + conflito de sala na agenda
-- ===========================================================================

-- =============================================================================
-- Salas e recursos: onde o atendimento acontece
-- =============================================================================
--
-- NAO APLICADA. Este arquivo e proposta: quem tem credencial administrativa
-- revisa, aplica no painel do Supabase e marca a data aqui, como foi feito com
-- as quatro anteriores.
--
-- Problema. O item "Salas e recursos" existe no menu e nao tem tabela. A
-- consequencia nao e cosmetica: a agenda hoje impede que o mesmo PROFISSIONAL
-- tenha dois atendimentos no mesmo horario (constraint
-- `appointments_no_overlap`, aplicada em 08/08/2026) e nao impede que dois
-- profissionais diferentes sejam mandados para a MESMA SALA no mesmo horario.
--
-- Numa clinica com tres consultorios e cinco profissionais, esse e o conflito
-- que acontece toda semana — e o unico que o sistema ainda nao vê.
--
-- -----------------------------------------------------------------------------
-- DECISOES QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--
-- 1. **Sala e um recurso, e nao so uma etiqueta.** `kind` distingue consultorio
--    de sala de exame, de procedimento e de equipamento movel (o aparelho de
--    ultrassom que anda entre salas e disputa horario igual). Modelar so
--    "consultorio" obrigaria a criar uma tabela nova no dia em que a clinica
--    comprar o segundo aparelho.
--
-- 2. **`appointments.room_id` e OPCIONAL.** Clinica que nao controla sala nao
--    passa a ser obrigada a preencher, e os atendimentos que ja existem nao
--    precisam de backfill. Sem isso, a migration quebraria toda agenda gravada
--    ate hoje.
--
-- 3. **A constraint de sobreposicao e PARCIAL, e depende do `room_id` nulo.**
--    `exclude` ignora linha com `room_id is null` (um NULL nunca e igual a
--    outro), entao clinica sem controle de sala nao sente a regra. Quem
--    preenche, ganha a protecao.
--
-- 4. **Mesmo predicado de status da constraint de profissional.** Cancelado e
--    falta liberam a sala, exatamente como liberam a agenda. Divergir aqui
--    faria a sala continuar ocupada por um atendimento que nao vai acontecer.
--
-- 5. **RLS pelo padrao do modulo de agenda**, nao pelo financeiro: quem enxerga
--    atendimento enxerga sala. Sala nao e dado clinico nem financeiro — e a
--    planta da clinica.
--
-- 6. **`deleted_at` em vez de DELETE.** Sala desativada continua referenciada
--    por atendimentos passados; apagar a linha quebraria o historico.
-- =============================================================================

begin;

-- 1. Tipo de recurso ---------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'room_kind') then
    create type public.room_kind as enum (
      'consultorio',
      'sala_exame',
      'sala_procedimento',
      'equipamento'
    );
  end if;
end
$$;

-- 2. Tabela ------------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  kind public.room_kind not null default 'consultorio',
  -- Quantas pessoas cabem. Null quando nao faz sentido (equipamento).
  capacity smallint,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Nome unico por clinica, ignorando as removidas: duas "Sala 1" ativas na mesma
-- clinica tornam a agenda ambigua para quem le.
create unique index if not exists rooms_clinic_name_unique
  on public.rooms (clinic_id, lower(name))
  where deleted_at is null;

create index if not exists rooms_clinic_active_idx
  on public.rooms (clinic_id)
  where deleted_at is null and is_active;

-- 3. Vinculo com a agenda ----------------------------------------------------

alter table public.appointments
  add column if not exists room_id uuid references public.rooms(id);

create index if not exists appointments_room_idx
  on public.appointments (room_id, starts_at)
  where room_id is not null;

-- 4. Sobreposicao de sala ----------------------------------------------------

create extension if not exists btree_gist;

alter table public.appointments
  drop constraint if exists appointments_room_no_overlap;

alter table public.appointments
  add constraint appointments_room_no_overlap
  exclude using gist (
    clinic_id with =,
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (room_id is not null and status not in ('canceled', 'no_show'));

-- 5. RLS ---------------------------------------------------------------------

-- Mesmo formato das policies ja aplicadas em `insurance_claim_denials`:
-- `current_clinic_id()` fecha o tenant, e a funcao de papel decide o resto.
-- `has_clinic_role` NAO recebe `clinic_id` — ela usa a clinica ativa do JWT
-- (conferido em `database.types.ts`: `Args: { p_roles: MembershipRole[] }`).

alter table public.rooms enable row level security;

drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select"
  on public.rooms
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

-- Escrita e administrativa: quem configura a clinica define a planta dela.
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert"
  on public.rooms
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[])
  );

drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update"
  on public.rooms
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[])
  );

-- Sem policy de DELETE, de proposito: sala sai por `deleted_at`, porque
-- atendimento passado continua apontando para ela.

commit;

-- -----------------------------------------------------------------------------
-- Rodar ANTES de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. A assinatura de `has_clinic_role` foi lida de `database.types.ts`, que e
--    gerado do schema remoto — mas o TIPO do array nao aparece la. Conferir:
--
--      select proname, pg_get_function_arguments(oid)
--        from pg_proc where proname = 'has_clinic_role';
--
--    Se o parametro nao for `membership_role[]`, ajustar o cast das policies.
--
-- 2. Atendimentos que ja existem NAO impedem esta migration: `room_id` nasce
--    nulo em todos, e a constraint e parcial. Nao ha backfill a fazer nem
--    sobreposicao previa a limpar — diferente da constraint de profissional.
--
-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. Estrutura:
--      select column_name, data_type, is_nullable
--        from information_schema.columns
--       where table_name = 'rooms' order by ordinal_position;
--
-- 2. A coluna entrou na agenda e e opcional:
--      select is_nullable from information_schema.columns
--       where table_name = 'appointments' and column_name = 'room_id';
--      -- esperado: YES
--
-- 3. RLS ativa e com duas policies:
--      select relrowsecurity from pg_class where relname = 'rooms';
--      select policyname, cmd from pg_policies where tablename = 'rooms';
--
-- 4. A constraint existe:
--      select conname from pg_constraint
--       where conrelid = 'public.appointments'::regclass
--         and conname = 'appointments_room_no_overlap';
--
-- 5. Comportamento, com duas contas de clinicas diferentes:
--      a) marcar 10:00-10:30 na Sala 1 -> deve funcionar;
--      b) marcar 10:15-10:45 na Sala 1, outro profissional -> deve falhar 23P01;
--      c) marcar 10:15-10:45 na Sala 2 -> deve funcionar;
--      d) marcar 10:15-10:45 SEM sala -> deve funcionar (constraint e parcial);
--      e) cancelar (a) e repetir (b) -> deve funcionar;
--      f) `receptionist` tentando criar sala -> deve ser recusado pela RLS;
--      g) membro de OUTRA clinica lendo `rooms` -> zero linhas.
--
-- -----------------------------------------------------------------------------
-- Depois de aplicar, no codigo
-- -----------------------------------------------------------------------------
--
-- 1. `npm run db:types` para regenerar `database.types.ts`.
-- 2. `toWriteError` do adapter de agenda ja traduz 23P01 para "horario
--    ocupado" — a mensagem precisa passar a distinguir sala de profissional,
--    senao a recepcao le "profissional ocupado" e troca a pessoa errada.
-- 3. Habilitar "Salas e recursos" em `navigation.ts` e registrar a rota em
--    `navigation.test.ts`.
-- =============================================================================


-- ===========================================================================
-- 20260809_clinic_tasks.sql — Tarefas
-- ===========================================================================

-- =============================================================================
-- Tarefas da clinica: o que ficou pendente, e de quem
-- =============================================================================
--
-- NAO APLICADA. Proposta para revisao de quem tem credencial administrativa.
--
-- Problema. "Tarefas inteligentes" e item de menu sem tabela. O adjetivo
-- "inteligentes" e o que fez a feature ficar parada: ele sugere geracao por IA,
-- que depende de W-01, de provedor de modelo e da aprovacao de
-- `docs/04-agente-ia.md`.
--
-- Mas o que a clinica precisa antes disso nao depende de IA nenhuma: "ligar
-- para a paciente que faltou", "conferir a guia que a operadora devolveu",
-- "cobrar o exame que nao voltou". Hoje isso vive em papel na recepcao, e some
-- junto com o papel.
--
-- Esta migration entrega a tabela para a tarefa HUMANA. A geracao automatica,
-- se um dia existir, escreve na mesma tabela com `created_by` nulo e uma origem
-- declarada — e por isso `source` ja nasce aqui, em vez de virar migration nova.
--
-- -----------------------------------------------------------------------------
-- DECISOES QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--
-- 1. **Tarefa aponta para o que ela e sobre, e o alvo e OPCIONAL.** Uma tarefa
--    pode nascer de um paciente, de um atendimento, de uma fatura — ou de nada,
--    quando alguem so anota o que precisa ser feito. Modelar o alvo como
--    obrigatorio deixaria de fora justamente o caso mais comum.
--
-- 2. **Sao colunas separadas, e nao um par `(entity_type, entity_id)`.** O par
--    generico nao tem chave estrangeira, entao o banco nao impede apontar para
--    linha apagada — e um dia a tarefa abre uma ficha que nao existe mais.
--
-- 3. **`assigned_to` referencia `profiles`, nao `professionals`.** Quem executa
--    tarefa administrativa e a recepcao, que nao e profissional de saude e nao
--    tem linha em `professionals`.
--
-- 4. **Sem coluna de "concluida" booleana.** `status` cobre pendente, em
--    andamento, concluida e cancelada. Booleano nao distingue "resolvi" de
--    "nao era para fazer", e as duas contam diferente na lista de pendencias.
--
-- 5. **RLS: leitura para membro da clinica, escrita para membro da clinica.**
--    Tarefa nao e dado clinico nem financeiro; e coordenacao de equipe. Quem
--    trabalha na clinica cria e resolve. A restricao por papel viria depois, se
--    a clinica pedir.
-- =============================================================================

begin;

-- 1. Tipos -------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum (
      'pending',
      'in_progress',
      'done',
      'canceled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'task_source') then
    -- `manual` e o unico usado hoje. `automation` existe para que a geracao
    -- automatica, quando vier, nao precise de migration — e para que a tela
    -- possa distinguir o que a equipe escreveu do que o sistema sugeriu.
    create type public.task_source as enum ('manual', 'automation');
  end if;
end
$$;

-- 2. Indices que as chaves compostas exigem -----------------------------------
--
-- `id` ja e unico nas tres tabelas, entao estes indices nao mudam cardinalidade
-- nenhuma: eles so dao ao Postgres o alvo que uma FK composta precisa. Sao
-- `if not exists` porque outras migrations de 09/08 criam os mesmos.

create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

create unique index if not exists appointments_id_clinic_id_key
  on public.appointments (id, clinic_id);

create unique index if not exists invoices_id_clinic_id_key
  on public.invoices (id, clinic_id);

-- 3. Tabela ------------------------------------------------------------------

create table if not exists public.clinic_tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  title text not null,
  notes text,
  status public.task_status not null default 'pending',
  source public.task_source not null default 'manual',

  -- Menor numero primeiro, como em `waiting_queue.priority`.
  priority smallint not null default 3,
  due_at timestamptz,

  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),

  -- Alvo opcional. Ver decisao 1 e 2 no cabecalho.
  --
  -- As FKs sao COMPOSTAS, com o tenant dentro: sem `clinic_id` na referencia,
  -- o banco aceita uma tarefa desta clinica apontando para o paciente de OUTRA.
  -- Nao vaza nada (a RLS filtra o join, e o nome volta nulo), mas guarda uma
  -- linha que nao devia existir — e integridade que o banco sabe garantir nao
  -- deve depender de a aplicacao lembrar. Mesmo padrao ja usado em
  -- `clinic_form_responses`, `patient_documents` e `bank_reconciliation`.
  patient_id uuid,
  appointment_id uuid,
  invoice_id uuid,

  foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id) on delete restrict,
  foreign key (appointment_id, clinic_id)
    references public.appointments (id, clinic_id) on delete restrict,
  foreign key (invoice_id, clinic_id)
    references public.invoices (id, clinic_id) on delete restrict,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A lista que a tela abre: pendentes da clinica, mais urgentes primeiro.
create index if not exists clinic_tasks_open_idx
  on public.clinic_tasks (clinic_id, priority, due_at)
  where status in ('pending', 'in_progress');

-- "Minhas tarefas".
create index if not exists clinic_tasks_assignee_idx
  on public.clinic_tasks (clinic_id, assigned_to)
  where status in ('pending', 'in_progress');

create index if not exists clinic_tasks_patient_idx
  on public.clinic_tasks (patient_id)
  where patient_id is not null;

-- 4. RLS ---------------------------------------------------------------------

alter table public.clinic_tasks enable row level security;

drop policy if exists "clinic_tasks_select" on public.clinic_tasks;
create policy "clinic_tasks_select"
  on public.clinic_tasks
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_tasks_insert" on public.clinic_tasks;
create policy "clinic_tasks_insert"
  on public.clinic_tasks
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_tasks_update" on public.clinic_tasks;
create policy "clinic_tasks_update"
  on public.clinic_tasks
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- Sem policy de DELETE: tarefa sai por `status = 'canceled'`, que preserva o
-- registro de que alguem decidiu nao fazer.

commit;

-- -----------------------------------------------------------------------------
-- Rodar ANTES de aplicar
-- -----------------------------------------------------------------------------
--
-- Confirmar que `profiles.id` e a chave certa para `assigned_to`:
--
--   select column_name, data_type from information_schema.columns
--    where table_name = 'profiles' and column_name = 'id';
--
-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. Estrutura e RLS:
--      select relrowsecurity from pg_class where relname = 'clinic_tasks';
--      select policyname, cmd from pg_policies where tablename = 'clinic_tasks';
--
-- 2. Tenant, com duas contas de clinicas diferentes:
--      a) criar tarefa na clinica A;
--      b) ler `clinic_tasks` logado na clinica B -> zero linhas;
--      c) tentar INSERT com `clinic_id` da clinica A logado na B -> recusado.
--
-- 3. Alvo opcional: INSERT so com `title` e `clinic_id` deve funcionar.
--
-- 4. Alvo invalido: INSERT com `patient_id` inexistente deve falhar (23503).
--
-- -----------------------------------------------------------------------------
-- Depois de aplicar, no codigo
-- -----------------------------------------------------------------------------
--
-- 1. `npm run db:types`.
-- 2. Modulo `tasks` com porta, adapters, action pelo `createAction` (a escrita e
--    mutacao tenant-scoped: entra no pipeline com auditoria) e tela.
-- 3. Renomear o item de menu para "Tarefas" — sem "inteligentes", que promete
--    geracao automatica que esta migration nao entrega.
-- =============================================================================


-- ===========================================================================
-- 20260809_clinic_leads.sql — CRM e Leads
-- ===========================================================================

-- =============================================================================
-- CRM da clinica: leads, pipeline e historico de estagio
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- O CRM nao e uma segunda tabela de pacientes: um lead pode nunca comparecer
-- nem virar paciente. Quando a conversao existir, `converted_patient_id` aponta
-- para o cadastro resultante sem apagar o historico comercial.
--
-- O app ja prepara a tela e o adapter, mas mantem o item do menu desabilitado
-- ate esta migration existir no banco remoto e os tipos serem regenerados.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'new',
      'contacted',
      'qualified',
      'scheduled',
      'showed',
      'converted',
      'lost'
    );
  end if;
end
$$;

create table if not exists public.clinic_leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  phone text,
  email text,
  source text not null default 'manual',
  campaign text,
  interest text,
  stage public.lead_stage not null default 'new',
  potential_value_cents integer,
  next_action_at timestamptz,
  notes text,

  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  converted_patient_id uuid references public.patients(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinic_leads_pipeline_idx
  on public.clinic_leads (clinic_id, stage, updated_at desc);

create index if not exists clinic_leads_assignee_idx
  on public.clinic_leads (clinic_id, assigned_to, stage);

create index if not exists clinic_leads_next_action_idx
  on public.clinic_leads (clinic_id, next_action_at)
  where next_action_at is not null;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  lead_id uuid not null references public.clinic_leads(id) on delete cascade,
  from_stage public.lead_stage,
  to_stage public.lead_stage not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_events_timeline_idx
  on public.lead_events (clinic_id, lead_id, created_at desc);

alter table public.clinic_leads enable row level security;
alter table public.lead_events enable row level security;

drop policy if exists "clinic_leads_select" on public.clinic_leads;
create policy "clinic_leads_select"
  on public.clinic_leads
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_leads_insert" on public.clinic_leads;
create policy "clinic_leads_insert"
  on public.clinic_leads
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_leads_update" on public.clinic_leads;
create policy "clinic_leads_update"
  on public.clinic_leads
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "lead_events_select" on public.lead_events;
create policy "lead_events_select"
  on public.lead_events
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "lead_events_insert" on public.lead_events;
create policy "lead_events_insert"
  on public.lead_events
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

-- Nao ha DELETE: perder um lead e uma decisao de negocio, nao limpeza tecnica.

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class where relname in ('clinic_leads','lead_events');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('clinic_leads','lead_events');
-- Testar com duas clinicas: a clinica B nao deve ler nem inserir em A.
-- Depois: npm run db:types


-- ===========================================================================
-- 20260809_clinic_forms.sql — Formularios digitais
-- ===========================================================================

-- =============================================================================
-- Formulários digitais da clínica: modelos versionáveis e respostas futuras
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- Esta migration separa o modelo do formulário das respostas. A coluna `fields`
-- guarda apenas a definição validada pela aplicação; respostas e dados de saúde
-- terão policies e auditoria próprias quando a coleta for ativada.
-- =============================================================================

begin;

create table if not exists public.clinic_forms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  description text,
  form_type text not null default 'custom'
    check (form_type in ('intake', 'anamnesis', 'consent', 'feedback', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  fields jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create index if not exists clinic_forms_list_idx
  on public.clinic_forms (clinic_id, status, updated_at desc);

-- As chaves compostas abaixo tornam o tenant parte da referência futura de
-- respostas. `id` já é único, portanto os índices não mudam a cardinalidade;
-- apenas permitem ao Postgres impedir uma referência cruzada.
create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

create unique index if not exists appointments_id_clinic_id_key
  on public.appointments (id, clinic_id);

create table if not exists public.clinic_form_responses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  form_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'void')),
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (form_id, clinic_id)
    references public.clinic_forms(id, clinic_id)
    on delete restrict,
  foreign key (patient_id, clinic_id)
    references public.patients(id, clinic_id)
    on delete restrict,
  foreign key (appointment_id, clinic_id)
    references public.appointments(id, clinic_id)
    on delete restrict
);

create index if not exists clinic_form_responses_patient_idx
  on public.clinic_form_responses (clinic_id, patient_id, created_at desc);

create index if not exists clinic_form_responses_form_idx
  on public.clinic_form_responses (clinic_id, form_id, status, created_at desc);

alter table public.clinic_forms enable row level security;
alter table public.clinic_form_responses enable row level security;

drop policy if exists "clinic_forms_select" on public.clinic_forms;
create policy "clinic_forms_select"
  on public.clinic_forms
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_forms_insert" on public.clinic_forms;
create policy "clinic_forms_insert"
  on public.clinic_forms
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_forms_update" on public.clinic_forms;
create policy "clinic_forms_update"
  on public.clinic_forms
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_form_responses_select" on public.clinic_form_responses;
create policy "clinic_form_responses_select"
  on public.clinic_form_responses
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_form_responses_insert" on public.clinic_form_responses;
create policy "clinic_form_responses_insert"
  on public.clinic_form_responses
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_form_responses_update" on public.clinic_form_responses;
create policy "clinic_form_responses_update"
  on public.clinic_form_responses
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('clinic_forms', 'clinic_form_responses');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('clinic_forms', 'clinic_form_responses');
-- Testar com duas clinicas: a clinica B nao deve ler nem inserir em A.
-- Depois: npm run db:types


-- ===========================================================================
-- 20260809_patient_tags.sql — Tags de paciente
-- ===========================================================================

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
  with check (clinic_id = public.current_clinic_id());

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
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "patient_tag_links_delete" on public.patient_tag_links;
create policy "patient_tag_links_delete"
  on public.patient_tag_links
  for delete
  to authenticated
  using (clinic_id = public.current_clinic_id());

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


-- ===========================================================================
-- 20260809_patient_documents.sql — Documentos — a tabela JA EXISTE; ver o aviso no bloco
-- ===========================================================================

-- =============================================================================
-- Documentos de pacientes: metadados tenant-scoped + Storage privado
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- ATENCAO — a tabela JA EXISTE no schema remoto (conferido em 09/08/2026 em
-- `database.types.ts`, gerado do projeto). O `create table if not exists`
-- abaixo e, portanto, um NO-OP: as colunas ja estao la e batem com as daqui.
--
-- O que este arquivo efetivamente aplica sobre uma tabela existente:
--
--   * as POLICIES, que SUBSTITUEM as atuais — confira antes o que existe:
--       select policyname, cmd from pg_policies
--        where tablename = 'patient_documents';
--   * os indices;
--   * as policies de `storage.objects`.
--
-- O que ele NAO aplica, justamente por a tabela ja existir: as constraints
-- declaradas no corpo do `create table` (`storage_path unique` e
-- `unique (id, clinic_id)`). Se elas forem necessarias, precisam virar
-- `alter table ... add constraint` proprios.
--
-- O bucket `patient-documents` foi criado em 09/08/2026 — privado, limite de
-- 20 MB, aceitando PDF e imagem. As policies de Storage abaixo dependem dele.
--
-- O arquivo armazenado nunca fica público. A aplicação só entrega uma URL
-- assinada por 60 segundos depois de localizar o metadado dentro da clínica
-- ativa. O caminho começa com clinic_id para que a policy do Storage tenha a
-- mesma fronteira tenant-scoped da tabela.
-- =============================================================================

begin;

create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  kind text not null check (kind in (
    'rg', 'cpf', 'cns', 'passport', 'insurance_card', 'consent_form', 'other'
  )),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create index if not exists patient_documents_list_idx
  on public.patient_documents (clinic_id, created_at desc);

create index if not exists patient_documents_patient_idx
  on public.patient_documents (clinic_id, patient_id, created_at desc);

-- A policy tenant-scoped sozinha não impede que um id de paciente de outra
-- clínica seja anexado a uma linha nova. A chave composta fecha essa fronteira
-- também no banco, inclusive para futuros adapters que não passem pela UI.
create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'patient_documents_patient_clinic_fkey'
       and conrelid = 'public.patient_documents'::regclass
  ) then
    alter table public.patient_documents
      add constraint patient_documents_patient_clinic_fkey
      foreign key (patient_id, clinic_id)
      references public.patients (id, clinic_id)
      on delete restrict;
  end if;
end
$$;

alter table public.patient_documents enable row level security;

drop policy if exists "patient_documents_select" on public.patient_documents;
create policy "patient_documents_select"
  on public.patient_documents
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "patient_documents_insert" on public.patient_documents;
create policy "patient_documents_insert"
  on public.patient_documents
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "patient_documents_storage_select" on storage.objects;
create policy "patient_documents_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

drop policy if exists "patient_documents_storage_insert" on storage.objects;
create policy "patient_documents_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class where relname = 'patient_documents';
-- select policyname, tablename, cmd from pg_policies
--   where tablename = 'patient_documents';
-- select id, name, public, file_size_limit from storage.buckets
--   where id = 'patient-documents';
-- Depois: npm run db:types


-- ===========================================================================
-- 20260809_notifications_insert_policy.sql — Notificacoes — so acrescenta policy de INSERT
-- ===========================================================================

-- =============================================================================
-- Notificações operacionais criadas pelo próprio usuário autenticado
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- A tabela `notifications` JA EXISTE no schema remoto — esta migration não cria
-- nada, só acrescenta a policy de INSERT.
--
-- O centro de notificações é recortado por `user_id` no repositório. Esta policy
-- fecha também a ESCRITA: sem ela, uma action poderia fabricar um aviso para
-- outro usuário, ou para outra clínica. O recorte de leitura não impede isso —
-- ele só decide quem vê depois de a linha existir.
--
-- `auth.uid()` e não `current_clinic_id()` sozinho: as duas condições respondem
-- perguntas diferentes, e só as duas juntas fecham o caso de alguém escrever na
-- clínica certa para a pessoa errada.
-- =============================================================================

begin;

alter table public.notifications enable row level security;

drop policy if exists "notifications_insert_own_user" on public.notifications;
create policy "notifications_insert_own_user"
  on public.notifications
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and user_id = auth.uid()
  );

commit;

-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. A policy existe e cobre INSERT:
--      select policyname, cmd from pg_policies
--       where tablename = 'notifications';
--
-- 2. Com duas contas: logado na clínica A, tentar inserir uma notificação com
--    `user_id` de outra pessoa -> deve ser recusado (42501).
-- =============================================================================


-- ===========================================================================
-- 20260809_bank_reconciliation.sql — Conciliacao bancaria
-- ===========================================================================

-- =============================================================================
-- Conciliação bancária: contas, transações importadas e vínculo auditável
-- =============================================================================
--
-- NÃO APLICADA. Revisar no Supabase antes de executar.
--
-- Esta migration entrega o núcleo local da conciliação. A entrada automática
-- de extratos continua sendo um adapter de provedor externo; a clínica pode
-- cadastrar transações manualmente enquanto esse provedor não existe.
-- Nenhuma senha bancária ou token de terceiro entra no banco.
-- =============================================================================

begin;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  bank_name text,
  last_four text,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create index if not exists bank_accounts_list_idx
  on public.bank_accounts (clinic_id, is_active, name);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  bank_account_id uuid not null,

  occurred_on date not null,
  direction text not null check (direction in ('credit', 'debit')),
  amount_cents integer not null check (amount_cents > 0),
  description text not null,
  external_id text,
  status text not null default 'pending'
    check (status in ('pending', 'reconciled', 'ignored')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id),
  foreign key (bank_account_id, clinic_id)
    references public.bank_accounts(id, clinic_id)
    on delete restrict
);

create unique index if not exists bank_transactions_external_id_idx
  on public.bank_transactions (clinic_id, bank_account_id, external_id)
  where external_id is not null;

create index if not exists bank_transactions_pending_idx
  on public.bank_transactions (clinic_id, status, occurred_on desc);

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  transaction_id uuid not null,
  invoice_id uuid,
  payable_id uuid,
  matched_amount_cents integer not null check (matched_amount_cents > 0),
  notes text,
  reconciled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  unique (transaction_id),
  check ((invoice_id is not null) <> (payable_id is not null)),
  foreign key (transaction_id, clinic_id)
    references public.bank_transactions(id, clinic_id)
    on delete restrict
);

-- O id da linha já é globalmente único; estes índices compostos tornam o
-- tenant parte da referência para que uma conciliação não atravesse clínicas.
create unique index if not exists invoices_id_clinic_id_key
  on public.invoices (id, clinic_id);

create unique index if not exists payables_id_clinic_id_key
  on public.payables (id, clinic_id);

alter table public.bank_reconciliations
  add constraint bank_reconciliations_invoice_clinic_fkey
  foreign key (invoice_id, clinic_id)
  references public.invoices(id, clinic_id)
  on delete restrict;

alter table public.bank_reconciliations
  add constraint bank_reconciliations_payable_clinic_fkey
  foreign key (payable_id, clinic_id)
  references public.payables(id, clinic_id)
  on delete restrict;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_reconciliations enable row level security;

drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select"
  on public.bank_accounts
  for select to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "bank_accounts_insert" on public.bank_accounts;
create policy "bank_accounts_insert"
  on public.bank_accounts
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "bank_accounts_update" on public.bank_accounts;
create policy "bank_accounts_update"
  on public.bank_accounts
  for update to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "bank_transactions_select" on public.bank_transactions;
create policy "bank_transactions_select"
  on public.bank_transactions
  for select to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "bank_transactions_insert" on public.bank_transactions;
create policy "bank_transactions_insert"
  on public.bank_transactions
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "bank_transactions_update" on public.bank_transactions;
create policy "bank_transactions_update"
  on public.bank_transactions
  for update to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "bank_reconciliations_select" on public.bank_reconciliations;
create policy "bank_reconciliations_select"
  on public.bank_reconciliations
  for select to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "bank_reconciliations_insert" on public.bank_reconciliations;
create policy "bank_reconciliations_insert"
  on public.bank_reconciliations
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id());

-- Não há UPDATE nem DELETE: uma conciliação é uma evidência; correções devem
-- nascer como novo lançamento de ajuste, não apagar o histórico.

create or replace function public.reconcile_bank_transaction(
  p_clinic_id uuid,
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_payable_id uuid,
  p_reconciled_by uuid,
  p_notes text
)
returns public.bank_reconciliations
language plpgsql
as $$
declare
  v_transaction public.bank_transactions;
  v_reconciliation public.bank_reconciliations;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if (p_invoice_id is null) = (p_payable_id is null) then
    raise exception 'reconciliation_target_invalid' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.bank_transactions
  where id = p_transaction_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'bank_transaction_not_found' using errcode = 'P0002';
  end if;

  if v_transaction.status <> 'pending' then
    raise exception 'bank_transaction_already_processed' using errcode = '22023';
  end if;

  if p_invoice_id is not null then
    if v_transaction.direction <> 'credit' or not exists (
      select 1 from public.invoices where id = p_invoice_id and clinic_id = p_clinic_id
    ) then
      raise exception 'invoice_reconciliation_invalid' using errcode = '22023';
    end if;
  else
    if v_transaction.direction <> 'debit' or not exists (
      select 1 from public.payables where id = p_payable_id and clinic_id = p_clinic_id
    ) then
      raise exception 'payable_reconciliation_invalid' using errcode = '22023';
    end if;
  end if;

  insert into public.bank_reconciliations (
    clinic_id,
    transaction_id,
    invoice_id,
    payable_id,
    matched_amount_cents,
    notes,
    reconciled_by
  ) values (
    p_clinic_id,
    v_transaction.id,
    p_invoice_id,
    p_payable_id,
    v_transaction.amount_cents,
    nullif(trim(p_notes), ''),
    p_reconciled_by
  ) returning * into v_reconciliation;

  update public.bank_transactions
  set status = 'reconciled',
      updated_at = now()
  where id = v_transaction.id and clinic_id = p_clinic_id;

  return v_reconciliation;
end;
$$;

revoke all on function public.reconcile_bank_transaction(uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.reconcile_bank_transaction(uuid, uuid, uuid, uuid, uuid, text) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('bank_accounts', 'bank_transactions', 'bank_reconciliations');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('bank_accounts', 'bank_transactions', 'bank_reconciliations');
-- Testar com duas clínicas e uma entrada/saída em cada: nenhuma transação,
-- conta ou vínculo da clínica A pode aparecer na clínica B.
-- Criar uma entrada e vinculá-la a uma invoice; criar uma saída e vinculá-la a
-- um payable; tentar inverter os sentidos e confirmar que o banco recusa.
-- Depois: npm run db:types


-- ===========================================================================
-- 20260809_inventory.sql — Estoque — PRECISA vir antes de purchases
-- ===========================================================================

-- =============================================================================
-- Estoque da clínica: itens, saldo e movimentações auditáveis
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- O saldo é mantido com lock de linha dentro da função de movimentação. Assim a
-- aplicação não faz o perigoso fluxo "ler saldo -> calcular -> gravar" em duas
-- requests concorrentes.
-- =============================================================================

begin;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'unidade',
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create unique index if not exists inventory_items_clinic_sku_idx
  on public.inventory_items (clinic_id, lower(sku))
  where sku is not null;

create index if not exists inventory_items_list_idx
  on public.inventory_items (clinic_id, is_active, name);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  item_id uuid not null,
  movement_type text not null check (movement_type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (item_id, clinic_id)
    references public.inventory_items(id, clinic_id)
    on delete restrict
);

create index if not exists inventory_movements_timeline_idx
  on public.inventory_movements (clinic_id, created_at desc);

create index if not exists inventory_movements_item_idx
  on public.inventory_movements (clinic_id, item_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_items_select" on public.inventory_items;
create policy "inventory_items_select"
  on public.inventory_items
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "inventory_items_insert" on public.inventory_items;
create policy "inventory_items_insert"
  on public.inventory_items
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "inventory_items_update" on public.inventory_items;
create policy "inventory_items_update"
  on public.inventory_items
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "inventory_movements_select" on public.inventory_movements;
create policy "inventory_movements_select"
  on public.inventory_movements
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "inventory_movements_insert" on public.inventory_movements;
create policy "inventory_movements_insert"
  on public.inventory_movements
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

create or replace function public.record_inventory_movement(
  p_clinic_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_reason text,
  p_created_by uuid
)
returns public.inventory_movements
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_movement public.inventory_movements;
begin
  if p_clinic_id is distinct from public.current_clinic_id() then
    raise exception 'CLINIC_SCOPE' using errcode = '42501';
  end if;

  if p_movement_type not in ('in', 'out') or p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_MOVEMENT' using errcode = '22023';
  end if;

  select * into v_item
    from public.inventory_items
   where id = p_item_id
     and clinic_id = p_clinic_id
     and is_active = true
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_movement_type = 'out' and v_item.current_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  update public.inventory_items
     set current_quantity = case
       when p_movement_type = 'in' then current_quantity + p_quantity
       else current_quantity - p_quantity
     end,
         updated_at = now()
   where id = p_item_id
     and clinic_id = p_clinic_id;

  insert into public.inventory_movements (
    clinic_id, item_id, movement_type, quantity, unit_cost_cents, reason, created_by
  ) values (
    p_clinic_id, p_item_id, p_movement_type, p_quantity, p_unit_cost_cents,
    nullif(trim(p_reason), ''), p_created_by
  ) returning * into v_movement;

  return v_movement;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, uuid, text, integer, integer, text, uuid) from public;
grant execute on function public.record_inventory_movement(uuid, uuid, text, integer, integer, text, uuid) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('inventory_items', 'inventory_movements');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('inventory_items', 'inventory_movements');
-- Testar com duas clinicas e concorrencia de saidas do mesmo item.
-- Depois: npm run db:types


-- ===========================================================================
-- 20260809_purchases.sql — Compras — referencia inventory_items
-- ===========================================================================

-- =============================================================================
-- Compras da clínica: fornecedores, pedidos e recebimento no estoque
-- =============================================================================
--
-- NÃO APLICADA. Revisar no Supabase antes de executar.
--
-- A tela de Compras não é uma lista decorativa: cada pedido possui linhas
-- ligadas a itens do estoque e o recebimento atualiza o saldo dentro da mesma
-- transação do banco. A integração com contas a pagar pode nascer depois sem
-- misturar o lançamento financeiro com o recebimento físico.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_order_status') then
    create type public.purchase_order_status as enum (
      'draft',
      'requested',
      'approved',
      'ordered',
      'partially_received',
      'received',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.purchase_suppliers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  tax_id text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create unique index if not exists purchase_suppliers_clinic_tax_id_idx
  on public.purchase_suppliers (clinic_id, lower(tax_id))
  where tax_id is not null;

create index if not exists purchase_suppliers_list_idx
  on public.purchase_suppliers (clinic_id, is_active, name);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  supplier_id uuid not null,

  status public.purchase_order_status not null default 'draft',
  expected_delivery_date date,
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id),
  foreign key (supplier_id, clinic_id)
    references public.purchase_suppliers(id, clinic_id)
    on delete restrict
);

create index if not exists purchase_orders_list_idx
  on public.purchase_orders (clinic_id, status, created_at desc);

create index if not exists purchase_orders_supplier_idx
  on public.purchase_orders (clinic_id, supplier_id, created_at desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  purchase_order_id uuid not null,
  inventory_item_id uuid not null,

  quantity integer not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now(),

  unique (id, clinic_id),
  unique (purchase_order_id, inventory_item_id),
  check (received_quantity <= quantity),
  foreign key (purchase_order_id, clinic_id)
    references public.purchase_orders(id, clinic_id)
    on delete cascade,
  foreign key (inventory_item_id, clinic_id)
    references public.inventory_items(id, clinic_id)
    on delete restrict
);

create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (clinic_id, purchase_order_id);

create index if not exists purchase_order_items_inventory_idx
  on public.purchase_order_items (clinic_id, inventory_item_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.purchase_suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "purchase_suppliers_select" on public.purchase_suppliers;
create policy "purchase_suppliers_select"
  on public.purchase_suppliers
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_suppliers_insert" on public.purchase_suppliers;
create policy "purchase_suppliers_insert"
  on public.purchase_suppliers
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_suppliers_update" on public.purchase_suppliers;
create policy "purchase_suppliers_update"
  on public.purchase_suppliers
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_orders_select" on public.purchase_orders;
create policy "purchase_orders_select"
  on public.purchase_orders
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_orders_insert" on public.purchase_orders;
create policy "purchase_orders_insert"
  on public.purchase_orders
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_orders_update" on public.purchase_orders;
create policy "purchase_orders_update"
  on public.purchase_orders
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_order_items_select" on public.purchase_order_items;
create policy "purchase_order_items_select"
  on public.purchase_order_items
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_order_items_insert" on public.purchase_order_items;
create policy "purchase_order_items_insert"
  on public.purchase_order_items
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "purchase_order_items_update" on public.purchase_order_items;
create policy "purchase_order_items_update"
  on public.purchase_order_items
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- -----------------------------------------------------------------------------
-- RPCs atômicas
-- -----------------------------------------------------------------------------

create or replace function public.create_purchase_order(
  p_clinic_id uuid,
  p_supplier_id uuid,
  p_expected_delivery_date date,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
)
returns public.purchase_orders
language plpgsql
as $$
declare
  v_order public.purchase_orders;
  v_item jsonb;
  v_inventory_item_id uuid;
  v_quantity integer;
  v_unit_cost_cents integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.purchase_suppliers
    where id = p_supplier_id and clinic_id = p_clinic_id and is_active
  ) then
    raise exception 'supplier_not_found' using errcode = 'P0002';
  end if;

  insert into public.purchase_orders (
    clinic_id,
    supplier_id,
    expected_delivery_date,
    notes,
    created_by
  ) values (
    p_clinic_id,
    p_supplier_id,
    p_expected_delivery_date,
    nullif(trim(p_notes), ''),
    p_created_by
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_inventory_item_id := (v_item ->> 'inventory_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_cost_cents := (v_item ->> 'unit_cost_cents')::integer;

    if v_quantity is null or v_quantity <= 0 or v_unit_cost_cents is null or v_unit_cost_cents < 0 then
      raise exception 'purchase_order_item_invalid' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.inventory_items
      where id = v_inventory_item_id and clinic_id = p_clinic_id and is_active
    ) then
      raise exception 'inventory_item_not_found' using errcode = 'P0002';
    end if;

    insert into public.purchase_order_items (
      clinic_id,
      purchase_order_id,
      inventory_item_id,
      quantity,
      unit_cost_cents
    ) values (
      p_clinic_id,
      v_order.id,
      v_inventory_item_id,
      v_quantity,
      v_unit_cost_cents
    );

    v_total := v_total + (v_quantity * v_unit_cost_cents);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  update public.purchase_orders
  set total_cents = v_total,
      updated_at = now()
  where id = v_order.id and clinic_id = p_clinic_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.transition_purchase_order_status(
  p_clinic_id uuid,
  p_order_id uuid,
  p_status text,
  p_changed_by uuid
)
returns public.purchase_orders
language plpgsql
as $$
declare
  v_order public.purchase_orders;
  v_has_items boolean;
  v_next public.purchase_order_status;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  begin
    v_next := p_status::public.purchase_order_status;
  exception when invalid_text_representation then
    raise exception 'purchase_order_status_invalid' using errcode = '22023';
  end;

  select * into v_order
  from public.purchase_orders
  where id = p_order_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status = v_next then
    return v_order;
  end if;

  select exists (
    select 1 from public.purchase_order_items
    where purchase_order_id = p_order_id and clinic_id = p_clinic_id
  ) into v_has_items;

  if not v_has_items and v_next in ('requested', 'approved', 'ordered') then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  if not (
    (v_order.status = 'draft' and v_next in ('requested', 'cancelled')) or
    (v_order.status = 'requested' and v_next in ('draft', 'approved', 'cancelled')) or
    (v_order.status = 'approved' and v_next in ('requested', 'ordered', 'cancelled')) or
    (v_order.status = 'ordered' and v_next = 'cancelled')
  ) then
    raise exception 'purchase_order_transition_invalid' using errcode = '22023';
  end if;

  update public.purchase_orders
  set status = v_next,
      approved_by = case when v_next = 'approved' then p_changed_by else approved_by end,
      updated_at = now()
  where id = p_order_id and clinic_id = p_clinic_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.receive_purchase_order_item(
  p_clinic_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_received_by uuid
)
returns public.purchase_order_items
language plpgsql
as $$
declare
  v_line public.purchase_order_items;
  v_order public.purchase_orders;
  v_inventory public.inventory_items;
  v_total_quantity integer;
  v_received_quantity integer;
  v_next_status public.purchase_order_status;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'received_quantity_invalid' using errcode = '22023';
  end if;

  select * into v_line
  from public.purchase_order_items
  where id = p_order_item_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'purchase_order_item_not_found' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.purchase_orders
  where id = v_line.purchase_order_id and clinic_id = p_clinic_id
  for update;

  if v_order.status not in ('ordered', 'partially_received') then
    raise exception 'purchase_order_not_ready_to_receive' using errcode = '22023';
  end if;

  if p_quantity > (v_line.quantity - v_line.received_quantity) then
    raise exception 'received_quantity_exceeds_order' using errcode = '22023';
  end if;

  select * into v_inventory
  from public.inventory_items
  where id = v_line.inventory_item_id and clinic_id = p_clinic_id and is_active
  for update;

  if not found then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;

  update public.inventory_items
  set current_quantity = current_quantity + p_quantity,
      updated_at = now()
  where id = v_inventory.id and clinic_id = p_clinic_id;

  insert into public.inventory_movements (
    clinic_id,
    item_id,
    movement_type,
    quantity,
    unit_cost_cents,
    reason,
    created_by
  ) values (
    p_clinic_id,
    v_inventory.id,
    'in',
    p_quantity,
    v_line.unit_cost_cents,
    'Recebimento de pedido ' || left(v_order.id::text, 8),
    p_received_by
  );

  update public.purchase_order_items
  set received_quantity = received_quantity + p_quantity
  where id = v_line.id and clinic_id = p_clinic_id
  returning * into v_line;

  select sum(quantity), sum(received_quantity)
    into v_total_quantity, v_received_quantity
  from public.purchase_order_items
  where purchase_order_id = v_order.id and clinic_id = p_clinic_id;

  v_next_status := case
    when v_received_quantity >= v_total_quantity then 'received'::public.purchase_order_status
    else 'partially_received'::public.purchase_order_status
  end;

  update public.purchase_orders
  set status = v_next_status,
      updated_at = now()
  where id = v_order.id and clinic_id = p_clinic_id;

  return v_line;
end;
$$;

revoke all on function public.create_purchase_order(uuid, uuid, date, text, uuid, jsonb) from public;
grant execute on function public.create_purchase_order(uuid, uuid, date, text, uuid, jsonb) to authenticated;

revoke all on function public.transition_purchase_order_status(uuid, uuid, text, uuid) from public;
grant execute on function public.transition_purchase_order_status(uuid, uuid, text, uuid) to authenticated;

revoke all on function public.receive_purchase_order_item(uuid, uuid, integer, uuid) from public;
grant execute on function public.receive_purchase_order_item(uuid, uuid, integer, uuid) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('purchase_suppliers', 'purchase_orders', 'purchase_order_items');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('purchase_suppliers', 'purchase_orders', 'purchase_order_items');
-- Testar com duas clínicas: a clínica B não deve ler nem inserir em A.
-- Criar pedido com duas linhas; avançar até ordered; receber em duas operações;
-- conferir que inventory_items.current_quantity e inventory_movements mudaram
-- na mesma transação e que a ordem terminou como received.
-- Depois: npm run db:types

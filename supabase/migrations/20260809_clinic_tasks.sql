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
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_tasks_insert" on public.clinic_tasks;
create policy "clinic_tasks_insert"
  on public.clinic_tasks
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_tasks_update" on public.clinic_tasks;
create policy "clinic_tasks_update"
  on public.clinic_tasks
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

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

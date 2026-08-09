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

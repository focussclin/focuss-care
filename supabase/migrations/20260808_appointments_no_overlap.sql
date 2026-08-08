-- =============================================================================
-- appointments: impedir sobreposicao de horario do mesmo profissional
-- =============================================================================
--
-- PROPOSTA — NAO APLICADA. Ver supabase/migrations/PROPOSTAS.md.
--
-- Problema (A-02). A aplicacao ja verifica sobreposicao antes de gravar: le os
-- atendimentos do profissional no intervalo e recusa se houver algum. Isso
-- resolve o caso real — pessoas diferentes marcando em momentos diferentes —
-- e nao resolve a corrida: PostgREST nao expoe transacao, entao a leitura e a
-- escrita sao duas idas ao banco. Duas recepcionistas clicando no mesmo
-- instante podem passar as duas pela leitura e gravar as duas.
--
-- Quem fecha essa janela e o banco, e so ele: a constraint abaixo avalia a
-- sobreposicao no momento do INSERT, com o bloqueio da propria transacao.
--
-- O adapter JA TRADUZ 23P01 para "horario ocupado" (ver `toWriteError` em
-- SupabaseAppointmentRepository). Ou seja: aplicar esta migration nao exige
-- mudanca de codigo — a mensagem que o usuario recebe e a mesma, venha a
-- recusa da consulta previa ou da constraint.
--
-- -----------------------------------------------------------------------------
-- DECISOES QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--
-- 1. `btree_gist` e obrigatoria para combinar igualdade (uuid) com sobreposicao
--    (tstzrange) no mesmo EXCLUDE. Se a extensao nao puder ser criada no
--    projeto, esta migration nao se aplica como esta.
--
-- 2. O intervalo e SEMIABERTO — `[)`. Um atendimento das 10:00 as 10:30 e outro
--    das 10:30 as 11:00 se encostam e NAO conflitam. Trocar por `[]` quebraria
--    toda agenda de 30 em 30 minutos.
--
-- 3. O `where` exclui `canceled` e `no_show`: atendimento cancelado libera o
--    horario, e remarcar em cima de um cancelado e o caso mais comum de todos.
--    Sem essa clausula, um cancelamento bloquearia o proprio horario para
--    sempre.
--
-- 4. `clinic_id` entra no EXCLUDE junto de `professional_id`. Profissional ja e
--    unico por clinica, entao e redundante para a corretude — e barato, e deixa
--    o indice util para consultas por clinica.
--
-- 5. **Dados existentes com sobreposicao impedem a criacao da constraint.** A
--    consulta de diagnostico esta no fim deste arquivo: rode ANTES e resolva o
--    que aparecer, senao o `alter table` falha e a transacao inteira volta.
-- =============================================================================

begin;

create extension if not exists btree_gist;

alter table public.appointments
  drop constraint if exists appointments_no_overlap;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    clinic_id with =,
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status not in ('canceled', 'no_show'));

commit;

-- -----------------------------------------------------------------------------
-- Rodar ANTES de aplicar: sobreposicoes que ja existem no banco
-- -----------------------------------------------------------------------------
--
-- select a.id, b.id, a.professional_id, a.starts_at, b.starts_at
--   from public.appointments a
--   join public.appointments b
--     on a.clinic_id = b.clinic_id
--    and a.professional_id = b.professional_id
--    and a.id < b.id
--    and tstzrange(a.starts_at, a.ends_at, '[)')
--     && tstzrange(b.starts_at, b.ends_at, '[)')
--  where a.status not in ('canceled', 'no_show')
--    and b.status not in ('canceled', 'no_show');
--
-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. Dois INSERT simultaneos no mesmo intervalo: o segundo deve falhar com
--    23P01, e o usuario deve ver "Este profissional ja possui um atendimento
--    nesse horario."
-- 2. Marcar as 10:00-10:30 e depois as 10:30-11:00 deve FUNCIONAR.
-- 3. Cancelar um atendimento e remarcar outro no mesmo horario deve FUNCIONAR.

-- =============================================================================
-- audit_log: permitir INSERT do membro autenticado
-- =============================================================================
--
-- APLICADA no projeto Supabase em 08/08/2026. Este arquivo permanece como
-- migration reproduzível e documentação do motivo da policy.
--
-- Problema (verificacao V8 de docs/07-cadastro-de-pacientes.md, pendencia P-P6):
-- a policy de INSERT de `audit_log` recusa o membro autenticado com 403/42501.
-- O resultado e que NENHUM evento de auditoria do produto esta sendo gravado.
--
-- O `recordAuditEvent` e best-effort de proposito, entao nada quebra na tela —
-- e por isso o defeito passou despercebido ate ser sondado diretamente. Para
-- dado de saude, trilha de auditoria e requisito legal, nao recurso.
--
-- O WITH CHECK abaixo e o que torna a permissao segura: o membro so grava
-- evento DA PROPRIA CLINICA ATIVA e SOMENTE EM SEU PROPRIO NOME. Nao ha como
-- forjar um evento de outra clinica nem atribuir um ato a outra pessoa.
--
-- Note que NAO ha policy de UPDATE nem de DELETE, e isso e deliberado: trilha
-- de auditoria que pode ser editada nao e trilha de auditoria. Correcao de
-- evento errado se faz gravando outro evento.
-- =============================================================================

begin;

drop policy if exists "audit_log_insert_own_clinic" on public.audit_log;

create policy "audit_log_insert_own_clinic"
  on public.audit_log
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and actor_user_id = auth.uid()
  );

commit;

-- Verificar depois de aplicar (repetir V8):
--
--   insert into public.audit_log (clinic_id, actor_user_id, action, entity_type)
--   values (public.current_clinic_id(), auth.uid(), 'test.probe', 'test');
--
-- Deve devolver 201. Em seguida, remover a linha de sonda.

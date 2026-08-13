-- =============================================================================
-- OpenAI como provedor de IA do produto
--
-- `clinic_integration_credentials.provider` é `text` com `check`, e não enum.
-- A escolha original permite acrescentar provedor sem `alter type`, que no
-- Postgres não roda dentro de transação junto com o resto — mas exige trocar a
-- restrição inteira, porque `check` não se estende.
--
-- `deepseek` PERMANECE na lista. Sair dali apagaria a possibilidade de uma
-- clínica que já o tenha cadastrado continuar usando, e a troca de provedor é
-- decisão de cada clínica, não da migration.
--
-- Verificar depois de aplicar:
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.clinic_integration_credentials'::regclass
--      and contype = 'c';
-- =============================================================================

begin;

alter table public.clinic_integration_credentials
  drop constraint if exists clinic_integration_credentials_provider_check;

alter table public.clinic_integration_credentials
  add constraint clinic_integration_credentials_provider_check
  check (
    provider in (
      'brevo',
      'evolution',
      'deepseek',
      'openai',
      'google_calendar',
      'outlook_calendar'
    )
  );

commit;

-- =============================================================================
-- Contato e endereço da clínica
--
-- # O que faltava
--
-- `clinics` guardava identidade (nome, CNPJ, fuso) e nenhuma forma de alguém
-- chegar até ela. O produto sentia a falta em três lugares:
--
--   * o assistente de WhatsApp respondia "vou confirmar com a equipe" quando o
--     paciente perguntava o endereço — porque não havia onde ler;
--   * documentos e recibos saem em nome da clínica sem dizer onde ela fica;
--   * o convite por e-mail não tem telefone de contato para quem desconfia.
--
-- # Por que `address` é jsonb, e telefone e e-mail são colunas
--
-- Telefone e e-mail são valores únicos, consultáveis e às vezes filtráveis —
-- coluna resolve. Endereço é um agregado com sete campos que só fazem sentido
-- juntos, e cujo formato varia (número sem numeração, complemento ausente).
-- Espalhá-lo em sete colunas encheria a tabela de campos quase sempre nulos.
--
-- A forma do jsonb é FECHADA pela aplicação em Zod, como `emergency_contact` em
-- `patients` — o banco guarda, a aplicação valida e relê.
--
-- Verificar depois de aplicar:
--
--   select column_name, data_type from information_schema.columns
--    where table_name = 'clinics' and column_name in ('phone','email','address');
-- =============================================================================

begin;

alter table public.clinics
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address jsonb;

comment on column public.clinics.phone is
  'Telefone público da clínica, como o paciente disca. Sem formatação garantida.';

comment on column public.clinics.email is
  'E-mail público de contato. Não é o e-mail de login de ninguém.';

comment on column public.clinics.address is
  'Endereço público: { street, number, complement, district, city, state, zipCode }. Forma fechada em Zod pela aplicação.';

commit;

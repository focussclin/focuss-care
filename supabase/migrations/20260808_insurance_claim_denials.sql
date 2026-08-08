-- =============================================================================
-- Glosas: recusa de pagamento da operadora APOS o faturamento
-- =============================================================================
--
-- PROPOSTA — NAO APLICADA. Ver supabase/migrations/PROPOSTAS.md.
--
-- Problema (V-01). O schema nao tem onde registrar glosa. O que existe e
-- `insurance_authorizations.status = 'denied'`, e isso e OUTRA COISA:
--
--   * `denied` e negativa de AUTORIZACAO PREVIA. Acontece ANTES do atendimento.
--     Consequencia: o atendimento nao e feito, ou e feito como particular.
--   * GLOSA e recusa de PAGAMENTO. A operadora autorizou, o atendimento foi
--     prestado, a fatura foi enviada — e ela nao paga, total ou parcialmente.
--     Consequencia: a clinica ja teve o custo, e o dinheiro nao vem.
--
-- Modelar a segunda em cima da primeira misturaria dois fatos com efeitos
-- financeiros opostos, e o relatorio de convenios passaria a somar macas com
-- laranjas. Por isso V-01 deixou a glosa explicitamente AUSENTE, com o motivo na
-- tela, em vez de reaproveitar o status errado.
--
-- -----------------------------------------------------------------------------
-- DECISOES QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--
-- 1. A glosa aponta para `invoices`, e nao para `insurance_authorizations`: e a
--    FATURA que deixou de ser paga. Uma fatura pode ter varias glosas (uma por
--    item recusado), e por isso a tabela e separada em vez de colunas na fatura.
--
-- 2. `invoice_item_id` e opcional. Glosa de linha aponta para o item; glosa
--    total da guia aponta so para a fatura.
--
-- 3. Valores em CENTAVOS, inteiros, como o resto do financeiro (roadmap §3).
--
-- 4. `status` cobre o ciclo real: recebida, em recurso, recuperada (a operadora
--    voltou atras) ou aceita (a clinica desistiu e assumiu o prejuizo). Sem o
--    ultimo estado, glosa nenhuma "fecha", e o relatorio de pendencias cresce
--    para sempre.
--
-- 5. RLS pelo mesmo padrao das demais tabelas do modulo: leitura e escrita
--    restritas a quem `can_access_financial()` autoriza. **O corpo dessa funcao
--    nao e legivel deste ambiente (bloqueio B1)** — o revisor precisa confirmar
--    que ela cobre `finance`, senao a tela ficara vazia para justamente quem
--    trabalha com glosa.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'claim_denial_status') then
    create type public.claim_denial_status as enum (
      'received',   -- glosa recebida, ainda nao tratada
      'appealing',  -- recurso enviado a operadora
      'recovered',  -- operadora voltou atras e pagou
      'accepted'    -- clinica assumiu o prejuizo
    );
  end if;
end $$;

create table if not exists public.insurance_claim_denials (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  invoice_id uuid not null references public.invoices(id),
  invoice_item_id uuid references public.invoice_items(id),
  -- Codigo da glosa no padrao da operadora (TISS usa uma tabela propria).
  denial_code text,
  reason text not null,
  amount_cents integer not null check (amount_cents > 0),
  status public.claim_denial_status not null default 'received',
  denied_at date not null,
  appealed_at timestamptz,
  resolved_at timestamptz,
  -- Quanto voltou depois do recurso. Nulo enquanto nao resolvido.
  recovered_cents integer check (recovered_cents >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists insurance_claim_denials_clinic_invoice_idx
  on public.insurance_claim_denials (clinic_id, invoice_id);

create index if not exists insurance_claim_denials_open_idx
  on public.insurance_claim_denials (clinic_id, status)
  where status in ('received', 'appealing');

alter table public.insurance_claim_denials enable row level security;

drop policy if exists "claim_denials_select" on public.insurance_claim_denials;
create policy "claim_denials_select"
  on public.insurance_claim_denials
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.can_access_financial()
  );

drop policy if exists "claim_denials_insert" on public.insurance_claim_denials;
create policy "claim_denials_insert"
  on public.insurance_claim_denials
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and public.can_access_financial()
  );

drop policy if exists "claim_denials_update" on public.insurance_claim_denials;
create policy "claim_denials_update"
  on public.insurance_claim_denials
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.can_access_financial()
  );

-- Sem policy de DELETE, de proposito: glosa recebida e fato, e a clinica precisa
-- poder provar que recorreu. Erro de lancamento se corrige com `status` e nota.

commit;

-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. `npm run db:types` e conferir que `insurance_claim_denials` aparece.
-- 2. Como membro `finance`, INSERT deve devolver 201; como `receptionist`, 403.
-- 3. Teste de tenancy pgTAP da tabela nova (R1 exige para toda tabela).
-- 4. Confirmar que `can_access_financial()` cobre `finance`:
--    select prosrc from pg_proc where proname = 'can_access_financial';

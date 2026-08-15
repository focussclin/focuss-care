# Pagamento antes da consulta — análise antes de implementar

> Levantado contra o código em **14/08/2026**, branch `feat/telas-e-camada-supabase`,
> commit `89bfd9b`. Cada afirmação vem de leitura do código e do schema tipado,
> não de suposição. Nenhuma linha foi alterada para produzir este documento.

---

## 1. Como o fluxo funciona hoje

### 1.1 O caminho real do paciente

```
/agenda        criar agendamento    appointments.status = 'scheduled' | 'confirmed'
   ↓
/atendimentos  check-in             waiting_queue (status='waiting')  +  appointments.status='checked_in'
   ↓                                                                     appointments.checked_in_at
/atendimentos  chamar               waiting_queue.status='called'
   ↓
/atendimentos  iniciar              encounters (status='open')  +  appointments.status='in_progress'
   ↓
/prontuarios   evoluir              medical_records (versionado)
   ↓
/atendimentos  encerrar             encounters.status='closed'  +  appointments.status='completed'
```

**O dinheiro não aparece nenhuma vez neste caminho.** `/financeiro` é um módulo
paralelo: a fatura é criada à mão, sem vínculo com o agendamento, e ninguém
consulta saldo em lugar nenhum do fluxo assistencial.

### 1.2 Os quatro pontos de escrita que importam

| Onde | Arquivo | O que faz |
| --- | --- | --- |
| Check-in | `encounters/actions/checkIn.action.ts` | Insere em `waiting_queue` com `status='waiting'` — **entra direto na fila do profissional** |
| Chamar | `SupabaseEncounterRepository.call` | `waiting → called`, com compare-and-swap no `WHERE` |
| Iniciar | `startEncounter.action.ts` | Abre `encounters`, carimba `in_progress` |
| Pagar | `billing/actions/registerPayment.action.ts` | Insere em `payments`, recalcula `invoices.paid_cents` |

A ligação entre agenda e fila já existe e é boa: `lib/scheduling/appointment-progress.ts`
(`syncAppointmentProgress`) carimba a agenda quando a fila anda, em *best-effort*,
e foi feita justamente para as duas telas não discordarem sobre a mesma pessoa.

### 1.3 O que o banco já tem — e é mais do que eu esperava

```
appointments      status(7), starts_at, room_id, reason, checked_in_at, is_walk_in
waiting_queue     status(5: waiting|called|in_service|done|abandoned), priority, arrived_at,
                  called_at, started_at, finished_at, appointment_id
invoices          appointment_id ✅, encounter_id ✅, payer_type, status(6), subtotal_cents,
                  discount_cents, total_cents, paid_cents, canceled_at
payments          invoice_id, amount_cents, method(8), installments, external_id,
                  cash_session_id, received_by, paid_at
services          default_price_cents, default_duration_minutes, requires_authorization
price_lists       + price_list_items (vigência, tabela padrão)
vitals            weight, height, systolic/diastolic_bp, heart_rate, respiratory_rate,
                  temperature_c, spo2, glucose_mgdl, notes
cash_sessions     turno de caixa, com espelho de pagamento em dinheiro
```

Três achados que mudam o tamanho do trabalho:

1. **`invoices.appointment_id` já existe.** A ligação agendamento ↔ cobrança está
   modelada no banco e **nunca foi usada** — `createInvoiceSchema` não aceita o
   campo. Esta é a peça central, e ela não precisa de migration.
2. **`payments` é N:1 com `invoices`.** Pagamento dividido (Pix + cartão na mesma
   cobrança) funciona hoje, sem nenhuma mudança de schema. `invoice_status` já
   tem `partially_paid`.
3. **`vitals` tem os nove campos da triagem** pedidos, exatamente.

---

## 2. Problemas encontrados

| # | Problema | Gravidade | Evidência |
| --- | --- | --- | --- |
| P1 | **Check-in entra direto na fila do profissional.** Não há nenhuma trava financeira em lugar nenhum | Alta — é a regra do pedido | `checkIn.action.ts` → `waiting_queue.status='waiting'` |
| P2 | **Fatura não se liga ao agendamento.** A coluna existe; o schema da action não a aceita | Alta — é a peça que falta | `billing.schema.ts:117` |
| P3 | **Check-in duplicado cria duas linhas na fila.** Nenhuma guarda de unicidade | Alta | `SupabaseEncounterRepository.checkIn` — insert sem conflito |
| P4 | **`registerPayment` lê o saldo e depois grava.** Dois cliques simultâneos de R$ 500 numa fatura de R$ 500 passam os dois: ambos leem `remaining=500` | Alta — é o item 12 do pedido | `SupabaseBillingRepository.ts:488` |
| P5 | **`installments` fixado em `1`.** A coluna existe e o parcelamento não é oferecido | Média | `SupabaseBillingRepository.ts:514` |
| P6 | **Não existe estorno.** `invoices.canceled_at` é cancelamento da cobrança, não devolução de dinheiro já recebido | Média | Sem coluna de refund em `payments` |
| P7 | **Agendamento não captura valor, serviço, convênio nem forma de pagamento.** `appointments` só tem `reason` (texto livre) e `room_id` | Média | Colunas ausentes na tabela |
| P8 | **Não existe unidade.** Não há tabela `units`; `clinic_id` é o único nível de tenant | Alta para o pedido, mas fora de alcance | `FOCUS_CARE_ARCHITECTURE.md` §4 |
| P9 | **Não existe triagem.** Nem status, nem etapa, nem vínculo entre `vitals` e a visita antes do atendimento | Média | `vitals.encounter_id` só existe depois que o encontro abre |
| P10 | **Nenhuma tela responde "quem precisa pagar?"** `/recepcao` responde quem chegou e quem atrasou; `/financeiro` lista faturas sem contexto operacional | Média | `lib/clinic/reception-board.ts` |

---

## 3. O que já existe e deve ser reaproveitado

**Não reescrever nada disto.** É o que sustenta a mudança:

| Peça | Por que serve |
| --- | --- |
| `createAction` | Pipeline único: autentica → clínica → 2º fator → papel → Zod → handler → revalida → audita. Toda action nova nasce com auditoria e RBAC |
| `syncAppointmentProgress` | O padrão já resolvido de "um módulo move o estado do outro sem invadi-lo", em `lib/` |
| Compare-and-swap nas transições | `.eq('status', origem)` no `WHERE` — fecha corrida entre dois operadores. Já usado em `call`, `start`, `cancel` |
| `refreshInvoiceBalance` | Recalcula `paid_cents` somando `payments`. O saldo é projeção, não fonte |
| Espelho de caixa | Pagamento em dinheiro já vira lançamento em `cash_sessions` |
| `lib/clinic/reception-board.ts` | O lugar e o formato certos para a visão operacional do dia |
| `permissions.ts` | `rolesWith('payment.write')`, `invoice.write`, `encounter.write` já existem e são derivados, nunca copiados |
| `price_lists` + `services` | Preço com vigência e tabela padrão, já com tela |
| Tradução `write-forbidden` vs `not-found` | Releitura após zero linhas — já resolvido em todos os adapters |

---

## 4. O que falta

### 4.1 Falta e dá para fazer sem tocar no banco

- Vínculo fatura ↔ agendamento (coluna existe, schema não aceita)
- Trava de pagamento antes de chamar/iniciar
- Tela "Aguardando pagamento"
- Pagamento dividido na interface (o modelo já suporta)
- Parcelamento (coluna já existe)
- Desconto com permissão (`invoices.discount_cents` existe)
- Cobrança adicional pós-consulta (nova fatura no mesmo `encounter_id`)
- Visão operacional única do dia

### 4.2 Falta e **exige migration** — hoje bloqueado

| O que | Por quê |
| --- | --- |
| `units` (unidade) | Tabela inexistente. É segundo nível de tenant: mexe em RLS de tudo |
| `appointments.service_id`, `price_cents`, `expected_payment_method`, `insurance_plan_id` | Colunas inexistentes |
| Estados `aguardando_triagem` / `em_triagem` | `appointment_status` e `queue_status` são enums fechados no Postgres |
| Estorno | Sem coluna de refund; `amount_cents` negativo mentiria para todo relatório que soma |
| Índice único para idempotência de pagamento | `payments.external_id` existe, mas sem constraint não garante nada |

> **Contexto que pesa:** 18 migrations já estão escritas e **não aplicadas** no
> projeto Supabase. Somar mais uma leva de migrations à fila não destrava nada —
> destrava o acesso ao banco, que é decisão sua.

---

## 5. Mudanças de banco necessárias

**A recomendação é: nenhuma, na primeira entrega.**

Os estados que você pediu podem ser **derivados** da composição de três tabelas
que já existem — e derivar é o padrão que este produto já adota para `expired`
de guia, `divergente` de conciliação e nível de estoque, porque não há worker
que mantivesse um status gravado.

| Estado pedido | Derivado de |
| --- | --- |
| AGENDADO | `appointments.status='scheduled'` |
| CONFIRMADO | `='confirmed'` |
| PACIENTE CHEGOU / CHECK-IN | `='checked_in'` + `checked_in_at` |
| **AGUARDANDO PAGAMENTO** | `checked_in` + fatura com `total_cents - paid_cents > 0` |
| **PAGAMENTO PARCIAL** | `invoices.status='partially_paid'` |
| **PAGO** | `invoices.status='paid'` (ou sem fatura obrigatória) |
| AGUARDANDO ATENDIMENTO | `waiting_queue.status='waiting'` **e** saldo zero |
| EM ATENDIMENTO | `waiting_queue.status='in_service'` |
| ATENDIMENTO FINALIZADO | `encounters.status='closed'` |
| FINALIZADO | `closed` + saldo zero |
| CANCELADO / FALTOU | `appointments.status='canceled' \| 'no_show'` |
| AGUARDANDO PAGAMENTO ADICIONAL | `closed` + fatura nova com saldo |
| ❌ AGUARDANDO TRIAGEM / EM TRIAGEM | **não derivável** — ver §9, etapa 6 |
| ❌ ESTORNADO | **não derivável** — precisa de migration |

Migrations a escrever **quando o acesso ao banco existir** (não agora):

```sql
-- 1. idempotência de verdade
alter table payments add column idempotency_key text;
create unique index payments_idempotency
  on payments (clinic_id, idempotency_key) where idempotency_key is not null;

-- 2. check-in único por agendamento
create unique index waiting_queue_one_per_appointment
  on waiting_queue (appointment_id) where appointment_id is not null;

-- 3. o agendamento carrega o que será cobrado
alter table appointments
  add column service_id uuid references services(id),
  add column price_cents integer,
  add column expected_payment_method payment_method,
  add column requires_prepayment boolean not null default false;

-- 4. triagem
alter type queue_status add value 'triage_waiting' before 'called';
alter type queue_status add value 'in_triage' before 'called';

-- 5. estorno
alter table payments add column refunded_at timestamptz,
  add column refund_reason text, add column refunded_by uuid;
```

---

## 6. Mudanças de backend

### 6.1 A decisão de desenho, e por que ela é assim

Há dois jeitos de impedir que o paciente entre na fila do profissional:

**(A) Não criar a linha da fila no check-in.** Só criar quando o pagamento
fechar. — Rejeitado: quebra encaixe (que não tem agendamento onde se apoiar),
perde `arrived_at` como marco zero do tempo de espera, e a recepção deixa de
enxergar quem está na sala.

**(B) Criar a linha como hoje, e travar as TRANSIÇÕES.** `chamar` e `iniciar`
recusam enquanto houver saldo. — **Recomendado.**

A (B) ganha por três motivos: `waiting_queue` passa a significar "está na
clínica", que é o que a recepção precisa ver; a trava fica no compare-and-swap
que o projeto já usa; e encaixe continua funcionando sem caso especial. A fila
do profissional vira uma **visão filtrada** da fila da clínica — que é
exatamente como `/recepcao` já se relaciona com `/atendimentos`.

### 6.2 O que muda

| Arquivo | Mudança |
| --- | --- |
| `billing/schemas/billing.schema.ts` | `createInvoiceSchema` aceita `appointmentId` opcional |
| `SupabaseBillingRepository.createInvoice` | Grava `appointment_id`; guarda de tenant (`appointmentBelongsTo`) antes — FK de coluna única prova que a linha existe, não que é desta clínica |
| **novo** `lib/clinic/payment-gate.ts` | `outstandingFor(appointmentId)` → saldo. Mora em `lib/` porque cruza `billing` e `encounters`, como `appointment-progress.ts` |
| `SupabaseEncounterRepository.call` / `start` | Consultam o portão antes do update. Recusa tipada: `payment-pending` |
| `encounters/application/encounterFailure.ts` | Traduz `payment-pending` para mensagem que diz o valor devido |
| `checkIn.action.ts` | `afterSuccess` passa a emitir fatura a partir do serviço, quando houver serviço com preço |
| `SupabaseEncounterRepository.checkIn` | Relê antes de inserir: agendamento já na fila devolve a linha existente em vez de duplicar (mitigação de P3 sem índice) |
| `registerPayment` | Aceita `idempotencyKey`; recusa repetição pela releitura. **Mitigação, não garantia** — sem índice único a corrida continua possível |
| **novo** `closeEncounter` → cobrança adicional | Ao encerrar, se houver item novo, abre fatura ligada ao `encounter_id` |

### 6.3 Onde a regra NÃO pode ficar

No frontend. A trava tem de estar no repositório, no mesmo `WHERE` do
compare-and-swap — senão duas abas abertas contornam a tela.

---

## 7. Mudanças de frontend

| Tela | Mudança |
| --- | --- |
| **nova** `/recepcao` — bloco "Aguardando pagamento" | Paciente, horário, profissional, procedimento, valor, **tempo aguardando**, status. Ação: abrir o caixa do paciente |
| **novo** painel de cobrança do paciente | Resumo (total / pago / saldo) e ações: receber, desconto, trocar forma, dividir, cancelar — cada uma atrás da permissão que já existe |
| `/atendimentos` | Selo financeiro por pessoa na fila; botão "Chamar" desabilitado **e** o servidor recusando |
| `/agenda` | Selo de status incluindo o financeiro derivado |
| Portal do profissional | Filtra quem tem saldo — o profissional só vê liberado |
| **novo** formulário de pagamento dividido | Lista de lançamentos (método + valor) somando o total; `installments` no cartão de crédito |

Sobre o item 11 do pedido (recepcionista nova entender rápido): a resposta é
**uma tela só** — `/recepcao` com as sete colunas do dia (não chegou / chegou /
precisa pagar / pagou / esperando / em atendimento / terminou), cada uma
derivada, sem duplicar informação em página nenhuma.

---

## 8. Riscos

| # | Risco | Mitigação |
| --- | --- | --- |
| R1 | **Trava financeira parando a clínica.** Erro na leitura de saldo bloqueando atendimento é pior que cobrança perdida | Falha de leitura do portão **libera** e registra. Mesma escolha já feita para cota de plano e estado comercial |
| R2 | **Encaixe e urgência.** Nem todo atendimento pode esperar caixa | `requires_prepayment` por serviço; sem a coluna, a primeira entrega trava só quem tem fatura ligada ao agendamento — quem não tem passa como hoje |
| R3 | **Idempotência incompleta.** Sem índice único, dois cliques simultâneos ainda podem duplicar | Botão travado + releitura no servidor + chave de idempotência **preparada** para o dia da migration. Documentar como mitigação, nunca como resolvido |
| R4 | **Convênio.** Paciente de convênio não paga no balcão; travá-lo pararia a operação | `invoices.payer_type` já distingue. Fatura de convênio não gera saldo de paciente |
| R5 | **Regressão no `/atendimentos`.** É a tela mais usada da clínica | Mudança incremental: portão primeiro com log e sem bloquear, depois bloqueando |
| R6 | **Triagem derivada de `vitals` é frágil.** Sem `encounter_id` a vinculação é por paciente+dia | Não entregar triagem na primeira leva. Se for urgente, entregar **sem** os dois estados, só como registro de sinais na fila |
| R7 | **Dobrar o significado de `waiting_queue`** | Um teste de guarda que prove que a fila do profissional filtra por saldo, e que a da recepção não |

---

## 9. Ordem de implementação

Cada etapa fecha sozinha, com teste, e é reversível. **Uma por vez.**

| # | Etapa | Depende de banco? | Entrega |
| --- | --- | --- | --- |
| **1** | Estados derivados em `lib/` — a função pura que responde "em que ponto está esta pessoa" | Não | Domínio + teste. Nada muda na tela |
| **2** | Fatura ligada ao agendamento (`appointmentId` no schema + adapter + guarda de tenant) | Não | A cobrança passa a ter dono |
| **3** | Portão de pagamento em `lib/`, **em modo observação**: registra quem passaria, não bloqueia | Não | Mede antes de travar |
| **4** | Tela "Aguardando pagamento" + painel de cobrança do paciente | Não | A recepção enxerga a fila do caixa |
| **5** | Pagamento dividido, parcelamento e desconto com permissão | Não | Formas de pagamento completas |
| **6** | **Ligar o portão**: `call` e `start` recusam com saldo | Não | A regra passa a valer |
| **7** | Cobrança adicional ao encerrar o atendimento | Não | Fecha o ciclo do item 9 |
| **8** | Idempotência de pagamento e check-in (mitigação) | Não | Reduz duplicidade |
| **9** | Visão operacional única do dia | Não | Item 11 |
| **10** | Triagem | **Sim** | Só depois do acesso ao banco |
| **11** | Unidade, estorno, índices únicos, colunas do agendamento | **Sim** | Migrations |

**As etapas 1 a 9 não precisam de nenhuma alteração no banco.** É onde está a
maior parte do valor do pedido, e é por onde começar.

---

## 9.1 Achado da etapa 2 — a recepcionista não pode cobrar

Descoberto ao implementar, não na análise: **`receptionist` não tem
`invoice.write` nem `payment.write`.** Só `owner`, `admin` e `finance` têm.

E não é esquecimento. `permissions.ts` declara a decisão:

> **`receptionist` não vê valor nenhum.** Marcar consulta não exige saber quanto
> ela custa nem o que o paciente deve.

Isso colide de frente com o pedido, que diz "a recepcionista abre o agendamento
e clica" e põe receber pagamento, aplicar desconto e dividir pagamento nas mãos
de quem está no balcão.

**Não mudei a matriz.** Mexer em papel é decisão de produto com consequência de
LGPD, não efeito colateral de uma etapa de implementação. Fixei o estado atual
com teste, para que a mudança — se vier — seja deliberada e visível.

As três saídas possíveis, em ordem de preferência minha:

| Saída | O que implica |
| --- | --- |
| **Papel novo `reception_cashier`** | A recepção que opera caixa é um papel; a que só marca consulta é outro. Não amplia quem já existe |
| Dar `invoice.write` + `payment.write` a `receptionist` | Uma linha. Mas toda recepcionista passa a ver o que todo paciente deve |
| Manter como está | A tela de "aguardando pagamento" é de `admin`/`finance`. Em clínica pequena, é a mesma pessoa |

Enquanto não decidir, a **etapa 4 fica travada** — construir a tela do caixa sem
saber quem a abre gastaria trabalho no lugar errado.

---

## 10. O que preciso decidir com você antes da etapa 6

1. **Quem pode ser liberado sem pagar?** Convênio, retorno, cortesia, urgência.
   Sem `requires_prepayment` no banco, a primeira versão trava **só quem tem
   fatura com saldo ligada ao agendamento** — quem não tem passa. É seguro, mas
   quer dizer que a regra vale quando a recepção emitir a cobrança.
2. **Retorno dentro do prazo é cobrado?** Muda se a fatura nasce no check-in.
3. **Ordem entre triagem e pagamento** quando os dois existirem — o pedido diz
   pagamento antes; confirmo que urgência não inverte isso.

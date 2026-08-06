# Focuss Care — Modelagem do Banco de Dados

> **Banco completo — 4 ondas aplicadas e validadas** no projeto
> `pvyfeeobywpwwyrpphfs` em 2026-08-06.
> **55 tabelas · 116 policies · 21 migrations · 36/36 testes funcionais passando.**

---

## 1. Decisões que valem para todo o banco

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Toda tabela de negócio tem `clinic_id NOT NULL`** | Isolamento explícito. Sem coluna, sem policy possível |
| 2 | **`enable` + `force row level security` em toda tabela** | `force` cobre também o dono da tabela. `service_role` continua passando (tem `BYPASSRLS`) — é assim que o servidor administra |
| 3 | **Policies sempre com `(select fn())`** | Faz o planner tratar como *InitPlan*: avalia 1× por statement, não 1× por linha. Diferença de ~1000× em tabela grande |
| 4 | **Tenant vem do JWT, não de subconsulta** | Ver `0003`. É a decisão de performance mais importante do projeto |
| 5 | **Todo índice começa por `clinic_id`** | Consulta sempre filtra por tenant; índice que não começa por ele é índice inútil |
| 6 | **UUID v4 como PK** | Não vaza volume de negócio (id sequencial diz quantos pacientes você tem) e permite gerar no cliente |
| 7 | **`timestamptz` sempre, nunca `timestamp`** | Clínica em Manaus e clínica em SP no mesmo banco. Armazena UTC, renderiza no `clinics.timezone` |
| 8 | **Sem `DELETE` em dado com valor jurídico** | Vínculo, profissional e prontuário usam `revoked_at` / `deleted_at` / versionamento |
| 9 | **Dinheiro em `integer` de centavos** | `float` para dinheiro é bug esperando data |
| 10 | **Migrations versionadas, aplicadas por pipeline** | Nunca colar SQL à mão no editor. Schema drift quebra tela em produção sem erro visível |

---

## 2. As duas decisões de produto que moldaram o schema

### 2.1 Paciente é isolado por clínica

O mesmo CPF atendido em duas clínicas gera **dois registros independentes**.
`UNIQUE (clinic_id, cpf)`, nunca `UNIQUE (cpf)`.

Isso não é duplicação acidental — é o comportamento correto. Se houvesse
cadastro global, a Clínica A conseguiria descobrir que o paciente também é
atendido na Clínica B, o que é vazamento de dado sensível de saúde entre
controladores distintos. O prontuário pertence à relação daquela clínica com
aquele paciente.

Consequência aceita: unificação de histórico entre clínicas exigiria
consentimento explícito do paciente e um mecanismo de vinculação — fora de
escopo, mas não bloqueado pelo modelo.

### 2.2 Prontuário legível por todos os profissionais da clínica

Decisão do cliente. Implementada em **uma única função**:

```sql
public.can_access_clinical()  →  role in ('owner','admin','professional')
```

Recepção e financeiro **nunca** acessam conteúdo clínico — isso é a fronteira
mínima que sobrevive a uma auditoria.

Como isso afrouxa o sigilo por profissional, três compensações entram já na
Onda 1:

1. `author_id` gravado em todo registro clínico (Onda 2)
2. Leitura de prontuário registrada em `audit_log` com `action = 'READ'`
3. A regra vive numa função, não espalhada em 20 policies

Apertar depois para "só o autor + atendimento ativo" é editar essa função.
Nenhuma tabela muda, nenhum dado migra.

---

## 3. Onda 1 — o que foi criado

```
clinics ──┬── memberships ──── profiles ──── auth.users
          │        │
          ├── professionals
          ├── invitations
          ├── clinic_settings
          ├── subscriptions ──── plans
          ├── consents
          └── audit_log (particionada por mês)
```

| Migration | Conteúdo |
|---|---|
| `20260806090001_extensions_and_enums.sql` | Extensões, schema `private`, tipos enumerados |
| `20260806090002_core_tenancy.sql` | `clinics`, `profiles`, `memberships`, `invitations`, `professionals` |
| `20260806090003_auth_hook_and_helpers.sql` | Auth Hook do JWT + funções de RLS |
| `20260806090004_rls_core.sql` | Policies do núcleo |
| `20260806090005_audit_log.sql` | Trilha particionada + gatilho genérico |
| `20260806090006_platform_and_consents.sql` | Planos, assinatura, settings, LGPD, RPCs |
| `20260806090007_guardrails.sql` | Cobertura de RLS + teste de isolamento |

### Onda 2 — Núcleo clínico

```
patients ──┬── patient_contacts
           ├── patient_documents
           ├── appointments ──── appointment_status_history
           │        │
           │        └── encounters ──┬── medical_records (imutável, versionada)
           │                         ├── vitals
           │                         ├── prescriptions ── prescription_items
           │                         └── clinical_attachments
           ├── allergies
           └── waiting_queue

professionals ──┬── availability_rules
                └── availability_exceptions
```

| Migration | Conteúdo |
|---|---|
| `20260806090008_patients.sql` | `patients`, `patient_contacts`, `patient_documents` |
| `20260806090009_scheduling.sql` | Disponibilidade, `appointments` com trava de sobreposição, fila |
| `20260806090010_clinical_records.sql` | `encounters`, `medical_records` imutável, sinais vitais, alergias, prescrição, anexos |
| `20260806090011_rls_clinical.sql` | RLS das duas camadas, auditoria, log de leitura de prontuário |

**A trava de agenda mora no banco.** `appointments` tem um
`EXCLUDE USING gist` que recusa dois agendamentos sobrepostos do mesmo
profissional. Validar isso em JavaScript é uma corrida: dois atendentes
clicando ao mesmo tempo passam ambos pela checagem e você tem overbooking.
O Postgres recusa o segundo INSERT com o erro `23P01` — trate na aplicação
como "esse horário acabou de ser ocupado". Cancelados e faltas liberam o
horário; qualquer outro status ocupa.

**O prontuário é imutável de verdade.** `medical_records` tem gatilho que
levanta exceção em `UPDATE` e `DELETE` — inclusive para quem usar a chave de
serviço. Corrigir um registro é inserir nova linha com `supersedes_id`
apontando para a anterior. A versão vigente sai da view
`v_medical_records_current`, que é "a linha que ninguém substituiu" — assim
nem para marcar algo como superado é preciso um UPDATE.

**Duas fronteiras de acesso na Onda 2:**

| Camada | Tabelas | Quem lê |
|---|---|---|
| Operacional | paciente, agenda, fila, atendimento | todo membro da clínica |
| Clínica | prontuário, sinais vitais, alergia, prescrição, anexo | somente `can_access_clinical()` |

Recepção e financeiro não alcançam a camada clínica. Por isso
`encounters.chief_complaint` guarda a queixa **declarada pelo paciente** (a
mesma de `appointments.reason`); avaliação clínica vai em `medical_records`.

**Autoria não pode ser forjada.** A policy de inserção de prontuário e
prescrição exige `author_id = current_professional_id()`. Um profissional não
consegue gravar registro em nome de outro, mesmo com prontuário aberto a todos.

**Leitura de prontuário é registrada** via `public.log_clinical_access()`,
chamada pelo use case de abrir prontuário. O Postgres não tem gatilho de
SELECT, então esse é o único caminho — e é o principal controle compensatório
da decisão de deixar o prontuário aberto a toda a equipe clínica.

### Onda 3 — Financeiro e convênios

```
services ──── price_list_items ──── price_lists
                                         │
insurance_providers ── insurance_plans ──┘
                            │
                            ├── patient_insurances ──── insurance_authorizations
                            │
invoices ──┬── invoice_items ──── professional_payout_items ──── professional_payouts
           └── payments ──── cash_entries ──── cash_sessions

payables (contas a pagar)      document_sequences (numeração por clínica)
```

| Migration | Conteúdo |
|---|---|
| `20260806090012_catalog_and_pricing.sql` | Serviços, tabelas de preço, regra de repasse, numeração por clínica |
| `20260806090013_insurance.sql` | Operadoras, planos, carteirinhas, guias de autorização |
| `20260806090014_billing.sql` | Notas com congelamento, itens com snapshot, pagamentos |
| `20260806090015_cash_and_payouts.sql` | Caixa, contas a pagar, repasse ao profissional |
| `20260806090016_rls_financial.sql` | RLS em três níveis de acesso |

**Preço é histórico, não é junção.** `invoice_items` guarda cópia do preço e da
regra de repasse no momento do lançamento. Ler o preço atual para exibir uma
nota de janeiro faria a tabela de março reescrever o passado — e o mesmo vale
para o repasse: mudar o percentual hoje recalcularia meses já fechados.

**Nota emitida congela.** Enquanto é `draft`, edita à vontade. Depois de
`issue_invoice()`, um gatilho recusa qualquer mudança em valor, pagador ou
número; outro recusa incluir ou remover itens. Só status, pagamento e
cancelamento passam. Corrigir uma nota emitida é cancelar e emitir outra.

**Numeração é sequencial por clínica.** Uma `SEQUENCE` do Postgres é global e
deixaria a Clínica A com notas 1, 7, 12. `document_sequences` usa
`ON CONFLICT DO UPDATE`, que trava a linha: duas requisições simultâneas
recebem números diferentes, sem buraco.

**Repasse só sobre o que entrou.** `preview_professional_payout()` considera
apenas notas com status `paid` e itens ainda não repassados. Repassar sobre
nota emitida e não recebida é como clínica descapitaliza sem perceber.

**Caixa não se "ajusta".** `difference_cents` é coluna calculada
(`contado − esperado`). O esperado sai da soma real das movimentações no
fechamento. Ninguém digita a diferença.

**Pagamento e movimento de caixa são imutáveis.** Corrigir é lançar o estorno,
não editar o lançamento original.

**Três níveis de acesso:**

| Nível | O quê | Quem |
|---|---|---|
| Catálogo | serviços, preços, convênios | todo membro lê |
| Operação | notas, pagamentos, caixa | `can_handle_billing()` — inclui recepção |
| Gestão | contas a pagar, repasse | `can_access_financial()` — sem recepção |

O profissional enxerga as notas dos próprios atendimentos e o próprio repasse,
sem alcançar o financeiro da clínica.

### Onda 4 — Operação e IA

| Migration | Conteúdo |
|---|---|
| `20260806090017_workforce.sql` | `employees`, `work_schedules`, `time_off` |
| `20260806090018_communication.sql` | WhatsApp, conversas, mensagens, modelos, notificações |
| `20260806090019_automation.sql` | `workflows`, `workflow_runs` |
| `20260806090020_ai.sql` | pgvector, embeddings, conversas de IA, medição de custo |
| `20260806090021_rls_operations.sql` | RLS de operação e IA |

**A busca vetorial é o ponto mais perigoso do sistema.** Um
`ORDER BY embedding <=> query LIMIT 5` sem filtro de tenant devolve trecho de
prontuário de outra clínica — e falha em silêncio: nenhum erro, resposta
plausível, dado errado.

Duas defesas independentes:

- `search_clinic_knowledge()` é **`SECURITY INVOKER`**. Marcá-la `DEFINER`
  "para funcionar" desliga a RLS e abre o vazamento. Está comentado na função.
- A policy de `document_embeddings` exige `can_access_clinical()` para trechos
  com `source_type = 'medical_record'`. Sem isso, a recepção faria uma pergunta
  ao assistente e receberia evolução médica de volta — pela porta dos fundos do
  RAG.

Testado com as duas clínicas indexadas ao mesmo tempo e o mesmo vetor de busca:
o profissional recebeu 2 resultados da própria clínica, a recepcionista da
mesma clínica recebeu 1 (só o não-clínico), e nenhum papel viu a outra clínica.

**`employees` ≠ `professionals`.** Um é vínculo trabalhista, o outro é vínculo
assistencial. A recepcionista é employee e não é professional; o médico PJ por
repasse pode ser o contrário. Fundir as duas obriga a inventar coluna nula para
metade dos casos. Salário fica restrito a owner/admin — nem o financeiro vê.

**Idempotência onde o mundo externo bate.** `provider_message_id` é único por
clínica: provedor de WhatsApp reenviando o mesmo webhook não duplica a mensagem
na tela. `workflow_runs.dedupe_key` garante que o lembrete da consulta X dispare
uma vez só — paciente recebendo o mesmo lembrete três vezes é o jeito mais
rápido de virar bloqueio no WhatsApp.

**Custo de IA é medido por clínica.** `ai_usage_log` (particionada) grava
tokens de entrada, saída e de cache por chamada, inclusive as que falharam.
`ai_usage_current_period()` compara com a quota do plano e é consultada **antes**
da chamada ao modelo — quota verificada só na UI é quota decorativa.
O campo `cache_read_tokens` é o alarme de custo: se vier sempre zero em prompts
repetidos, há invalidador silencioso no prefixo (data, UUID ou nome de usuário
no prompt de sistema).

### Por que `profiles` não tem `clinic_id`

É a única tabela de pessoa que é **global**. Um médico atende em três clínicas
com um login só. `profiles` é a identidade; `memberships` é o vínculo;
`professionals` é o perfil profissional dentro de cada clínica.

Colocar `clinic_id` em `profiles` obrigaria o médico a ter três contas e três
senhas — e é assim que produto de agenda médica perde usuário.

### Por que `professionals` duplica dados de conselho

Dr. X em duas clínicas = duas linhas, com o mesmo CRM repetido. Deliberado:
uma linha compartilhada exigiria que ambas as clínicas enxergassem o mesmo
registro, e a Clínica A passaria a saber da existência da Clínica B.

Isolamento venceu normalização. Em multi-tenant de saúde isso é quase sempre
a escolha certa.

---

## 4. Configuração do projeto

### Já configurado

- ✅ **Auth Hook ativado** — `pg-functions://postgres/public/custom_access_token_hook`.
  Era o item bloqueante: sem ele o claim não é emitido, `current_clinic_id()`
  retorna NULL e o usuário logado não enxerga absolutamente nada. Parece bug de
  RLS e não é.
- ✅ **Confirmação de e-mail obrigatória** (`mailer_autoconfirm = false`).

### Pendente de verificação sua

1. **Project Settings → API → Exposed schemas**
   Deve conter apenas `public` (e `graphql_public`). `private` **jamais** —
   é onde vivem os helpers de auditoria e o teste de isolamento.

2. **Database → Backups**
   Confirmar PITR ativo. Prontuário tem retenção legal de 20 anos.

3. **Senha mínima está em 6 caracteres** — fraco para um sistema com prontuário.
   Recomendo 10 + proteção contra senha vazada (HaveIBeenPwned), que o Supabase
   oferece nativamente. Afeta apenas senhas novas.

---

## 5. Aplicação

As 11 migrations já foram aplicadas e estão registradas em
`supabase_migrations.schema_migrations`, então o CLI as considera concluídas e
não vai reaplicá-las.

Daqui em diante, o fluxo normal:

```bash
npx supabase link --project-ref pvyfeeobywpwwyrpphfs
npx supabase db push          # aplica só o que ainda não rodou

# Tipos TypeScript — sempre gerados, nunca escritos à mão
npx supabase gen types typescript --linked > src/types/database.ts
```

Verificação a qualquer momento:

```sql
select * from private.v_rls_coverage order by table_name;
select private.assert_rls_coverage();   -- silêncio = tudo coberto
```

### Testes funcionais executados

Rodados dentro de uma transação com `rollback` — nenhum dado ficou no banco.

| Teste | Resultado |
|---|---|
| Agenda recusa sobreposição do mesmo profissional | recusou com `23P01` |
| Agenda aceita horário adjacente (10:30 após 10:00–10:30) | aceitou |
| Agendamento cancelado libera o horário | aceitou |
| Histórico de status gravado por gatilho | 2 registros |
| Prontuário recusa `UPDATE` | recusou |
| Prontuário recusa `DELETE` | recusou |
| `content_hash` SHA-256 gerado automaticamente | 64 caracteres |
| Nova versão por `supersedes_id` | aceitou |
| View `v_medical_records_current` mostra só a vigente | 1 de 2 |
| CPF único dentro da clínica | recusou duplicata |
| Mesmo CPF em outra clínica | aceitou — isolamento correto |
| Um atendimento aberto por profissional | recusou o segundo |
| Auditoria gravou automaticamente | 10 eventos |
| **Onda 3** — total do item calculado pelo banco | 20000 centavos |
| Total da nota recalculado pelos itens | 20000 centavos |
| Emissão atribui número sequencial | número 1 |
| Nota emitida congela valores | recusou alteração |
| Nota emitida recusa novo item | recusou |
| Snapshot de preço resiste a mudança de tabela | tabela virou 50000, nota seguiu 20000 |
| Um caixa aberto por clínica | recusou o segundo |
| Pagamento quita e muda status | `paid` |
| Pagamento imutável | recusou edição |
| Fechamento calcula esperado (10000+20000−5000) | 25000 centavos |
| Diferença zero quando o contado confere | 0 |
| Repasse: 60% de 20000 | 12000 centavos |
| Repasse ignora nota emitida e não paga | só o item pago |
| Numeração sequencial por clínica | clínica B também começou em 1 |
| **Onda 4** — RAG nunca devolve conteúdo de outra clínica | 2 resultados, 0 vazados |
| RAG: profissional alcança trecho de prontuário | 2 visíveis |
| RAG: recepção **não** recebe trecho de prontuário | 1 resultado, 0 clínicos |
| RAG: recepção ainda vê o FAQ da própria clínica | 1 resultado |
| `SELECT` direto em embeddings também isola | 0 linhas de outra clínica |
| Mensagem atualiza a conversa (não lidas, último envio) | 1 não lida |
| Webhook duplicado não duplica mensagem | recusou |
| Automação não dispara o mesmo lembrete 2× | recusou |
| Quota de IA calculada contra o plano | 1500 de 500000, restam 498500 |

---

## 6. O que vem depois do banco

O schema está completo. Os próximos passos são de aplicação:

1. Gerar os tipos TypeScript (`supabase gen types`) — nunca escrever à mão
2. Estrutura de pastas e regra de dependência com enforcement no CI
3. Camada de acesso: cliente server-side, resolução de tenant no `proxy.ts`
4. Primeiro módulo vertical ponta a ponta

Fora de escopo consciente: TISS completo, telemedicina com vídeo, app nativo,
marketplace de integrações. Nenhum deles é bloqueado pelo modelo — Insurance e
Communication já são contextos isolados.

---

## 7. Riscos conhecidos desta onda

| Risco | Estado |
|---|---|
| Auth Hook não ativado no Dashboard | **Bloqueia tudo.** Item 1 da seção 4 |
| JWT desatualizado após revogar acesso | Janela de até ~30 min. Operações sensíveis usam `is_active_member()`, que vai à tabela |
| `profiles` legível por colegas | Policy libera a linha inteira — por isso `profiles` não pode receber CPF/endereço. Documentado no `0004` |
| Partições de auditoria acabando | Criadas 12 meses à frente; agendar o cron da seção 5 do `0005` |
| Prontuário aberto a todos os profissionais | Decisão consciente do cliente. Compensado por auditoria de leitura |
| `log_clinical_access()` depende da aplicação chamar | Não há gatilho de SELECT no Postgres. Se o use case esquecer, a leitura não é registrada — precisa de teste cobrindo isso |
| Erro `23P01` na agenda chega cru na UI | A aplicação precisa traduzir para "horário acabou de ser ocupado", senão o usuário vê erro de banco |

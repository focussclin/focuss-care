# Focuss Care — Modelagem do Banco de Dados

> Fase 1 de 4. Este documento cobre a **Onda 1 (Fundação)**, já implementada em
> `supabase/migrations/`. As ondas 2–4 estão inventariadas ao final.

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
| `0001_extensions_and_enums.sql` | Extensões, schema `private`, tipos enumerados |
| `0002_core_tenancy.sql` | `clinics`, `profiles`, `memberships`, `invitations`, `professionals` |
| `0003_auth_hook_and_helpers.sql` | Auth Hook do JWT + funções de RLS |
| `0004_rls_core.sql` | Policies do núcleo |
| `0005_audit_log.sql` | Trilha particionada + gatilho genérico |
| `0006_platform_and_consents.sql` | Planos, assinatura, settings, LGPD, RPCs |
| `0007_guardrails.sql` | Cobertura de RLS + teste de isolamento |

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
| `0008_patients.sql` | `patients`, `patient_contacts`, `patient_documents` |
| `0009_scheduling.sql` | Disponibilidade, `appointments` com trava de sobreposição, fila |
| `0010_clinical_records.sql` | `encounters`, `medical_records` imutável, sinais vitais, alergias, prescrição, anexos |
| `0011_rls_clinical.sql` | RLS das duas camadas, auditoria, log de leitura de prontuário |

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

## 4. Passos manuais no Dashboard (não dá para fazer por SQL)

Depois de aplicar as migrations:

1. **Authentication → Hooks → Customize Access Token (JWT)**
   Selecionar `Postgres` e a função `public.custom_access_token_hook`.
   **Sem isso, `current_clinic_id()` retorna NULL e o usuário não vê nada.**

2. **Project Settings → API → Exposed schemas**
   Deve conter apenas `public` (e `graphql_public`). `private` **jamais**.

3. **Authentication → Providers → Email**
   Confirmação de e-mail obrigatória. Cadastro aberto sem confirmação é como
   convite não solicitado vira conta ativa.

4. **Database → Backups**
   Confirmar PITR ativo. Prontuário tem retenção legal de 20 anos.

---

## 5. Como aplicar

```bash
# 1. Preencher .env.local com as chaves ROTACIONADAS
# 2. Vincular o projeto (usa SUPABASE_ACCESS_TOKEN)
npx supabase link --project-ref pvyfeeobywpwwyrpphfs

# 3. Aplicar
npx supabase db push

# 4. Gerar os tipos TypeScript (nunca escrever esses tipos à mão)
npx supabase gen types typescript --linked > src/types/database.ts
```

Verificação pós-aplicação:

```sql
select * from private.v_rls_coverage order by table_name;
select private.assert_rls_coverage();   -- deve não retornar nada
```

---

## 6. Roadmap das ondas seguintes

### Onda 3 — Financeiro e convênios
`services`, `price_lists`, `price_list_items`, `insurance_providers`,
`insurance_plans`, `insurance_contracts`, `invoices`, `invoice_items`,
`payments`, `cash_sessions`, `cash_entries`, `receivables`, `payables`,
`professional_payouts`

### Onda 4 — Operação e IA
`employees`, `work_schedules`, `time_off`, `whatsapp_channels`,
`conversations`, `messages`, `message_templates`, `workflows`,
`workflow_runs`, `ai_conversations`, `ai_messages`, `ai_usage_log`,
`document_embeddings` (pgvector), `notifications`

O ponto crítico da Onda 4: a busca vetorial precisa respeitar RLS. Um
`ORDER BY embedding <=> query LIMIT 5` sem filtro de tenant retorna trecho de
prontuário de outra clínica. Índice HNSW particionado por tenant e função de
busca `SECURITY INVOKER`.

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

# Focuss Care — Banco de dados

> Levantado a partir do schema **real** do projeto Supabase remoto (07/08/2026).
> O banco é a fonte de verdade. Este documento descreve o que existe; não é uma proposta.

## 1. Situação

O schema oficial **já está aplicado no Supabase remoto**. Não há migrations locais a
executar — ver `supabase/README.md`. Números do levantamento:

| Métrica | Valor |
|---|---|
| Tabelas | 55 |
| Views | 1 (`v_medical_records_current`) |
| Enums | 31 |
| Funções RPC | 19 |
| Tabelas com `clinic_id` | **53 de 56** |
| Cobertura de RLS | **56 de 56** |

## 2. Multi-tenancy

53 dos 56 objetos carregam `clinic_id`. As três exceções são corretas por natureza:

| Tabela | Por que não tem `clinic_id` |
|---|---|
| `clinics` | É a própria raiz do tenant — o tenant é o `id` dela |
| `profiles` | Dados do usuário, que pode pertencer a várias clínicas |
| `plans` | Catálogo global de planos do SaaS, igual para todos |

### Verificação de isolamento

Teste executado contra o banco real: leitura anônima (chave publicável, sem sessão)
em **todos os 56 objetos**.

```
56/56 retornaram 0 linhas — nenhum vazamento
```

RLS está ativa e efetiva em toda a superfície, inclusive nas tabelas mais sensíveis
(`medical_records`, `patients`, `audit_log`, `invoices`).

## 3. Domínios

### Tenancy e assinatura
`clinics` · `memberships` · `profiles` · `invitations` · `clinic_settings` ·
`subscriptions` · `plans`

O papel do usuário vive no **vínculo** (`memberships.role`), não no usuário — o mesmo
profissional pode ser `professional` em uma clínica e `admin` em outra.

### Pacientes
`patients` · `patient_contacts` · `patient_documents` · `patient_insurances` ·
`allergies` · `consents`

`consents` existe para a LGPD: registra finalidade e momento do consentimento.

### Agenda
`appointments` · `appointment_status_history` · `availability_rules` ·
`availability_exceptions` · `work_schedules` · `waiting_queue`

O intervalo é `starts_at` + `ends_at` (não duração). `appointment_status_history`
guarda cada transição de status — auditoria nativa da agenda.

### Atendimento e prontuário
`encounters` · `medical_records` · `v_medical_records_current` · `prescriptions` ·
`prescription_items` · `vitals` · `clinical_attachments`

A view `v_medical_records_current` entrega a versão vigente de cada registro: o
prontuário é **versionado**, e correção gera nova versão em vez de sobrescrever.

### Financeiro
`invoices` · `invoice_items` · `payments` · `payables` · `cash_sessions` ·
`cash_entries` · `price_lists` · `price_list_items` · `services` ·
`professional_payouts` · `professional_payout_items` · `document_sequences`

Valores em **centavos** (`*_cents`, inteiros) — sem ponto flutuante para dinheiro.
`document_sequences` gera numeração fiscal sequencial por clínica.

### Convênios
`insurance_providers` · `insurance_plans` · `insurance_authorizations`

### Equipe
`professionals` · `employees` · `time_off`

`professionals.user_id` é opcional: dá para pôr alguém na agenda antes de a pessoa
ter conta.

### Comunicação
`conversations` · `messages` · `message_templates` · `whatsapp_channels` ·
`notifications`

### IA
`ai_conversations` · `ai_messages` · `ai_usage_log` · `document_embeddings`

`document_embeddings.embedding` é `vector(1024)` (pgvector) — RAG por clínica, com
os vetores sob a mesma RLS do resto. `ai_usage_log` mede consumo de tokens: IA é
custo variável e precisa ser medida por tenant desde o início.

### Automações e auditoria
`workflows` · `workflow_runs` · `audit_log`

## 4. Funções RPC (19)

As que a aplicação usa hoje:

| Função | Assinatura | Uso |
|---|---|---|
| `current_clinic_id()` | → `string` | **Clínica ativa da sessão** |
| `current_clinic_role()` | → `membership_role` | Papel na clínica ativa |
| `current_professional_id()` | → `string` | Profissional vinculado ao usuário |
| `switch_clinic(p_clinic_id)` | → `void` | Troca a clínica ativa |
| `has_clinic_role(p_roles)` | → `boolean` | Autorização por papel |
| `is_active_member(p_clinic)` | → `boolean` | Vínculo ativo |
| `create_clinic(p_slug, p_trade_name)` | → `clinics` | Onboarding |
| `accept_invitation(p_token)` | → `uuid` | Aceite de convite |
| `can_access_clinical()` / `can_access_financial()` / `can_handle_billing()` | → `boolean` | Guardas de domínio |
| `custom_access_token_hook(event)` | → `jsonb` | Injeta claims no JWT |

**`current_clinic_id()` é a fonte de verdade da clínica ativa.** A aplicação a chama
em `src/lib/auth/active-clinic.ts` em vez de reimplementar a leitura das claims —
assim aplicação e RLS nunca discordam sobre qual clínica está ativa.

## 5. Tipos TypeScript

`src/lib/supabase/database.types.ts` é **gerado**, nunca escrito à mão:

```bash
npm run db:types
```

O script (`scripts/generate-database-types.mjs`) lê o documento OpenAPI que o
PostgREST publica e emite as 55 tabelas, a view, os 31 enums e os 19 RPCs.

**Por que não `supabase gen types --linked`:** aquele comando exige credenciais de
CLI (`supabase login`). Este script usa a `SUPABASE_SECRET_KEY` que a aplicação já
precisa ter. O resultado é equivalente e o banco continua sendo a única fonte.

Duas limitações do OpenAPI, tratadas explicitamente no gerador:

1. **Não expõe DEFAULTs.** `id`, `created_at` e `updated_at` são marcados opcionais
   no `Insert`; as demais colunas `NOT NULL` entram como obrigatórias.
2. **Não expõe assinaturas de RPC.** Os nomes vêm do schema; as assinaturas das 12
   funções usadas estão declaradas em `KNOWN_FUNCTIONS`, no topo do gerador. As
   outras 7 ficam com tipagem genérica — chamáveis, sem retorno estreitado.

## 6. Convenções observadas no schema

- **Exclusão lógica:** `deleted_at` em vez de `DELETE` — prontuário tem prazo legal
  de guarda.
- **Dinheiro em centavos:** colunas `*_cents` inteiras.
- **Tempo:** `timestamptz` em tudo; `clinics.timezone` guarda o fuso da clínica.
- **Auditoria:** `audit_log` central + `appointment_status_history` específico.
- **Identificadores:** `uuid` com default no banco.

## 7. O que ainda não está ligado na aplicação

A UI consome hoje `clinics`, `memberships`, `profiles`, `patients`, `professionals`
e `appointments`. As outras 49 tabelas existem no banco, estão tipadas e protegidas
por RLS, mas ainda não têm repositório nem tela — entram conforme os módulos forem
implementados (Financeiro, Prontuários, Convênios, IA, WhatsApp, Automações).

> **Desatualizado desde 10/08/2026.** Vários desses módulos já têm repositório e
> tela — entre eles `conversations`/`messages` (Inbox), `invoices`/`payables`
> (Financeiro) e `medical_records` (Prontuários). O estado corrente por módulo
> está em `PROJECT_PROGRESS.md`; esta seção só volta a valer depois de uma
> conferência tabela a tabela, que ninguém fez ainda.

### A verificação de isolamento não cobriu ESCRITA

O teste de 56/56 acima é de **leitura anônima**: prova que ninguém sem sessão lê
nada. Ele não diz quais comandos cada papel autenticado pode executar, e a
diferença apareceu ao ligar a Inbox: se não existir policy de `UPDATE` em
`conversations`, o Postgres **não devolve erro** — a linha não é alcançada e zero
linhas mudam, em silêncio.

A aplicação passou a tratar isso explicitamente (`write-forbidden`, distinto de
`not-found`), mas a pergunta continua aberta no banco. Para responder, sem
alterar nada:

```sql
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('conversations', 'messages', 'workflows')
 order by tablename, cmd;
```

Se não houver linha com `cmd = 'UPDATE'` para `conversations`, a Inbox mostra a
mensagem apontando a policy ausente em vez de fingir que a conversa sumiu — mas
status, responsável e leitura só passam a gravar depois que essa policy existir.

O mesmo vale para `workflows` em `/automacoes`, que precisa de `INSERT`,
`UPDATE` e `DELETE` para o papel com `clinic.settings`. As duas telas tratam a
ausência do mesmo jeito: `write-forbidden`, com o texto apontando a policy.

### `workflows` guarda `jsonb` que a aplicação não controla sozinha

`trigger_config`, `conditions` e `actions` aceitam qualquer estrutura no banco.
A aplicação só grava formas fechadas, validadas por Zod, e **relê pelo mesmo
schema** — o que não casa é descartado na leitura em vez de exibido cru. Linha
inserida por fora (console, script, worker futuro) não quebra a tela, mas também
não aparece nela. Ver `PROJECT_PROGRESS.md` §8.22.

# Focuss Care AI — Recepcionista Digital Autônoma

> **Proposta técnica. Nenhuma migration executada.** Aguardando aprovação.
> Levantamento feito contra o banco real e o código atual em 07/08/2026.

---

## 1. Auditoria da arquitetura atual

### O que existe e funciona

| Camada | Estado |
|---|---|
| Next.js 16.3 + React 19 + TS | ✅ operacional |
| Supabase Auth (e-mail + Google OAuth) | ✅ operacional, fonte única |
| RLS | ✅ **56/56 objetos protegidos**, verificado |
| Tipos do banco | ✅ gerados (`npm run db:types`), 55 tabelas |
| Repositórios com porta/adapter | ✅ `patients`, `appointments` |
| Telas | ✅ login, dashboard, agenda, pacientes |
| `proxy.ts` | ✅ protege rotas privadas |

### O que **não** existe

| Item | Estado |
|---|---|
| Evolution API | ❌ nenhuma linha de código, nenhuma env var |
| Redis / fila | ❌ nenhuma dependência instalada |
| Provedor LLM | ❌ nenhuma dependência instalada |
| Worker / processo longo | ❌ só há o app Next |

**Conclusão da auditoria:** a fundação de dados está pronta e madura; a camada de
runtime do agente é 100% greenfield.

---

## 2. Mapeamento do schema existente

Este é o achado mais importante da auditoria: **o banco já foi modelado prevendo o
agente**. Boa parte do que o pedido descreve já tem tabela.

### Já existe — não criar

| Necessidade do pedido | Tabela existente | Evidência |
|---|---|---|
| Conexão WhatsApp (§3) | `whatsapp_channels` | `provider` já inclui **`evolution`**; `provider_config jsonb`; `connected_at` |
| Inbox omnichannel (§14) | `conversations` | `status` (open/pending/resolved/archived), `assigned_to`, `is_ai_handled`, `unread_count` |
| Mensagens + áudio/imagem (§21, §22) | `messages` | `content_type`, `media_url`, `direction`, `is_from_ai` |
| Idempotência (§31) | `messages.provider_message_id` | id do provedor já persistido |
| Memória de conversa (§5) | `ai_conversations` + `ai_messages` | `role` (system/user/assistant/**tool**), `tool_calls jsonb` |
| Controle de custos (§36) | `ai_usage_log` | `input/output/cache_read/cache_creation_tokens`, **`cost_usd_micros`**, `latency_ms`, `was_error` |
| Automações (§24) | `workflows` + `workflow_runs` | trigger/conditions/actions; **`dedupe_key`**, `attempt`, `status` |
| Base de conhecimento (§19) | `document_embeddings` | **pgvector(1024)**, `source_type`, `metadata` |
| Auditoria (§32) | `audit_log` | `before`/`after`, `actor_role`, `ip` |
| LGPD / opt-out (§23, §34) | `consents` | purposes incluem **`marketing_communication`** e **`ai_assisted_processing`** |
| Disponibilidade real (§6) | `availability_rules` + `availability_exceptions` | weekday, `slot_minutes`, `valid_from/until`, `kind` block/extra |
| Duração e preço (§4) | `services` | `default_duration_minutes`, `default_price_cents` |
| Templates (§23) | `message_templates` | `variables`, `is_approved` |

### Armadilha identificada

**`waiting_queue` NÃO é lista de espera por horário.** Seus campos (`arrived_at`,
`called_at`, `in_service`, `priority`) descrevem a **sala de espera presencial** — quem
já chegou na clínica. O §7 pede outra coisa: paciente que quer uma vaga futura e
aceita ser avisado se abrir. São conceitos distintos e precisam de tabelas distintas.

---

## 3. Análise da Evolution API

Não há integração alguma no código. O que existe é a **preparação no schema**:
`channel_provider` já contempla `evolution`, e `provider_config jsonb` guarda a
configuração por clínica sem exigir migration futura.

### Decisão: uma instância Evolution por clínica

O pedido (§3) fala em "instância lógica por clínica". Na Evolution API, instância é
um conceito de primeira classe (cada uma tem seu pareamento e seu QR Code). Logo:

```
clinic_id  ──1:N──  whatsapp_channels  ──1:1──  instância Evolution
                     provider_config: { instanceName, baseUrl, apiKeyRef }
```

**A API key da Evolution nunca vai no `provider_config`.** Ali fica apenas uma
*referência* (nome da variável/segredo); o valor vive no ambiente do servidor. Motivo:
`provider_config` é lido pela aplicação sob RLS, e segredo em coluna acaba em backup,
log e export.

### Fluxo de conexão (§3)

```
Configurações → WhatsApp → Conectar
  → POST /instance/create        (nosso backend → Evolution)
  → GET  /instance/connect       → QR Code (base64)
  → UI exibe QR + polling de status
  → webhook CONNECTION_UPDATE    → grava connected_at, phone_number
```

Estados exibidos: `disconnected · connecting · connected · error`, com
`connected_at` como "última sincronização".

---

## 4. Arquitetura do agente

### Onde cada peça roda — a decisão mais cara de errar

O pipeline pedido (fila → engine → tools) **não cabe dentro do Next.js**. Route
handlers têm ciclo de vida de request; uma conversa com LLM + tools leva segundos,
precisa de retry e não pode morrer no fim do request.

**Proposta: dois processos no mesmo repositório, dois serviços no Coolify.**

```
┌──────────────────────────────┐     ┌───────────────────────────────┐
│  focuss-care-web (Next.js)   │     │  focuss-care-worker (Node)    │
│                              │     │                               │
│  • UI + Server Actions       │     │  • consumidor da fila         │
│  • /api/webhooks/evolution   │     │  • Conversation Engine        │
│    (só valida + enfileira)   │     │  • Intent Router              │
│  • Inbox, Simulador          │     │  • AI Orchestrator            │
│                              │     │  • Tool Runtime               │
└──────────────┬───────────────┘     └───────────────┬───────────────┘
               │                                     │
               └──────────► Redis (fila) ◄───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Supabase (Postgres)   │
                    └─────────────────────────┘
```

O webhook responde **202 em milissegundos** — só valida assinatura, deduplica e
enfileira. Todo o trabalho pesado é do worker. Isso é o que impede a Evolution de
reenviar por timeout e duplicar atendimento.

### Pipeline completo

```
WhatsApp → Evolution API → POST /api/webhooks/evolution
   │
   ├─ 1. valida assinatura + resolve clinic_id pela instância
   ├─ 2. dedupe por provider_message_id  ──► já visto? descarta
   ├─ 3. persiste em messages (inbound)
   ├─ 4. enfileira { clinicId, conversationId, messageId }
   └─ 5. responde 202
                    │
              Redis (BullMQ)
                    │
   ┌────────────────▼─────────────────┐
   │  Worker: Conversation Engine     │
   │                                  │
   │  a. carrega contexto (3 camadas) │
   │  b. checa modo do agente         │
   │  c. checa handoff ativo ─────────┼──► humano no controle? só registra e para
   │  d. Intent Router                │
   │  e. AI Orchestrator (LLM+tools)  │
   │  f. loop de tools (máx N)        │
   │  g. grava ai_messages + usage    │
   │  h. decide: responder | sugerir | transferir
   └────────────────┬─────────────────┘
                    │
        Evolution API → paciente
```

### Intent Router — por que existe antes do LLM

Nem toda mensagem merece uma chamada de LLM. "SIM" respondendo a uma confirmação de
consulta é uma transição de estado determinística. O router resolve por regra o que é
inequívoco (confirmação, cancelamento por palavra-chave, opt-out **STOP/SAIR**) e só
manda ao LLM o que é conversa aberta.

Isso corta custo, latência e risco — e o opt-out **nunca** pode depender de o LLM
interpretar corretamente.

---

## 5. Modelo de eventos

Fila única com filas nomeadas por natureza (BullMQ):

| Fila | Origem | Concorrência | Retry |
|---|---|---|---|
| `inbound.message` | webhook Evolution | alta | 3× exponencial |
| `outbound.message` | engine | alta | 5× + DLQ |
| `automation.trigger` | eventos de domínio | média | 3× |
| `campaign.batch` | agendador | baixa | 2× |
| `embedding.index` | mudança na base de conhecimento | baixa | 3× |

### Eventos de domínio que disparam automações

Mapeiam direto para `workflows.trigger_type`, que **já existe** com os valores:
`appointment_created`, `appointment_confirmed`, `appointment_reminder`,
`appointment_no_show`, `encounter_finished`, `invoice_issued`, `invoice_overdue`,
`patient_birthday`, `schedule`.

Cobrem §8 (faltas) e §24 (automações) sem inventar nada.

### Ordenação por conversa

Mensagens da **mesma conversa** processam em série (chave de concorrência =
`conversationId`). Sem isso, duas mensagens seguidas do paciente geram duas respostas
concorrentes que se contradizem.

---

## 6. Tools do agente

Contrato: **entrada Zod → saída JSON estruturado**. O LLM nunca vê SQL, nunca recebe
credencial, e não existe tool genérica de query.

Toda tool executa o mesmo preâmbulo:

```
resolver tenant (clinic_id do canal, nunca do LLM)
  → checar modo/permissão
  → validar input (Zod)
  → executar caso de uso já existente
  → auditar em audit_log
  → devolver JSON tipado
```

### Catálogo inicial (§35)

| Tool | Leitura/Escrita | Observação |
|---|---|---|
| `search_patient` | R | Busca por telefone/nome; retorna mínimo necessário |
| `get_clinic_info` | R | Da base de conhecimento; **nunca inventa** |
| `get_services` | R | `services` ativos, com duração e preço autorizado |
| `get_professionals` | R | Por especialidade/unidade |
| `get_available_slots` | R | **Motor real** de `availability_rules` − `appointments` − exceções |
| `create_lead` / `update_lead` | W | Pipeline comercial |
| `create_appointment` | W | Idempotente por `dedupe_key` |
| `reschedule_appointment` | W | Valida conflito |
| `cancel_appointment` | W | Dispara busca na lista de espera |
| `confirm_appointment` | W | Chamada também pelo Intent Router |
| `join_waitlist` / `leave_waitlist` | W | Lista de espera por horário |
| `transfer_to_human` | W | Marca handoff e **silencia a IA** |
| `create_followup` / `cancel_followup` | W | Follow-up configurável |
| `add_internal_note` | W | Nota interna, invisível ao paciente |

### A regra que impede o pior erro

`get_available_slots` é a **única** fonte de horário. O prompt do sistema proíbe
explicitamente sugerir horário fora do retorno dessa tool, e a `create_appointment`
revalida a disponibilidade no servidor antes de gravar. Se o LLM alucinar um horário,
a escrita falha — não vira agendamento fantasma.

---

## 7. Modelo de permissões

Quatro camadas, todas obrigatórias:

1. **Tenant** — `clinic_id` vem do canal WhatsApp que recebeu a mensagem. O LLM não
   informa e não influencia o tenant.
2. **RLS** — o worker usa um client autenticado como *service account* da clínica.
   Ver ressalva abaixo.
3. **Modo do agente** — `observation` só sugere; `assisted` sugere e envia com
   aprovação; `autonomous` envia sozinho. Tools de escrita são bloqueadas em
   `observation`.
4. **Permissão da tool** — cada tool declara o que exige; nenhuma tool clínica está
   no catálogo.

### Ressalva honesta sobre RLS no worker

O worker não tem sessão de usuário — não há JWT de paciente. Duas opções:

| Opção | Prós | Contras |
|---|---|---|
| **A. Service role + filtro obrigatório** | simples | **RLS desligada**; um bug de filtro cruza clínicas |
| **B. JWT de serviço por clínica** | RLS continua valendo | exige emitir e rotacionar tokens |

**Recomendo B.** É mais trabalho, mas mantém a garantia que hoje protege 56/56
tabelas. Com a opção A, a última linha de defesa do produto deixa de existir
justamente no componente que mais escreve no banco. Se preferir A por velocidade,
precisa vir com testes automatizados de isolamento no CI — não como promessa.

---

## 8. Modelo multi-tenant

Nenhuma novidade estrutural: todas as tabelas novas nascem com `clinic_id NOT NULL`,
RLS `ENABLE` + `FORCE`, índice começando por `clinic_id`, e policy com `USING` **e**
`WITH CHECK`.

Pontos específicos do agente:

- **Cache e memória com chave por tenant.** Toda chave Redis é
  `clinic:{id}:conv:{id}` — nunca `conv:{id}`.
- **RAG isolado.** `document_embeddings` já tem `clinic_id`; a busca vetorial filtra
  por tenant *antes* do `ORDER BY distance`.
- **Prompt por clínica.** Persona, tom e políticas saem de `ai_agent_settings`.
  Nenhum dado de outra clínica entra no contexto.

---

## 9. Estratégia de filas

- **BullMQ sobre Redis** (já previsto na stack).
- **Chave de concorrência por conversa** — serializa a mesma conversa, paraleliza
  conversas diferentes.
- **Backoff exponencial** com teto; após N tentativas → DLQ + `transfer_to_human`.
  Falha nunca vira silêncio para o paciente.
- **Rate limit por clínica** — protege contra uma clínica em campanha consumir a fila
  inteira.
- **Idempotência em duas camadas (§31):**
  - entrada: `inbound_events(provider_event_id)` único
  - ação: `dedupe_key` em `workflow_runs` e nas tools de escrita

---

## 10. Estratégia de memória (§5)

Três camadas, com custo controlado:

| Camada | Onde | Conteúdo | TTL |
|---|---|---|---|
| **Curto prazo** | Redis + `ai_messages` | últimas N mensagens | 24h no Redis, permanente no banco |
| **Estruturada** | `ai_conversations.context` (novo) | slots extraídos: serviço, profissional, data preferida, **opções oferecidas** | vida da conversa |
| **Longo prazo** | `document_embeddings` | base de conhecimento da clínica | permanente |

### Como "o segundo" funciona

O exemplo do §5 exige memória estruturada, não janela de contexto. Quando o agente
oferece horários, ele grava:

```json
{ "offered_slots": [
    {"index":1,"starts_at":"2026-08-08T14:00:00-03:00","professional_id":"..."},
    {"index":2,"starts_at":"2026-08-08T15:30:00-03:00","professional_id":"..."}
]}
```

"O segundo" resolve por índice contra esse estado — não por interpretação livre do
histórico. Isso torna a referência ordinal **determinística**, e o slot ainda é
revalidado antes de gravar.

---

## 11. Estratégia de handoff (§17)

Estados em `conversations`:

```
ai_handling → awaiting_human → human_handling → resolved
```

Hoje há `status` (open/pending/resolved/archived) + `is_ai_handled`. A combinação
cobre os quatro estados sem enum novo, mas falta **um campo**: `ai_paused_until`.

### A regra crítica

> "Depois do handoff, IA NÃO responde sozinha até receber autorização."

Isso precisa ser **estrutural**, não instrução de prompt. O engine checa handoff
**antes** de qualquer chamada de LLM (passo `c` do pipeline). Com humano no controle,
a mensagem é persistida e o processamento encerra. Nenhum prompt pode reverter isso.

### Gatilhos automáticos

Pedido de humano · reclamação · baixa confiança · assunto clínico · erro de tool ·
informação ausente na base · negociação de preço fora da tabela.

---

## 12. Estratégia de observabilidade

| Camada | Ferramenta | O que responde |
|---|---|---|
| Auditoria | `audit_log` | quem fez o quê, com antes/depois |
| Custo | `ai_usage_log` | tokens e `cost_usd_micros` por clínica/feature |
| Fila | métricas BullMQ | profundidade, retries, DLQ |
| Conversa | `ai_messages.tool_calls` | quais tools rodaram e com quais parâmetros |
| Produto | `v_ai_metrics` (view nova) | §26: % resolvido, handoffs, agendamentos |

**Nada de segredo em log.** Parâmetros de tool são auditados; tokens de API, chaves e
conteúdo clínico não entram no `audit_log`.

---

## 13. Estratégia de custos (§36)

`ai_usage_log` já tem tudo: tokens de entrada/saída, **tokens de cache** (leitura e
criação), custo em micros, latência e flag de erro.

Medidas de contenção:

1. **Cache de prompt** — persona e base de conhecimento são estáveis; cachear corta a
   maior parte do custo recorrente.
2. **Roteamento por complexidade** — Intent Router resolve o determinístico sem LLM.
3. **Teto por plano** — `plans` e `subscriptions` já existem; a função
   `ai_usage_current_period()` já expõe `limit_tokens`/`used_tokens`/`remaining_tokens`.
4. **Degradação previsível** — estourou o teto: o agente para e transfere para humano.
   Nunca degrada silenciosamente a qualidade.

> **Antes de escolher modelo e calcular custo real, consultarei a skill `claude-api`**
> para preços e ids atuais — não vou estimar de memória.

---

## 14. Tabelas adicionais realmente necessárias

Critério: só entra o que **não** tem equivalente. Sete tabelas.

| # | Tabela | Por que não dá para reaproveitar |
|---|---|---|
| 1 | `ai_agent_settings` | `clinic_settings.ai_enabled` é um booleano. Falta persona, tom, modo (observation/assisted/autonomous), critérios de handoff, limites |
| 2 | `inbound_events` | Idempotência de webhook. `messages.provider_message_id` só cobre mensagem — não `CONNECTION_UPDATE`, status, etc. |
| 3 | `leads` | Não existe pipeline comercial. Paciente ≠ lead: lead pode nunca virar paciente |
| 4 | `lead_events` | Histórico de estágio para funil e recuperação (§12) |
| 5 | `waitlist_entries` | `waiting_queue` é sala de espera **presencial**. Esta é vaga futura, com preferências |
| 6 | `knowledge_entries` | `document_embeddings` guarda vetor; falta a fonte **editável** (FAQ, política) que o gera |
| 7 | `ai_message_feedback` | 👍/👎 do §27 |

### Alterações mínimas em tabelas existentes

| Tabela | Campo | Motivo |
|---|---|---|
| `conversations` | `ai_paused_until timestamptz` | trava do handoff |
| `conversations` | `priority smallint` | fila do §18 |
| `ai_conversations` | `context jsonb` | memória estruturada (slots oferecidos) |

### O que **não** vou criar

Follow-ups e campanhas → `workflows` + `workflow_runs` já cobrem (têm `dedupe_key`,
`attempt`, `conditions`, `actions`). Opt-out → `consents` já tem
`marketing_communication`. Métricas → view sobre as tabelas existentes.

---

## 15. Roadmap

Cada fase entrega valor operacional isolado e mensurável (§39).

### Fase 0 — Fundação (sem IA)
Worker + Redis + BullMQ no Coolify · webhook idempotente · conexão Evolution com QR
Code · **Inbox 100% humano**
→ *Ganho: a clínica já centraliza o WhatsApp.* **Sem risco de IA.**

### Fase 1 — Agente em Modo Observação (§29)
Engine + tools de **leitura** · persona por clínica · Simulador (§28) · IA sugere e
**não envia**
→ *Ganho: a clínica avalia a qualidade sem expor paciente.*

### Fase 2 — Agendamento assistido
`get_available_slots` + `create_appointment` · memória estruturada · handoff
→ *Ganho: primeiro agendamento pela IA, com humano aprovando.*

### Fase 3 — Modo Autônomo + faltas
Confirmação, lembrete, reconfirmação via `workflows`
→ *Ganho: redução de faltas — o retorno mais direto do produto.*

### Fase 4 — Comercial
Leads, qualificação, follow-up, recuperação
→ *Ganho: receita recuperada.*

### Fase 5 — Lista de espera e preenchimento
`waitlist_entries` + oferta automática no cancelamento
→ *Ganho: horário vago preenchido sozinho.*

### Fase 6 — Copiloto, métricas e feedback
Sugestões ao humano · resumo automático · dashboard (§26) · 👍/👎

### Fase 7 — Mídia
Áudio (transcrição) e imagens/documentos

**Ordem deliberada:** valor cedo, risco tarde. A IA só fala com paciente sem
supervisão na Fase 3 — depois de duas fases de observação.

---

## 16. Limites do agente (§ regra fundamental)

Fora de escopo, por decisão de produto e por segurança:

- ❌ diagnóstico, prescrição, interpretação de exame, aconselhamento clínico
- ❌ acesso a `medical_records`, `prescriptions`, `vitals`, `allergies` — **nenhuma
  tool clínica no catálogo**
- ❌ preço fora da tabela autorizada
- ❌ inventar informação ausente da base → transfere ou diz que vai confirmar

Triagem por sintoma é o pedido mais provável de aparecer depois. **Recomendo manter
fora**: cria responsabilidade clínica sobre software que não é dispositivo médico
registrado.

---

## 17. O que preciso decidir com você

| # | Decisão | Recomendação |
|---|---|---|
| 1 | RLS no worker: service role vs JWT de serviço | **JWT de serviço** — preserva o isolamento verificado |
| 2 | Worker: serviço separado no Coolify vs dentro do Next | **Separado** — Next não sustenta processo longo |
| 3 | Provedor LLM | Consultar `claude-api` antes de fixar modelo/custo |
| 4 | Escopo da Fase 0 | Confirmar se Inbox humano sem IA já tem valor |
| 5 | Triagem por sintoma | **Manter fora** do escopo |

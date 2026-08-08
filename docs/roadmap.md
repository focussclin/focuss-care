# Focuss Care — Roadmap Mestre

> **Documento de consolidação. Nenhuma implementação nova até a aprovação deste roadmap.**
> Levantado contra o código e o banco reais em **07/08/2026**, branch `feat/telas-e-camada-supabase`.
> Fontes: [`01-arquitetura.md`](./01-arquitetura.md) · [`02-estrutura-de-pastas.md`](./02-estrutura-de-pastas.md) ·
> [`03-banco-de-dados.md`](./03-banco-de-dados.md) · [`04-agente-ia.md`](./04-agente-ia.md) (§1 é a auditoria de referência) ·
> `supabase/README.md` · leitura direta de `src/`.

---

## 1. Visão e princípios

**Visão.** SaaS B2B multi-tenant para gestão de clínicas — agenda, prontuário, financeiro
e uma recepcionista digital no WhatsApp — em uma única instalação, com isolamento por
clínica garantido pelo banco, não por disciplina de código.

**Princípios não negociáveis** (derivados de `01-arquitetura.md`; violá-los é motivo de
rejeição em revisão):

| # | Princípio | Consequência prática |
|---|---|---|
| P1 | **O banco é a fonte de verdade** | `database.types.ts` é gerado (`npm run db:types`), nunca escrito à mão. Nenhuma proposta de schema entra sem comparar com o remoto. |
| P2 | **RLS é a última linha, não a única** | Toda leitura/escrita passa por cliente com sessão do usuário. `admin.ts` só em job/webhook/onboarding, com `server-only`. |
| P3 | **Uma clínica por vez, resolvida no servidor** | `current_clinic_id()` é a única fonte da clínica ativa. Nada de `clinicId` vindo do cliente. |
| P4 | **Toda chave de cache carrega `clinic_id`** | Vazamento por cache mal chaveado é a falha silenciosa mais cara do produto. |
| P5 | **Toda mutação passa pelo mesmo pipeline** | `createAction`: autenticar → clínica ativa → autorizar papel → Zod → use case → revalidar → auditar. |
| P6 | **Fatia vertical completa por vez** | Uma feature só é "pronta" quando UI, action, use case, repositório e teste existem. Nada de telas sem persistência entrando como concluído. |
| P7 | **Domínio rico só onde há regra real** | Agenda, Atendimentos, Prontuários, Financeiro, Convênios, IA → ricos. Configurações, Relatórios, listagens → Zod + repositório. |
| P8 | **Regra de arquitetura sem lint é decoração** | O que o CI não verifica, não existe. |
| P9 | **IA sugere, humano assina** | Nada gerado por IA entra em prontuário ou é enviado a paciente sem confirmação, até a Fase 3 do agente. |
| P10 | **Next 16 ≠ Next 14/15** | Antes de escrever código de framework, consultar `node_modules/next/dist/docs/`. |

---

## 2. Estado atual

### 2.1 Existe e funciona

| Item | Evidência |
|---|---|
| Next.js 16.3.0 + React 19.2.8 + TS 5 + Tailwind v4 | `package.json` |
| Supabase Auth por e-mail/senha (login real) | `src/modules/identity/actions/signIn.action.ts`, `src/app/auth/callback/route.ts` |
| Proteção de rotas privadas | `src/proxy.ts` (renova sessão + redireciona sem sessão — escopo mínimo, correto) |
| Clínica ativa via RPC do banco | `src/lib/auth/active-clinic.ts` → `current_clinic_id()` / `current_clinic_role()` |
| Schema remoto aplicado e protegido | 55 tabelas + 1 view + 31 enums + 19 RPCs; **RLS em 56/56 objetos**, verificado |
| Tipos gerados do schema real | `src/lib/supabase/database.types.ts` via `npm run db:types` |
| Ports & Adapters em 2 módulos | `patients` e `scheduling` com porta + adapter Supabase + adapter Mock |
| Chave de decisão mock/real centralizada | `src/lib/data-source.ts` (`resolveDataSource`) |
| Design system consolidado | `src/components/ui/*` + `src/styles/tokens.*.css` + 5 documentos `*_DESIGN.md` |
| Telas navegáveis das 13 rotas | `src/app/(app)/*` — todas renderizam |

### 2.2 Incompleto — existe, mas não fecha a fatia vertical

| Item | Falta |
|---|---|
| **Leitura real** de pacientes e agenda | Pacientes já possuem `listPage`, `countMetrics` e `findById`; agenda possui `listByRange`, `listByPatient` e `listProfessionals`. A escrita de pacientes existe na fatia P-01, mas as demais mutações ainda estão pendentes. |
| **Escrita** em qualquer módulo | `NewPatientModal` e `NewAppointmentModal` chamam `onSubmit`, e `PatientsScreen`/`AgendaScreen` apenas fazem `setState` local. **Nada é persistido; recarregar a página descarta.** |
| Casca da aplicação | `src/app/(app)/layout.tsx` monta o `AppShell` com `currentUser` **mockado** — nome, papel e clínica na UI não vêm da sessão. |
| Cadastro de conta | `src/app/(auth)/cadastro/page.tsx` é um `<form>` sem action. O botão não faz nada. |
| Onboarding | `OnboardingScreen` é wizard de 3 passos em `useState`; não chama `create_clinic()`. Termina em um link para `/dashboard`. |
| Dashboard | Métricas, atividade recente e usuário vêm de `src/lib/mocks/clinic-data.ts`; só a agenda do dia vem do repositório. |
| Navegação | `navItems` não lista `/equipe` nem `/convenios`, embora as rotas existam. Páginas órfãs. |

### 2.3 Mock / read-only por design (telas de vitrine)

`src/modules/workspace/ui/OperationsScreens.tsx` concentrava **11 telas** com dados
literais no arquivo e botões `disabled`:

`AtendimentosScreen` · `ProntuariosScreen` · `FinanceiroScreen` · `WhatsappScreen` ·
`ChatIaScreen` · `AutomacoesScreen` · `RelatoriosScreen` · `ConfiguracoesScreen` ·
`EquipeScreen` · `ConveniosScreen` · `OnboardingScreen`

São **protótipos visuais aprovados**, não funcionalidade. Serão desmontadas uma a uma:
cada tela migra para `src/modules/<módulo>/ui/` com container + view + repositório real,
e sai deste arquivo. **O arquivo desaparece quando o último módulo for implementado** —
esse é o critério de saída dele.

**Situação em 08/08/2026: o arquivo NÃO EXISTE MAIS.** As onze telas saíram —
oito com suas fatias (I-01, E-01, R-01, S-01, C-01, T-01, B-01, V-01) e as três
últimas com o módulo `integrations`, que trocou dados literais por estado de
conexão lido do banco. W-01, AI-* e AU-01 continuam **Blocked**; a diferença é
que as telas agora dizem isso em vez de simular um canal ligado.

### 2.4 Dívida técnica catalogada

| # | Dívida | Severidade | Quando pagar |
|---|---|---|---|
| D1 | `createAction` existia como dívida; F-01 criou `modules/_shared/application/createAction.ts`. Primeiro chamador runtime ainda pendente (P-A6). | **Em Review** | P-01, primeira mutação tenant-scoped |
| D2 | `audit_log` existia no banco sem escritas no código; F-01 criou `recordAuditEvent` e integrou `clinic.created`. Policy remota de INSERT ainda não verificada (P-A1). | **Em Review** | Confirmar RLS no Supabase e cobrir com F-04 |
| D3 | `lib/cache/tags.ts` existe (F-02): fábrica única e tipada, toda tag com `clinic_id`, invalidação por tag ligada ao `createAction`. **Continua sem nenhum `use cache` em uso** — nenhum dado clínico foi cacheado (P-C1 de [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md) §8.6). | **Em Review** | Infra paga; o uso entra com a primeira leitura cacheável tenant-scoped |
| D4 | ESLint é só `next/core-web-vitals` + `typescript`. **`eslint-plugin-boundaries` não instalado** → as 6 regras de arquitetura da §10 de `02-estrutura-de-pastas.md` não são verificadas. | Alta | Fase 1 |
| D5 | **Zero testes.** Nenhum runner, nenhum arquivo de teste, `supabase/tests/` não existe. | Alta | Fase 1 (harness) → contínuo |
| D6 | Sem script `typecheck` no `package.json`; sem CI (`.github/workflows/` ausente). | Alta | Fase 1 |
| D7 | `supabase/migrations/` **vazio** — o schema remoto não está versionado no repo. Não há como reproduzir o banco nem revisar mudança de schema em PR. | Alta | Fase 2 |
| D8 | Modo demo (`data-source.ts` cai para mock quando falta vínculo) mascara bug de tenancy: usuário sem clínica vê dados fictícios em vez de ser levado ao onboarding. | Alta | Fase 1 (feature 01) |
| D9 | `OperationsScreens.tsx` — 11 telas em um arquivo `'use client'`, com estilos inline longos. Ponto de conflito garantido entre agentes. | Média | Diluída por fase |
| D10 | **Parcialmente paga:** `cacheComponents: true` habilitada por F-02 (com quatro segmentos em `instant = false` — P-C2). Faltam `unauthorized.tsx` / `forbidden.tsx` e `experimental.authInterrupts`. | Média | Restante em I-05 |
| D11 | Sem TanStack Query instalado, embora a arquitetura o preveja para interação. | Baixa | Quando a agenda ganhar drag/filtros server-side |
| D12 | ~~Nenhum `Result`/`Paginated` em `_shared/domain`~~ — **parcialmente paga**: `Result` (F-01) e `Paginated<T>` (P-02a) existem. Falta `Money`/centavos. | Média | `Money` antes do Financeiro |
| D13 | Documentos `*_DESIGN.md` soltos na raiz (5 arquivos). Deveriam viver em `docs/design/`. | Baixa | Oportunístico |
| D14 | **Registro do `custom_access_token_hook` no projeto remoto não verificado.** Sem ele, o JWT não recebe as claims de clínica e `current_clinic_id()` devolve vazio. I-01 assume a checagem defensiva de `memberships` — ver [`05-onboarding-e-sessao.md`](./05-onboarding-e-sessao.md) §6, P1. | Alta | Antes de F2 |

---

## 3. Módulos e backlog priorizado

Prioridade: **P0** bloqueia todo o resto · **P1** núcleo operacional · **P2** gestão ·
**P3** diferenciação.

| Prio | Módulo | Escopo mínimo (MVP do módulo) | Depende de |
|---|---|---|---|
| **P0** | `_shared` | `createAction`, `Result`, `Money`, `Paginated`, `cache/tags.ts`, auditoria | — |
| **P0** | `identity` | Cadastro real, onboarding (`create_clinic`), sessão na casca, troca de clínica (`switch_clinic`), convites (`accept_invitation`), matriz papel × ação | `_shared` |
| **P1** | `patients` | Criar, editar, arquivar, buscar com paginação por cursor, contatos, documentos, consentimento LGPD | `identity` |
| **P1** | `scheduling` | Criar/remarcar/cancelar, detecção de conflito, disponibilidade (`availability_rules`), histórico de status | `patients` |
| **P1** | `encounters` | Iniciar/encerrar atendimento, fila presencial (`waiting_queue`), sinais vitais | `scheduling` |
| **P2** | `records` | Prontuário versionado (append-only), evolução, prescrição, anexos, assinatura | `encounters` |
| **P2** | `staff` | Profissionais, funcionários, escalas, ausências, convites por papel | `identity` |
| **P2** | `billing` | Fatura, itens, pagamentos, caixa, tabelas de preço, repasses — **tudo em centavos** | `encounters` |
| **P2** | `insurance` | Operadoras, planos, autorizações, guias, glosas | `billing` |
| **P2** | `settings` | Configurações da clínica, horários, marca, integrações | `identity` |
| **P3** | `reporting` | Projeções e relatórios sobre os módulos operacionais (só lê) | `billing`, `encounters` |
| **P3** | `whatsapp` | Canal Evolution, inbox humano, templates | `_shared`, worker |
| **P3** | `ai` | Agente conforme [`04-agente-ia.md`](./04-agente-ia.md) — Fases 0→7 | `whatsapp`, `scheduling` |
| **P3** | `automation` | `workflows` + `workflow_runs`: lembretes, confirmação, recuperação | `ai`, worker |

`dashboard` não é módulo de domínio: é camada transversal que lê projeções dos demais.
Ele "fica pronto" incrementalmente, conforme cada módulo passa a expor dados reais.

---

## 4. Fases e ordem de execução

Regra de ordenação: **fundação antes de feature, escrita antes de vitrine, risco tarde.**

| Fase | Nome | Entrega | Gate de saída |
|---|---|---|---|
| **F0** | Consolidação | Este roadmap aprovado; nada implementado | Aprovação do usuário |
| **F1** | Fundação de escrita e sessão | `createAction` + auditoria + cache tags + boundaries no lint + harness de teste + CI + **onboarding real e sessão/tenant** | Um usuário novo cria conta, cria clínica, e a casca mostra dados reais dele. Modo demo só existe sem Supabase configurado. |
| **F2** | Pacientes ponta a ponta | CRUD real, busca paginada, consentimento LGPD, migrations versionadas | Cadastro persiste; recarregar mantém o dado; teste de tenancy passa |
| **F3** | Agenda ponta a ponta | Criar/remarcar/cancelar com conflito e disponibilidade reais | Agendamento persiste com `starts_at`/`ends_at`; conflito é recusado no domínio |
| **F4** | Atendimentos e fila | Check-in, fila presencial, encerramento | Fluxo de recepção completo sem mock |
| **F5** | Prontuários | Versionamento append-only, evolução, prescrição, assinatura | `UPDATE`/`DELETE` recusados; correção gera nova versão; leitura auditada |
| **F6** | Equipe e configurações | Convites, papéis, escalas, config da clínica | RBAC efetivo por papel em todas as telas |
| **F7** | Financeiro e convênios | Faturamento, caixa, repasses, guias | Valores em centavos; fechamento de caixa confere |
| **F8** | Relatórios e dashboard real | Projeções sobre dados reais | Zero import de `lib/mocks` no `src/app/(app)/` |
| **F9** | WhatsApp + IA + automações | Fases 0→7 de [`04-agente-ia.md`](./04-agente-ia.md) | Conforme gates daquele documento |

**Não paralelizar F1.** Ela toca arquivos que todo o resto importa. A partir de F2, duas
fatias verticais podem correr em paralelo **se** tocarem módulos diferentes e nenhuma das
áreas compartilhadas da §6.

---

## 5. Ownership — Claude e Codex

A fronteira já está desenhada em `02-estrutura-de-pastas.md` (💻 Claude · 🎨 Codex).
Este roadmap a torna explícita em termos de responsabilidade, não só de pasta.

### Claude — implementação da fatia vertical

| Responsabilidade | Onde |
|---|---|
| Domínio, casos de uso, invariantes | `modules/*/domain`, `modules/*/application` |
| Repositórios e mappers | `modules/*/infrastructure` |
| Server Actions e schemas Zod | `modules/*/actions`, `modules/*/schemas` |
| Containers e wiring de dados | `modules/*/ui/*.container.tsx` |
| Contratos de props (**escritos primeiro**) | `modules/*/ui/*.props.ts` |
| Infra interna e serviços | `src/lib/**`, `src/services/**`, `src/proxy.ts`, `src/app/auth/**` |
| Banco: migrations, policies, RPCs, seeds | `supabase/**` |
| CI, scripts, dependências | `.github/**`, `scripts/**`, `package.json` |

### Codex — arquitetura, contratos, segurança, revisão, testes e integração

| Responsabilidade | Entregável |
|---|---|
| Decisão arquitetural e ADR | Atualização de `docs/01-*` e `docs/02-*` |
| Contrato de dados e de props antes da implementação | Revisão/aprovação de `*.props.ts` e do schema Zod |
| Modelagem e revisão de schema/RLS | Aprovação obrigatória de qualquer migration |
| Revisão de segurança e LGPD | Checklist da §8 aplicado por PR |
| Estratégia e revisão de testes | Definição do que precisa de teste de tenancy |
| Design system e views | `src/components/**`, `src/styles/**`, `*.view.tsx`, `*_DESIGN.md` |
| Integração e resolução de conflito entre agentes | Merge das branches de fatia |

### O handoff, em ordem

```
Codex: contrato (props + Zod + decisão de schema)
   ↓  aprovação
Claude: domínio → repositório → action → container → teste
   ↓  PR
Codex: revisão (arquitetura, segurança, LGPD, testes) → integra
```

**Regra dura:** Claude não altera `*.view.tsx`, `src/components/**` nem
`src/styles/**` sem pedido explícito. Codex não escreve action, repositório nem
migration. Quem precisar do território do outro, **abre pedido — não edita**.

---

## 6. Áreas compartilhadas e regra de não-edição paralela

Estes arquivos são pontos de conflito conhecidos. **Um agente por vez, com trava
declarada antes de abrir o editor.**

| Arquivo / área | Dono padrão | Risco |
|---|---|---|
| `src/modules/_shared/**` | Claude | Todo módulo importa. Mudança aqui quebra tudo. |
| `src/lib/supabase/database.types.ts` | **gerado** | Nunca editar à mão. Regerar e commitar em PR isolado. |
| `src/lib/data-source.ts` | Claude | Decide mock vs real para o app inteiro. |
| `src/app/(app)/layout.tsx` | Claude | Casca de sessão de todas as telas. |
| `src/components/layout/navigation.ts` | Codex | Toda feature nova quer acrescentar um item. |
| `src/modules/workspace/ui/OperationsScreens.tsx` | Codex | 11 telas em um arquivo — conflito quase certo (D9). |
| `src/styles/tokens.*.css`, `globals.css` | Codex | Mudança de token repinta o produto. |
| `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Claude | Dependência e config afetam o build de todos. |
| `supabase/migrations/**` | Claude (aprovação Codex) | Ordem de migration não se reordena depois de aplicada. |
| `docs/**` | Codex | Fonte de verdade das decisões. |

### Protocolo

1. **Antes de editar:** `git status` e checar se o arquivo está sob edição de outro agente.
2. **Uma fatia vertical = uma branch.** `feat/<modulo>-<feature>`.
3. **Áreas compartilhadas em PR próprio**, curto, mergeado antes das fatias que dependem dele.
4. **Nunca sobrescrever trabalho não commitado de outro agente.** Em conflito, escalar — não resolver por conta.
5. **Extrair de `OperationsScreens.tsx` é migração, não edição:** move-se a tela inteira para o módulo, e o export sai do arquivo no mesmo commit.

---

## 7. Dependências técnicas e de Supabase

### 7.1 A instalar (nenhuma instalada ainda)

| Dependência | Para quê | Fase |
|---|---|---|
| `eslint-plugin-boundaries` | Impor as 6 regras de arquitetura (D4) | F1 |
| Runner de teste (`vitest` + `@testing-library/react`) | Unitário e de integração (D5) | F1 |
| `@tanstack/react-query` | Interação client-side (D11) | F3 |
| Playwright | Smoke E2E dos fluxos críticos | F2+ |
| `supabase` CLI (já em devDeps) | Diff e versionamento de schema (D7) | F2 |
| Redis + BullMQ + worker + provedor LLM + Evolution API | Agente de IA | F9 |

### 7.2 Configuração de Next 16 pendente

| Flag | Para quê |
|---|---|
| `experimental.authInterrupts` | `unauthorized()` / `forbidden()` + telas 401/403 (D10) |
| ~~`cacheComponents`~~ | **Habilitada por F-02.** Substitui `dynamicIO`, `useCache` e `ppr`, removidas no Next 16 |
| `experimental.taint` | Impedir que objeto sensível chegue a Client Component |
| `output: 'standalone'` | Deploy em Docker/Coolify |

### 7.3 Supabase — o que já dá para usar hoje

Consumido pela aplicação: `clinics`, `memberships`, `profiles`, `patients`,
`professionals`, `appointments`. **As outras 49 tabelas existem, estão tipadas e sob
RLS, mas não têm repositório nem tela.**

RPCs disponíveis e **ainda não usadas** no código — são o caminho pronto para F1:

| RPC | Uso previsto |
|---|---|
| `create_clinic(p_slug, p_trade_name)` | Onboarding (feature 01) |
| `accept_invitation(p_token)` | Entrada de membro em clínica existente |
| `switch_clinic(p_clinic_id)` | Seletor de clínica na casca |
| `has_clinic_role(p_roles)` | Autorização por papel no `createAction` |
| `is_active_member(p_clinic)` | Guarda de vínculo |
| `can_access_clinical()` / `can_access_financial()` / `can_handle_billing()` | Guardas de domínio |
| `custom_access_token_hook(event)` | Claims no JWT (já ativo no banco) |

### 7.4 Regras de banco

- Nenhuma migration nova sem antes **diffar contra o schema remoto** (`supabase/README.md`).
- Migration precisa de aprovação do Codex e de PR isolado.
- Após qualquer mudança de schema: `npm run db:types` e commit dos tipos no mesmo PR.
- Migrations antigas com `clinic_members` / `patients.name` são **lixo histórico** — não ressuscitar.

---

## 8. Multi-tenancy, RLS e LGPD

### Checklist obrigatório por PR que toca dados

- [ ] Toda query usa o cliente **do servidor com sessão do usuário** (`server.ts`), não `admin.ts`.
- [ ] `clinic_id` vem de `current_clinic_id()` — **nunca** de parâmetro do cliente.
- [ ] Nenhuma nova tabela sem `clinic_id NOT NULL` + RLS `ENABLE` **e** `FORCE`.
- [ ] Toda policy tem `USING` **e** `WITH CHECK` (só `USING` permite gravar em outra clínica).
- [ ] `clinic_id` é a **primeira coluna** de todo índice composto.
- [x] Toda tag/chave de cache carrega `clinic_id`, gerada por `lib/cache/tags.ts` (F-02; o tipo `CacheTag` recusa string literal em tempo de compilação).
- [ ] Dado derivado de sessão usa `'use cache: private'` — nunca `'use cache'` puro. **Nenhum dado está cacheado hoje**; o item passa a valer quando a primeira leitura cacheável entrar.
- [ ] Mutação passa pelo `createAction` e grava em `audit_log`.
- [ ] Leitura de prontuário é auditada (quem, quando, qual, de qual IP).
- [ ] Exclusão é lógica (`deleted_at`), nunca `DELETE`.
- [ ] Dado clínico não vaza para Client Component (usar `taint`; view recebe só o necessário).
- [ ] Novo tratamento de dado pessoal tem finalidade registrada em `consents`. **P-03 entregou o registro por finalidade do paciente** (5 propósitos do enum `consent_purpose`, conceder e revogar pelo `createAction`); o item só fecha quando a policy de escrita da tabela for confirmada — C1/C2 da §13.
- [ ] Alteração/remoção de vínculo **revoga a sessão explicitamente** (claims do JWT ficam velhas por ~1h).
- [ ] `SUPABASE_SECRET_KEY` não aparece em nenhum caminho alcançável pelo browser.

### LGPD — o que precisa existir antes do primeiro cliente real

| Requisito | Onde | Fase |
|---|---|---|
| Registro de consentimento por finalidade | `consents` | F2 — **em Review (P-03)**: painel no perfil do paciente, conceder/revogar com data e versão do documento. Falta confirmar RLS/policy da tabela e o teste de tenancy |
| Auditoria de acesso a prontuário | `audit_log` | F5 |
| Exportação de dados do titular | `identity` / `settings` | F6 |
| Eliminação/anonimização respeitando prazo legal de guarda | `records` | F6 |
| Storage privado com path `{clinic_id}/…` e URL assinada curta | `services/storage` | F2 |

---

## 9. Riscos e gates

| # | Risco | Sev. | Gate que o bloqueia |
|---|---|---|---|
| R1 | Clínica A enxerga dado da clínica B | Crítica | Teste de tenancy no CI para **toda** tabela nova. Sem teste, o PR não entra. |
| R2 | Cache vazando entre tenants | Crítica | **Parcial (F-02):** toda tag sai de `cache/tags.ts` e o tipo `CacheTag` recusa string literal no compilador; hoje nada está cacheado. Falta a regra de lint proibindo `next/cache` fora do pipeline (F-03 — P-C4). |
| R3 | Service role key no bundle | Crítica | `server-only` + regra de import no lint + verificação no CI. |
| R4 | Escrita sem auditoria ou sem autorização | Crítica | Lint: Server Action que não usa `createAction` reprova. |
| R5 | Prontuário editável | Crítica | Policy recusa `UPDATE`/`DELETE`; teste prova a recusa. |
| R6 | Claims de JWT desatualizadas após mudança de papel | Alta | Revogação de sessão é requisito funcional do módulo `staff`. |
| R7 | Modo demo mascarando falha de tenancy (D8) | Alta | Após F1, demo só existe com Supabase **não configurado**. Usuário sem clínica vai ao onboarding. |
| R8 | Divergência entre banco remoto e repo (D7) | Alta | `supabase db diff` no CI; divergência falha o build. |
| R9 | API do Next 16 divergir do esperado | Alta | Consulta obrigatória a `node_modules/next/dist/docs/` antes de código de framework. |
| R10 | Conflito entre Claude e Codex em área compartilhada | Média | §6 — trava declarada e PR isolado. |
| R11 | Telas de vitrine chegarem a cliente parecendo prontas | Média | Botão sem back-end fica `disabled` com `title` explicativo (padrão já adotado). |
| R12 | Custo de IA sem controle | Média | `ai_usage_log` por clínica desde a primeira chamada; limite por plano. |

---

## 10. Critérios de entrada e saída

### Entrada (uma feature só sai de `Ready` se tiver tudo)

1. Contrato de dados aprovado pelo Codex (Zod + `*.props.ts`).
2. Tabelas e RPCs necessários **existem no banco remoto** — ou a migration foi aprovada.
3. Decisão de papel: quais roles podem executar.
4. Design aprovado (`*_DESIGN.md` ou tela já existente no design system).
5. Impacto em área compartilhada (§6) declarado e destravado.
6. Critérios de aceite escritos e verificáveis.

### Saída (uma feature só vira `Done` se tiver tudo)

1. Fatia vertical completa: domínio → repositório → action → container → view.
2. Persistência real verificada: criar, recarregar a página, o dado continua lá.
3. `createAction` usado; `audit_log` recebe a escrita.
4. Cache invalidado por tag com `clinic_id`.
5. Checklist da §8 assinado no PR.
6. `lint` + `typecheck` + `build` verdes.
7. Teste de tenancy da tabela envolvida passando.
8. Zero import de `lib/mocks` no caminho da feature.
9. Responsivo em 360px, 768px e 1280px; foco visível; navegável por teclado.
10. Revisão do Codex aprovada.

---

## 11. Definição de pronto (DoD)

> Uma feature está pronta quando **um usuário real, em uma clínica real, consegue
> executá-la de ponta a ponta, o dado sobrevive ao reload, outra clínica não o
> enxerga, e a operação está no `audit_log`.**

Tudo aquém disso é protótipo, e protótipo entra no board como `In Progress`, nunca como `Done`.

---

## 12. Estratégia de testes

### 12.1 Portões automáticos (todo PR, no CI)

| Portão | Comando | Status hoje |
|---|---|---|
| Lint | `npm run lint` | ✅ existe (sem regras de arquitetura — D4) |
| Typecheck | `npm run typecheck` | ❌ **script não existe** (D6) |
| Build | `npm run build` | ✅ existe |
| Teste unitário | `npm test` | ❌ **nenhum runner** (D5) |
| Tenancy (pgTAP) | `supabase test db` | ❌ `supabase/tests/` não existe |
| Diff de schema | `supabase db diff` | ❌ (D7) |

### 12.2 Pirâmide

| Nível | O que testar | Ferramenta |
|---|---|---|
| **Unitário** | Invariantes de domínio: conflito de agenda, CPF, `Money` em centavos, versionamento de prontuário, matriz papel × ação | Vitest |
| **Integração** | Repositório contra banco real com dois usuários de clínicas diferentes; `createAction` ponta a ponta (autorização, Zod, auditoria) | Vitest + Supabase |
| **Tenancy (não negociável)** | Para **cada tabela nova**: usuário da clínica A não lê nem grava linha da clínica B | pgTAP em `supabase/tests/` |
| **E2E (smoke)** | Cadastro → onboarding → criar paciente → agendar → ver no dashboard | Playwright |

### 12.3 UX e responsividade (checklist manual por PR de tela)

- Breakpoints 360 / 768 / 1280 sem scroll horizontal.
- Alvo de toque ≥ 44px; foco visível em todo elemento interativo.
- Estados **loading / vazio / erro** implementados — não só o caminho feliz.
- Texto em pt-BR, moeda em BRL, datas no fuso de `clinics.timezone`.
- Tema claro e escuro coerentes (tokens semânticos, sem cor literal).
- Botão sem back-end fica `disabled` com `title` explicando — nunca clicável e mudo.

---

## 13. Status das features

`Backlog` → `Ready` → `In Progress` → `Blocked` → `Review` → `Done`

### Fundação

| ID | Feature | Dono | Status | Nota |
|---|---|---|---|---|
| F-01 | `createAction` + `Result` + auditoria | Claude | **Review** | Implementado e exercitado por P-01; P-A1 (policy remota de `audit_log`) e cobertura automatizada seguem abertos. |
| F-02 | `lib/cache/tags.ts` + flags do Next 16 | Claude | **Review** | D3 e parte de D10. Fábrica, `cacheComponents` e invalidação por tag no `createAction` entregues e testadas (§8 de [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md)). **Nenhum dado clínico cacheado** — as tags existem sem consumidor até uma leitura cacheável tenant-scoped ser criada (P-C1). |
| F-03 | `eslint-plugin-boundaries` com as 6 regras | Claude | **Ready** | D4 |
| F-04 | Harness de teste + script `typecheck` + CI | Claude | **Ready** | D5, D6 |
| F-05 | Versionar schema remoto em `supabase/migrations/` | Claude / rev. Codex | Backlog | D7 |

### Identidade e tenancy

| ID | Feature | Dono | Status | Nota |
|---|---|---|---|---|
| **I-01** | **Onboarding real + sessão/tenant na casca** | Claude | **Review** | §14 · implementação e pendências em [`05-onboarding-e-sessao.md`](./05-onboarding-e-sessao.md). CA7 depende da policy de `audit_log`; CA8 e CA1 (testes) seguem abertos e dependem de verificação do banco/F-04. |
| I-02 | Cadastro de conta funcional (`signUp`) | Claude | **Review** | Entregue junto de I-01 |
| **I-03** | **Seletor de clínica (`switch_clinic`)** | Claude | **Review** | Regra de produto: **uma assinatura = uma clínica**, e cada conta cria uma só. Vários vínculos existem pelo convite (I-04) — ver §13.1 |
| I-04 | Convites (`accept_invitation`) + revogação de sessão | Claude | Backlog | R6 |
| I-05 | Matriz papel × ação + `unauthorized`/`forbidden` | Claude / Codex | Backlog | D10 |

### Operacional

| ID | Feature | Dono | Status |
|---|---|---|---|
| **P-01** | **Pacientes — cadastro real persistindo** | Claude | **Review** |
| **P-02a** | **Pacientes — busca server-side e paginação por cursor** | Claude | **Review** |
| P-02b | Pacientes — filtro "Última visita", índices trigram e cache | Claude | **Blocked** |
| **P-03** | **Pacientes — consentimento LGPD** | Claude | **Review** |
| **A-01** | **Agenda — criar/remarcar/cancelar persistindo** | Claude | **Review** |
| **A-02** | **Agenda — conflito real e horário de funcionamento** | Claude | **Review** |
| **E-01** | **Atendimentos — check-in, fila, encerramento** | Claude | **Review** |
| **R-01** | **Prontuário versionado append-only** | Claude | **Review** |
| **S-01** | **Equipe — vínculos, papéis, revogação** | Claude | **Review** |
| **S-02** | **Equipe — funcionários e ausências** | Claude | **Review** |
| **C-01** | **Configurações da clínica** | Claude | **Review** |
| **B-01** | **Financeiro — cobrança, pagamento, caixa** | Claude | **Review** |
| **V-01** | **Convênios — operadoras, planos, guias** | Claude | **Review** |
| **T-01** | **Relatórios e dashboard sem mock** | Claude | **Review** |

### Diferenciação

| ID | Feature | Dono | Status | Nota |
|---|---|---|---|---|
| W-01 | Worker + Redis + Evolution + inbox humano | Claude / arq. Codex | **Blocked** | Aguarda aprovação de `04-agente-ia.md` |
| AI-01..07 | Agente — Fases 1 a 7 | Claude / arq. Codex | **Blocked** | Idem |
| AU-01 | Automações sobre `workflows` | Claude | Blocked | Depende de W-01 |

### Telas de vitrine a desmontar (`OperationsScreens.tsx`)

| Tela | Vira feature | Status |
|---|---|---|
| Onboarding | I-01 | **Ready** |
| Equipe | S-01 | **Removida** |
| Configurações | C-01 | **Removida** |
| Atendimentos | E-01 | **Removida** |
| Prontuários | R-01 | **Removida** |
| Financeiro | B-01 | **Removida** |
| Convênios | V-01 | **Removida** |
| Relatórios | T-01 | **Removida** |
| WhatsApp / Chat IA / Automações | W-01, AI-*, AU-01 | Blocked |

### 13.1 Uma assinatura, uma clínica — e o que isso NÃO significa

Decisão de produto de **07/08/2026**. São duas cardinalidades diferentes, e
confundi-las custa caro nos dois sentidos:

| Relação | Cardinalidade | Onde vive |
|---|---|---|
| Assinatura → clínica | **1:1** | `subscriptions.clinic_id` |
| Conta → clínica que ela **cria** | **1:1** | Guard em `createClinicAction` |
| Usuário → clínica de que ele **participa** | **N:N** | `memberships` |

A regra proíbe **plano multi-unidade** (uma assinatura cobrindo uma rede) e
**uma conta responsável por duas clínicas**. Ela **não** proíbe o profissional
que atende em dois consultórios: ele é convidado para o segundo, que tem
assinatura própria, paga por outro dono.

**Consequência que já valeu uma correção:** o guard do `createClinicAction`
recusava quem tivesse *qualquer* vínculo ativo. Isso significava que aceitar um
convite tirava da pessoa, para sempre, o direito de abrir a própria clínica — e
ninguém desconfiaria disso ao aceitar. O filtro passou a ser por `role = 'owner'`.

### O que trava P-02b

P-02a entregou listagem paginada, busca e filtro de status no servidor **sem tocar
no banco**. O resto depende de coisas que não são código de aplicação:

| # | Bloqueio | O que fica de fora |
|---|---|---|
| B1 | Sem acesso SQL ao banco remoto (não há `DATABASE_URL` nem access token; `supabase/migrations/` está vazio — D7) | Índices, extensões e **colação de `patients.full_name`** não são verificáveis. Se a colação for não determinística, o keyset precisa mudar para `(created_at, id)` |
| B2 | Migration exige aprovação do Codex e PR isolado (§7.4) | `pg_trgm` + `unaccent` e o índice `(clinic_id, full_name, id) where deleted_at is null`. Sem eles a busca infixa é **correta e O(n) por clínica** |
| B3 | Filtro "Última visita (30/90 dias)" deriva de `appointments` | Não é expressável em keyset sobre `patients` via PostgREST — "mais de 90 dias" é anti-join. Exige `last_visit_at` denormalizado ou RPC. **O controle está desabilitado na tela, não fingindo funcionar** |
| B4 | **Destravado como infraestrutura, ainda aberto como decisão.** F-02 entregou `lib/cache/tags.ts`, `cacheComponents: true` e a invalidação por tag no `createAction` — a tag por clínica existe e é testada. O que falta não é mais o R2: é o **contrato de cache do dado clínico**. A listagem lê sessão em cookie, `searchParams` e `connection()`, e as três são proibidas em `use cache`; o caminho é `'use cache: private'` com `cacheLife` e decisão de LGPD explícitas | A listagem continua **sem cache**. P-02b decide o contrato ou entrega só índice e filtro |

**P-02 não está Done.** P-02a está em Review; P-02b continua Blocked.

### O que falta para P-03 sair de Review

P-03 entregou o consentimento LGPD ponta a ponta — porta, adapter, Zod, duas
Server Actions pelo `createAction`, painel no perfil e 4 arquivos de teste — **sem
tocar no banco remoto**. `lint`, `typecheck`, `build` e `npm test` estão verdes.

O que impede `Done` é o outro lado da fronteira, e nada disso é código de
aplicação (detalhe em [`07-cadastro-de-pacientes.md`](./07-cadastro-de-pacientes.md) §9.8):

| # | Bloqueio | Consequência |
|---|---|---|
| C1 | **RLS e policies de `consents` não verificadas.** Nenhuma sonda foi executada contra a tabela; o que se sabe é o levantamento geral da §2 de [`03-banco-de-dados.md`](./03-banco-de-dados.md) | Sem B1 resolvido (acesso SQL), continua não verificável |
| C2 | **`INSERT`/`UPDATE` de `consents` pelo membro autenticado não confirmados.** Mesmo tipo de achado do `audit_log` (P-A1): policy com `USING` e sem `WITH CHECK` recusa a escrita com `42501` | O botão traduziria a recusa para "você não tem permissão" — correto, e inútil |
| C3 | `patient.consent.granted` / `.revoked` **não chegam a `audit_log`**, pelo mesmo bloqueio de policy | Escrita acontece, evento vira log de servidor |
| C4 | **Teste de tenancy pgTAP de `consents`** — R1 exige o teste para toda tabela nova | `supabase/tests/` não existe (D5/D7) |
| C5 | Sem unique parcial em `(clinic_id, subject_type, subject_id, purpose) where revoked_at is null`, duas concessões simultâneas deixam duas linhas vigentes | Degradação escolhida: o painel mostra a mais recente, a revogação fecha **todas**, e `revoked_count > 1` no evento é a evidência da corrida. A correção é migration (§7.4) |
| C6 | Persistência não verificada por usuário real (DoD da §11) | Depende de C1 e C2 |

**A tabela `consents` também não tem FK de `subject_id` para `patients` nem
`created_by`.** A aplicação compensa lendo o paciente antes de gravar e validando
o formato uuid no adapter; o ator do registro fica em `audit_log`, não na linha.

### O que C-01 deliberadamente NÃO configura

A tela de configurações entrega o que é **fato** (a identidade da empresa) e o
que **alguém consome** (a duração padrão da agenda). O resto de
`clinic_settings` ficou sem controle, e a ausência está escrita na própria tela:

| Coluna / campo | Por que não tem ajuste ainda |
|---|---|
| `notification_prefs` | Nenhum caminho do produto envia notificação. Gravar a preferência faria a pessoa parar de conferir se o aviso chegou |
| `branding` e `clinics.logo_url` | Upload exige bucket de Storage cuja configuração não é verificável daqui (B1) |
| `ai_enabled` | O módulo de IA está **Blocked** (W-01/AI-*). Ligar uma coluna não liga um agente |
| `clinics.timezone` e `locale` | Somente leitura: datas e horas são renderizadas pelo relógio do dispositivo. Um seletor gravaria o fuso sem mudar nada do que a agenda mostra |
| `clinics.slug` | Somente leitura: trocá-lo quebra todo link já compartilhado, e não há redirecionamento do endereço antigo |

**O horário de funcionamento passou a valer com A-02.** Ele persiste aqui e a
agenda o consulta: atendimento fora do expediente pede confirmação antes de ser
gravado, e a confirmação vira evento de auditoria. O formato guarda **um turno
por dia** — intervalo de almoço ainda não é representável.

**Perfil pessoal ENTROU depois**, e não como parte de `settings`. Nome e
telefone moram em `profiles` e são do módulo `identity`; o card chega a
`/configuracoes` como slot, composto na rota — a mesma solução do seletor de
clínicas na casca. É para lá que o menu da pessoa aponta desde sempre, com o
rótulo "Perfil e configurações", e até então entregava só a segunda metade.

### O que A-02 entregou, e o que ficou de fora

| Verificação | Estado |
|---|---|
| **Sobreposição de horário do mesmo profissional** | **Entregue.** Consulta de intervalo semiaberto antes de criar e de remarcar, com `clinic_id` e `professional_id` no filtro. Recusa dura |
| **Horário de funcionamento da clínica** | **Entregue.** Só o que foi salvo em C-01 vale; padrão de tela não é imposto. Recusa reversível por confirmação explícita, auditada |
| **Atomicidade da recusa de sobreposição** | **Entregue.** Constraint aplicada em `20260808_appointments_no_overlap.sql` e verificada |
| **Disponibilidade por profissional (`availability_rules`)** | **Bloqueado (B1).** Ver abaixo |
| **Exceções de agenda (`availability_exceptions`)** | **Fora de escopo.** Depende de `availability_rules` estar interpretável |

**Por que `availability_rules` não foi implementada.** A coluna `weekday` é um
`number` e o schema não diz qual convenção usa: `extract(dow …)` do Postgres é
0–6 com domingo em zero, `isodow` é 1–7 com domingo em sete. As duas produzem
tabelas plausíveis, e a diferença desloca a semana inteira em um dia.

Detectar a convenção pelos dados não resolve: uma clínica com regras só de
segunda a sexta tem valores 1–5 nas duas convenções. **Adivinhar errado recusaria
agendamento legítimo** — o pior modo de falha possível para uma clínica, porque
o sintoma é "o sistema não deixa marcar" e a causa é invisível.

Resolver com uma consulta, e então implementar:

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.availability_rules'::regclass;
```

Enquanto isso, a ausência não degrada nada: sem interpretação, não há regra
imposta, que é exatamente o comportamento de hoje.

### O que T-01 mede, e o que se recusa a medir

O painel e os relatórios passaram a contar linhas do banco. `dashboardMetrics`
— 24 atendimentos, 92% de comparecimento, "+12%" — saiu de
`src/lib/mocks/clinic-data.ts`.

| Indicador | Fonte | Fatia que a criou |
|---|---|---|
| Atendimentos hoje / no período | `appointments`, exceto cancelados | A-01 |
| Desfechos (realizados, cancelados, faltas, por acontecer) | `appointments.status` | A-01 |
| Pacientes aguardando | `waiting_queue` com `status = 'waiting'`, chegados hoje | E-01 |
| Novos pacientes (mês e período) | `patients.created_at` | P-01 |
| Base ativa | `patients.is_active` | P-01 |
| Comparecimento | `completed` sobre `completed + no_show` | A-01 |
| Volume por profissional | `appointments` agrupados, sem cancelados | A-01 |
| Atividade recente | `appointments`, `patients` e `encounters` recentes | A-01, P-01, E-01 |

**Faturamento, recebimentos e glosas não entram.** `invoices`, `payments` e
`cash_entries` existem no schema, e **nenhuma tela do produto grava neles**. Ler
agora devolveria R$ 0,00 para toda clínica: verdadeiro como consulta e falso como
informação — "a clínica não faturou" e "o sistema ainda não registra
faturamento" são coisas diferentes, e o painel diria a primeira. Entram com
**B-01** e **V-01**.

**A atividade recente agora pode ser auditada em `audit_log`.** A policy de
`INSERT` foi aplicada e verificada (**P-P6**). O feed do painel ainda mantém as
próprias operações como fonte para não expor informação clínica sem recorte por
papel — "encerrou o atendimento de Fulano" continua fora da descrição.

**Três decisões sobre ausência de dado**, que valem para os relatórios que vierem:

- **Comparecimento sem base é `null`, não 0%.** Zero por cento diz que ninguém
  compareceu; numa clínica que ainda não fechou um atendimento, é acusação falsa.
  A tela mostra "—" e explica quando o número aparece.
- **Variação percentual só com base declarada.** O painel exibe uma única — novos
  pacientes, mês contra mês — e a omite quando o mês anterior é zero: crescer do
  nada não é percentual, e todo primeiro mês cairia nesse caso.
- **Relatório truncado avisa.** A leitura tem teto de 5.000 linhas; atingi-lo
  troca o número por uma amostra, e a tela diz isso. Truncar em silêncio é o pior
  erro possível num painel — o número parece completo e a decisão é tomada.

### O que B-01 entregou, e as três RPCs que não pôde chamar

| Operação | Estado |
|---|---|
| **Cobrança** com itens, desconto e vencimento | **Entregue.** Nasce em `draft`; totais recalculados no servidor |
| **Cancelamento** de cobrança | **Entregue.** Preserva a linha; recusa se já houve pagamento |
| **Pagamento**, total ou parcial, em sete formas | **Entregue.** Recusa valor acima do saldo; `paid_cents` recalculado da soma |
| **Caixa**: abrir, lançar entrada/saída, fechar com contagem | **Entregue.** Pagamento em espécie vira lançamento automático |
| **Emissão fiscal numerada** | **Bloqueado.** Ver abaixo |
| **Contas a pagar / despesas** (`payables`) | **Entregue nesta fatia.** Lista vencimentos, registra despesa e baixa usando o valor persistido |
| **Repasse a profissional** (`professional_payouts`) | **Bloqueado.** `preview_professional_payout` tem a mesma limitação |

**Três RPCs financeiras aparecem em `database.types.ts` como
`Args: Record<string, unknown>`** — ou seja, o gerador **não resolveu a
assinatura**: `issue_invoice`, `close_cash_session` e
`preview_professional_payout`. Chamá-las seria adivinhar nomes de parâmetro em
operações que mexem em dinheiro.

Consequências, uma a uma:

- **`issue_invoice`** — a fatia entrega COBRANÇA, não documento fiscal. A
  cobrança nasce em `draft` e sem `number`, e a tela diz isso onde estaria o
  botão de emitir. Marcar `issued` sem numerar alegaria uma emissão que não
  aconteceu, e numeração fiscal que pula ou repete é problema com a prefeitura.
- **`next_document_number(p_kind)`** é tipada, mas `document_sequences.kind` é
  texto livre e o valor válido não é legível daqui — o mesmo bloqueio, por outro
  caminho.
- **`close_cash_session`** — o adapter calcula e grava direto, com
  `eq('status','open')` no `where` para que dois fechamentos concorrentes não
  gravem valores diferentes. O desvio está documentado no método.

Reconciliar com:

```sql
select proname, pg_get_function_arguments(oid)
  from pg_proc
 where proname in ('issue_invoice','close_cash_session','preview_professional_payout');

select distinct kind from public.document_sequences;
```

**Duas regras de dinheiro que o adapter impõe**, e que valem para V-01:

- **Nenhum total vem do cliente.** O formulário envia quantidade e preço
  unitário; subtotal e total são recalculados no servidor. Quem controla o total
  controla quanto o paciente deve, e o formulário roda no navegador dele.
- **`paid_cents` é recalculado da soma dos pagamentos, nunca incrementado.**
  Somar sobre o valor anterior transforma uma requisição repetida em dinheiro
  duplicado; recalcular faz a repetição ser inócua e conserta divergência
  deixada por falha anterior.

### O que V-01 entregou, e as duas ausências que a tela declara

| Operação | Estado |
|---|---|
| **Operadoras**: cadastrar, ativar, desativar | **Entregue.** Desativar não mexe nos planos |
| **Planos** com coparticipação e prazo de pagamento | **Entregue.** Exige operadora antes — a dependência aparece na interface |
| **Guias**: abrir solicitação com procedimentos | **Entregue.** Nasce em `requested`, sem número |
| **Resposta da operadora**: autorizada com número, ou negada com motivo | **Entregue.** Só guia pendente aceita resposta |
| **Glosas** | **Infraestrutura entregue.** Tabela aplicada; tela e fluxo financeiro seguem em evolução |
| **Elegibilidade junto à operadora** | **Ausente.** Exige integração externa (TISS/portal) |

**Glosa não tem tabela, e não é a mesma coisa que guia negada.**
`insurance_authorizations.status = 'denied'` é negativa de autorização **prévia**:
decidida antes do atendimento, e a consequência é o atendimento não acontecer.
Glosa é recusa de **pagamento**: a operadora autorizou, o atendimento foi
prestado, a fatura foi enviada — e o dinheiro não vem. Modelar a segunda em cima
da primeira somaria dois fatos com efeitos financeiros opostos e esconderia
justamente o número que a clínica precisa acompanhar. A migration está em
`supabase/migrations/20260808_insurance_claim_denials.sql`, aplicada no banco em
08/08/2026. A tela completa de glosas continua sendo uma próxima fatia.

**Elegibilidade não é a validade cadastrada.** `patient_insurances.valid_until` é
uma data que a clínica digitou. Consultar a operadora exige integração externa
que este ambiente não tem, e chamar o campo local de "elegível" faria a recepção
confiar num dado que ninguém confirmou. A tela usa o termo "validade cadastrada"
e avisa quando ela já passou — como aviso, não como bloqueio: impedir a guia por
causa de um cadastro possivelmente desatualizado seria confiar mais nele do que
em quem está com o paciente na frente.

**Duas recusas do adapter**, pelas mesmas razões de sempre:

- **Guia já respondida não aceita nova resposta.** Reescrever apagaria o motivo
  da negativa — o texto que sustenta o recurso. O filtro no `where` também
  impede que duas pessoas respondendo ao mesmo tempo sobrescrevam uma à outra.
- **O paciente sai da carteirinha, não da entrada.** Recebê-los separados
  permitiria montar guia do paciente A com a carteirinha de B, e a operadora só
  recusaria depois do atendimento marcado.

---

## 14. Primeira feature recomendada — **I-01: onboarding real e sessão/tenant**

### Por que esta, e não outra

Hoje o produto tem um buraco estrutural: **quem cria uma conta não consegue criar uma
clínica.** Sem vínculo, `current_clinic_id()` devolve `null`, `resolveDataSource()` cai
em `demo` e o usuário vê a clínica fictícia — dados que não são dele, em uma tela que
parece funcionar. É simultaneamente o pior bug de percepção (D8) e o bloqueio de
qualquer feature que precise gravar: **nenhuma outra fatia vertical é testável até que
exista uma clínica real com um membro real.**

Ela também exercita, de uma vez, os trilhos de bootstrap da fundação: auditoria best-effort,
claims, RPC do banco e sessão na casca. O `createAction` será exercitado pela primeira
mutação tenant-scoped (P-01), porque o bootstrap ainda não possui clínica ativa para o
pipeline resolver.

### Escopo

1. **Cadastro real** — `signUpAction` com Zod, Supabase Auth, criação de `profiles`,
   mensagens de erro que não revelam existência de e-mail.
2. **Onboarding com persistência** — o wizard chama `create_clinic(p_slug, p_trade_name)`;
   o passo 2 vira convite de equipe (ou "pular"); o passo 3 deixa de criar atendimento fictício.
3. **Roteamento por estado de vínculo** — autenticado **sem** clínica → `/onboarding`;
   com clínica → `/dashboard`. Decidido no servidor, não no `proxy.ts` (P3 de `01-arquitetura.md`).
4. **Sessão na casca** — `src/app/(app)/layout.tsx` deixa de importar `currentUser` do mock
   e passa a ler nome, papel e clínica da sessão.
5. **Modo demo contido** — só quando o Supabase **não está configurado**. Usuário autenticado
   sem clínica nunca mais vê dado fictício.

### Fora de escopo (deliberadamente)

Troca de clínica (I-03), fluxo completo de convite (I-04), matriz de permissões (I-05),
recuperação de senha, marca/tema por clínica.

### Pré-requisitos

F-01 (`createAction` + auditoria) e F-02 (cache tags + `cacheComponents`) entraram em
Review; as duas já cobrem a primeira mutação tenant-scoped. F-03 e F-04 entram em
paralelo, sem bloquear o bootstrap, mas F-04 é necessário para assinar os critérios
automatizados.

### Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| CA1 | Usuário novo cria conta pelo `/cadastro` e recebe sessão válida | E2E: cadastro → redirecionado a `/onboarding` |
| CA2 | Onboarding cria a clínica de verdade via `create_clinic()` | Linha em `clinics` + `memberships` com role `owner` |
| CA3 | Após o onboarding, `current_clinic_id()` devolve a clínica criada | RPC retorna UUID; `resolveDataSource()` responde `mode: 'supabase'` |
| CA4 | A casca mostra nome, papel e clínica **reais** | `layout.tsx` sem import de `lib/mocks` |
| CA5 | Autenticado sem clínica é levado ao onboarding, nunca ao dashboard demo | Usuário sem `memberships` acessando `/dashboard` → `/onboarding` |
| CA6 | Slug duplicado devolve erro tratado, sem 500 | Duas clínicas com o mesmo slug: mensagem clara na UI |
| CA7 | O bootstrap da clínica grava `clinic.created` em `audit_log` com ator, ação e `after`; o `createAction` cobre as mutações tenant-scoped posteriores | Linha em `audit_log` com actor, ação e `after`, após confirmar a policy de INSERT |
| CA8 | Nenhuma clínica enxerga a outra | Teste de tenancy: usuário da clínica A lê `clinics` → só a dele |
| CA9 | Modo demo só com Supabase não configurado | Com env preenchida e sem vínculo → onboarding, não mock |
| CA10 | Wizard responsivo e acessível | 360/768/1280; foco visível; erro anunciado a leitor de tela |
| CA11 | `lint` + `typecheck` + `build` verdes | CI |
| CA12 | `OnboardingScreen` sai de `OperationsScreens.tsx` e passa a viver em `modules/identity/ui/` | Export removido do arquivo de vitrine |

### Divisão do trabalho

| Quem | O quê |
|---|---|
| **Codex** | Aprovar contrato (`OnboardingWizard.props.ts` + Zod de clínica), confirmar assinatura de `create_clinic`, revisar segurança/LGPD, revisar o PR |
| **Claude** | `signUpAction`, `createClinicAction`, `identity/domain` + `infrastructure`, containers, roteamento por vínculo, sessão na casca, testes |

---

## 15. Como este documento é mantido

- Mudou fase, prioridade ou status de feature → atualizar aqui, no mesmo PR.
- Decisão arquitetural nova → `01-arquitetura.md`; este roadmap só referencia.
- Dívida paga → riscar a linha na §2.4 com o PR que a pagou.
- Dono deste arquivo: **Codex**. Claude propõe alteração via PR.

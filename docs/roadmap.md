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
| **Leitura real** de pacientes e agenda | Só há `listByClinic`, `findById`, `listByRange`, `listByPatient`, `listProfessionals`. **Nenhum `save`/`update`.** |
| **Escrita** em qualquer módulo | `NewPatientModal` e `NewAppointmentModal` chamam `onSubmit`, e `PatientsScreen`/`AgendaScreen` apenas fazem `setState` local. **Nada é persistido; recarregar a página descarta.** |
| Casca da aplicação | `src/app/(app)/layout.tsx` monta o `AppShell` com `currentUser` **mockado** — nome, papel e clínica na UI não vêm da sessão. |
| Cadastro de conta | `src/app/(auth)/cadastro/page.tsx` é um `<form>` sem action. O botão não faz nada. |
| Onboarding | `OnboardingScreen` é wizard de 3 passos em `useState`; não chama `create_clinic()`. Termina em um link para `/dashboard`. |
| Dashboard | Métricas, atividade recente e usuário vêm de `src/lib/mocks/clinic-data.ts`; só a agenda do dia vem do repositório. |
| Navegação | `navItems` não lista `/equipe` nem `/convenios`, embora as rotas existam. Páginas órfãs. |

### 2.3 Mock / read-only por design (telas de vitrine)

`src/modules/workspace/ui/OperationsScreens.tsx` (407 linhas, `'use client'`) concentra
**11 telas** com dados literais no arquivo e botões `disabled`:

`AtendimentosScreen` · `ProntuariosScreen` · `FinanceiroScreen` · `WhatsappScreen` ·
`ChatIaScreen` · `AutomacoesScreen` · `RelatoriosScreen` · `ConfiguracoesScreen` ·
`EquipeScreen` · `ConveniosScreen` · `OnboardingScreen`

São **protótipos visuais aprovados**, não funcionalidade. Serão desmontadas uma a uma:
cada tela migra para `src/modules/<módulo>/ui/` com container + view + repositório real,
e sai deste arquivo. **O arquivo desaparece quando o último módulo for implementado** —
esse é o critério de saída dele.

### 2.4 Dívida técnica catalogada

| # | Dívida | Severidade | Quando pagar |
|---|---|---|---|
| D1 | `createAction` existia como dívida; F-01 criou `modules/_shared/application/createAction.ts`. Primeiro chamador runtime ainda pendente (P-A6). | **Em Review** | P-01, primeira mutação tenant-scoped |
| D2 | `audit_log` existia no banco sem escritas no código; F-01 criou `recordAuditEvent` e integrou `clinic.created`. Policy remota de INSERT ainda não verificada (P-A1). | **Em Review** | Confirmar RLS no Supabase e cobrir com F-04 |
| D3 | Sem `lib/cache/tags.ts`; nenhuma chave de cache com `clinic_id`. Nenhum `use cache` em uso. | **Crítica** | Fase 1 |
| D4 | ESLint é só `next/core-web-vitals` + `typescript`. **`eslint-plugin-boundaries` não instalado** → as 6 regras de arquitetura da §10 de `02-estrutura-de-pastas.md` não são verificadas. | Alta | Fase 1 |
| D5 | **Zero testes.** Nenhum runner, nenhum arquivo de teste, `supabase/tests/` não existe. | Alta | Fase 1 (harness) → contínuo |
| D6 | Sem script `typecheck` no `package.json`; sem CI (`.github/workflows/` ausente). | Alta | Fase 1 |
| D7 | `supabase/migrations/` **vazio** — o schema remoto não está versionado no repo. Não há como reproduzir o banco nem revisar mudança de schema em PR. | Alta | Fase 2 |
| D8 | Modo demo (`data-source.ts` cai para mock quando falta vínculo) mascara bug de tenancy: usuário sem clínica vê dados fictícios em vez de ser levado ao onboarding. | Alta | Fase 1 (feature 01) |
| D9 | `OperationsScreens.tsx` — 11 telas em um arquivo `'use client'`, com estilos inline longos. Ponto de conflito garantido entre agentes. | Média | Diluída por fase |
| D10 | Sem `unauthorized.tsx` / `forbidden.tsx`; `authInterrupts` e `cacheComponents` não habilitados em `next.config.ts`. | Média | Fase 1 |
| D11 | Sem TanStack Query instalado, embora a arquitetura o preveja para interação. | Baixa | Quando a agenda ganhar drag/filtros server-side |
| D12 | Nenhum `Money`/centavos, `Result`, `Paginated` em `_shared/domain` — só `types.ts`. | Média | Antes do Financeiro |
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
| `cacheComponents` | Diretivas `use cache`, `use cache: private` (D3) |
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
- [ ] Toda tag/chave de cache carrega `clinic_id`, gerada por `lib/cache/tags.ts`.
- [ ] Dado derivado de sessão usa `'use cache: private'` — nunca `'use cache'` puro.
- [ ] Mutação passa pelo `createAction` e grava em `audit_log`.
- [ ] Leitura de prontuário é auditada (quem, quando, qual, de qual IP).
- [ ] Exclusão é lógica (`deleted_at`), nunca `DELETE`.
- [ ] Dado clínico não vaza para Client Component (usar `taint`; view recebe só o necessário).
- [ ] Novo tratamento de dado pessoal tem finalidade registrada em `consents`.
- [ ] Alteração/remoção de vínculo **revoga a sessão explicitamente** (claims do JWT ficam velhas por ~1h).
- [ ] `SUPABASE_SECRET_KEY` não aparece em nenhum caminho alcançável pelo browser.

### LGPD — o que precisa existir antes do primeiro cliente real

| Requisito | Onde | Fase |
|---|---|---|
| Registro de consentimento por finalidade | `consents` | F2 |
| Auditoria de acesso a prontuário | `audit_log` | F5 |
| Exportação de dados do titular | `identity` / `settings` | F6 |
| Eliminação/anonimização respeitando prazo legal de guarda | `records` | F6 |
| Storage privado com path `{clinic_id}/…` e URL assinada curta | `services/storage` | F2 |

---

## 9. Riscos e gates

| # | Risco | Sev. | Gate que o bloqueia |
|---|---|---|---|
| R1 | Clínica A enxerga dado da clínica B | Crítica | Teste de tenancy no CI para **toda** tabela nova. Sem teste, o PR não entra. |
| R2 | Cache vazando entre tenants | Crítica | Lint proibindo tag de cache literal; toda tag sai de `cache/tags.ts`. |
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
| F-02 | `lib/cache/tags.ts` + flags do Next 16 | Claude | **Ready** | D3, D10 |
| F-03 | `eslint-plugin-boundaries` com as 6 regras | Claude | **Ready** | D4 |
| F-04 | Harness de teste + script `typecheck` + CI | Claude | **Ready** | D5, D6 |
| F-05 | Versionar schema remoto em `supabase/migrations/` | Claude / rev. Codex | Backlog | D7 |

### Identidade e tenancy

| ID | Feature | Dono | Status | Nota |
|---|---|---|---|---|
| **I-01** | **Onboarding real + sessão/tenant na casca** | Claude | **Review** | §14 · implementação e pendências em [`05-onboarding-e-sessao.md`](./05-onboarding-e-sessao.md). CA7 depende da policy de `audit_log`; CA8 e CA1 (testes) seguem abertos e dependem de verificação do banco/F-04. |
| I-02 | Cadastro de conta funcional (`signUp`) | Claude | **Review** | Entregue junto de I-01 |
| I-03 | Seletor de clínica (`switch_clinic`) | Claude | Backlog | Depois de I-01 |
| I-04 | Convites (`accept_invitation`) + revogação de sessão | Claude | Backlog | R6 |
| I-05 | Matriz papel × ação + `unauthorized`/`forbidden` | Claude / Codex | Backlog | D10 |

### Operacional

| ID | Feature | Dono | Status |
|---|---|---|---|
| **P-01** | **Pacientes — cadastro real persistindo** | Claude | **Review** |
| P-02 | Pacientes — busca paginada por cursor | Claude | Backlog |
| P-03 | Pacientes — consentimento LGPD | Claude | Backlog |
| A-01 | Agenda — criar/remarcar/cancelar persistindo | Claude | Backlog |
| A-02 | Agenda — conflito e disponibilidade reais | Claude | Backlog |
| E-01 | Atendimentos — check-in, fila, encerramento | Claude | Backlog |
| R-01 | Prontuário versionado append-only | Claude | Backlog |
| S-01 | Equipe — profissionais, escalas, ausências | Claude | Backlog |
| C-01 | Configurações da clínica | Claude | Backlog |
| B-01 | Financeiro — fatura, pagamento, caixa | Claude | Backlog |
| V-01 | Convênios — operadoras, guias, glosas | Claude | Backlog |
| T-01 | Relatórios e dashboard sem mock | Claude | Backlog |

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
| Equipe | S-01 | Backlog |
| Configurações | C-01 | Backlog |
| Atendimentos | E-01 | Backlog |
| Prontuários | R-01 | Backlog |
| Financeiro | B-01 | Backlog |
| Convênios | V-01 | Backlog |
| Relatórios | T-01 | Backlog |
| WhatsApp / Chat IA / Automações | W-01, AI-*, AU-01 | Blocked |

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

F-01 (`createAction` + auditoria) entrou em Review; F-02 (cache tags) precisa entrar antes
ou junto da primeira mutação tenant-scoped. F-03 e F-04 entram em paralelo, sem bloquear
o bootstrap, mas F-04 é necessário para assinar os critérios automatizados.

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

# Focuss Care — estado real do produto

> Levantado contra o código em **08/08/2026**, branch `feat/telas-e-camada-supabase`,
> commit `8e25111`. Este documento descreve o que **existe e funciona**, não o que
> está planejado — o plano é o [`docs/roadmap.md`](./docs/roadmap.md).
>
> Regra de preenchimento: uma linha só é **COMPLETO** se a fatia vertical fecha
> (UI → action → caso de uso → repositório → teste) e persiste de verdade.
> Tela bonita sem persistência é **PENDENTE**, não "quase pronto".

**Validação atual:** 391 testes em 29 arquivos · `lint` limpo · `typecheck` limpo ·
`build` compila com 21 rotas.

---

## 1. Resumo por status

| Status | O que significa | Quantos |
|---|---|---|
| **COMPLETO** | Fatia vertical fechada, persistindo, com teste | 15 |
| **EM ANDAMENTO** | Parte entregue, parte declaradamente ausente na tela | 3 |
| **PENDENTE** | Não implementado, e nada bloqueia começar | 2 |
| **BLOQUEADO** | Depende de acesso ao banco, integração externa ou decisão de produto | 8 |

---

## 2. Fundação

| Item | Status | Evidência |
|---|---|---|
| `createAction` — pipeline único de mutação | **COMPLETO** | `src/modules/_shared/application/createAction.ts` · usado por 20 actions |
| `Result` / `AppError` tipado | **COMPLETO** | `src/modules/_shared/domain/Result.ts` |
| Auditoria (`recordAuditEvent`) | **EM ANDAMENTO** | Código completo; **nenhum evento persiste** — ver P-P6 na §6 |
| Cache tags tenant-scoped | **EM ANDAMENTO** | `src/lib/cache/tags.ts` existe e é invalidado; **nenhuma leitura usa `use cache`** ainda |
| 6 regras de arquitetura no lint | **COMPLETO** | `eslint.config.mjs` · `eslint-plugin-boundaries` |
| Harness de teste + CI | **COMPLETO** | Vitest · `.github/workflows/` |
| Tipos gerados do schema | **COMPLETO** | `npm run db:types` |

---

## 3. Módulos de domínio

| Módulo | Status | O que faz hoje |
|---|---|---|
| `identity` | **COMPLETO** | Cadastro, login, onboarding (`create_clinic`), troca de clínica, aceite de convite, matriz papel × ação |
| `patients` | **COMPLETO** | Cadastro, edição, arquivamento, busca server-side com cursor, consentimento LGPD |
| `scheduling` | **COMPLETO** | Criar, remarcar, cancelar, histórico de status, conflito de horário, horário de funcionamento |
| `encounters` | **COMPLETO** | Check-in, fila presencial, chamar, iniciar, encerrar |
| `records` | **COMPLETO** | Prontuário versionado append-only, retificação por nova versão, auditoria de leitura |
| `team` | **EM ANDAMENTO** | Vínculos, papéis e revogação funcionam; **emissão de convite ausente** (RPC bloqueada) |
| `settings` | **COMPLETO** | Identidade da clínica, horário de funcionamento, duração padrão da agenda |
| `reporting` | **COMPLETO** | Indicadores do dia e do período, atividade recente — só o que há linha para sustentar |
| `billing` | **EM ANDAMENTO** | Cobrança, pagamento e caixa funcionam; **emissão fiscal numerada ausente** (RPC bloqueada) |
| `insurance` | **EM ANDAMENTO** | Operadoras, planos e guias funcionam; **glosa ausente** (sem tabela) |
| `dashboard` | **COMPLETO** | Cartões, agenda do dia e atividade — todos contados do banco |
| `workspace` | **EM ANDAMENTO** | Restam 3 telas de vitrine, todas bloqueadas — ver §5 |

---

## 4. Rotas

As 21 rotas existem e renderizam. A coluna **Dados** diz de onde vem o conteúdo.

| Rota | Status | Dados | Autorização |
|---|---|---|---|
| `/` | **COMPLETO** | Estático | Pública |
| `/login`, `/cadastro`, `/recuperar-senha` | **COMPLETO** | Supabase Auth | Pública |
| `/onboarding` | **COMPLETO** | `create_clinic()` | Sessão sem clínica |
| `/convite/[token]` | **COMPLETO** | `accept_invitation()` | Token na URL, `noindex` |
| `/dashboard` | **COMPLETO** | Banco (reporting + scheduling) | Membro |
| `/agenda` | **COMPLETO** | Banco (scheduling + patients + settings) | Membro |
| `/pacientes` e subrotas | **COMPLETO** | Banco (patients) | `patient.read` |
| `/atendimentos` | **COMPLETO** | Banco (encounters + patients + scheduling) | Membro |
| `/prontuarios` | **COMPLETO** | Banco (records) | `record.read` |
| `/equipe` | **EM ANDAMENTO** | Banco (team) | `team.read` |
| `/configuracoes` | **COMPLETO** | Banco (settings) | Membro; edição exige `clinic.settings` |
| `/relatorios` | **COMPLETO** | Banco (reporting) | `report.read` |
| `/financeiro` | **EM ANDAMENTO** | Banco (billing + patients) | `invoice.read` |
| `/convenios` | **EM ANDAMENTO** | Banco (insurance) | `insurance.manage` |
| `/whatsapp` | **BLOQUEADO** | **Vitrine** — dados literais no arquivo | Membro |
| `/chat-ia` | **BLOQUEADO** | **Vitrine** — dados literais no arquivo | Membro |
| `/automacoes` | **BLOQUEADO** | **Vitrine** — dados literais no arquivo | Membro |

---

## 5. Vitrines restantes

`src/modules/workspace/ui/OperationsScreens.tsx` tinha **11 telas** com dados
escritos no arquivo. **Oito saíram** com suas fatias. Restam três, e as três
dependem da mesma coisa:

| Tela | Vira | Status | O que bloqueia |
|---|---|---|---|
| `WhatsappScreen` | W-01 | **BLOQUEADO** | Worker + Redis + provedor Evolution; nenhum existe no ambiente |
| `ChatIaScreen` | AI-01..07 | **BLOQUEADO** | Aguarda aprovação de `docs/04-agente-ia.md` (P9: IA sugere, humano assina) |
| `AutomacoesScreen` | AU-01 | **BLOQUEADO** | Depende de W-01 |

O arquivo desaparece quando a última sair — esse é o critério de saída dele.

---

## 6. Bloqueios reais, e o que cada um custa

**B1 — sem acesso SQL ao banco.** Não há `DATABASE_URL`, senha nem
`SUPABASE_ACCESS_TOKEN` neste ambiente. Consequência: nenhuma migration é
aplicada, nenhum corpo de RPC é legível, nenhuma policy é verificável.

| # | Bloqueio | Custo hoje | Como sair |
|---|---|---|---|
| **P-P6** | Policy de `INSERT` de `audit_log` recusa o membro autenticado | **Nenhum dos ~20 eventos de auditoria está sendo gravado.** Para dado de saúde, trilha de auditoria é requisito legal | Aplicar `20260807_audit_log_insert_policy.sql` |
| **P-INV** | Não há RPC de criação de convite | Convites só nascem direto no banco; a tela diz isso onde estaria o botão | Aplicar `20260807_create_invitation_rpc.sql` (revisar o hash antes) |
| **P-OVL** | Sem constraint de exclusão em `appointments` | Duas recepcionistas clicando no mesmo instante podem gravar horários sobrepostos | Aplicar `20260808_appointments_no_overlap.sql` |
| **P-GLO** | Glosa não tem tabela | O controle de glosas não existe, e a tela declara isso | Aplicar `20260808_insurance_claim_denials.sql` |
| **P-RPC** | `issue_invoice`, `close_cash_session`, `preview_professional_payout` com assinatura não resolvida | Sem emissão fiscal numerada e sem repasse a profissional | `select proname, pg_get_function_arguments(oid) from pg_proc where …` |
| **P-WD** | Convenção de `availability_rules.weekday` desconhecida (0–6 ou 1–7) | Sem disponibilidade por profissional na agenda | `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.availability_rules'::regclass` |
| **P-02b** | Índices trigram e coluna de última visita | Filtro "Última visita" fica desabilitado, com o motivo na tela | Diagnóstico em `docs/07-cadastro-de-pacientes.md` §8.11 |
| **P-C2** | `cacheComponents` exige shell estático | 11 segmentos usam `instant = false` | Empurrar leitura de sessão para dentro de `<Suspense>`, rota a rota |

---

## 7. Pendente, e nada bloqueia

| Item | Por que ainda não |
|---|---|
| Perfil pessoal (nome, telefone de quem usa) | Mora em `profiles`, é do módulo `identity`, e nenhuma fatia o pegou |
| Escalas e ausências (`work_schedules`, `time_off`) | Pendem de `employees` — o vínculo trabalhista, entidade que o produto não modela |

---

## 8. O que NÃO existe, e não é esquecimento

Cada item abaixo aparece **declarado na tela**, com o motivo, em vez de um botão
que não funciona:

| Ausência | Onde a tela diz | Por quê |
|---|---|---|
| Emissão de convite | `/equipe` | Exigiria a aplicação saber gerar `token_hash` — e quem sabe gerar sabe forjar |
| Emissão fiscal numerada | `/financeiro` | `issue_invoice` com assinatura não resolvida; numeração que pula é problema com a prefeitura |
| Despesas e contas a pagar | `/financeiro` | `payables` existe, nenhuma tela grava; card em R$ 0,00 diria que a clínica não tem custo |
| Faturamento nos relatórios | `/relatorios` | Mesma razão: R$ 0,00 é verdadeiro como consulta e falso como informação |
| Glosas | `/convenios` | Não há tabela; guia negada é outra coisa |
| Elegibilidade junto à operadora | `/convenios` | Exige integração externa; o que existe é a validade cadastrada |
| Notificações, marca, IA, fuso horário | `/configuracoes` | Colunas existem, nada as consome — preferência gravada sem efeito é recurso falso |
| Turnos partidos no expediente | `/configuracoes` | Formato guarda um turno por dia, e a tela avisa antes de salvar |
| Disponibilidade por profissional | `/agenda` | Convenção de `weekday` não verificável; adivinhar recusaria agendamento legítimo |

---

## 9. Como este documento é mantido

Atualizado **na mesma fatia** que muda o estado — nunca depois. Se uma linha
aqui discorda do código, o código está certo e este arquivo está errado.

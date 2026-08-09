# Focuss Care — estado real do produto

> Levantado contra o código em **08/08/2026**, branch `feat/telas-e-camada-supabase`.
> Este documento descreve o que **existe e funciona**, não o que
> está planejado — o plano é o [`docs/roadmap.md`](./docs/roadmap.md).
>
> Regra de preenchimento: uma linha só é **COMPLETO** se a fatia vertical fecha
> (UI → action → caso de uso → repositório → teste) e persiste de verdade.
> Tela bonita sem persistência é **PENDENTE**, não "quase pronto".

**Validação atual:** 1064 testes em 100 arquivos · `lint` limpo · `typecheck` limpo ·
`build` compila com 42 rotas · OpenNext Cloudflare limpo.

**Atualização do banco (08/08/2026):** as quatro migrations propostas foram
aplicadas no Supabase: auditoria, glosas, proteção contra sobreposição de
agendamentos e RPC de convites. As cinco verificações estruturais retornaram
`true`, e os tipos locais foram regenerados no commit `851688e`.

---

## 1. Resumo por status

| Status | O que significa | Quantos |
|---|---|---|
| **COMPLETO** | Fatia vertical fechada, persistindo, com teste | 19 |
| **EM ANDAMENTO** | Parte entregue, parte declaradamente ausente na tela | 4 |
| **PENDENTE** | Não implementado, e nada bloqueia começar | 0 |
| **BLOQUEADO** | Depende de acesso ao banco, integração externa ou decisão de produto | 10 |

---

## 2. Fundação

| Item | Status | Evidência |
|---|---|---|
| `createAction` — pipeline único de mutação | **COMPLETO** | `src/modules/_shared/application/createAction.ts` · usado por 28 actions (27 escritas + `patient.search`, leitura que precisa rodar sem sair do modal) |
| `Result` / `AppError` tipado | **COMPLETO** | `src/modules/_shared/domain/Result.ts` |
| Auditoria (`recordAuditEvent`) | **COMPLETO** | Código e policy de inserção aplicados; eventos passam pelo `audit_log` |
| Cache tags tenant-scoped | **COMPLETO** | `src/lib/cache/tags.ts` + a primeira leitura cacheada, em `settings/infrastructure/settingsCache.ts` (`use cache: private`) |
| 6 regras de arquitetura no lint | **COMPLETO** | `eslint.config.mjs` · `eslint-plugin-boundaries` |
| Harness de teste + CI | **COMPLETO** | Vitest (`node` por padrão, `jsdom` por arquivo) · `.github/workflows/` |
| Tipos gerados do schema | **COMPLETO** | `npm run db:types` |

---

## 3. Módulos de domínio

| Módulo | Status | O que faz hoje |
|---|---|---|
| `identity` | **COMPLETO** | Cadastro, login, **recuperação de senha por e-mail**, onboarding (`create_clinic`), troca de clínica, aceite de convite, matriz papel × ação, perfil pessoal |
| `patients` | **COMPLETO** | Cadastro, edição, arquivamento, busca server-side com cursor, seletor de paciente com busca no servidor, contatos vinculados com CRUD, consentimento LGPD |
| `scheduling` | **COMPLETO** | Criar, remarcar, cancelar, histórico de status, conflito de horário, horário de funcionamento |
| `encounters` | **COMPLETO** | Check-in, fila presencial, chamar, iniciar, encerrar |
| `records` | **COMPLETO** | Prontuário versionado append-only, retificação por nova versão, auditoria de leitura |
| `team` | **EM ANDAMENTO** | Vínculos, papéis, revogação, funcionários, ausências e **emissão de convite por RPC** funcionam; escalas seguem ausentes (P-WD) |
| `settings` | **COMPLETO** | Identidade da clínica, horário de funcionamento, duração padrão da agenda e preferência de avisos operacionais |
| `reporting` | **COMPLETO** | Indicadores do dia e do período, atividade recente — só o que há linha para sustentar |
| `billing` | **EM ANDAMENTO** | Cobrança, pagamento, caixa e **contas a pagar com baixa** funcionam; **emissão fiscal numerada ausente** (RPC bloqueada) |
| `insurance` | **EM ANDAMENTO** | Operadoras, planos, **carteirinhas**, guias e **glosas com ciclo de recurso** funcionam; elegibilidade externa segue ausente |
| `dashboard` | **COMPLETO** | Cartões, agenda, atividade e **pulso financeiro tenant-scoped**, respeitando `invoice.read` |
| `audit` | **COMPLETO** | Trilha de ações tenant-scoped, filtro por ação/entidade, paginação e RBAC `audit.read` |
| `subscription` | **COMPLETO** | Plano da clínica, estado da assinatura e cotas contadas na hora. **Só leitura**: não há gateway de pagamento |
| `integrations` | **EM ANDAMENTO** | Estado de conexão real + cofre cifrado por clínica para Brevo, Evolution, DeepSeek e calendários. **Ainda não envia, não executa, não chama modelo nem sincroniza agenda** |
| `documents` | **BLOQUEADO** | Central de metadados, upload privado, URL assinada e auditoria preparados; migration e bucket ainda não aplicados |
| `insights` | **COMPLETO** | Alertas operacionais derivados de métricas reais, com fonte, critérios explícitos e links para a ação relacionada |
| `notifications` | **COMPLETO** | Centro por usuário, marcação individual/em lote, avisos operacionais persistidos e preferência de silenciamento por clínica |
| `patient-tags` | **BLOQUEADO** | Tags administrativas tenant-scoped preparadas na ficha 360; migration ainda não aplicada |

---

## 4. Rotas

As 42 rotas existem e renderizam. A coluna **Dados** diz de onde vem o conteúdo.

| Rota | Status | Dados | Autorização |
|---|---|---|---|
| `/` | **COMPLETO** | Estático — redireciona para `/login`; quem já tem sessão segue ao painel pelo proxy | Pública |
| `/login`, `/cadastro` | **COMPLETO** | Supabase Auth · `/login` prerenderiza; só o aviso de retorno do OAuth é dinâmico. O `?next=` leva de volta ao destino, validado por `safeNextPath` | Pública |
| `/recuperar-senha` | **COMPLETO** | Supabase Auth (`resetPasswordForEmail`) · responde a mesma frase para conta existente e inexistente | Pública |
| `/redefinir-senha` | **COMPLETO** | Supabase Auth (`updateUser`) · sessão vinda do link, validada no servidor; `noindex` | Pública no proxy, e o conteúdo depende da sessão do link |
| `/onboarding` | **COMPLETO** | `create_clinic()` | Sessão sem clínica |
| `/convite/[token]` | **COMPLETO** | `accept_invitation()` | Token na URL, `noindex` |
| `/dashboard` | **COMPLETO** | Banco (reporting + scheduling) | Membro |
| `/agenda` | **COMPLETO** | Banco (scheduling + patients + settings) · seletor de paciente busca no servidor, não filtra uma página no navegador | Membro; buscar paciente exige `patient.read` |
| `/pacientes` e subrotas | **COMPLETO** | Banco (patients + `admin_notes` + patient_contacts + consents); tags administrativas preparadas e aguardando migration | `patient.read`; alterações exigem `patient.write` |
| `/recepcao` | **COMPLETO** | Banco (scheduling + encounters) — quem falta chegar e quem está atrasado, derivado na rota | `encounter.read` |
| `/atendimentos` | **COMPLETO** | Banco (encounters + patients + scheduling) | Membro |
| `/display` | **COMPLETO** | Banco (encounters) — projeta `waiting_queue` para a TV da sala de espera, com nome abreviado | `encounter.read` |
| `/prontuarios` | **COMPLETO** | Banco (records) | `record.read` |
| `/assinaturas` | **COMPLETO** | Banco (subscription) — plano, estado e cotas contadas do uso real | `clinic.settings` |
| `/equipe` | **EM ANDAMENTO** | Banco (team) + emissão/cópia de convite | `team.read`; emitir exige `team.manage` |
| `/configuracoes` | **COMPLETO** | Banco (settings + identity) | Membro; perfil é sempre próprio, clínica exige `clinic.settings` |
| `/indicadores` | **COMPLETO** | Banco (reporting) — série de 12 meses contada por `count`, sem transferir linha | `report.read` |
| `/relatorios` | **COMPLETO** | Banco (reporting) | `report.read` |
| `/auditoria` | **COMPLETO** | Banco (`audit_log`) — sem IP, user-agent ou metadados brutos | `audit.read` |
| `/tarefas` | **EM ANDAMENTO** | Migration `clinic_tasks` pendente; UI e camada de escrita preparadas | Membro quando a tabela existir |
| `/financeiro` | **EM ANDAMENTO** | Banco (billing + payables + patients) | `invoice.read`; escrever despesas exige `payable.write` |
| `/convenios` | **EM ANDAMENTO** | Banco (insurance): operadoras, planos, carteirinhas, guias e glosas | `insurance.manage` |
| `/crm` | **EM ANDAMENTO** | Migration `clinic_leads` pendente; pipeline e camada de escrita preparadas | Membro quando as tabelas existirem |
| `/inbox` | **EM ANDAMENTO** | Leitura tenant-scoped de `conversations` e `messages`; sem ingestão/envio até W-01 | Membro |
| `/formularios` | **EM ANDAMENTO** | Migration `clinic_forms` pendente; builder de modelos preparado | `clinic.settings` quando a tabela existir |
| `/formularios/[formId]/responder` | **EM ANDAMENTO** | Formulário publicado + pacientes ativos; salva rascunho e envio quando a migration existir | `patient.write` na action |
| `/estoque` | **EM ANDAMENTO** | Migration `inventory` pendente; cadastro, saldo e movimentação atômica preparados | `invoice.read`; escrita exige `clinic.settings`/`invoice.write` |
| `/conciliacao` | **EM ANDAMENTO** | Migration `bank_reconciliation` pendente; contas, transações manuais e vínculos a faturas/despesas preparados | `invoice.read`; escrita exige `clinic.settings`/`invoice.write` |
| `/documentos` | **BLOQUEADO** | Banco de metadados e Storage privado dependem de `20260809_patient_documents.sql`; catálogo, filtros, upload e download assinado preparados | `patient.read`; upload exige `patient.write` |
| `/insights` | **COMPLETO** | Reporting (fila, atendimentos, pacientes e distribuição por profissional) + motor de regras explicáveis | `report.read` |
| `/whatsapp` | **EM ANDAMENTO** | Banco (integrations) — estado de conexão | Membro |
| `/chat-ia` | **EM ANDAMENTO** | Banco (integrations) — estado e regra P9 | Membro |
| `/automacoes` | **EM ANDAMENTO** | Banco (integrations) — regras reais, sem executor | Membro |

---

## 4.0 Auditoria final local — 08/08/2026

Rodada completa: `git status` limpo, `git diff --check` sem apontamentos,
**788 testes em 61 arquivos**, `lint`, `typecheck`, `build` e OpenNext Cloudflare limpos, e smoke HTTP
das 23 rotas com o servidor de desenvolvimento ativo.

| Verificação | Resultado |
|---|---|
| Rotas públicas (`/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`) | **200** |
| Rotas privadas (14) e `/onboarding` | **307 → `/login?next=<rota>`**, com o destino preservado e escapado |
| `/` e `/convite/[token]` sem sessão | **307** — a raiz para `/login`; o convite para `/login?next=/convite/<token>` |
| Segredos versionados | Nenhum. `.gitignore` cobre `.env*`, com exceção só para `.env.example`, que tem valores vazios |
| Cliente `service_role` | `src/lib/supabase/admin.ts` continua **sem nenhum importador** |
| `clinicId` em schema de entrada | Nenhum |
| `TODO`/`FIXME`, `href="#"`, `onClick` vazio | Nenhum |
| Dados de demonstração fora do fallback | **Duas divergências, corrigidas nesta etapa** — ver abaixo |

**1. O painel podia chamar alguém pelo nome de outra pessoa.** A saudação usava
`session.status === 'active' ? nome real : nome de exemplo`. Os estados
`needs-onboarding` e `claims-stale` são pessoas autenticadas, com nome próprio, e
caíam no lado errado — na prática o layout as redireciona antes, ou seja, a
proteção era o desvio de outro arquivo e não a decisão desta tela. Agora a
pergunta é "há usuário nesta sessão?" (`displayNameOf`, em `lib/auth/session.ts`),
com teste cobrindo os cinco estados e falhando se um sexto aparecer.

**2. O comentário da raiz descrevia um futuro que já chegou.** Dizia que o
redirecionamento viraria condicional "quando o Supabase Auth entrar" — ele
entrou. O desvio segue incondicional de propósito, e o motivo agora está escrito:
`/` é uma das duas rotas totalmente estáticas do produto, e ler sessão ali
trocaria isso por um salto que o proxy já resolve.

---

## 4.2 Itens do menu — estado real (08/08/2026)

O menu tem **31 itens: 18 funcionam e 13 continuam desabilitados**. Antes desta
rodada eram 33 itens, 14 habilitados e 19 apagados.

**Fechados nesta rodada** — quatro telas novas, todas sobre tabela que já
existia no schema, sem migration e sem dependência externa:

| Item | Rota | Sobre o quê |
|---|---|---|
| Display para TV | `/display` | `waiting_queue`, projetada com nome abreviado |
| Indicadores e BI | `/indicadores` | contagem mensal de `appointments` e `patients` |
| Assinaturas | `/assinaturas` | `subscriptions` + `plans`, com cotas contadas do uso |
| Recepção | `/recepcao` | agenda + fila, derivadas na rota |

**Removidos do menu** — dois itens que duplicavam o que já existe: "Fila e
senhas" e "Check-in digital". A fila é `/atendimentos`, o painel dela é
`/display`, e check-in feito pelo próprio paciente é o Portal. Item
permanentemente apagado é promessa vazia, o mesmo motivo que tirou os quatro
`?tab=`.

**Os 13 que restam.** Nenhum é escopo cortado: cada um depende de algo que não
existe neste ambiente, e a coluna diz o quê.

| Item | Bloqueio |
|---|---|
| Estoque | Migration `20260809_inventory.sql` criada, ainda não aplicada (**B1**) |
| Compras | Migration `20260809_purchases.sql` criada, depende de Estoque e ainda não aplicada (**B1**) |
| Salas e recursos | Não há `rooms` nem `resources` — exige migration (**B1**) |
| CRM e Leads | Migration `20260809_clinic_leads.sql` criada, ainda não aplicada (**B1**) |
| Tarefas | Migration `20260809_clinic_tasks.sql` criada, ainda não aplicada (**B1**) |
| Formulários digitais | Migration `20260809_clinic_forms.sql` criada, ainda não aplicada (**B1**); builder local entregue |
| Conciliação bancária | Não há `bank_accounts` nem `bank_transactions` — exige migration (**B1**) |
| Documentos | `patient_documents` existe, mas **não há bucket de Storage**: `listBuckets()` devolveu vazio em 08/08/2026. Sem bucket, o arquivo não tem para onde ir |
| Inbox de atendimento | Leitura tenant-scoped de `conversations` e `messages` entregue; ingestão e envio dependem de W-01 |
| Portal do paciente, Portal do profissional | Aplicação separada, com autenticação própria |
| Teleatendimento | Provedor de vídeo — dependência externa |
| Insights proativos | Provedor de IA e aprovação de `docs/04-agente-ia.md` |

**Seis dos treze dependem só de migration**, que é o bloqueio **B1** (sem acesso
SQL a este ambiente). São os que destravam mais rápido no dia em que houver
credencial administrativa.

---

## 4.1 Auditoria incremental de 08/08/2026

Varredura de rotas, ações e componentes atrás de fluxo inerte, mock fora do
fallback, segredo exposto e furo de tenant. **O que foi conferido, e o que se
achou:**

| Frente | Resultado |
|---|---|
| Botão/formulário inerte | Nenhum. Os controles sem operação local restante (filtro de última visita e paginação no fim da lista) dizem na própria tela por que estão assim; o sino lê notificações reais, marca uma ou todas como lidas e contatos do paciente possuem CRUD quando há sessão |
| `TODO`/`FIXME` no código | Nenhum |
| `href="#"`, `onClick` vazio, `<form>` sem envio | Nenhum |
| `clinic_id` nos repositórios | Todos os `.from()` filtram por clínica, exceto `profiles` (chaveada por usuário) e `clinics` (chaveada pelo próprio id) — corretos |
| `clinicId` em schema de entrada | Nenhum. Continua vindo só de `current_clinic_id()` (P3) |
| Cliente `service_role` | `src/lib/supabase/admin.ts` **não é importado por ninguém**; a regra 5 do lint impede que passe a ser |
| Segredos e `process.env` | Só em `config.ts` e `admin.ts`. Nenhum valor no repositório |
| `dangerouslySetInnerHTML`, `target="_blank"` | Nenhuma ocorrência |
| **`?next=` escrito e ignorado** | **Defeito real, corrigido nesta etapa** — ver abaixo |

**O defeito:** cinco lugares escreviam `?next=` ao mandar alguém para o login (o
proxy, a tela de convite, a agenda e a lista de pacientes ao perder a sessão), e
**nenhum código lia**. Todo login terminava em `/dashboard`. O caso caro era o
convite: `/convite/[token]` desviava para `/login?next=/convite/<token>` com um
comentário afirmando que "assim o token sobrevive ao desvio" — não sobrevivia, e
o link de convite costuma valer uma vez.

Corrigido com `src/lib/routes/safeNextPath.ts`, usado pela entrada por senha e
pelo retorno do Google. A validação compara a **origem** depois de resolver a
entrada, e não uma lista de caracteres proibidos: `//evil.net` e `/\evil.net`
trocam de origem sem conter "http" nem dois pontos.

---

## 4.3 Feature em andamento — Salas e recursos (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** A rota
`/salas-e-recursos` agora possui domínio, porta de repositório, adapter Supabase
tenant-scoped, fallback de demonstração isolado, validação Zod, Server Actions
com `clinic.settings`, auditoria, estados de erro/loading/empty e tela
responsiva com criação, edição, desativação e reativação.

O item permanece desabilitado no menu até `supabase/migrations/20260809_rooms.sql`
ser aplicado e `npm run db:types` ser executado. Se a rota for aberta antes disso,
ela informa que a migration está pendente e não oferece gravação. Isso é
intencional: a feature não é considerada completa enquanto a persistência real
não puder ser verificada.

Validação desta fatia: 4 testes de UI, lint e typecheck limpos.

---

## 4.4 Feature em andamento — Tarefas (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** A rota `/tarefas`
agora possui agrupamento por prazo, filtros de responsável/situação, criação,
edição, conclusão com desfazer e cancelamento auditado. A camada vertical inclui
schema Zod, Server Actions pelo `createAction`, adapter Supabase tenant-scoped,
estado de migration pendente e testes de contrato/UI.

O item do menu foi renomeado para **Tarefas**. Ele continua desabilitado até
`supabase/migrations/20260809_clinic_tasks.sql` ser aplicado e
`npm run db:types` ser executado. A tela não oferece gravação enquanto o schema
não sustenta a operação. Geração automática por IA e notificações permanecem
fora desta fatia.

Validação desta fatia: 53 testes em 3 arquivos, lint, typecheck, build Next.js e
OpenNext Cloudflare limpos. O servidor local segue acessível em `localhost:3000`;
inspeção visual pelo navegador embutido não foi possível neste ambiente.

---

## 4.5 Feature em andamento — CRM e Leads (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** `/crm` possui
pipeline Kanban por sete etapas, busca, filtros por etapa/responsável, criação e
edição, movimentação rápida, valor potencial em centavos, próxima ação,
responsável e histórico de mudanças. A camada vertical inclui migration,
policies RLS, porta, adapter Supabase tenant-scoped, Server Actions pelo
`createAction`, auditoria e estados de erro/loading/empty.

O item continua desabilitado até `20260809_clinic_leads.sql` ser aplicado e
`npm run db:types` ser executado. Conversão em paciente, follow-up automático,
WhatsApp e IA ficam para as integrações correspondentes.

Validação desta fatia: 4 testes de UI, suíte completa com 978 testes em 77
arquivos, lint, typecheck, build Next.js e OpenNext Cloudflare limpos. O servidor
local segue acessível em `localhost:3000`; inspeção visual pelo navegador
embutido não foi possível neste ambiente.

---

## 4.6 Feature em andamento — Inbox de atendimento (09/08/2026)

**Leitura local concluída; ingestão e envio permanecem bloqueados por integração
externa.** A rota `/inbox` consulta as tabelas existentes em uma leitura
tenant-scoped, carrega conversas e mensagens em lote, permite buscar por nome,
telefone ou paciente, filtrar status e abrir o histórico da conversa com link
para a ficha do paciente. A tela é responsiva e não fabrica conversas quando a
base está vazia.

Não existe action de envio, marcar como lida ou alteração de status nesta fatia:
esses controles não são exibidos como se funcionassem. Recebimento de webhook,
normalização de mensagens, fila/worker e envio exigem o contrato do provedor de
WhatsApp descrito em `EXTERNAL_SETUP.md` §3.1.

Validação da fatia: 3 testes de UI direcionados, suíte completa com 978 testes
em 77 arquivos, lint, typecheck, build Next.js com 35 rotas e OpenNext Cloudflare
limpos. O servidor local segue acessível em `localhost:3000`; inspeção visual pelo
navegador embutido não foi possível neste ambiente.

---

## 4.7 Feature em andamento — Formulários digitais (09/08/2026)

**Builder e coleta local concluídos; ativação do banco pendente.** `/formularios`
possui um modelo versionável, com tipo, descrição, status, campos ordenáveis,
obrigatoriedade, ajuda e opções para respostas fechadas. A rota
`/formularios/[formId]/responder` permite escolher paciente ativo, salvar
rascunho e enviar uma resposta de formulário publicado. A camada vertical inclui
`20260809_clinic_forms.sql`, policies RLS, domínio, adapters Supabase
tenant-scoped, actions com `clinic.settings`/`patient.write`, auditoria e estados
de erro/loading/empty.

O item permanece desabilitado até a migration ser aplicada e
`npm run db:types` ser executado. A tabela de respostas já está preparada na
migration. Respostas ficam vinculadas a formulário, paciente e clínica; os campos
de assinatura/upload permanecem bloqueados até Storage e assinatura eletrônica
serem configurados. Vínculo com consulta, autosave entre sessões e histórico de
respostas serão fatias posteriores — não são apresentados como se já funcionassem.

Validação desta fatia: 10 testes direcionados, suíte completa com 988 testes em
81 arquivos, lint, typecheck, build Next.js com 37 rotas e OpenNext Cloudflare
limpos. O servidor local segue acessível em `localhost:3000`; inspeção visual pelo
navegador embutido não foi possível neste ambiente.

---

## 4.8 Feature em andamento — Estoque (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** `/estoque` possui
cadastro e edição de itens, SKU, unidade, estoque mínimo, ativação/desativação,
busca, filtros, cards de saldo, alerta de baixo estoque e histórico recente de
movimentações. Entradas e saídas passam por `record_inventory_movement`, função
Postgres que bloqueia a linha do item, valida saldo e grava o movimento de forma
atômica. Toda entidade inclui `clinic_id`, RLS e referências compostas para
impedir associação cruzada entre clínicas.

O item permanece desabilitado até `supabase/migrations/20260809_inventory.sql`
ser aplicada. Depois execute `npm run db:types`, valide concorrência de saídas e
isolation entre duas clínicas, e só então habilite o item. Compras, fornecedores,
lotes e validade são módulos posteriores; não foram simulados nesta fatia.

Validação desta fatia: 5 testes direcionados, suíte completa com 993 testes em
83 arquivos, lint, typecheck, build Next.js com 38 rotas e OpenNext Cloudflare
limpos. O servidor local segue acessível em `localhost:3000`; inspeção visual pelo
navegador embutido não foi possível neste ambiente.

---

## 4.9 Feature em andamento — Compras e fornecedores (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** `/compras` possui
cadastro, edição e arquivamento de fornecedores, criação de pedido com itens do
Estoque, busca por fornecedor/ID, filtro por status, transições controladas
(rascunho → solicitado → aprovado → pedido enviado), cancelamento e recebimento
parcial ou total.

`supabase/migrations/20260809_purchases.sql` cria fornecedores, pedidos e linhas
com referências compostas por `(id, clinic_id)`, RLS e três RPCs: criação
atômica do pedido, transição de status e recebimento atômico. O recebimento
trava a linha e o item do Estoque, atualiza `current_quantity`, grava
`inventory_movements` e finaliza o status do pedido na mesma transação.

O item continua bloqueado no menu até aplicar primeiro
`20260809_inventory.sql` e depois `20260809_purchases.sql`, regenerar os tipos e
validar duas clínicas, concorrência no recebimento e transições inválidas.
Contas a pagar ainda não são criadas automaticamente: a integração financeira
será uma próxima decisão para evitar duplicidade de lançamentos.

Validação desta fatia: 5 testes direcionados; suíte completa com 998 testes em
85 arquivos, lint, typecheck, build Next.js com 39 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.10 Feature em andamento — Conciliação bancária (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** `/conciliacao`
possui cadastro/ativação de contas, registro manual de entradas e saídas,
busca, filtros por status/tipo, candidatos reais de faturas e despesas e
conciliação com vínculo auditável. O sentido é validado: entradas só apontam
para faturas e saídas só apontam para despesas.

`supabase/migrations/20260809_bank_reconciliation.sql` cria
`bank_accounts`, `bank_transactions` e `bank_reconciliations`, com RLS,
referências compostas por `(id, clinic_id)` e a RPC
`reconcile_bank_transaction`. O vínculo trava a transação, rejeita repetição e
altera o status para `reconciled` sem apagar o extrato.

O item continua bloqueado até aplicar a migration, regenerar os tipos e validar
duas clínicas. A importação automática de extratos não foi simulada: depende de
um provedor bancário que ainda não está configurado; a tela identifica isso
explicitamente e mantém o fluxo manual útil.

Validação direcionada desta fatia: 5 testes; suíte completa com 1003 testes em
87 arquivos, lint, typecheck, build Next.js com 40 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.11 Feature bloqueada — Documentos (09/08/2026)

**Implementação local concluída; ativação do banco e do Storage pendente.**
`/documentos` possui catálogo tenant-scoped, busca por arquivo/paciente, filtros
por tipo e paciente, upload multipart real, validação de MIME/tamanho, limpeza
de objeto órfão, link de download assinado por 60 segundos e auditoria de envio
e download. O modo demonstração não fabrica arquivos pessoais.

`supabase/migrations/20260809_patient_documents.sql` cria (ou prepara) os
metadados de `patient_documents`, RLS, chave composta paciente-clínica e o
bucket privado `patient-documents`, com policies de Storage limitadas ao
primeiro segmento `clinic_id` do caminho.

O item só deve ser considerado ativo depois de aplicar a migration, regenerar
`database.types.ts`, validar o bucket e testar duas clínicas. A URL assinada
não é persistida nem exposta em logs; o Storage continua sem `service_role` no
frontend.

Validação direcionada desta fatia: 5 testes; suíte atual com 1008 testes em 89
arquivos, lint, typecheck e testes de rotas/revalidação limpos. Build completo e
OpenNext serão executados antes do commit. A inspeção visual pelo navegador
continua indisponível neste ambiente.

---

## 4.12 Feature completa — Insights proativos (09/08/2026)

`/insights` agora é uma camada de leitura sobre o reporting existente. O motor
gera sinais para fila aguardando, taxa de faltas, desaceleração de novos
pacientes, pressão de cancelamentos e concentração de agenda. Cada insight
exibe a fonte da métrica e leva para a rota operacional correspondente.

Os critérios são puros, testáveis e explicáveis; não há número aleatório,
modelo de IA sem provedor ou recomendação clínica. Quando não existe volume
suficiente, a tela mostra estado vazio em vez de acusar um problema. A rota
respeita `report.read` e o isolamento tenant-scoped do repositório de reporting.

Validação direcionada desta fatia: 4 testes; suíte completa com 1012 testes em
91 arquivos, lint, typecheck, build Next.js com 42 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.13 Feature bloqueada — Tags administrativas de pacientes (09/08/2026)

**Implementação local concluída; ativação do banco pendente.** A ficha 360 em
`/pacientes/[patientId]` agora possui painel para criar, listar e remover tags
administrativas. O nome é normalizado pelo schema, a cor usa vocabulário fechado,
as ações usam o pipeline tenant-scoped e a RLS/RPC da migration, e o modo demo
não inventa tags pessoais.

`supabase/migrations/20260809_patient_tags.sql` cria catálogo e vínculos com
chaves compostas por clínica, policies RLS, índice case-insensitive e a RPC
idempotente `add_patient_tag`. O item só deve ser considerado ativo depois de
aplicar a migration, regenerar `database.types.ts` e validar duas clínicas.

Validação direcionada desta fatia: 7 testes; suíte completa com 1019 testes em
93 arquivos, lint, typecheck, build Next.js com 42 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.14 Correção de ficha 360 — Observação administrativa (09/08/2026)

O campo `patients.admin_notes` já era persistido e editável pelo cadastro, mas a
ficha live descartava o valor e renderizava uma lista vazia; apenas o modo demo
mostrava observações. A rota agora exibe o texto salvo, normaliza espaços laterais
e identifica claramente que ele é administrativo, sem misturá-lo ao prontuário
clínico versionado.

Quando a clínica não possui observação, a ficha mostra estado vazio. O fallback
de demonstração continua separado e mantém seus dados de exemplo declarados.

Validação direcionada desta correção: 2 testes; suíte completa com 1021 testes em
94 arquivos, lint, typecheck, build Next.js com 42 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.15 Feature de busca — Pacientes inline na Command Palette (09/08/2026)

O campo de busca do cabeçalho e o atalho `Ctrl/Cmd + K` agora consultam pacientes
ativos de forma real após dois caracteres, usando a Server Action existente e a
RLS da clínica ativa. A consulta aguarda 250 ms, cancela respostas obsoletas e
exibe somente id/nome; selecionar o resultado abre diretamente a ficha 360.

O comando de abrir a lista filtrada `/pacientes?q=…` continua disponível como
fallback. No modo demonstração não há consulta nem resultado pessoal fictício.
Atendimentos, prontuários, cobranças e guias permanecem declaradamente fora da
busca porque ainda não possuem contrato de pesquisa por nome.

Validação direcionada desta fatia: 2 testes; suíte atual com 1023 testes em 94
arquivos, lint, typecheck, build Next.js com 42 rotas e OpenNext Cloudflare
limpos. A inspeção visual pelo navegador continua indisponível neste ambiente.

---

## 4.16 Correção de navegação — Contexto do header por rota (09/08/2026)

O header deixa de cair no título genérico “Dashboard” em rotas que já existiam,
mas não tinham entrada no mapa de contexto. Indicadores, Recepção, Display,
CRM, Inbox, Conciliação, Estoque, Compras, Insights, Tarefas, Documentos,
Formulários, Assinaturas, Auditoria e Salas agora exibem título e descrição
correspondentes, preservando o comportamento compartilhado de navegação.

Validação desta correção: matriz de comandos com 36 testes, lint, typecheck,
build Next.js com 42 rotas e OpenNext Cloudflare limpos. O servidor local
continua acessível em `localhost:3000`; inspeção visual pelo navegador embutido
continua indisponível neste ambiente.

---

## 4.17 Notificações operacionais da agenda (09/08/2026)

O centro de notificações deixou de ser somente uma leitura passiva. O contrato
do repositório agora persiste avisos para o usuário autenticado, e o pipeline de
mutação ganhou `afterSuccess` best-effort para efeitos derivados que não podem
desfazer a operação principal.

Criar, remarcar e cancelar um agendamento registram um aviso com link para
`/agenda`, data/hora em `America/Sao_Paulo` e apenas o nome do paciente. Motivos,
observações e texto clínico não entram no aviso. A policy
`notifications_insert_own_user` exige simultaneamente a clínica ativa e
`auth.uid()`, mantendo o isolamento da escrita.

Validação desta fatia: 3 testes adicionais (1026 em 94 arquivos), lint,
typecheck, build Next.js com 42 rotas, smoke HTTP de `/login` (200) e árvore Git
limpa. A migration individual e o bloco `APLICAR_TUDO_20260809.sql` ainda
precisam ser executados no projeto Supabase remoto.

---

## 4.18 Notificações da recepção (09/08/2026)

Os eventos operacionais da fila agora usam o mesmo produtor persistente do
centro de notificações: check-in, chamada, início e encerramento geram avisos
para o usuário que realizou a ação, com link para `/atendimentos` e horário no
fuso `America/Sao_Paulo`. O motivo informado na chegada não atravessa o DTO nem
entra no aviso.

Validação desta fatia: 2 testes direcionados para os contratos de agenda e
recepção; suíte completa com 1028 testes em 95 arquivos, lint, typecheck e build
Next.js com 42 rotas limpos. A migration de inserção própria de notificações
continua pendente no Supabase remoto.

---

## 4.19 Auditoria de leitura sem ruído de prefetch (09/08/2026)

O carregamento de `/prontuarios` não registra mais `record.read` quando o Next
está apenas fazendo prefetch por hover ou viewport. A navegação real continua
registrando a leitura de forma best-effort; se a leitura dos headers falhar, o
guarda assume acesso para não silenciar uma trilha legítima.

Validação desta correção: 7 testes, suíte atual com 1035 testes em 96 arquivos,
lint, typecheck e build Next.js com 42 rotas limpos.

---

## 4.20 Redirecionamento privado compatível com Cloudflare (09/08/2026)

O layout autenticado voltou a cumprir o contrato de navegação: sessão anônima
recebe redirect HTTP 307 para `/login`, em vez de uma resposta 401 inline de
`unauthorized()`. Isso mantém a proteção server-side sem reintroduzir o proxy
Node incompatível com OpenNext/Cloudflare Workers.

Smoke local validado em `/dashboard`, `/pacientes` e `/agenda` (307) e `/login`
(200). O build Next.js e `npx opennextjs-cloudflare build` passaram, gerando o
worker em `.open-next/worker.js`.

---

## 4.21 Notificações financeiras (09/08/2026)

Cobranças criadas, pagamentos registrados, cobranças canceladas, contas a pagar,
abertura/lançamentos/fechamento de caixa agora geram avisos persistidos para o
usuário que executou a operação, com link para `/financeiro`, paciente quando a
operação o devolve e valor formatado em BRL. Descrições dos itens, observações e
motivos não entram no aviso.

Validação desta fatia: 4 testes direcionados, suíte com 1041 testes em 97
arquivos, lint, typecheck, build Next.js com 42 rotas e OpenNext Cloudflare
limpos.

---

## 4.22 Busca global de agendamentos (09/08/2026)

A Command Palette agora consulta agendamentos reais por nome do paciente a partir
de dois caracteres. A busca passa por uma Server Action com `appointment.read`,
RLS e limite de resultados; o repositório primeiro encontra pacientes ativos no
tenant e depois carrega apenas agendamentos não cancelados/não comparecidos.
Cada resultado exibe paciente e data/hora local e retorna para `/agenda`. O DTO
não expõe observações, dados clínicos ou detalhes além do necessário para a
seleção.

Foram adicionados schema, estados de loading/erro, debounce, testes do repositório
Supabase e teste de integração da paleta. Prontuários, cobranças e guias seguem
explicitamente fora da busca até existir um contrato de consulta próprio.

Validação desta fatia: suíte com 1041 testes em 97 arquivos, lint, typecheck,
build Next.js com 42 rotas e OpenNext Cloudflare limpos.

---

## 4.23 Consistência do cabeçalho do dashboard (09/08/2026)

O dashboard deixou de renderizar um segundo sino desabilitado no cabeçalho da
página. O centro real de notificações já pertence à casca autenticada e aparece
uma única vez no `AppHeader`; remover a duplicidade evita dois controles para a
mesma função e elimina a affordance falsa. O texto da busca global também foi
atualizado para mencionar pacientes e agendamentos, que são as buscas reais
disponíveis hoje.

Validação desta fatia: suíte com 1041 testes em 97 arquivos, lint, typecheck e
build Next.js com 42 rotas limpos.

---

## 4.24 Preferência de avisos operacionais (09/08/2026)

Configurações agora expõe e persiste o controle “Receber avisos de agenda,
recepção e financeiro”. O valor vive em `clinic_settings.notification_prefs`,
passa por schema Zod e action com `clinic.settings`, é auditado e revalida a
tela. A leitura é defensiva: JSONB ausente ou inválido mantém avisos ligados.

Os produtores de agenda, recepção e financeiro consultam a preferência antes de
criar novos avisos; o histórico já criado não é apagado quando a clínica opta
por silenciar eventos futuros. O padrão de demonstração também permanece
explícito e não promete persistência.

Validação desta fatia: suíte com 1046 testes em 97 arquivos, lint, typecheck,
build Next.js com 42 rotas e OpenNext Cloudflare limpos.

---

## 4.25 Busca global de cobranças (09/08/2026)

A Command Palette agora pesquisa cobranças reais pelo nome do paciente quando o
usuário possui `invoice.read`. A Server Action consulta primeiro pacientes ativos
no tenant e depois carrega suas cobranças, devolvendo somente id, paciente,
valor, valor pago, status e data de criação. O resultado retorna para
`/financeiro`; nenhuma observação financeira ou dado clínico entra no DTO.

O contrato inclui limite, debounce, sanitização do termo, loading/erro, mock
explícito para demonstração e testes do repositório, schema e componente. A
paleta continua declarando que prontuários e guias não possuem busca por termo.

Validação desta fatia: suíte com 1050 testes em 98 arquivos, lint, typecheck,
build Next.js com 42 rotas e OpenNext Cloudflare limpos.

---

## 4.26 Cofre seguro de integrações (09/08/2026)

**Concluído:** a tela `/configuracoes` agora possui um painel real para
credenciais operacionais de Brevo, Evolution API, DeepSeek, Google Calendar e
Outlook Calendar. A action usa `clinic.settings`, resolve tenant pela sessão,
valida os campos com Zod, cifra o payload com AES-GCM no servidor, persiste no
Supabase com RLS owner/admin e registra auditoria sem valores sensíveis.

O painel nunca recebe o payload salvo: após a gravação, limpa os campos e mostra
somente o status e a data. Estados de demonstração, migration ausente, servidor
indisponível e falta de `INTEGRATION_ENCRYPTION_KEY` ficam explícitos. Tokens de
GitHub, Cloudflare, Coolify/VPS e Hostinger foram deliberadamente excluídos por
serem secrets de infraestrutura, não credenciais de uma clínica.

**Pendente externo:** aplicar `supabase/migrations/20260809_integration_credentials.sql`
e configurar `INTEGRATION_ENCRYPTION_KEY` em cada ambiente. O cofre não marca
provedores como conectados enquanto os adapters de envio, OAuth, webhook ou
worker ainda não existirem.

Validação desta fatia: 1064 testes em 100 arquivos, lint direcionado, typecheck,
build Next.js com 42 rotas e OpenNext Cloudflare limpos.

---

## 5. Vitrines — nenhuma resta

`src/modules/workspace/ui/OperationsScreens.tsx` tinha **11 telas** com dados
escritos no arquivo. **O arquivo não existe mais**, que era o critério de saída
dele. Oito telas saíram com suas fatias; as três últimas saíram com o módulo
`integrations`.

| Tela | Vira | O que a rota mostra hoje |
|---|---|---|
| `WhatsappScreen` | W-01 | Estado do canal lido de `whatsapp_channels`, e o que falta para conectar |
| `ChatIaScreen` | AI-01..07 | Que nenhum provedor está configurado, e a regra P9 declarada antes do recurso |
| `AutomacoesScreen` | AU-01 | Regras reais de `workflows`, e que **nada as executa** |

**As features continuam BLOQUEADAS** — não há worker, provedor de WhatsApp,
provedor de IA nem executor de automação, e agora elas têm linha própria na §6
com o motivo e o caminho de saída. O que mudou é que as telas dizem isso em vez
de simular um canal ligado. A vitrine de automações era o caso mais grave: o
interruptor funcionava, mudava para "ativa", e não ligava nada — uma clínica
confiaria que o lembrete de consulta estava saindo.

**Tentativa de destravar W-01 pela fundação local, em 08/08/2026: descartada.**
A avaliação está em `EXTERNAL_SETUP.md` §3.1, e o resumo é que as três peças
candidatas (contrato do provider, porta de fila com envelope de evento, validação
de `provider_config`) nasceriam **sem chamador**: a primeira adivinharia uma API
externa não verificada, a segunda precisa de uma decisão de infraestrutura que
não foi tomada, e a terceira validaria uma coluna que nenhuma linha do código lê
ou escreve. Nenhum código foi alterado — abstração sem chamador é dívida com cara
de progresso.

---

## 6. Bloqueios reais, e o que cada um custa

> Atualização: P-P6, P-INV, P-OVL e P-GLO foram resolvidos no banco remoto em
> 08/08/2026. O quadro abaixo mantém os demais bloqueios ainda válidos; as
> referências a essas quatro migrations representam o estado anterior.

**B1 — resolvido para as migrations críticas.** As quatro migrations foram
aplicadas no Supabase e as verificações estruturais retornaram `true`. Ainda não
há credencial administrativa no ambiente local para ler corpos de RPC ou rodar
testes funcionais contra o banco remoto; por isso a aceitação real de um convite
emitido pela aplicação continua sendo uma validação manual pendente.

**O roteiro para sair daqui está pronto e documentado:**
[`docs/supabase-migrations-runbook.md`](./docs/supabase-migrations-runbook.md).
Pré-requisitos, backup, dry-run, ordem por risco crescente, as consultas que
**bloqueiam** cada arquivo, e os testes de tenancy, papel e auditoria depois de
aplicar. Escrevê-lo não desbloqueia nada — quem aplica precisa de acesso ao
projeto Supabase.

| # | Bloqueio | Custo hoje | Como sair |
|---|---|---|---|
| **P-P6** | Policy de `INSERT` de `audit_log` | **RESOLVIDO** — policy aplicada e verificada |
| **P-INV** | RPC de emissão de convite | **RESOLVIDO no banco**; aplicação emite link seguro. Falta apenas aceite funcional com outra conta |
| **P-OVL** | Constraint de exclusão em `appointments` | **RESOLVIDO** — constraint aplicada e verificada |
| **P-GLO** | Tabela e ciclo de glosas | **RESOLVIDO nesta fatia** — registro, recurso, recuperação e aceite persistem |
| **P-RPC** | `issue_invoice`, `close_cash_session`, `preview_professional_payout` com assinatura não resolvida | Sem emissão fiscal numerada e sem repasse a profissional | `select proname, pg_get_function_arguments(oid) from pg_proc where …` |
| **P-WD** | Convenção de `availability_rules.weekday` desconhecida (0–6 ou 1–7) | Sem disponibilidade por profissional na agenda | `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.availability_rules'::regclass` |
| **P-02b** | Índices trigram e coluna de última visita | Filtro "Última visita" fica desabilitado, com o motivo na tela | Diagnóstico em `docs/07-cadastro-de-pacientes.md` §8.11 |
| **W-01** | WhatsApp/Evolution + worker: bloqueado por **aprovação de `docs/04-agente-ia.md`** e por infraestrutura externa (worker, Redis, instância Evolution com credencial) | A clínica não centraliza o WhatsApp. `/whatsapp` mostra o estado do canal e diz o que falta, sem simular conexão | Aprovar o desenho e provisionar worker + Redis + instância. Detalhe em `EXTERNAL_SETUP.md` §3.1 |
| **AI-01..07** | Agente de IA: mesma aprovação pendente, mais provedor de modelo | Nenhuma sugestão e nenhum envio. `/chat-ia` declara a regra P9 antes de existir recurso | Idem W-01, e depois dele |
| **AU-01** | Executor de automações | `workflows` tem regras reais e **nada as executa**; a tela diz isso | Depende de W-01 |
| **P-C2** | `cacheComponents` exige shell estático | **3 segmentos** usam `instant = false` (eram 14, depois 5, depois 4). `/login`, `/recuperar-senha` e `/redefinir-senha` prerenderizam. Os três restantes têm motivo escrito no próprio arquivo e registrado em `src/app/instantOptOuts.test.ts`: dois são portões de sessão que terminam em `redirect`, e convertê-los trocaria um 307 por navegação dependente de JavaScript; o terceiro é a casca autenticada inteira | Depende de mover o portão de sessão para fora da página — não há conversão segura enquanto a decisão de renderizar for a própria página |

---

## 7. Pendente, e nada bloqueia

| Item | Por que ainda não |
|---|---|
| _(vazio)_ | A última pendência local sem bloqueio era a recuperação de senha, entregue como **P-RS** em 08/08/2026. O que resta depende de acesso ao banco ou de integração externa — ver §6 |

---

## 8. O que NÃO existe, e não é esquecimento

Cada item abaixo aparece **declarado na tela**, com o motivo, em vez de um botão
que não funciona:

| Ausência | Onde a tela diz | Por quê |
|---|---|---|
| Emissão fiscal numerada | `/financeiro` | `issue_invoice` com assinatura não resolvida; numeração que pula é problema com a prefeitura |
| Repasse a profissional | `/financeiro` | `professional_payouts` existe, mas a RPC de prévia/emissão ainda não tem assinatura verificável |
| Geração automática de notificações | `/whatsapp`, `/automacoes` | A agenda já produz avisos persistidos para o usuário da ação; produtores de WhatsApp e automações dependem de executor e integrações externas |
| Faturamento nos relatórios | `/relatorios` | Mesma razão: R$ 0,00 é verdadeiro como consulta e falso como informação |
| Elegibilidade junto à operadora | `/convenios` | Exige integração externa; o que existe é a validade cadastrada |
| Marca, IA, fuso horário | `/configuracoes` | Colunas existem, nada as consome — controles seriam recursos falsos |
| Turnos partidos no expediente | `/configuracoes` | Formato guarda um turno por dia, e a tela avisa antes de salvar |
| Disponibilidade por profissional | `/agenda` | Convenção de `weekday` não verificável; adivinhar recusaria agendamento legítimo |
| Escalas de trabalho | `/equipe` | Mesmo `weekday` de `work_schedules`: errar desloca a semana e põe alguém para trabalhar no dia errado |
| Salário e CPF de funcionário | `/equipe` | Colunas existem; o produto não tem folha, e guardá-los agora seria acumular risco sem contrapartida |

---

## 9. Como este documento é mantido

Atualizado **na mesma fatia** que muda o estado — nunca depois. Se uma linha
aqui discorda do código, o código está certo e este arquivo está errado.

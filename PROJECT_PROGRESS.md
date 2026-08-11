# Focuss Care — estado real do produto

> Levantado contra o código em **09/08/2026**, branch `feat/telas-e-camada-supabase`.
> Este documento descreve o que **existe e funciona**, não o que
> está planejado — o plano é o [`docs/roadmap.md`](./docs/roadmap.md).
>
> Regra de preenchimento: uma linha só é **COMPLETO** se a fatia vertical fecha
> (UI → action → caso de uso → repositório → teste) e persiste de verdade.
> Tela bonita sem persistência é **PENDENTE**, não "quase pronto".

**Validação atual (11/08/2026):** 2727 testes em 213 arquivos · `typecheck`,
`lint` (global) e `build` limpos.

**Atualização do banco (09/08/2026):** o schema local foi consultado com
`npm run db:types` e continua expondo 56 tabelas; as migrations de módulos
preparados (CRM, formulários, estoque, compras, conciliação, salas, tarefas,
documentos e cofre de integrações) não aparecem integralmente no schema remoto.
Por isso o menu mantém essas rotas bloqueadas até a aplicação confirmada das
migrations. A última consulta não alterou secrets nem executou DDL remoto.

**Commits desta etapa:** `ee959f8` (queixa principal e vínculo clínico inicial),
`6c536e6` (reparo de policies privadas do Storage),
`7027fcd` e `2c63eee` (gates de autorização), `2f53a01` (testes do repositório
de estoque).

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
| `scheduling` | **COMPLETO** | Criar, remarcar, cancelar, histórico de status, conflito de horário, horário de funcionamento e **reserva opcional de sala** — o campo só aparece quando a clínica tem salas, e `room_id` fica fora do payload quando não há |
| `encounters` | **COMPLETO** | Check-in, fila presencial, chamar, iniciar, encerrar e **sinais vitais** na ficha do paciente — append-only, sem classificação de valores |
| `records` | **COMPLETO** | Prontuário versionado append-only, retificação por nova versão, auditoria de leitura e **prescrições** na ficha — texto livre, append-only, **sem assinatura, emissão ou impressão** |
| `team` | **EM ANDAMENTO** | Vínculos, papéis, revogação, funcionários, ausências e **emissão de convite por RPC** funcionam; escalas seguem ausentes (P-WD) |
| `settings` | **COMPLETO** | Identidade da clínica, horário de funcionamento, duração padrão da agenda e preferência de avisos operacionais |
| `reporting` | **COMPLETO** | Indicadores do dia e do período, atividade recente — só o que há linha para sustentar |
| `billing` | **EM ANDAMENTO** | Cobrança, pagamento, caixa, **contas a pagar com baixa** e **recibo interno por pagamento** funcionam; **emissão fiscal numerada ausente** (RPC bloqueada) |
| `insurance` | **EM ANDAMENTO** | Operadoras, planos, **carteirinhas**, guias com **ciclo completo** (baixa, cancelamento e vencimento derivado) e **glosas com ciclo de recurso** funcionam; elegibilidade externa segue ausente |
| `dashboard` | **COMPLETO** | Cartões, agenda, atividade e **pulso financeiro tenant-scoped**, respeitando `invoice.read` |
| `audit` | **COMPLETO** | Trilha de ações tenant-scoped, filtro por ação/entidade, paginação e RBAC `audit.read` |
| `subscription` | **COMPLETO** | Plano da clínica, estado da assinatura e cotas contadas na hora. **Só leitura**: não há gateway de pagamento |
| `integrations` | **EM ANDAMENTO** | Estado de conexão real, cofre cifrado por clínica, construtor de automações e **biblioteca de modelos de mensagem** (CRUD real, aprovação lida do provedor). **Ainda não envia, não executa, não chama modelo nem sincroniza agenda** |
| `documents` | **BLOQUEADO** | Central de metadados, upload privado, URL assinada e auditoria preparados; migration e bucket ainda não aplicados |
| `catalog` | **COMPLETO** | Catálogo de serviços (com preço omitido no servidor para quem não tem `invoice.read`) e **tabelas de preço** com vigência, tabela padrão única e preço por serviço. Repasse ao profissional segue fora: convenção ambígua no schema |
| `insights` | **COMPLETO** | Alertas operacionais derivados de métricas reais, com fonte, critérios explícitos e links para a ação relacionada |
| `notifications` | **COMPLETO** | Centro por usuário, marcação individual/em lote, avisos operacionais persistidos e preferência de silenciamento por clínica |
| `patient-tags` | **BLOQUEADO** | Tags administrativas tenant-scoped preparadas na ficha 360; migration ainda não aplicada |
| `leads` | **BLOQUEADO** | Pipeline de 7 etapas com CRUD, busca, filtros, eventos de transição e **conversão atômica em paciente** por função do banco. RBAC separado: funil exige `team.read`, converter exige `patient.write`. 54 testes. Migration não aplicada |
| `tasks` | **BLOQUEADO** | CRUD completo com transição de estado auditada em três eventos distintos, filtros por situação/responsável/prazo extraídos para função pura, tenant explícito e 134 testes. Alimenta o Portal do profissional por `listAssignedTo`. Migration não aplicada |
| `rooms` | **BLOQUEADO** | CRUD completo com remoção lógica (`deleted_at`), RBAC `clinic.settings`, tenant explícito e 54 testes. Agenda integrada com reserva opcional por `appointments.room_id`; migration de salas ainda não aplicada |
| `patient-portal` | **EM ANDAMENTO** | Vínculo do paciente por convite (token com hash + prova de e-mail), leitura por função com lista fechada de colunas. **Prontuário nunca entra.** Migration pendente |
| `portal` | **EM ANDAMENTO** | O dia de quem atende: agenda pessoal filtrada no banco por `current_professional_id()`, com "acontecendo agora" e "aguardando encerramento" derivados. **Só leitura, e não tem tabela própria** — é uma visão sobre `scheduling` e `tasks`. O painel de tarefas espera `clinic_tasks` |

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
| `/agenda` | **COMPLETO** | Banco (scheduling + patients + settings) · seletor de paciente busca no servidor, não filtra uma página no navegador · confirmação e desfecho (§8.34) | Membro; buscar paciente exige `patient.read`; confirmar exige `appointment.write` e desfecho exige `appointment.cancel` |
| `/pacientes` e subrotas | **COMPLETO** | Banco (patients + `admin_notes` + patient_contacts + consents); tags administrativas preparadas e aguardando migration | `patient.read`; alterações exigem `patient.write` |
| `/recepcao` | **COMPLETO** | Banco (scheduling + encounters) — quem falta chegar e quem está atrasado, derivado na rota | `encounter.read` |
| `/atendimentos` | **COMPLETO** | Banco (encounters + patients + scheduling) · queixa principal filtrada por papel (§8.36) | `encounter.read`; a queixa exige `record.read`, e escrevê-la `record.write` |
| `/display` | **COMPLETO** | Banco (encounters) — projeta `waiting_queue` para a TV da sala de espera, com nome abreviado | `encounter.read` |
| `/prontuarios` | **COMPLETO** | Banco (records) | `record.read` |
| `/assinaturas` | **COMPLETO** | Banco (subscription) — plano, estado e cotas contadas do uso real | `clinic.settings` |
| `/equipe` | **COMPLETO** | Banco (team) — acesso, convites, funcionários, ausências e cadastro de profissionais (§8.33). Escalas seguem bloqueadas por **P-WD** | `team.read`; escrever exige `team.manage` |
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
| `/portal-profissional` | **EM ANDAMENTO** | Banco (scheduling) — agenda do dia filtrada por `current_professional_id()`, real e funcionando. O painel de tarefas depende de `clinic_tasks` e declara a pendência sem derrubar o resto | `appointment.read`; sem cadastro em `professionals` a tela explica em vez de mostrar zero |
| `/portal-paciente` | **EM ANDAMENTO** | Banco (funções `portal_my_*`), aguardando `20260810_patient_portal.sql`. Fora de `(app)`: o paciente não é membro, e o layout de lá o mandaria ao onboarding | **Sem papel** — o recorte é `portal_patient_ids()` a partir de `auth.uid()`. Quem não tem vínculo recebe explicação, não 403 |
| `/portal-paciente/convite/[token]` | **EM ANDAMENTO** | Pré-visualização por RPC aberta a `anon`; aceite exige sessão **e** e-mail igual ao do convite | Token na URL, `noindex`. Nem token nem e-mail sozinhos liberam o acesso |

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
| Teleatendimento | Removido do escopo do produto por decisão de produto |
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
Supabase e teste de integração da paleta. Naquele momento, prontuários, cobranças
e guias seguiam explicitamente fora da busca; cobranças e guias foram concluídas
em fatias posteriores.

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
explícito para demonstração e testes do repositório, schema e componente. Na
data desta fatia, a paleta ainda declarava que prontuários e guias não possuíam
busca por termo; a busca de guias foi adicionada em §8.41.

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
| **P-WD** | Convenção de `weekday` desconhecida (0–6 ou 1–7) em **duas** tabelas: `availability_rules` e `work_schedules` | Sem disponibilidade por profissional na agenda (A-02) **e** sem escalas de trabalho em `/equipe` (S-02) | `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.availability_rules'::regclass, 'public.work_schedules'::regclass)` |
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
| Agenda seguir a fila de espera (`checked_in`, `in_progress`) | `/agenda`, `/atendimentos` | Quem move o paciente pela fila é `encounters`; carimbar `appointments.status` de lá exigiria um módulo compor o repositório de outro, e nenhum módulo do projeto faz isso hoje. Confirmação e desfecho existem (§8.34); os dois estados do meio, não |

---

## 8.9 Rodada de correções — 10/08/2026

Sete fatias, todas de defeito real encontrado por auditoria. Nenhuma feature
nova, nenhum DDL remoto, nenhuma credencial usada.

### O que estava errado, em ordem de gravidade

**1. `appointment.read` não era exigido em rota nenhuma** (`acc1746`).
A permissão era declarada no item "Agenda" do menu, e o menu não é fronteira.
`finance` é o único papel sem ela, e a matriz diz com todas as letras que ele
não alcança agenda. Na prática, um financeiro convidado só para faturar lia
pela URL a semana inteira da clínica, o histórico completo de qualquer paciente
e as duas seções de agenda da ficha. Quem consulta com quem, quando e de que
tipo é dado de saúde por inferência.

`/pacientes/[patientId]` **não** foi bloqueada: `finance` tem `patient.read` de
propósito, porque sem nome e documento não se emite fatura. As seções de agenda
somem, e a consulta também não acontece — esconder na tela o que já veio no
payload do RSC não esconde nada.

**2. Cancelar atendimento falhava em silêncio** (`83de40b`).
Duas portas para a mesma ação irreversível, e a mais fácil era a
desprotegida: "Cancelar" no menu da lista chamava a action direto, enquanto o
caminho pelo modal exigia confirmação. Pior, `cancelError` era **inalcançável
nos dois caminhos** — o botão chamava a action e fechava o modal na linha
seguinte, sem esperar. O arquivo tinha até um comentário explicando por que a
prop era necessária, sobre um código que nunca a renderizou.

**3. As policies das tabelas novas não verificavam papel** (`062dcc6`).
Oito migrations tinham `using (clinic_id = current_clinic_id())` e mais nada.
Isso isola a clínica e não separa papéis — e a separação por papel não pode
viver só na aplicação, porque o navegador tem a chave publicável e o JWT do
próprio membro. `POST /rest/v1/bank_transactions` com token de recepcionista
teria funcionado. 36 policies corrigidas **antes** de o DDL rodar.

**4. Seis RPCs aceitavam o autor como parâmetro** (`953c739`).
Sem confronto com `auth.uid()`, e com `grant execute to authenticated`. A
aprovação de um pedido de compra ficava registrada em nome de outra pessoa —
falsificação de trilha, que é pior de detectar que vazamento: a linha parece
legítima e a auditoria mente sem nunca ter sido violada.

**5. Cancelar cobrança: um clique, motivo sempre vazio** (`4c84822`).
`reason: ''` fixo no `onClick`, sobre uma action cujo `audit` promete registrar
por quê. Motivo opcional que ninguém pede é motivo que não existe.

**6. Quinze rotas sem `loading.tsx`** (`e988890`).
Mais da metade. Todas fazem de 4 a 6 `await` antes de renderizar, e sem o
arquivo o Next segura a navegação na tela anterior. A falha se parece com
lentidão, e lentidão não tem dono.

**7. Vinte e cinco rotas sem error boundary, e nenhum `not-found.tsx`**
(`aa92cbf`). Apesar de `notFound()` ser chamado. Os dois boundaries que
existiam usavam `reset`, que re-renderiza sem refazer o fetch: o botão "Tentar
novamente" reexibia o mesmo erro.

### Guardas novos

Quatro testes que impedem a reincidência, no estilo de registro-com-motivo que
o projeto já usa:

| Teste | O que prende |
|---|---|
| `src/app/routeGates.test.ts` | Permissão declarada no menu é exigida pela rota, com `forbidden()`. Rota privada sem portão precisa de motivo escrito |
| `src/app/migrationBundle.test.ts` | `APLICAR_TUDO` é o que o gerador produz; policy nova precisa estreitar além do tenant |
| `src/app/routeLoading.test.ts` | Toda rota privada tem `loading.tsx` |
| `src/components/ui/confirm-dialog.test.tsx` | Confirmação não fecha sem sucesso do servidor |

`scripts/build-migration-bundle.mjs` passa a gerar o arquivo combinado, que
antes mandava "gere de novo" sem existir com o quê.

### Acessibilidade

Skip-link para `#conteudo` (a sidebar tem até 31 itens antes do `<main>`);
rótulos de seção da sidebar de 3,15:1 para 5,36:1; `--fc-attention-600` de
3,45:1 para 4,83:1 na pior superfície. `PageSkeleton` anuncia o carregamento
por `role="status"` — antes, como todo `loading.tsx` é feito de `Skeleton`
(`aria-hidden`, corretamente), a página era silenciosa e indistinguível de
erro.

### O que foi apontado e NÃO mudei

**Fechamento de caixa sem confirmação.** Aparecia na lista de ações
destrutivas sem modal, mas já exige contar a gaveta e digitar o valor — e o
comentário do arquivo diz que pré-preencher "transformaria o fechamento em um
clique". Digitar um valor conferido é guarda mais forte que um sim/não.

**Nove outras ações destrutivas sem confirmação** — desativar operadora,
arquivar formulário, cancelar pedido, remover tag, negar ausência, aceitar
glosa como perda, arquivar paciente, encerrar atendimento, desativar conta
bancária. `ConfirmDialog` torna cada uma barata; ficaram para a próxima fatia.

**Contrastes limítrofes**: `border-default` 1,31:1 (WCAG 1.4.11 pede 3:1 para
contorno), badge neutro 4,38:1, `text-muted` sobre `row-hover` 4,46:1. Os três
reprovam por pouco e mexem na identidade visual — é decisão de design, não
correção.

**`CommandPalette`**: `role="listbox"` com `<li>` envolvendo
`<button role="option">` é estrutura ARIA inválida. Funciona na prática.

---

## 8.10 Feature — Portal do profissional (10/08/2026)

`/portal-profissional` sai de `disabled: true` e entra no menu com
`permission: 'appointment.read'`. **Não é `availability: 'setup'`**: a função
principal lê `appointments`, tabela que o banco tem, e funciona hoje.

### O que ela responde, e por que não é `/agenda` com filtro

`/agenda` é a mesa da recepção — mostra a clínica inteira porque quem marca
precisa comparar profissionais para encaixar. Quem atende não usa nada disso e
paga por ele: abre uma grade de cinco colunas, procura o próprio nome, e faz
isso de pé, entre um paciente e outro.

O portal responde uma pergunta só: **o que eu tenho pela frente agora**.

### As três identidades, e o erro fácil entre elas

| Identidade | Origem | Para quê |
|---|---|---|
| Papel | `current_clinic_role()` | Autoriza. `finance` não entra |
| `professionals.id` | `current_professional_id()` | Filtra a **agenda** |
| `profiles.id` | sessão | Filtra as **tarefas** |

Confundir as duas últimas é o erro que não dá erro: `clinic_tasks.assigned_to`
referencia `profiles`, então filtrar tarefa por `professionals.id` devolveria
zero para todo mundo, em silêncio.

### Segurança multi-tenant

Os dois filtros vão ao **banco**, não a um `.filter()` depois:

- `listByProfessionalRange` → `.eq('clinic_id')` **e** `.eq('professional_id')`
- `listAssignedTo` → `.eq('clinic_id')` **e** `.eq('assigned_to')`

A RLS de `appointments` isola a clínica, não a pessoa. Sem a segunda cláusula a
consulta voltaria com a agenda dos colegas e só a tela esconderia — e esconder
no navegador não esconde, porque o payload do RSC continua legível.

### Os três "vazios" que a tela não confunde

1. **Dia livre** — lista vazia legítima. Se já houve atendimentos, o texto muda
   para "nada mais marcado", em vez de dizer que o dia foi vazio.
2. **Sem cadastro de profissional** — um `admin` tem `appointment.read` e entra
   legitimamente. Ele não tem linha em `professionals` porque não atende. A tela
   explica e aponta para `/equipe`; a consulta nem acontece.
3. **`clinic_tasks` ausente** — declarado **só no painel lateral**. A agenda ao
   lado é real, e derrubar o portal por causa dela trocaria uma ausência parcial
   por uma total.

### Um quarto grupo que a primeira versão perdia

`splitDay` começou com `current`/`upcoming`/`finished`, e um atendimento que
começou às 8h e ninguém encerrou não era nenhum dos três — **sumia**. Sumir é o
pior desfecho, porque a ausência se parece com "não havia nada marcado".

O grupo `unclosed` existe para incomodar: nesse estado o atendimento não entra
no faturamento e não libera a sala, e só quem atendeu pode encerrar. Um teste
verifica que a soma dos quatro grupos é o total, com os sete estados do enum.

### Camadas

| Camada | Arquivo |
|---|---|
| Domínio | `portal/domain/ProfessionalDay.ts` — derivação pura, `now` por parâmetro |
| Aplicação | `portal/application/toPortalDto.ts` — DTO serializável, rótulos no servidor |
| Contrato | `portal/schemas/portal.schema.ts` — **sem Zod**: o portal não escreve nada |
| UI | `portal/ui/PortalProfissionalScreen.tsx` — Server Component, sem estado |
| Rota | `app/(app)/portal-profissional/` — composição dos módulos, `+ loading.tsx` |

`portal` não importa o interior de `scheduling` nem de `tasks` (regra 4): a
composição acontece na rota, e o domínio tem um `PortalTask` próprio com os
cinco campos que a tela usa.

### Migration

`20260810_appointments_professional_idx.sql` — **não aplicada**, aditiva, só
cria `(clinic_id, professional_id, starts_at)`. O portal funciona sem ela; só
varre a agenda da clínica inteira a cada abertura. Fica **fora** do
`APLICAR_TUDO_20260809`, que é o lote de outro dia — registrada na tabela §0 do
runbook.

### Testes desta fatia — 42 novos

14 no domínio (partição completa, bordas do relógio, atendimento não encerrado),
6 no `listByProfessionalRange` (os dois filtros no banco, intervalo `[início,
fim)`), 11 no `SupabaseTaskRepository` — que **não tinha teste nenhum** —, e 13
na tela (os três vazios, pendência isolada, cancelado visível).

Corrigido de quebra: o fake de `SupabaseAppointmentRepository.test.ts`
detectava a sonda de sobreposição só por `.lt()`, e as consultas de intervalo
usam `gte` + `lt` — cairiam no ramo errado. Nenhum teste cobria intervalo até
agora, então a ambiguidade nunca tinha aparecido.

---

## 8.11 Feature — Portal do paciente (10/08/2026)

`/portal-paciente` sai de `disabled: true`. O acesso do paciente nasce de um
**convite da clínica**, e não de cadastro público.

### O problema que a arquitetura teve de resolver primeiro

O paciente **não é membro da clínica**: ele tem conta no Supabase Auth e zero
linhas em `memberships`. Isso significa que `getSessionState()` o classifica
como `needs-onboarding`, e a primeira linha do layout de `(app)` faz:

```ts
if (session.status === 'needs-onboarding') redirect('/onboarding')
```

Sob `(app)`, todo paciente seria mandado para a tela de **criar uma clínica**.
Relaxar aquela guarda não era opção — ela é o que impede alguém autenticado sem
vínculo de circular pelo produto. Por isso existe o grupo `(portal)`, com casca
própria: as duas audiências têm regras de acesso **opostas**, uma exige vínculo
de equipe e a outra exige a ausência dele.

### Por que a leitura é por função, e não por policy

RLS filtra linha, não coluna. Uma policy de SELECT em `patients` deixaria o
paciente pedir `select=*` ao PostgREST — com a chave publicável e o próprio JWT
— e ler `admin_notes`, a anotação interna da recepção sobre ele. Em
`appointments` seria `internal_notes`; em `invoices`, `notes` e `cancel_reason`.

A migration **não cria policy em nenhuma tabela existente**. Três funções
`security definer` com lista fechada de colunas entregam o que o portal mostra,
e não há função que alcance `medical_records`.

### As duas provas do vínculo

| Prova | Como | O que impede |
|---|---|---|
| Posse do token | 32 bytes aleatórios; o banco guarda só o sha256 | Quem controla o e-mail mas não recebeu o convite |
| Controle do e-mail | `auth.jwt() ->> 'email'` = e-mail do convite | Quem interceptou o link |

Ligar `auth.users.email` a `patients.email` seria mais simples e estaria errado:
esse campo é digitado pela recepção sem verificação, o mesmo endereço aparece em
vários pacientes, e ninguém prova que o controla.

O token **nunca é gravado em claro** e aparece uma única vez, no retorno da
função que o cria. Quem não copiar precisa de outro — e gerar outro invalida o
anterior (índice parcial único por paciente pendente).

### Decisões de tela que não são cosméticas

- **O paciente DIGITA o e-mail.** Mandá-lo junto do convite transformaria o
  token num revelador de dado pessoal: ele viaja por WhatsApp e papel, e quem o
  interceptasse saberia o endereço mesmo sem conseguir aceitar nada. A máscara
  (`a****@exemplo.com`) confirma para o dono sem dizer qual é.
- **Sucesso e falha do envio dão a mesma frase.** Distinguir faria da página um
  oráculo de quem é paciente daquela clínica.
- **O aceite é botão, não efeito de carregamento.** Criar vínculo permanente
  entre uma conta e o prontuário de alguém dentro de um GET é o que um
  pré-carregador de link dispara sem ninguém pedir.
- **Não há botão de pagar.** Não há gateway, e um PIX inventado seria pior que a
  ausência.
- **A tela diz que o prontuário não está ali.** Quem abre um portal de saúde
  procura o prontuário; não achar e não saber por quê parece tela quebrada.

### Camadas

| Camada | Arquivo |
|---|---|
| Migration | `supabase/migrations/20260810_patient_portal.sql` — 2 tabelas, 8 funções, RLS |
| Shim de tipos | `patient-portal/infrastructure/portalDatabase.ts` — remover após `db:types` |
| Domínio | `PatientPortal.ts` (espelho da lista de colunas), `PatientPortalRepositoryError.ts` (11 razões, cada uma com uma ação diferente) |
| Actions | `createPortalInvite` (via `createAction`, `patient.write`) e `acceptPortalInvite` (**fora** do `createAction`: o paciente não tem clínica ativa) |
| UI | `PortalPacienteScreen` (RSC), `PortalInviteForm` (client, magic link), `PatientPortalPanel` (ficha 360) |
| Rotas | `(portal)/portal-paciente/` + `convite/[token]/`, com loading e error próprios |

### Testes desta fatia — 68 novos

O mais incomum é `portalBoundary.test.ts`, que verifica **ausências** no texto do
SQL: nenhuma policy nas tabelas com coluna interna, nenhuma menção a
`medical_records`, `admin_notes` fora de qualquer select, o e-mail mascarado, e
`preview_patient_portal_invite` como a única função aberta a `anon`. Ausência não
quebra nada quando desaparece — por isso ela precisa de asserção.

### Ainda pendente

Aplicar a migration, e o **envio do convite por e-mail** — hoje a ficha gera e
copia o link, e a clínica manda pelo canal que já usa. Um botão "enviar" que não
envia faria a recepção acreditar que o paciente recebeu.

---

## 8.12 Feature — Salas e recursos, fechada (10/08/2026)

O módulo já tinha domínio, adapter, actions, schema e tela. A auditoria achou
**quatro defeitos**, e três deles eram silenciosos.

### 1. Nada no produto escrevia `deleted_at`

A coluna existia na migration desde 09/08, o adapter a respeitava na leitura
(`.is('deleted_at', null)`), e **nenhum caminho a preenchia**.

Consequência: uma sala criada por engano ficava para sempre. E o nome dela
também — o índice único é `(clinic_id, lower(name)) where deleted_at is null`,
então quem desativava "Sala 1" e tentava criar outra recebia "já existe uma
sala com esse nome" apontando para uma que ele acabara de tirar do ar.

`archive()` fecha isso. **Não é `delete`**: `appointments.room_id` referencia a
linha, e apagar quebraria o histórico de onde cada pessoa foi atendida — que é
por que a migration não cria policy de DELETE.

Na tela, "Remover" só aparece para a sala **já inativa**. Desativar é
reversível e remover não é; pôr as duas lado a lado com o mesmo peso convida ao
clique errado justamente na que não se desfaz.

### 2. A escrita perdia a razão da recusa

`toWriteError` só reconhecia `23505`; todo o resto virava `unexpected`. Isso
tornava **dois ramos de `roomFailure` inalcançáveis por qualquer escrita**:

- com a migration pendente, criar uma sala respondia "não foi possível concluir
  a ação agora" em vez de dizer que a tabela não existe — e a pessoa tentava de
  novo, para sempre, sobre um problema que nenhuma tentativa resolve;
- a recusa da policy virava "erro inesperado" em vez de "você não tem
  permissão", que é a única das duas que diz o que fazer.

A leitura já classificava certo. Era a escrita que jogava a informação fora.

### 3. O contrato da tela afirmava algo falso

`RoomsScreen.props.ts` dizia "já agrupadas e ordenadas **pela rota**". A rota
só fazia `map(toRoomDto)`; o agrupamento era um `reduce` dentro do componente
cliente, com a ordem saindo de um campo `order` no mapa de rótulos.

A frase errada não custava render nenhum. Custava a próxima pessoa, que leria o
contrato e passaria uma lista já ordenada esperando que fosse respeitada.

Agora `toRoomGroups` agrupa no servidor, `ROOM_KIND_ORDER` mora no domínio, e a
ordem tem teste — inclusive o de que **nenhuma sala se perde** e o de que a
lista recebida não é reordenada no lugar.

### 4. A mensagem de nome duplicado não dizia onde procurar

O índice é parcial, então a sala **desativada** continua ocupando o nome. A
mensagem agora diz "inclusive entre os inativos".

### Integração com a agenda — entregue na fatia seguinte

A ligação opcional com a Agenda foi implementada na seção 8.13 e detalhada em
`docs/supabase-migrations-runbook.md` §3.56: seleção de sala ativa na criação,
`appointments.room_id`, nome na grade/detalhes e tratamento de `23P01`.

Enquanto `20260809_rooms.sql` não for aplicada, o cadastro mantém o marcador de
setup e a Agenda degrada sem pedir a coluna ausente. A constraint de
sobreposição por sala só passa a proteger as escritas depois da migration.

### A tela continua `availability: 'setup'`

`20260809_rooms.sql` **não foi aplicada**. Remover o marcador agora prometeria
persistência que o banco não sustenta — a tela declara a pendência, e o botão
de gravar nasce desabilitado com o motivo no `title`.

### Testes desta fatia — 54 no módulo

Domínio (a ordem cobre todos os tipos, sem repetição), aplicação (agrupamento,
ordem, grupo vazio, nada se perde, não muta a entrada), schema Zod (trim,
limites de capacidade, enum, e **nenhum schema aceita `clinicId`**), repositório
Supabase (tenant em toda consulta, `deleted_at` só em `archive`, remoção é
update e nunca delete, e a classificação de erro na escrita) e tela.

---

## 8.13 Feature — a agenda reserva sala (10/08/2026)

Fecha a pendência que a fatia anterior tinha documentado: `appointments.room_id`
existia na migration e **nenhum código o escrevia**.

### O requisito que decidiu o desenho

`20260809_rooms.sql` continua **não aplicada**, e `/agenda` não é
`availability: 'setup'` — ela funciona há meses e não pode parar. Então o
vínculo tinha de ser invisível enquanto a coluna não existir.

Três pontos leem a mesma condição — a clínica tem sala? — e se apagam juntos:

| Ponto | Sem salas | Com salas |
|---|---|---|
| Rota | `rooms.list()` levanta `schema-not-ready` → lista vazia | as ativas |
| Modal | campo **não renderiza** | `<select>` com "Sem sala definida" primeiro |
| `create` | `room_id` **fora do payload** | `room_id` no insert |
| `listByRange` | `select` sem a coluna | `select` com `room_id, rooms ( name )` |

O detalhe que carrega o resto: **`room_id` não vai como `null`**. Seria
equivalente para o Postgres e fatal aqui — citar coluna inexistente faz o
PostgREST recusar o comando inteiro, e marcar consulta pararia para toda
clínica que não usa sala. O mesmo vale para o `select` da agenda, que roda em
toda abertura da tela.

### `room-conflict` é razão própria, e não `conflict`

Conflito de **profissional** é detectado por consulta na aplicação e se resolve
mudando o horário. Conflito de **sala** é detectado pelo banco, na constraint
`appointments_room_no_overlap`, e se resolve trocando de sala — o horário
continua bom.

O adapter separa os dois lendo o nome da constraint na mensagem do `23P01`.
Colapsá-los mandaria a recepção remarcar a consulta inteira para um problema
que um `select` resolve. Sem nome de constraint (driver diferente, versão
futura), cai no conflito genérico, que é a resposta mais antiga e ainda correta.

### Preservado

Todo atendimento criado antes desta fatia continua válido: `room_id` nulo não é
dado faltando, é a maioria. A constraint é `where room_id is not null`, então
nem chega a ser avaliada para eles. `roomId` é opcional na porta, no schema e na
entidade — ausência e `null` significam a mesma coisa.

De quebra, `SelectField` ganhou `hint`, que `TextField` e `TextareaField` já
tinham. A ausência forçava quem precisava explicar um `<select>` a pendurar um
`<p>` solto — fora do `aria-describedby`, ou seja, invisível para leitor de
tela.

### Ainda fora

Trocar a sala de um atendimento já marcado. Remarcar mantém a sala e altera o
horário; a troca deliberada de recurso é uma ação posterior, com suas próprias
regras de conflito e auditoria.

### Testes desta fatia — 44 novos

Schema (ausente, `''` e `null` viram null; UUID inválido recusado) e repositório
(`room_id` fora do payload sem sala, `select` sem a coluna, mapeamento com e sem
sala, e as três formas de `23P01`). O teste que protege o resto é
"não cita room_id no insert quando não há sala".

---

## 8.14 Feature — Tarefas, fechada (10/08/2026)

O módulo já tinha domínio, adapter, três actions, schema com testes, DTO com
testes e tela. A auditoria encontrou **uma lacuna de arquitetura e três buracos
de cobertura**.

### O recorte da lista vivia dentro do componente

`TasksScreen` tinha um `useMemo` com três funções auxiliares no fim do arquivo
— `matchesStatus`, `matchesAssignee`, `matchesDue`. Funcionava, e só dava para
verificar renderizando a tela e lendo o DOM.

O problema não é estético: as **combinações** são o que importa. "Minhas" +
"concluídas" + "esta semana" é a pergunta que a recepção faz na sexta-feira, e
ela é diferente de cada filtro isolado. Cobrir isso pelo DOM sai caro o
bastante para não ser feito — e não estava.

Agora vive em `application/filterTasks.ts`, com 20 testes. Dois deles registram
decisões que estavam implícitas:

- **"Todas" não inclui cancelada.** Cancelada é a decisão de NÃO fazer: não é
  trabalho pendente nem trabalho feito, e contá-la no total faria a lista somar
  coisas que ninguém vai executar.
- **"Minhas" sem sessão devolve nada, e nunca tudo.** O modo de falhar era o
  ramo cair em `return true` e "minhas" passar a significar "de todo mundo" — a
  pessoa agindo sobre tarefa alheia achando que era sua.

`DEFAULT_TASK_FILTERS` passou a ser a única fonte do recorte inicial. Ele
estava escrito em dois lugares (os `useState` e a comparação de
`hasActiveFilters`), e divergir faria a tela abrir já dizendo que há filtros
ativos.

### Cobertura que faltava

| Camada | Antes | Agora |
|---|---|---|
| Domínio (`bucketOf`, `isOpen`) | **nenhum teste** | 11 |
| Repositório | só `listAssignedTo` | +17 (`list`, `create`, `update`, `setStatus`) |
| Action | **nenhum teste** | 16 (`setTaskStatus`, pelo pipeline real) |
| Filtros | inline, não testável | 20 |
| UI | 4 | 9 |

O teste de domínio prende a borda que mais engana: **prazo para hoje não nasce
vencido**. O schema grava às 23:59:59 do dia escolhido justamente para isso, e
nada verificava a outra ponta.

O teste de repositório prende que **reabrir LIMPA `completed_at`** — deixá-la
para trás faria uma tarefa aberta carregar data de conclusão, e qualquer
contagem de "resolvidas no mês" passaria a mentir.

### Um acerto do código que o teste revelou

Eu esperava um único evento `task.status_changed` na auditoria. A action emite
**três**: `task.completed`, `task.canceled` e `task.reopened`. É melhor —
quem lê a trilha não precisa abrir o `after` para saber se a pessoa resolveu ou
decidiu não fazer, e as duas contam diferente em qualquer leitura de
produtividade. O teste passou a verificar a distinção.

### Integração com o Portal do profissional

Intacta. `listAssignedTo` nasceu naquela fatia, filtra por `assigned_to` no
banco e traz só `pending`/`in_progress` — a visão "o que falta eu fazer", que é
diferente da coordenação em `/tarefas`. Nada nesta fatia tocou nesse caminho, e
os 11 testes dele continuam passando.

### O que continua pendente

`20260809_clinic_tasks.sql` **não foi aplicada**, e por isso:

- `/tarefas` mantém `availability: 'setup'` no menu;
- a tela declara a pendência e nasce com a gravação desabilitada;
- o shim `infrastructure/tasksDatabase.ts` continua sendo a fonte dos tipos.

Nada disso é contornável por código: a tabela não existe.

---

## 8.15 Feature — CRM e Leads, fechada (10/08/2026)

O pipeline, o CRUD, a busca e os filtros já existiam. Faltava **a conversão** —
e ela é a única ação do módulo que cria dado clínico.

### O que estava faltando, e por que não era simples

`clinic_leads.converted_patient_id` existia na migration, a entidade tinha
`convertedPatientId`, e **nada preenchia**. Mover o lead para a etapa
"convertido" pela coluna deixaria o funil dizendo que virou paciente sem que
paciente nenhum existisse.

Converter faz três escritas que precisam valer juntas: cria a linha em
`patients`, marca o lead apontando para ela, e registra o evento de etapa.

O detalhe que torna a atomicidade obrigatória em vez de teórica: **`patients`
existe no schema remoto e `clinic_leads` não**. Uma implementação em duas
etapas conseguiria criar o paciente e falhar no lead — deixando **um paciente
órfão**, uma pessoa no cadastro clínico que ninguém pediu e nenhum lead explica.
Isso não é inconsistência técnica: é uma ficha a mais num produto de saúde, que
alguém encontra depois sem saber de onde veio.

Por isso a conversão é uma função no banco (`convert_lead_to_patient`),
adicionada à migration **local**. O teste do repositório verifica a ausência de
`from('patients')` no caminho — o fake lança se a tabela for tocada direto.

### A permissão é `patient.write`, e não `team.read`

As outras três actions pedem `team.read`, porque mexem no funil. Esta cria
ficha de paciente, que é cadastro clínico: quem não pode cadastrar paciente
pela tela de pacientes não pode cadastrar pelo CRM. Manter `team.read` seria
uma porta lateral para o mesmo efeito.

`finance` não converte — e há teste para isso.

### Os três estados do botão

Um botão sempre visível criaria a **segunda ficha da mesma pessoa**, que
ninguém percebe até a recepção achar duas Marias com o mesmo telefone.

| Estado | O que a tela mostra |
|---|---|
| Já convertido | link "Ver ficha do paciente" — nenhum botão |
| Conversível | botão real, que cria paciente de verdade |
| `lost`, sem banco, ou migration pendente | **nada** — nem botão desabilitado |

Botão desabilitado que nunca habilita é promessa vazia. E o sucesso **navega
até a ficha nova**: "convertido" sem mostrar onde o paciente foi parar faria a
recepção procurá-lo na lista para confirmar que existe.

### `already-converted` é razão própria

O segundo clique responderia "falha inesperada" sobre uma operação que já deu
certo — e alguém cadastraria o paciente à mão, duplicando a pessoa. A mensagem
manda abrir a ficha que já existe.

`42883`/`PGRST202` entraram junto com `42P01` no `schema-not-ready`: função
ausente é o mesmo "migration não aplicada" que tabela ausente, e a conversão é
RPC.

### Eventos e integração

`lead_events` já era escrito no `setStage`, e continua. A conversão registra o
evento da transição para `converted` dentro da mesma transação. Nada em
`patients` ou `scheduling` foi alterado — a ficha criada é uma linha comum de
`patients`, com `biological_sex = 'not_informed'`, o mesmo valor que o cadastro
manual usa.

### Testes desta fatia — 54 no módulo

Schema (22, incluindo que a conversão **não aceita dado de paciente** na
entrada), repositório da conversão (8), action (14, com a matriz de papéis) e
tela (10, com os três estados do botão).

### O que continua pendente

`20260809_clinic_leads.sql` **não foi aplicada**: `/crm` mantém
`availability: 'setup'`, a tela declara a pendência, e o shim
`infrastructure/leadsDatabase.ts` segue sendo a fonte dos tipos. A conversão
não tem como funcionar sem a tabela — e a demonstração recusa explicitamente,
em vez de fingir que criou a ficha.

---

## 8.16 Feature — Formulários digitais (10/08/2026)

Builder, CRUD, coleta de resposta, validação e os dois estados de tela já
existiam e persistem de verdade. A auditoria encontrou **um defeito silencioso
e um limite de escopo que precisa estar escrito**.

### `version` era exibida e nunca escrita

`clinic_forms.version` existia na migration, chegava à entidade e ao DTO, e
**nenhum caminho a atualizava**. Ficava em 1 para sempre, e a tela mostrava o
número como se ele significasse alguma coisa.

O que ele significa: `clinic_form_responses.answers` é um objeto chaveado por
id de campo. Uma resposta coletada quando o formulário tinha as perguntas A e B
é lida depois contra as perguntas A e C — e sem a versão ninguém consegue saber
sob qual questionário aquela anamnese foi respondida. Em dado clínico isso não
é detalhe de auditoria: é a diferença entre uma resposta interpretável e uma
resposta órfã.

`update` agora incrementa quando os **campos** mudam, e só então. Renomear ou
publicar não move o número — incrementar ali faria o valor perder o significado
que acabou de ganhar. O `findById` a mais só acontece ao salvar o construtor.

### Resposta pública/convite NÃO é implementável sobre este schema

`clinic_form_responses` exige `patient_id`, não tem token nem expiração, e as
policies exigem papel de equipe. O fluxo que existe é **da equipe**: a rota de
resposta pede `patient.write`, carrega a lista de pacientes, e a recepção
preenche junto com a pessoa. Isso funciona.

Um link que o paciente abre sozinho exigiria tabela de token, RPC
`security definer` com `grant to anon`, e rota fora de `(app)` — o mesmo
desenho do portal do paciente. Afrouxar a policy atual para `anon` abriria
`clinic_form_responses` inteira, que é dado de saúde, para qualquer chamador do
PostgREST.

**Não implementei**, porque o pedido delimitou "o fluxo que o schema local
suporta" e este não é. O desbloqueio está especificado item a item no runbook
§3.59 — quatro passos, com o precedente já no repositório.

### Cobertura

O repositório de formulários não tinha **nenhum** teste. Agora tem 16: tenant
em toda consulta, `findById` de outra clínica devolvendo `null` em vez de erro,
o versionamento nos três casos (campos sobem, renomear e publicar não), e a
tradução de `42P01`/`42501`.

### O que continua pendente

`20260809_clinic_forms.sql` **não foi aplicada**: `/formularios` mantém
`availability: 'setup'`, as duas telas declaram a pendência, e os shims
`formsDatabase.ts`/`formResponsesDatabase.ts` seguem sendo a fonte dos tipos.

---

## 8.17 Feature — Documentos (10/08/2026)

Metadados, upload privado, URL assinada, validação, tenant/RBAC e auditoria já
existiam e são coerentes. A auditoria **não achou defeito** — achou uma
ausência de cobertura sobre o código mais sensível do produto.

### Por que a action de upload merecia teste antes das outras

Ela é a única que constrói **um caminho de arquivo a partir de texto escolhido
pelo usuário**, e mexe em dois sistemas que falham separadamente: o Storage e a
tabela.

Três garantias existiam no código e nada as verificava:

1. **O caminho começa pela clínica da sessão.** A policy do Storage compara
   `(storage.foldername(name))[1]` com `current_clinic_id()` — o primeiro
   segmento não é organização, é a fronteira do tenant.
2. **Nome de arquivo não escapa da pasta.** `../../../etc/passwd` é a forma
   clássica de escrever fora do prefixo; `sanitizeFileName` troca `/` e `\` por
   `-`, e o UUID na frente garante que o nome nunca começa o segmento.
3. **Objeto órfão é removido.** O arquivo sobe **antes** de a linha existir. Se
   a linha falhar, sobra um documento de paciente no bucket que nenhuma linha
   explica e nenhuma tela alcança para apagar.

São 12 testes. Um deles cobre um detalhe que parece cosmético e não é: dois
envios do mesmo nome não colidem, porque `upsert: false` recusaria o segundo —
é o que deixa a recepção mandar "rg.pdf" duas vezes, frente e verso.

Outro verifica que a **auditoria não registra o nome do arquivo**: ele é
escolhido por quem envia e costuma trazer o nome do paciente
("rg-maria-silva.pdf"), e a trilha é lida por mais gente do que quem enviou.

### Não há remoção, e isso é decisão de schema

`patient_documents` não tem `deleted_at` e o repositório não tem `delete`. Ao
contrário de `rooms` — onde a coluna existia e nada a escrevia —, aqui a
ausência é coerente nas duas pontas: documento de paciente é registro, e a
migration não cria policy de DELETE.

### Estado real do desbloqueio

Diferente dos outros módulos bloqueados, este está **parcialmente vivo**:

| Peça | Estado |
|---|---|
| Tabela `patient_documents` | **já existe** no schema remoto |
| Bucket `patient-documents` | **criado** em 09/08/2026, privado |
| Policies de `patient_documents` e de `storage.objects` | **pendentes** — `20260809_patient_documents.sql` não aplicada |

Sem as policies, a leitura e o upload são recusados pela RLS, e a tela declara
a pendência. O item do menu segue `availability: 'setup'`.

---

## 8.18 Feature — Compras (10/08/2026)

Fornecedores, pedidos, recebimento atômico e a integração com estoque já
existiam. A auditoria comparou o código com `20260809_purchases.sql` e achou
**uma divergência entre o que o banco permite e o que a tela oferece**.

### A tela tinha a própria versão da máquina de estados, e ela era linear

O banco define as transições em `transition_purchase_order_status`:

```
draft      → requested, cancelled
requested  → draft, approved, cancelled
approved   → requested, ordered, cancelled
ordered    → cancelled
```

A tela escrevia as regras num mapa de rótulos, com **um único destino por
estado**: `draft → requested → approved → ordered`. Os dois caminhos de volta
não eram oferecidos:

- **`requested → draft`** — devolver para ajuste o pedido que chegou para
  aprovação com a quantidade errada;
- **`approved → requested`** — retirar a aprovação dada por engano.

Sem eles, a única saída de um pedido com problema era **cancelar e refazer**,
perdendo o histórico de quem pediu o quê. Não era botão falso: era capacidade
do schema que a interface não expunha.

Agora `PURCHASE_ORDER_TRANSITIONS` vive no domínio e a tela deriva os botões
dela. O rótulo depende da ORIGEM: o mesmo destino `requested` é "enviar para
aprovação" vindo de rascunho e "retirar aprovação" vindo de aprovado —
"enviar para aprovação" sobre um pedido já aprovado seria a tela contradizendo
o próprio selo de status.

### Duas fontes para a mesma regra, e o que as mantém honestas

Quem **decide** continua sendo o banco; a tabela do domínio decide o que
**mostrar**. `Purchase.test.ts` lê o SQL da migration e compara as duas listas.

Isso protege nos dois sentidos: transição nova no banco que a tela não oferece,
e transição removida do banco que a tela continua oferecendo — esta última
virando um botão que sempre falha.

### `partially_received` e `received` não são escolhidos

São derivados da soma das quantidades pela função de recebimento. Um botão que
os selecionasse na tela diria que a mercadoria chegou sem ninguém ter
conferido — e há teste para a ausência dele.

### "Cotações" não existe no schema

O enum tem `draft`, `requested`, `approved`, `ordered`,
`partially_received`, `received`, `cancelled`. Não há estágio de cotação nem
tabela de propostas de fornecedor: comparar preços entre fornecedores antes de
decidir seria uma fatia com schema próprio. `requested` é solicitação interna,
não pedido de cotação ao mercado.

### Testes desta fatia — 19 novos

12 no domínio (incluindo a comparação com o SQL) e 7 na tela (os dois caminhos
de volta, o verbo correto por origem, e a ausência de avanço manual em
`ordered` e nos estados finais).

### O que continua pendente

`20260809_purchases.sql` **não foi aplicada**, e depende de
`20260809_inventory.sql` vir antes — `purchase_order_items` referencia
`inventory_items`. `/compras` mantém `availability: 'setup'`.

---

## 8.19 Feature — Estoque (10/08/2026)

Cadastro de itens, saldo, entradas/saídas atômicas e a integração com compras já
existiam e estão íntegros — `receive_purchase_order_item` grava o movimento além
de somar o saldo, então o extrato não fica devendo nada ao recebimento. A
auditoria contra `20260809_inventory.sql` achou **três coisas**: uma
funcionalidade ausente, um alerta que mentia e uma mensagem de erro invisível.

### 1. O ajuste por contagem não existia

A tela oferecia entrada e saída; "ajuste" aparecia só como sugestão de texto no
campo de motivo. Quem contasse a prateleira e achasse divergência tinha de
calcular a diferença de cabeça e registrá-la como saída manual.

Fazer essa conta na aplicação seria pior do que não ter o recurso: exigiria ler
o saldo antes de subtrair, e duas contagens simultâneas partiriam do mesmo
número velho — a última sobrescreveria a primeira e o consumo do intervalo
sumiria. É o fluxo "ler → calcular → gravar" que o cabeçalho da própria
migration proíbe.

`set_inventory_quantity` recebe o **saldo contado** e calcula a diferença
depois do `for update`. A action nem aceita `movementType`/`quantity`: a direção
do ajuste é decisão do banco. Contagem igual ao saldo devolve `null` — sucesso
sem movimento, mostrado em `role="status"`, porque conferir um item que está
certo não é erro.

A coluna `counted_quantity` guarda o que foi contado. O ajuste continua sendo
`in`/`out` (a direção do saldo não pode depender de um terceiro tipo), mas sem a
coluna "saíram 3 no atendimento" e "contei e faltavam 3" viram duas linhas
idênticas — e só a segunda responde quanto a clínica perde por quebra.

### 2. Todo item recém-cadastrado nascia em vermelho

O alerta de estoque mínimo era `currentQuantity <= minimumQuantity`, escrito
duas vezes: uma no KPI, outra no selo do cartão. Como `minimum_quantity` nasce
`0` no banco, um item novo sem nenhuma entrada dava `0 <= 0` e aparecia como
**"Abaixo do mínimo"** — acusando violação de um mínimo que ninguém configurou.
Um painel que sempre acusa vermelho é um painel que ninguém olha.

`stockLevelOf` ficou no domínio, e KPI e selo leem a mesma função. Item sem
saldo continua pedindo atenção, mas por **"Sem saldo"**, que é verdade. O KPI
virou "Precisam de reposição" e ganhou um filtro "Repor" — o número existia
desde sempre sem nenhuma forma de listar quais itens eram.

### 3. Falha de gravação ficava atrás do overlay

O bloco de erro vivia no nível da página. Como o Radix marca o resto do
documento com `aria-hidden` enquanto o diálogo está aberto — e as gravações que
falham mantêm o modal aberto de propósito, para a pessoa corrigir sem redigitar
—, a mensagem ficava fora da árvore de acessibilidade e atrás do desfoque.
Clicar "Salvar" e falhar parecia não fazer nada. Vale para item, movimentação,
contagem e desativação.

Agora existe **um** `role="alert"` por vez: na página quando nenhum modal está
aberto, dentro do modal quando há um.

### Também corrigido

`42883`/`PGRST202` (função ausente) não eram traduzidos para `schema-not-ready`
— só os códigos de tabela ausente eram. Aplicar a migration pela metade fazia a
tela mandar "tente novamente" para sempre, numa função que nunca vai existir sem
a migration.

### O que continua bloqueado

`20260809_inventory.sql` **não foi aplicada** — nada rodou em banco remoto.
Enquanto isso, `/estoque` mantém `schemaPending` honesto e toda gravação fica
desabilitada. O desbloqueio está em `docs/supabase-migrations-runbook.md` §3.62,
incluindo o `alter table` para quem já aplicou uma versão anterior do arquivo.

---

## 8.20 Feature — Conciliação bancária (10/08/2026)

Contas, transações manuais, candidatos e o vínculo atômico já existiam. A
auditoria contra `20260809_bank_reconciliation.sql` achou **sete coisas** — uma
de segurança, três de estado mentindo, uma de dado descartado e duas de
cobertura.

### 1. A função era a única do produto sem `search_path` fixo

`reconcile_bank_transaction` não declarava `security invoker` nem
`set search_path = public`. Sem isso, `public.invoices` dentro do corpo passa a
depender do `search_path` de quem chamou — `function_search_path_mutable` no
linter do Supabase. Corrigido na migration, que continua **não aplicada**.

### 2. O filtro "Ignoradas" existia sem nenhuma forma de ignorar

A tela oferecia o filtro e `statusMeta` tinha o rótulo, mas nenhuma action
alcançava o status: o filtro só devolvia lista vazia, sempre. Tarifa,
transferência entre contas da própria clínica e estorno duplicado nunca vão casar
com fatura ou despesa — sem descarte, a fila de pendências só cresce e o número
no topo da tela deixa de significar trabalho a fazer.

`pending` ↔ `ignored` é UPDATE comum, com `.eq('status', <origem>)` no mesmo
comando: quem perder a corrida atualiza zero linhas. `reconciled` fica de fora
nos dois sentidos — ignorar uma conciliada deixaria a evidência de pé apontando
para uma transação que nega ter sido conciliada, e o vínculo não tem DELETE.

### 3. A evidência do vínculo era carregada e jogada fora

`TRANSACTION_SELECT` já trazia `bank_reconciliations` no mesmo SELECT, e a tela
não usava em lugar nenhum: a transação conciliada mostrava um selo verde e mais
nada. Como a conciliação não tem UPDATE nem DELETE, é justamente o dado que mais
precisa ser conferível. Agora a linha mostra com o que casou e por quanto.

### 4. Faturas em rascunho e canceladas entravam como candidatas

`listPayableCandidates` filtrava `paid_at is null`; `listInvoiceCandidates` não
filtrava nada. A RPC também não protege — ela só confere que a fatura existe na
clínica. Casar uma entrada do extrato com uma fatura `canceled` gravaria
evidência de recebimento de um valor que a clínica anulou de propósito, sem
desfazer possível. Restrito a `issued`, `partially_paid`, `paid` e `overdue`.

### 5. "Divergente" não existe no schema — e não foi inventado

A função grava `matched_amount_cents` com o valor **cheio da transação**, nunca
com o da fatura. Casar R$ 500 do extrato com uma fatura de R$ 450 é aceito em
silêncio. Como criar um status `divergente` seria mentir sobre o que está
gravado, a divergência é **derivada** dos dois valores reais e avisada no modal,
*antes* do vínculo — a única hora em que ainda dá para desistir.

### 6. Quatro recusas do banco viravam a mesma mensagem

As quatro chegam como `22023`. Todas diziam "escolha uma fatura ou uma despesa",
inclusive `bank_transaction_already_processed`: quem esbarrasse numa transação
conciliada por um colega trocava de alvo e falhava de novo, indefinidamente — o
alvo nunca foi o problema. Agora `already-processed` e `direction-mismatch` têm
motivo e mensagem próprios. `42883`/`PGRST202` também viram `schema-not-ready`.

### 7. O módulo não tinha teste de repositório

Era o único com uma RPC de quatro recusas distintas e nenhuma cobertura de
adapter. Novo arquivo com 21 testes: escopo de tenant, argumentos da RPC, a trava
do UPDATE por estado de origem e a tradução de cada código.

### Sem Open Finance

A entrada automática de extrato continua sendo um adapter de provedor externo que
não existe. Nenhuma credencial bancária entra no banco nem no código. O núcleo é
registro manual mais `external_id`, cujo índice único por
`(clinic_id, bank_account_id, external_id)` deixa a importação repetível sem
duplicar lançamento quando esse adapter existir.

### O que continua bloqueado

`20260809_bank_reconciliation.sql` **não foi aplicada** — nada rodou em banco
remoto. `/conciliacao` mantém `schemaPending` honesto e as gravações
desabilitadas. Desbloqueio em `docs/supabase-migrations-runbook.md` §3.63,
incluindo o `drop function` para quem já aplicou uma versão anterior.

---

## 8.21 Feature — Inbox de atendimento (10/08/2026)

Diferente das fatias anteriores: `conversations` e `messages` **já existem no
banco aplicado** — não há migration pendente. A auditoria foi contra o schema
real, em `database.types.ts`.

### 1. A Inbox era somente leitura

Não havia nenhuma action no módulo. Status, responsável e contador de não lidas
apareciam na tela e não havia como mexer em nenhum deles: a fila só crescia.
Agora há três actions com `encounter.write`, auditoria e revalidação de `/inbox`.

`markConversationRead` **não audita** de propósito. Quem leu o quê é telemetria
de uso; auditar cada clique afogaria a trilha em ruído. Status e responsável
mudam de quem é a responsabilidade pelo atendimento, e esses são auditados.

A regra `canChangeStatus` vale **na action**, e não só no clique. Ela nasceu só
na tela: quem chamasse a action direto — ou tivesse uma aba aberta com a lista
defasada — passava por fora, e o UPDATE gravava o mesmo status, mexia
`updated_at` e a conversa pulava para o topo sem que nada tivesse acontecido.
Repetido, é uma inbox que se reordena sozinha.

A origem da comparação vem de `findStatus`, no banco, e nunca do cliente. Status
igual devolve `validation` com `statusUnchanged`; conversa inexistente devolve
`not-found` — dizer "já está neste status" mandaria corrigir algo que não
existe.

Essa leitura **não fecha a janela de concorrência**, e não é para isso que
serve: entre ela e a gravação cabe outra pessoa resolvendo a mesma conversa.
Quem fecha é o compare-and-swap — o status lido desce como `from` e vira
condição no `WHERE` do UPDATE (`.eq('status', from)`). Sem ela, duas pessoas
resolvendo a mesma conversa em telas diferentes gravariam as duas, o banco
guardaria só a última, e as duas telas mostrariam sucesso.

Zero linhas afetadas tem três causas, e a releitura traz o `status` para
separá-las — é o que impede um CAS ingênuo de culpar a concorrência por tudo:

| Releitura | Motivo | O que a tela diz |
|---|---|---|
| linha ausente | `not-found` | a conversa saiu desta clínica |
| status diferente de `from` | `stale` → `conflict` | recarregue a lista |
| status **igual** a `from` | `write-forbidden` | falta policy de UPDATE |

O terceiro caso é o que sobrevive do achado 4: a condição batia, então quem
recusou foi o banco e não a corrida.

### 2. O teto de mensagens escondia as conversas mais recentes

`listMessages` buscava as mensagens de até 100 conversas com um teto único de
500 linhas, ordenadas por `created_at` **ascendente**. O teto guardava então as
mensagens mais antigas da clínica inteira: bastavam algumas conversas longas
para consumir as 500 linhas, e as conversas recentes — as do topo da lista, as
com não lidas — chegavam à tela com zero mensagens.

O painel exibia "3 não lidas" ao lado de *"A conversa existe, mas ainda não há
mensagens persistidas para exibir"* — um texto que descrevia o defeito como se
fosse comportamento normal.

Ordem invertida para descendente (o teto passa a descartar o passado distante,
que é o que se pode perder numa conversa) e a ordem de leitura é restaurada em
`groupMessagesByConversation`, função pura que a rota antes fazia à mão e sem
teste.

### 3. A rota não tinha `try`

Qualquer falha do repositório derrubava a página inteira no boundary de erro,
sem dizer o que houve. Agora a falha de leitura vira `loadError` na tela — e
também bloqueia as escritas, porque escrever sobre uma lista que não carregou
não faz sentido.

### 4. Escrita recusada pela policy não podia virar "não encontrado"

`conversations` tem RLS ativa, mas a verificação registrada em
`docs/03-banco-de-dados.md` cobriu **leitura anônima**, não escrita autenticada.
Se não houver policy de UPDATE para o papel, o Postgres não devolve erro: zero
linhas mudam, em silêncio.

O adapter releria a linha depois de um UPDATE sem efeito. Se ela ainda estiver
visível, quem recusou foi a escrita → `write-forbidden`, com mensagem que aponta
para a policy. Se sumiu → `not-found`. Sem isso, a tela mandaria procurar uma
conversa que está bem ali na lista.

### 5. Dois controles com o mesmo nome acessível

O filtro da lista e o seletor do detalhe se chamavam ambos "Responsável" — um
filtra, o outro grava. O filtro virou "Atribuída a".

### 6. Prioridade e notas NÃO foram implementadas

`conversations` tem `status`, `assigned_to` e `unread_count`, e nada mais que a
equipe controle. **Não existe coluna de prioridade nem de notas internas.** Um
seletor de prioridade não teria onde gravar; uma caixa de notas perderia o texto
no primeiro recarregamento. A ausência está registrada no domínio e num teste de
schema, para não voltar como "esquecimento".

### 7. O módulo não tinha teste de repositório nem de schema

Só havia teste de UI. Agora são 44 testes: 15 de repositório (escopo de tenant,
ordem das mensagens, a distinção `write-forbidden`/`not-found`), 4 de
agrupamento, 10 de schema/domínio e 15 de UI.

### Sem WhatsApp

Envio de mensagem continua fora: depende do provedor externo e da ingestão de
eventos, que não existem. O rodapé do detalhe segue dizendo isso, e nenhum botão
de enviar foi criado. O aviso do topo passou a distinguir o que já grava
(status, responsável, leitura) do que ainda depende do provedor.

---

## 8.22 Feature — Automações (10/08/2026)

Como a Inbox: `workflows` e `workflow_runs` **já existem no banco aplicado**.
Não há migration pendente. A tela era só leitura e justificava o vazio com "o
cadastro entra junto com o serviço que vai executá-las". O cadastro entrou; o
serviço não — e a tela continua dizendo isso em toda parte.

### 1. Nenhuma regra executa, e a tela repete isso em quatro lugares

Não há worker. O aviso de bloqueio segue no topo, o selo diz **"marcada como
ativa"** e não "ativa", o modal avisa antes de salvar, e o rodapé explica que
zero execuções não é coincidência. A regra nasce desligada: cadastrar não é
ligar, ainda mais quando ligar não liga nada.

Isto é a memória de um defeito antigo — a vitrine que tinha um interruptor que
mudava de posição e não ligava nada. O CRUD novo não podia recriá-lo.

### 2. O vocabulário é fechado porque as colunas são `jsonb`

`trigger_config`, `conditions` e `actions` aceitam qualquer coisa no banco. Um
campo de JSON livre no formulário transformaria a tela num canal para gravar
estrutura arbitrária no tenant — que o worker futuro leria como instrução.

Os três têm união discriminada em Zod, sem `passthrough`. Chave desconhecida é
descartada; tipo de ação inventado (`send_whatsapp`, `http_request`,
`run_prompt`) é recusado.

**Só ações internas**: notificar a equipe e abrir tarefa. Nada que saia da
clínica entra no vocabulário, porque cada saída depende de um adapter que não
existe — oferecer a opção seria prometer um envio que nunca acontece.

### 3. A leitura reconstrói o JSON pelo mesmo schema da escrita

Linha gravada por fora da aplicação (console do Supabase, script, worker futuro)
pode ter forma que a tela não conhece. `safeParse` descarta o que não casa em
vez de exibir cru. Configuração ilegível cai em `event`, a única forma sem
parâmetro — chutar `{ hoursBefore: 24 }` colocaria no formulário um número que
ninguém configurou, como se fosse escolha da clínica.

### 4. A rota não checava papel nenhum

Qualquer papel abria `/automacoes`. Automação é configuração da clínica: agora
exige `clinic.settings` para ler e para escrever, a mesma permissão que muda
horário de funcionamento.

### 5. `loadRules` engolia erro e devolvia lista vazia

No `overview`, uma recusa de policy ou queda de rede renderizava como "nenhuma
regra cadastrada" — indistinguível de uma clínica sem automação. A nova leitura
tem repositório próprio, e a falha vira `loadError` na tela.

### 6. Escrita recusada e exclusão com histórico

Mesmo padrão da Inbox: zero linhas afetadas com a regra ainda legível vira
`write-forbidden` apontando a policy ausente, não `not-found`. E `23503`
(`workflow_runs` referencia `workflows`) vira `has-runs`, com mensagem mandando
**desativar** — apagar uma regra com histórico apagaria a evidência do que
rodou. Hoje não há execução nenhuma, mas a recusa já está traduzida.

### O que continua bloqueado

Não sei se existe policy de `UPDATE`/`DELETE` em `workflows` — não consultei o
banco remoto. Se não existir, as escritas devolvem a mensagem apontando a policy
em vez de fingir que a regra sumiu. A query de verificação está no
`docs/03-banco-de-dados.md` §7, junto com a de `conversations`.

Executor, worker, WhatsApp, webhook e IA continuam fora — nenhum foi
implementado, e o vocabulário de ações foi desenhado para não os pressupor.

---

## 8.23 Auditoria — Escalas de trabalho (10/08/2026)

**Nenhuma escala foi escrita.** A convenção de `work_schedules.weekday` não pôde
ser provada, e essa era a condição para implementar.

### O que foi procurado, e onde

| Fonte | Resultado |
|---|---|
| Migrations em `supabase/migrations/` | `work_schedules` não é criada por nenhuma — a tabela é do schema original, aplicado direto no banco |
| `supabase/seed.sql` | 36 linhas, não toca a tabela |
| `database.types.ts` | `weekday: number`. Tipos gerados não carregam `CHECK` |
| Consultas existentes | **nenhum código lê ou escreve `work_schedules`** |
| `docs/03-banco-de-dados.md` | cita o nome da tabela, e nada sobre a convenção |
| Runbook §4.3 / roadmap / EXTERNAL_SETUP | registram a consulta como **ainda não respondida** |

A única convenção provada no produto é a de `lib/clinic/business-hours.ts` —
ISO-8601, `1 = segunda … 7 = domingo`. Ela **não serve de prova**: descreve um
`jsonb` que a própria aplicação define e escreve, em outra tabela. Nada garante
que quem criou `work_schedules` usou o mesmo critério, e `extract(dow)` do
Postgres — o padrão mais provável para um `integer` de dia da semana — começa em
domingo = 0. As duas hipóteses diferem em um dia.

### O que foi feito no lugar

**1. A decisão virou teste.** `src/modules/team/workScheduleBlocked.test.ts`
falha se qualquer código passar a ler ou escrever `work_schedules`, ou se a
porta do repositório ganhar método de escala. A decisão estava escrita em quatro
lugares e nenhum deles impedia nada: uma fatia futura encontraria a tabela
pronta no `database.types.ts` e o caminho de menor resistência seria usá-la.
Agora quem quiser fazê-lo precisa apagar o arquivo — que é onde está a consulta
que resolve o bloqueio.

**2. O bloqueio estava mal-escopado.** `P-WD` era descrito como convenção de
`availability_rules`, com uma consulta que cobria só essa tabela — aqui e no
`EXTERNAL_SETUP.md`. Mas `work_schedules` tem constraint própria: quem rodasse a
consulta documentada responderia pela agenda e concluiria, errado, que as
escalas também estavam liberadas. As duas fontes passaram a nomear as duas
tabelas. O runbook §4.3 já cobria as duas.

**3. A mensagem da tela passou a dizer como sair.** Ela explicava bem o motivo e
não apontava saída nenhuma. Quem lê é `owner` ou `admin` — quem tem acesso ao
painel do Supabase e pode responder a consulta. Agora ela vai junto do texto.

### O que NÃO foi feito, e por quê

Um guard de salário/CPF foi escrito e **descartado**:
`SupabaseTeamRepository.staff.test.ts` já prova o que importa, e prova melhor —
que as colunas não entram no `select` e que o `insert` não as carrega. A versão
por texto acusaria os próprios comentários que documentam a ausência.

---

## 8.24 Feature — Alergias do paciente (10/08/2026)

`allergies` estava no schema aplicado e **nenhuma linha de código a tocava** —
os únicos resultados no repositório eram os tipos gerados e o nome citado em
`docs/03`. Era a maior tabela aplicada sem nada construído em cima, e sem
dependência externa nenhuma.

### O painel entra na ficha, atrás de `record.read`

A ficha é visível a quem tem `patient.read`, o que inclui `finance` e `admin`. A
matriz é explícita: o que esses dois não alcançam é "agenda, atendimento e
prontuário". Alergia é informação de saúde, então entra na mesma trava —
mostrá-la a `patient.read` abriria uma porta lateral para o dado clínico que
`/prontuarios` protege. Escrever exige `record.write`.

> Que a recepção precise saber de alergia a látex antes de preparar a sala é um
> argumento real, mas mudaria a matriz de permissões do produto. Isso é decisão
> de produto, e não efeito colateral de um painel novo — fica registrado aqui,
> não implementado.

### `severity` não é lida, não é gravada, não é mostrada

A coluna existe e guarda um número. **A escala não pôde ser verificada**: pode
ser 1–3, 1–5, 0–10, e pode crescer para cima ou para baixo. Mesmo bloqueio do
`weekday` de S-02, com consequência pior — a gravidade de uma alergia é
exatamente o que alguém confere antes de aplicar um medicamento, e quem lê "2"
assume a escala que conhece.

Ela fica fora do `select` também, e não só das escritas: ler colocaria o número
no DTO, e número no DTO acaba na tela. A descrição da reação, em texto livre,
sustenta a decisão clínica sem depender de escala nenhuma. A consulta que
destrava está na mensagem exibida no próprio painel.

### Não existe excluir

Uma alergia registrada por engano continua sendo história clínica: alguém
afirmou aquilo, e decisões podem ter sido tomadas com base na afirmação.
"Descartar" usa `is_active` — sai da lista de atenção, permanece visível no
histórico e é reversível. Os dois sentidos são auditados com ações distintas.

### Substância repetida é risco, não duplicata boba

"Dipirona — urticária" e "dipirona — choque anafilático" na mesma ficha deixam
quem lê sem saber qual vale, e a leitura apressada pega a primeira. A
comparação normaliza caixa e espaço, roda **no servidor** sobre a lista lida do
banco, e alcança também as descartadas — reativar a entrada existente preserva
quem registrou e quando. Se o banco tiver índice único, `23505` cai na mesma
mensagem, sem a janela de corrida da checagem da aplicação.

A edição lê a alergia antes de gravar para descobrir a qual paciente ela
pertence: o input traz o id da alergia, não o do paciente, e aceitar um
`patientId` do cliente deixaria alguém apontar a checagem para outra ficha.

### Ficha vazia não afirma ausência

O vazio diz "nenhuma alergia registrada até agora — isso não significa ausência
de alergia". "Sem alergias" seria uma afirmação clínica que ninguém fez.

### Estado

`patients` continua **COMPLETO**; o painel de alergias entra como superfície
nova do módulo, com 43 testes (12 domínio + 16 repositório + 15 UI). Escrita
recusada por policy ausente vira `write-forbidden` apontando `allergies`, como
em `conversations` e `workflows` — a verificação está no
`docs/03-banco-de-dados.md` §7.

---

## 8.25 Feature — Bloqueios e horários extras da agenda (10/08/2026)

`availability_exceptions` estava no schema aplicado e **nada a lia nem
escrevia**. A tabela guardava bloqueios que não bloqueavam coisa alguma.

### Não é o mesmo bloqueio de S-02

`availability_rules` e `work_schedules` guardam `weekday: integer` e continuam
travadas por **P-WD**. `availability_exceptions` é `timestamptz` puro
(`starts_at`, `ends_at`) — **não há convenção a adivinhar**, e foi o que
permitiu construir esta e não aquelas.

### E não é `time_off`

`time_off`, em `/equipe`, é registro de RH sobre `employees`: quem tirou férias,
quem aprovou. Isto é sobre `professionals` e sobre a AGENDA. Uma recepcionista
de férias não bloqueia horário nenhum; um profissional de férias bloqueia. As
duas parecem a mesma coisa de longe, e nenhuma escreve na tabela da outra.

### As duas espécies fazem coisas opostas

`block` fecha uma janela (feriado, férias, manutenção); `extra` abre uma fora do
expediente (mutirão, plantão). As duas são avaliadas na mesma guarda de
`SupabaseAppointmentRepository`, agora `assertWindowIsOpen`:

- **bloqueio recusa**, e a recusa é **definitiva**;
- **extra dispensa** a pergunta de "fora do expediente", desde que cubra o
  atendimento **inteiro** — extra das 19h às 21h não autoriza atendimento que
  termina 22h.

### Bloqueio não é confirmável, e essa é a decisão central

`outside-business-hours` devolve `needs-confirmation` porque é inferência sobre
o horário padrão: encaixe acontece, e proibi-lo faria a recepção registrar hora
falsa. `blocked-window` devolve `conflict` porque é o contrário — alguém digitou
"25/12, clínica fechada". Deixar `allowOutsideBusinessHours` passar por cima
transformaria a decisão num aviso, e o bloqueio existe exatamente para não
depender de alguém lembrar. Para marcar assim mesmo, remova o bloqueio.

A mensagem cita de quem é a agenda e o motivo, montada por `describeBlock` a
partir da própria linha — nunca texto do Postgres.

### Bloquear não move atendimento

Um bloqueio criado por cima de agenda cheia deixaria os atendimentos onde estão,
dentro de uma janela que diz estar fechada, sem avisar ninguém. A action conta
os atendimentos vivos na janela **antes** de gravar e recusa se houver algum.
`extra` não sofre disso: abrir horário não conflita com quem já está marcado.

### `professional_id` nulo é a clínica inteira

A coluna é nullable no banco exatamente para isso. Feriado fecha tudo; férias
fecham a agenda de uma pessoa. Um atendimento sem profissional só é alcançado
pelas exceções de clínica.

### Onde mora, e quem pode

Painel em `/configuracoes`, logo abaixo do horário de funcionamento — é a
exceção a ele. Chega como slot, pelo mesmo desenho do perfil pessoal: exceção é
do módulo `scheduling` e horário é do `settings` (regra 4).

Leitura para todos: saber quando a clínica estará fechada não expõe dado de
ninguém. Escrita exige `appointment.write` — quem marca é quem bloqueia. Exigir
`clinic.settings` deixaria a recepção sem poder fechar a agenda de um
profissional que ligou doente pela manhã, que é quando o bloqueio serve.

### Falha de leitura NÃO libera

Ao contrário do horário de funcionamento, onde configuração indisponível não
pode virar clínica que não agenda. Aqui engolir o erro marcaria em cima de um
bloqueio que existe — e ninguém descobriria antes de o paciente chegar na porta
fechada.

### Estado

`scheduling` continua **COMPLETO** e ganha esta superfície, com 42 testes novos
(19 domínio, 9 integração com o agendamento, 14 UI). Escrita recusada por policy
ausente vira `write-forbidden` apontando `availability_exceptions`; a
verificação está no `docs/03-banco-de-dados.md` §7.

---

## 8.26 Feature — Catálogo de serviços (10/08/2026)

Módulo novo, `catalog`, e rota nova, `/servicos`. `services` estava no schema
aplicado e **nenhuma linha de código a tocava** — assim como `price_lists`,
`price_list_items`, `vitals`, `prescriptions`, `message_templates` e
`clinical_attachments`, todas ainda sem superfície.

### Por que esta, entre as sete

É a de maior alcance: `invoice_items.service_id` aponta para cá e hoje é sempre
nulo, então cada item de fatura é texto digitado na hora — duas pessoas cobrando
o mesmo procedimento escrevem nomes e valores diferentes. `default_duration_minutes`
tem o mesmo papel na agenda, onde as opções são hoje uma lista fixa no código.

E, decisivo: **nenhuma coluna exige convenção adivinhada**. `default_price_cents`
em centavos e `deleted_at` para exclusão lógica são convenções declaradas em
`docs/03`; `default_duration_minutes` traz a unidade no nome. Não há aqui o
problema de `severity` nem de `weekday`.

### O preço é omitido no SERVIDOR, não escondido na tela

A matriz é explícita: "`receptionist` não vê valor nenhum — marcar consulta não
exige saber quanto ela custa". Quem não tem `invoice.read` recebe
`defaultPriceCents: null` de `toServiceDto`: o número **não atravessa a
fronteira**. Mandar o valor e ocultá-lo no CSS o deixaria no HTML e na resposta
da action, ao alcance de quem abrisse o inspetor.

Nome, código, TUSS e duração continuam indo — sem eles a recepção não marca. Por
isso a rota **não** exige permissão: recusá-la a um `professional` o deixaria sem
saber o que a clínica oferece. O que é filtrado é o preço, não o acesso.

**As actions de escrita também filtram.** A primeira versão devolvia
`toServiceDto(service, true)` — preço sempre incluso — com o argumento de que
quem escreve acabou de digitar o valor. O argumento falha em dois pontos:
`clinic.settings` e `invoice.read` são permissões distintas (que hoje andam
juntas por acidente da matriz, não por definição), e as actions são
**exportadas** — quem chama `service.update` direto recebe o registro inteiro,
então bastaria alterar o nome de um serviço para receber de volta o preço dele.
Agora a decisão sai de `can(context.role, 'invoice.read')`, com o papel resolvido
pelo banco.

A auditoria **não** foi degradada junto: `after.price_cents` passou a sair do
INPUT — que é o valor persistido — e não do DTO devolvido. `audit_log` tem a
própria permissão de leitura.

### Desativar e excluir são coisas diferentes

Desativar é operacional e reversível. Excluir grava `deleted_at` — e a linha
**permanece no banco**, porque `invoice_items.service_id` pode apontar para ela:
apagar de verdade deixaria faturas antigas sem saber o que foi cobrado. A
confirmação diz isso em vez de prometer remoção total. O `softDelete` desativa
junto, para que nenhuma consulta futura que esqueça o filtro encontre um serviço
"ativo" que ninguém pode escolher.

### Código repetido é ambiguidade na fatura

O código liga o serviço ao que o convênio e o financeiro entendem; dois iguais
deixam quem fatura sem saber qual valor vale. A checagem normaliza caixa e roda
no servidor sobre a lista lida do banco, ignorando a própria linha na edição. Se
o banco tiver índice único, `23505` cai na mesma mensagem — sem a janela de
corrida da checagem da aplicação. **Nome repetido é permitido**: "Consulta" e
"Consulta (retorno)" convivem.

### Categorias vêm do que está cadastrado

Uma lista fixa — "Consultas", "Exames", "Procedimentos" — seria uma taxonomia
que o produto impõe a clínicas que já têm a delas. O filtro é montado a partir
das categorias em uso.

### O que NÃO entrou

`price_lists` e `price_list_items` (tabelas por convênio, com repasse ao
profissional) continuam sem superfície. São outra tela e outra regra — o preço
base do particular, que é o que `services.default_price_cents` guarda, está
completo. A tela diz isso em vez de sugerir que a tabela de convênio está ali.

A ligação de `invoice_items.service_id` também fica para depois: é mudança na
tela de faturamento, não no catálogo.

### Estado

`catalog` entra como **COMPLETO** para o que a tabela suporta, com 46 testes
(15 domínio, 14 repositório, 17 UI) mais 8 de action cobrindo a fronteira do
preço. Escrita recusada por policy ausente vira
`write-forbidden` apontando `services`; a verificação está no
`docs/03-banco-de-dados.md` §7.

---

## 8.27 Feature — Sinais vitais (10/08/2026)

`vitals` estava no schema aplicado e **nada a tocava**. Painel na ficha do
paciente, módulo `encounters`.

### Por que esta, entre as que sobraram

Reauditei as tabelas ainda sem superfície. `vitals` ganhou por dois motivos, e o
segundo foi decisivo:

- **Valor clínico direto**: a aferição é o que se lê antes de decidir conduta, e
  o histórico é o que mostra tendência.
- **Toda coluna traz a unidade no nome**: `weight_kg`, `height_cm`,
  `temperature_c`, `glucose_mgdl`; pressão em mmHg, frequências por minuto,
  saturação em porcentagem — universais. **Não há convenção a adivinhar**, ao
  contrário de `price_lists` (que tem `professional_share_percent` E
  `professional_share_cents`, sem dizer qual vence) e de `clinical_attachments`
  (que depende do mesmo bucket ainda não provisionado dos documentos).

### A permissão não foi escolhida por analogia

A matriz em `src/lib/auth/permissions.ts` nomeia **"sinais vitais"** ao lado de
check-in e fila, no comentário que abre `encounter.read`/`encounter.write`.
Seguir a declaração explícita do produto é diferente do caso das alergias
(§8.24), onde não havia nada escrito e a escolha por `record.*` ficou registrada
como julgamento meu. As duas decisões são consistentes justamente por isso.

### Nenhum valor é classificado

Faixa de referência depende de idade, condição e diretriz: a pressão "alta" de
um adulto é outra na criança, e a saturação aceitável de um paciente com DPOC
não é a da população geral. **Nada é pintado de normal ou alterado** — seria um
julgamento clínico que este código não tem como fazer e que pareceria oficial. A
tela mostra o valor com a unidade e diz que a leitura é de quem atende.

As faixas do schema **não são referência**, são plausibilidade: existem para
pegar 700 kg e 400 °C. São generosas de propósito — febre de 41 °C, FC de 180 e
saturação de 82 passam, porque recusar medida real é pior que aceitar dígito
trocado.

O **IMC** é calculado e exibido como número: a conta é exata (`kg/m²`). A faixa
não aparece — "sobrepeso" não vale para criança, atleta nem gestante.

### A tabela é append-only, e a aplicação respeita

`vitals` não tem `updated_at` nem `deleted_at`. **Não existe editar nem
excluir** em lugar nenhum do módulo: a medida é de um instante, e corrigir é
registrar de novo. A porta do repositório não expõe os métodos, e há teste que
verifica a ausência — um método ali seria convite para alguém sobrescrever a
aferição original, que é a única prova do que se mediu naquela hora.

Isso também dispensa a distinção `write-forbidden`/`not-found` dos outros
módulos: sem UPDATE não existe o caso de zero linhas em silêncio.

### Regras que o formulário aplica

- **Ao menos uma medida.** Registro só com observação apareceria no histórico
  como "aferição realizada" sem nada aferido.
- **Pressão inteira ou nenhuma.** "120 por nada" não permite calcular média nem
  diferencial, e parece completa na listagem.
- **Diastólica menor que a sistólica.** Invertidas é erro que passa
  despercebido: os dois números são plausíveis isolados.
- **Campo em branco vira `null`, nunca zero** — e não aparece na linha do
  histórico, em vez de virar travessão.
- **Aferição no futuro é recusada** — na action, não no schema: `new Date()` num
  schema o tornaria dependente do relógio no momento da importação.

### O alvo é conferido no servidor, contra a clínica da sessão

`patientId` e `encounterId` chegam do cliente, e as FKs de `vitals` são de
**coluna única**: `patient_id → patients.id`, `encounter_id → encounters.id`.
Elas provam que a linha existe em algum lugar do banco, **não que existe nesta
clínica** — ao contrário das FKs compostas `(id, clinic_id)` usadas nas
migrations locais, que prendem o tenant.

Inserir com `clinic_id` do contexto não bastava: a aferição ficaria com o tenant
certo apontando para o paciente errado — ausente da ficha que deveria mostrá-la
e presente numa que não deveria. A action agora confirma o paciente antes de
gravar, e o atendimento (quando informado) contra **clínica e paciente juntos**:
dentro da mesma clínica, um `encounterId` de outro paciente também passaria pela
FK, e a aferição ficaria pendurada no atendimento de outra pessoa.

As duas consultas de verificação pedem só o `id` — conferir um vínculo não
justifica trazer a ficha para a memória.

A auditoria registra **o que** foi medido (paciente, atendimento, instante), e
não os valores: repeti-los criaria uma segunda cópia de dado clínico numa tabela
com outra permissão de leitura (`audit.read`, que `admin` tem e `record.read`
não).

### Estado

`encounters` ganha esta superfície, com 69 testes: 15 de domínio, 12 de schema,
16 de repositório, 15 de UI e 13 de action — estes últimos cobrindo a guarda de
tenant do parágrafo acima. Nada de `price_lists`, `clinical_attachments`,
`prescriptions` ou `message_templates` foi tocado — seguem sem superfície, e os
motivos estão acima.

---

## 8.28 Feature — Modelos de mensagem (10/08/2026)

`message_templates` estava no schema aplicado, e a tela `/whatsapp` já
**contava** os modelos sem permitir geri-los. O contador virou biblioteca.

### As tabelas que ficaram de fora, e por quê

- `price_lists` / `price_list_items`: têm `professional_share_percent` **e**
  `professional_share_cents` sem nada dizer qual vence — mesma classe de
  `severity` e `weekday`. Convenção ambígua, não implementada.
- `clinical_attachments`: depende do bucket de storage que os documentos ainda
  esperam.
- `prescriptions` / `prescription_items`: prescrição exige cautela clínica que
  esta fatia não comporta — assinatura, validade, impressão.

### Nada aqui envia, e a tela diz isso três vezes

Aviso fixo no topo da biblioteca, texto no modal antes de salvar, e **nenhum
botão de enviar em lugar nenhum** — nem uma action de envio no módulo. Não há
provedor, não há fila. O que a biblioteca resolve hoje é concreto e menor: o
texto padrão que vive num bloco de notas da recepção passa a viver na clínica,
igual para todo mundo. O botão que existe é **copiar**.

### Duas colunas pertencem ao provedor

`is_approved` e `provider_template_id` são preenchidos por quem aprova modelo de
mensagem — a Meta, no caso do WhatsApp Business. A aplicação **lê e nunca
escreve**: o selo mostra "sem aprovação de provedor" e não há controle para
marcá-lo. Um interruptor ali afirmaria uma aprovação que ninguém deu, e o erro
só apareceria no primeiro envio recusado.

`provider_template_id` nem atravessa a fronteira: nada na tela o usa.

### `variables` é derivado do corpo, nunca digitado

A coluna é `jsonb`. Um campo livre faria a tela virar canal para gravar
estrutura arbitrária no tenant — e, pior, a lista digitada divergiria do texto
no primeiro ajuste. As variáveis saem de `{{nome}}` por regex, na escrita **e na
leitura**: linha gravada por fora com lista divergente é ignorada, e a tela
mostra o que o texto realmente usa.

O marcador aceita só letras, números e sublinhado — é o formato que os
provedores processam. E chave aberta e não fechada é recusada: o texto parece
certo no editor e chegaria ao paciente com chaves soltas.

### `language` é fixo em `pt-BR`, e a decisão está no código

A coluna é texto livre e nenhum registro existe para revelar a convenção do
provedor (`pt_BR`, com sublinhado, no WhatsApp Business). Chutar criaria uma
coluna cheia de valores que talvez precisem ser reescritos. Enquanto o produto é
só pt-BR, um seletor seria escolha sem efeito — a constante está no domínio para
que a conversa aconteça quando o adapter existir.

### Estado

**W-01 continua bloqueada.** Esta fatia não a destrava e não muda o status do
módulo `integrations`, que segue **EM ANDAMENTO**: o canal não conecta, nada é
enviado, e o cartão de bloqueio permanece no topo de `/whatsapp`. O que mudou é
que uma parte da tela deixou de ser só contador.

42 testes novos: 13 de domínio, 12 de repositório, 17 de UI.

---

## 8.29 Feature — Prescrições (10/08/2026)

`prescriptions` e `prescription_items` estavam no schema aplicado e nada as
tocava. Painel na ficha do paciente, módulo `records`.

### O que NÃO foi feito, e é a parte que importa

Não assina, não emite receita oficial, não imprime, não gera PDF, não fala com
provedor de assinatura e **não interpreta dose**. Nenhum botão para nada disso —
um que parecesse assinar seria a mentira mais cara que este produto poderia
contar.

`dosage`, `route`, `frequency`, `duration` e `quantity` são `text` no banco e
texto livre na aplicação. Não há enum de via nem unidade de dose: inventar um
obrigaria o profissional a caber numa lista que este código escolheu, além de
dar a impressão de que a aplicação confere a prescrição. Ela guarda o que foi
escrito.

### Quatro colunas pertencem a um emissor que não existe

`signed_at`, `signature`, `external_id` e `external_url` seriam preenchidas por
um sistema de receita com assinatura digital. A aplicação **lê e nunca
escreve**, e o schema Zod as descarta. `signature` e `external_id` nem entram no
`select`: `signature` é `jsonb` de um emissor inexistente, e estrutura
desconhecida no DTO acaba renderizada.

### Três portas antes de gravar

1. **Papel** — `record.write`, a permissão mais restritiva do produto. `admin`,
   `receptionist` e `finance` não alcançam.
2. **Cadastro profissional** — `current_professional_id()`. Quem não tem linha
   em `professionals` não prescreve, mesmo com o papel: `author_id` aponta para
   quem tem conselho, não para um login. `authorId` **nunca vem do cliente** —
   aceitá-lo deixaria alguém prescrever em nome de outro profissional. A tela
   mostra a lista e diz o que fazer, em vez de um botão desabilitado sem
   explicação.
3. **Alvo** — paciente desta clínica; atendimento, quando informado, desta
   clínica **e** deste paciente. As FKs de `prescriptions` são de coluna única e
   provam existência, não tenancy — mesma lacuna de `vitals`.

### Append-only, e a ordem é a que foi escrita

Nem `prescriptions` nem `prescription_items` têm `updated_at` ou `deleted_at`.
Não existe editar nem excluir: prescrição corrigida é prescrição nova, e a
anterior é o que o paciente levou na mão. `sort_order` preserva a sequência
digitada — a receita não é alfabética, e o paciente lê na ordem em que foi
escrita.

### Validade é comparação de data, não conduta

O selo "validade vencida" diz que a data passou. Não diz para suspender: uma
receita vencida pode estar sendo seguida com razão, e uma dentro do prazo pode
ter sido suspensa na consulta seguinte. Sem `valid_until`, nenhum selo — ausência
de prazo não é "válida para sempre".

A action recusa validade que já nasce vencida. Isso não é julgamento sobre o
prazo: a aplicação não opina se trinta dias são muitos ou poucos.

### A auditoria não copia conteúdo clínico

`after` guarda paciente, atendimento e **contagem de itens** — nunca nome de
medicamento, dose ou orientação. `audit_log` tem outra permissão de leitura
(`audit.read`, que `admin` tem e `record.read` não), e copiar a receita para lá
criaria uma segunda via do dado clínico fora da trava que o protege. Há teste
que serializa o evento e verifica que o medicamento não aparece.

### Limitação conhecida: duas escritas, sem função no banco

Não há RPC para criar cabeçalho e itens juntos, e esta fatia **não cria
migration**. São dois `insert`, e uma falha no segundo deixaria a prescrição sem
item. A leitura protege quem lê: a prescrição vazia aparece **como vazia**, com
aviso, nunca como receita completa — e a saída é registrar de novo, que é o
mesmo caminho de qualquer correção nesta tabela append-only.

Uma função no banco resolveria de vez; fica como desbloqueio, e não como algo
que esta camada finge ter.

### Estado

`records` continua **COMPLETO** para o prontuário e ganha esta superfície, com
50 testes: 10 de domínio, 16 de schema, 16 de repositório e 18 de action, mais
17 de UI. Teleatendimento não foi tocado.

---

## 8.30 Feature — Recibo de pagamento (10/08/2026)

Um recibo por **pagamento**, em modal na tela `/financeiro`. Comprovante
interno — e a distinção com documento fiscal é a fatia inteira.

### Não é nota fiscal, e o aviso vai DENTRO do recibo

A emissão fiscal numerada continua bloqueada por **P-RPC**, e o aviso
`issuanceUnavailable` segue no topo de `/financeiro`, intocado. O recibo repete
a distinção em texto próprio (`receiptNotFiscal`), dentro do comprovante: o
aviso da tela de trás não acompanha o papel impresso, e uma clínica que trate
este comprovante como nota deixa de emitir a nota.

**Sem numeração própria.** Numerar comprovante exige sequência sem pulo nem
repetição — o que `document_sequences` garante e esta camada não garante
sozinha. O recibo referencia a cobrança de origem: número fiscal quando houver
(hoje nunca há) e id abreviado quando não.

**Imprime pelo navegador, com folha preparada.** `window.print()` sozinho sairia
com o painel do financeiro atrás e o comprovante cortado no meio da página — o
diálogo é posicionado com `fixed` e `transform`. A regra em `globals.css` faz
duas coisas: esconde a página por `visibility` (e não `display`, que quebraria o
layout dos ancestrais do portal) e neutraliza o posicionamento do diálogo. Só a
subárvore marcada com `data-receipt-sheet` reaparece; os botões saem por
`print:hidden`.

**Não há geração de PDF nem arquivo.** Quem salva em PDF é o próprio navegador,
se quem imprime escolher — este código não gera nada.

### Um recibo por pagamento, não por fatura

O comprovante atesta um valor recebido. Fatura paga em duas vezes rende dois
papéis diferentes, com valor, método e data próprios — e o total de `paid_cents`
sozinho não permite emitir comprovante nenhum.

Foi o que exigiu ler `payments` junto da fatura. **`paid_cents` continua sendo a
fonte do saldo**: nada no recibo recalcula dinheiro, e montar um número novo ali
criaria uma segunda contabilidade ao lado da que `payments` guarda.

### A identidade da clínica é lida na rota, sem o id

`getClinicSettingsRepository` resolve a clínica ativa pelo banco, na rota, e o
que atravessa a fronteira é só `tradeName`, `legalName` e `cnpj`. **O `id` não
vai**: nada no comprovante o usa, e o identificador do tenant não tem por que
ser impresso. Há teste que guarda essa decisão.

`cnpj` **existe** em `ClinicProfile` — não foi preciso adivinhar identificador.
Quando ele está em branco no cadastro, o recibo diz que falta em vez de omitir
em silêncio: quem entrega o papel precisa saber.

Falha na leitura da clínica **não derruba o financeiro**: o recibo informa que
os dados não carregaram, e a tela continua servindo para cobrar e receber.

### Estado

`billing` continua **EM ANDAMENTO** — o recibo não destrava P-RPC e não muda o
que falta. 29 testes novos: 12 de domínio e 17 de UI.

---

## 8.31 Feature — Ciclo da guia de convênio (10/08/2026)

Auditei as sete áreas e escolhi **convênios**: era a maior superfície de escrita
(4 actions, 6 telas) com **zero teste de UI**, e o ciclo da guia estava pela
metade.

### O buraco: três das seis situações eram inalcançáveis

`AuthorizationStatus` tem seis valores. O módulo alcançava `requested`,
`approved` e `denied`. Faltavam:

- **`used`** — guia aprovada e consumida;
- **`canceled`** — desistência, antes ou depois da resposta;
- **`expired`** — prazo vencido.

Uma guia aprovada não tinha para onde ir: a lista de autorizadas crescia para
sempre, sem distinguir a já usada da que ainda vale, e sem forma de desistir de
um pedido que o paciente não voltou para fazer. `used` e `expired` nem tinham
rótulo — apareceriam como o valor cru do enum.

### O que foi fechado, e o que deliberadamente não

`AUTHORIZATION_TRANSITIONS` no domínio: `requested → canceled`,
`approved → used | canceled`. Negada é final (contestar é a glosa; pedir de novo
é guia nova), e `used`/`canceled` não voltam.

**Responder continua separado.** Aprovar exige número e negar exige motivo —
isso é a resposta da OPERADORA, e continua em `answerAuthorization`. Baixar e
cancelar são decisões da CLÍNICA sobre uma guia que já tem, ou já não terá,
resposta. Misturá-las abriria caminho para marcar guia como autorizada sem
número nenhum.

**`expired` não é escrito pela aplicação.** Vencimento é `expires_at` passando —
comparação de data. Gravar o status exigiria um processo diário; sem ele, uma
guia gravada como vencida conviveria com outra vencida e ainda marcada
`approved`, e a lista mentiria de duas formas. A tela deriva o selo na leitura e
o mostra **ao lado** do status gravado, nunca no lugar dele. Só guia aprovada
vence: negada, cancelada ou utilizada já terminaram.

### Concorrência

`transitionAuthorization` usa compare-and-swap, o mesmo padrão que
`answerAuthorization` já usava: `from` é o estado que a tela viu e vai para o
`WHERE`. Duas pessoas mexendo na mesma guia não se sobrescrevem — a segunda não
encontra linha.

### `AuthorizationDto.status` era `string`

Solto, deixava a tela indexar tabelas de estado com qualquer texto, e um status
novo no banco passaria despercebido até alguém notar o valor cru na tela.
Fechado no enum, o typecheck cobra rótulo e transição — foi ele que apontou os
dois rótulos faltando.

### Estado

`insurance` continua **EM ANDAMENTO**: elegibilidade externa segue ausente, e
esta fatia não a destrava. O que mudou é que o ciclo local da guia fechou, e o
módulo deixou de ter zero cobertura de UI — 27 testes novos, 11 de domínio e 16
de tela.

---

## 8.32 Feature — Tabelas de preço (10/08/2026)

Varri as 56 tabelas do schema aplicado procurando as que ainda não têm
superfície. Sobraram sete, e seis estão bloqueadas por coisa externa:
`ai_messages` e `document_embeddings` (IA), `clinical_attachments` (bucket),
`professional_payouts` e `professional_payout_items` (P-RPC). A sétima era
`price_lists` — e a ambiguidade que eu havia registrado estava **só nos itens**.

`price_lists` é inequívoca: `name`, `is_default`, `valid_from`, `valid_until`,
`is_active`. Nada a adivinhar.

### O que isso liga

`services.default_price_cents` é o particular. Uma clínica que atende convênio
cobra valores diferentes pelo mesmo procedimento, e `price_list_items.service_id`
é exatamente esse vínculo — que fecha o catálogo construído em §8.26 com os
convênios de §8.31. Sem tabela de preço, cada valor de convênio vive na cabeça
de quem fatura.

### O repasse ao profissional continua fora, e a tela diz por quê

`price_list_items` tem `professional_share_percent` **e**
`professional_share_cents`. As duas expressam a mesma coisa, nada declara qual
vence quando ambas estão preenchidas, e não há linha gravada que revele a
convenção. Escolher seria adivinhar um número que vira dinheiro no bolso de
alguém — mesma classe de `allergies.severity` e `work_schedules.weekday`.

As duas colunas ficam fora do `select` também, e não só das escritas: lê-las
colocaria no DTO um valor cuja unidade ninguém confirmou, e número no DTO acaba
na tela. A consulta que destrava está na mensagem exibida no painel.

### Uma tabela padrão, e a ORDEM das duas escritas

No máximo uma padrão por clínica: duas deixam quem fatura sem saber qual preço
vale. Não há função no banco para as duas escritas juntas, e esta fatia não cria
migration — então o repositório **limpa o padrão anterior antes** de promover.

A ordem é a proteção: se a segunda escrita falhar, a clínica fica **sem** padrão
— estado visível, que pede uma escolha. A ordem inversa deixaria duas padrão, e
aí ninguém sabe qual vale. Há teste que verifica a sequência.

Tabela nova nasce **sem** ser padrão, mesmo sendo a primeira: promover
automaticamente faria a primeira criada virar a referência de preço da clínica
sem ninguém decidir isso.

### Serviço aparece uma vez por tabela

Dois itens para o mesmo serviço na mesma tabela deixam quem fatura sem saber
qual valor cobrar. O seletor só oferece serviços ainda não precificados, e o
repositório atualiza o item existente em vez de criar um segundo. Entre tabelas
diferentes é o contrário — é para isso que elas existem.

Item removido é apagado de verdade: tabela de preço é configuração, e o que foi
cobrado vive em `invoice_items` com o valor copiado no momento da cobrança.

### Vigência é comparação de data

Tabela fora da janela **continua na lista**, sinalizada — quem fatura um
atendimento antigo precisa dela. E serviço apagado do catálogo não vira item
órfão sem nome: o item continua existindo, e esconder o nome deixaria um preço
que ninguém consegue interpretar.

### Estado

Painel em `/servicos`, abaixo do catálogo, como slot com leitura e falha
próprias — se as tabelas não carregarem, o cadastro de serviço continua
servindo. `catalog` segue **COMPLETO** para o que as tabelas suportam, agora com
98 testes (44 novos: 12 de domínio, 16 de repositório, 16 de UI).

---

## 8.33 Feature — Cadastro de profissionais (10/08/2026)

Reauditei o menu restante varrendo os enums de `database.types.ts` atrás de
valores que nenhum código alcança — é a varredura que mais rende, porque um
enum inteiro sem uso é uma funcionalidade que o banco espera e a aplicação não
oferece. Sobraram `AiFeature`/`AiRole` (IA bloqueada), `MessageStatus.queued`
(sem envio), `WorkflowRunStatus.succeeded` (sem executor), `BiologicalSex` e
**`CouncilType`: oito das nove siglas inalcançáveis** — só `CRM` chegava a
algum lugar, e por acaso.

Puxando o fio: `grep "from('professionals')"` devolve **quatro leitores e
nenhum escritor**. Agenda, prontuário, prescrição e assinatura dependiam de uma
linha que só existia se alguém a inserisse direto no banco.

### O que estava travado

`professionals` é pré-requisito de quatro coisas já construídas:

| Depende | Como |
| --- | --- |
| Agenda | o seletor de profissional lê `professionals` com `is_active = true` |
| Prontuário | `medical_records.author_id` |
| Prescrições (§8.29) | `prescriptions.author_id` + `current_professional_id()` |
| Equipe | a especialidade que aparece ao lado do membro |

A prescrição tinha a porta certa — quem não tem cadastro profissional não
prescreve — e nenhum caminho pela aplicação para atravessá-la.

### Três tabelas diferentes, e a tela é a única pista

`memberships` é ACESSO, `professionals` é quem ATENDE, `employees` é o vínculo
TRABALHISTA. A mesma pessoa pode ser as três, ou só uma: o dentista que atende
sem login é profissional e não é membro; a recepcionista é membro e funcionária,
e não é profissional. O painel novo fica entre o acesso (acima) e o vínculo
trabalhista (abaixo), nessa ordem, porque é o que ele é.

### `user_id` é opcional — e a tela diz o preço disso

`docs/03-banco-de-dados.md` registra que dá para pôr alguém na agenda antes de a
pessoa ter conta. O que ninguém dizia é a consequência: sem `user_id`,
`current_professional_id()` não resolve, e essa pessoa **não assina** prontuário
nem prescrição. A lista sinaliza quem está nessa situação, em vez de deixar
descobrir na hora de fechar um atendimento.

### A guarda de tenant que a FK não dá

`professionals.user_id` referencia `profiles.id` — **coluna única**. Ela prova
que o usuário existe em algum lugar do banco, não que pertence a esta clínica, e
a RLS protege a LINHA (`clinic_id`), não o conteúdo do campo. Sem guarda, um
administrador poderia apontar o cadastro para alguém de fora e dar a essa pessoa
a assinatura clínica daqui.

O servidor confere o vínculo contra `memberships` desta clínica **com status
`active`** — convite pendente ainda não é conta, e acesso revogado não volta a
assinar por um caminho lateral. Mesma classe de buraco fechada em §8.27 (vitals)
e §8.29 (prescrições).

### A cor de agenda fica fora, e é provável, não achismo

`agenda_color` não tem consumidor nenhum: a agenda colore por STATUS do
atendimento, e o tipo que chega até ela (`_shared/domain/types.ts`) carrega só
id, nome e especialidade. Somado a isso, o formato não está declarado em lugar
algum — hexadecimal, token do tema, nome CSS. Um seletor aqui gravaria um valor
que ninguém exibe; a coluna nasce nula e continua nula, e o painel diz por quê.

`default_slot_minutes` é o contrário: `NOT NULL` sem default, então **tem** que
receber valor. Está no formulário com o rótulo honesto de que a agenda ainda não
o aplica sozinha.

### Não há exclusão, e desativar é ação própria

`medical_records.author_id` e `prescriptions.author_id` apontam para cá: apagar
o profissional apagaria autoria de prontuário, que tem prazo legal de guarda. A
porta do repositório não tem `delete`.

Desativar tira o profissional do seletor da agenda de toda a clínica e derruba a
assinatura dele — botão próprio, nunca um checkbox no meio do formulário de
nome e conselho. Por isso as actions revalidam `/equipe` **e** `/agenda`.

### Estado

Painel em `/equipe`, com leitura e falha próprias — se `professionals` não
carregar, quem veio revogar um acesso continua conseguindo. `team` passa a 135
testes (63 novos: 15 de domínio, 17 de repositório, 17 de action, 20 de UI e
schema). As nove siglas de `council_type` ficam alcançáveis.

**Fica pendente:** `scheduling.listProfessionals` filtra `is_active` mas não
`deleted_at`, enquanto equipe, assinatura e este cadastro filtram os dois. A
aplicação nunca apaga profissional, então o caso só aparece com linha removida
por fora do produto — não toquei porque é outro módulo, mas é inconsistência
real.

---

## 8.34 Feature — Ciclo de vida do atendimento (10/08/2026)

Reauditei o que sobrou depois de `dc1c0e1`. As tabelas sem superfície nenhuma
estão todas bloqueadas (IA, `clinical_attachments` sem bucket, `availability_rules`
por P-WD, `professional_payouts` por P-RPC). A varredura de enums e a de colunas
não usadas apontaram o mesmo lugar: `appointments.confirmed_at` e
`checked_in_at` nunca escritas.

Puxando o fio, o achado real: **a única transição de status que a aplicação
sabia escrever era `canceled`.**

### O que estava quebrado

`appointment_status` tem sete valores. A linha nascia `scheduled` ou `confirmed`
— escolhido no formulário de criação — e dali só podia ir para `canceled`. As
consequências não eram cosméticas:

| Sintoma | Causa |
| --- | --- |
| Taxa de comparecimento nula para sempre | `/indicadores` e `/relatorios` calculam `completed / (completed + no_show)` lendo `appointments.status`; nenhum dos dois era gravado |
| Alerta de absenteísmo que nunca dispara | `operationalInsights` acende acima de 15% de falta, sobre a mesma conta |
| Horário preso depois da falta | o banco já trata `no_show` como vaga livre (`RELEASES_SLOT`), mas não havia como registrar a falta |
| Confirmação ao contrário | só dava para nascer confirmado; a clínica marca hoje e confirma na véspera |

Era um indicador desenhado, consultado e estruturalmente vazio — a mesma classe
de "verdadeiro como consulta, falso como informação" que §8 usa para justificar
faturamento fora dos relatórios, com a diferença de que aqui ninguém tinha
notado.

### A máquina de estados é uma só

`domain/AppointmentLifecycle.ts` declara as transições e nada mais as duplica. O
mapa completo está escrito por extenso no teste, de propósito: uma linha nova ali
obriga quem a acrescentar a olhar para o conjunto.

- `scheduled → confirmed` — carimba `confirmed_at`
- `scheduled | confirmed | checked_in | in_progress → completed | no_show`

`scheduled` entra nas origens de desfecho porque nem toda clínica usa
confirmação; exigi-la como degrau obrigatório zeraria a métrica justamente
nessas. Os três terminais (`completed`, `canceled`, `no_show`) não voltam:
reabrir reescreveria o que a clínica afirmou ter acontecido.

### A condição de origem vai no `WHERE`

`.in('status', allowedSourcesFor(to))`. Ler o status, decidir em memória e depois
gravar deixaria duas recepcionistas passarem as duas pela leitura, e a segunda
sobrescreveria o desfecho da primeira. Com a condição no banco, a segunda escrita
alcança zero linhas.

Zero linhas tem três causas e a releitura as separa: sumiu (`not-found`), está lá
em outro estado (`stale-status`, **com o status atual junto** — "já está como
Cancelado" resolve, "não foi possível" faz clicar de novo), ou está lá num estado
permitido e aí quem recusou foi a policy (`forbidden`).

### Desfecho só a partir do horário marcado

Falta anotada na véspera entraria na taxa de comparecimento como fato observado.
O corte é o **início**, não o fim: quem não chegou na hora já faltou, e esperar o
horário terminar só atrasaria a liberação da vaga. A recusa acontece antes do
`UPDATE`, e a tela some com os botões explicando por quê em vez de mostrá-los
desabilitados.

### Permissões

Confirmar pede `appointment.write`; registrar desfecho pede `appointment.cancel`.
**Hoje as duas resolvem para os mesmos quatro papéis** — só `finance` fica de
fora das duas —, e os testes travam esse fato para que a separação apareça aqui,
e não numa tela, quando a matriz de I-05 for ajustada. A permissão pedida é a que
descreve a decisão: desfecho encerra o atendimento e mexe em indicador, como
cancelar; confirmar é operar a agenda, como marcar.

O contrato do desfecho é um enum de **dois** valores, e não `AppointmentStatus`:
aceitar `canceled` daria um caminho para cancelar sem gravar motivo e sem
notificar, pulando a action que faz as duas coisas.

### Uma armadilha do próprio guard

Extraí os caminhos de revalidação para uma função auxiliar, e
`revalidateTargets.test.ts` **passou** — porque ele varre o literal
`revalidatePaths: [...]` e uma chamada de função é invisível para a varredura. Os
caminhos deixariam de ser conferidos contra `src/app` e contra o mapa por módulo.
Voltei ao array escrito em cada action; repetir cinco linhas é o preço de
continuar auditável. `/indicadores` entrou no mapa do módulo `scheduling`, com o
motivo registrado lá.

### Estado

`scheduling` passa a 156 testes (+49: 36 de domínio, 11 de adapter, 23 de action,
10 de UI — os últimos com relógio fixado, porque o desfecho depende dele).

**Fica pendente, e é o limite honesto desta fatia:** `checked_in` e `in_progress`
continuam inalcançáveis. Quem move o paciente pela fila é o módulo `encounters`
(check-in, chamada, início, encerramento), e carimbar `appointments.status` de lá
exigiria um módulo compor o repositório de outro — coisa que **nenhum módulo do
projeto faz hoje** (só `_shared` é importado entre eles). Inventar esse padrão de
dentro de uma fatia de agenda seria decidir arquitetura por conveniência. O efeito
prático: a agenda e a fila de espera continuam podendo discordar sobre o mesmo
paciente, e `completed` é registrado pela agenda, não pelo encerramento do
atendimento.

---

## 8.35 Feature — Identificação e contato do paciente (10/08/2026)

`PatientRepository` já registrava a dívida por escrito: "CPF, CNS, endereco,
contato de emergencia e foto ficam para a fatia de edicao (P-01 completa)". O
cadastro gravava cinco campos e o adapter preenchia o resto com **constante** —
`biological_sex: 'not_informed'` em toda linha da base, três dos quatro valores
do enum inalcançáveis pela aplicação inteira.

### O que passou a existir

`social_name`, `biological_sex`, `gender_identity`, `phone_alt` e
`emergency_contact`. Todos opcionais: o cadastro de balcão continua sendo nome e
telefone, e exigir sexo biológico para marcar uma consulta inventaria dado
clínico na pressa do atendimento.

### Nome social não é apelido

Quando existe, **vence** o nome de registro em toda exibição — ficha, listagem,
cartões. Quem decide isso é `preferredName`, no domínio: espalhar
`socialName ?? name` pelas telas é como uma delas acaba chamando alguém pelo nome
errado na sala de espera. O nome de registro reaparece na ficha **quando difere**,
porque quem confere documento, guia ou receita precisa dos dois.

É o único campo novo que entra também no cadastro: é na primeira conversa que a
pessoa diz como quer ser chamada, e deixar para a edição garante que a próxima
chamada use o nome errado.

### Sexo biológico e identidade de gênero continuam separados

O schema já os separava e a separação é correta: o primeiro tem uso clínico
(faixa de referência, dose), o segundo é autodeclaração. **Nenhum dos dois é
filtrado por papel**, e foi decisão: nome social e identidade existem para que
todo mundo que atende use o tratamento certo, e escondê-los da recepção derrota o
propósito. Sexo biológico está em qualquer carteirinha e a recepção precisa dele
para preencher guia e pedido de exame.

### O `jsonb` é fechado e relido

`emergency_contact` não tinha forma declarada — e não havia convenção alheia a
adivinhar, porque **nada escrevia na coluna**. A aplicação define a forma
(`{ name, phone, relationship }`), fecha em Zod com `.strict()` e **relê na
leitura**, como `workflows.trigger_config`.

Conteúdo que não casa **não vira `null` em silêncio**: a coluna tem dado, e
mostrar "sem contato" sobre um contato que existe é mentira. A ficha e o
formulário avisam que salvar vai substituí-lo.

Nome e telefone andam juntos: nome sem telefone não permite avisar ninguém, e é
numa emergência que alguém procura esse campo. A regra vale nas **duas** escritas
— aplicá-la só na edição deixaria o cadastro gravar meio contato, e o defeito
apareceria justamente na emergência.

### Estado

`patients` passa a 343 testes (+68). `changedFields` cobre os cinco campos novos
— continua registrando QUAIS mudaram, nunca os valores.

**Fica pendente, com motivo:**

| Campo | Por que não entrou |
| --- | --- |
| `cpf`, `cns`, `address` | Grupo DOCUMENTAL, que pertence ao faturamento. CPF pede validação de dígito e uma decisão sobre duplicidade na clínica; gravar identificador fiscal sem as duas coisas acumula risco sem contrapartida |
| `photo_url` | Depende de bucket de Storage, que não existe |
| Nome social nas outras telas | `patients ( full_name )` aparece em **9 módulos** (agenda, recepção, financeiro, convênios, inbox, tarefas, CRM, conciliação, atendimentos). Propagar é mudança transversal; propagar pela metade seria pior — o nome mudaria em algumas telas e não em outras |

---

## 8.36 Feature — Queixa principal do atendimento (10/08/2026)

Reauditei o que sobrou fora dos módulos já fechados. As tabelas sem superfície
continuam todas bloqueadas (IA, bucket, P-WD, P-RPC), e a varredura de colunas
apontou uma única coluna viva e não reclamada: **`encounters.chief_complaint`**,
nunca lida e nunca escrita.

### Não é `waiting_queue.reason`, e a diferença é o ponto

O domínio da fila já dizia, por escrito, o que faltava: `reason` é "motivo
declarado na chegada. **Não é queixa clínica**". A recepção anota o que a pessoa
falou no balcão; a queixa principal é registro de quem atende, na primeira linha
da consulta, e é dela que sai a conduta. Colapsar as duas faria a anotação do
balcão passar por afirmação clínica.

O atendimento começava, portanto, sem nenhum registro do motivo clínico — e o
prontuário não tinha vínculo com o porquê da visita.

### `record.write`, e não `encounter.write`

As outras quatro actions do módulo pedem `encounter.write`, recepção inclusive.
Esta pede a permissão **clínica**, e a diferença é real na matriz de I-05:
`receptionist` tem `encounter.write` e **não** tem `record.write`; `admin`
também não — administrar a clínica não é cuidar do paciente.

Por isso é action própria, e não um campo em `startEncounter`: juntar as duas
obrigaria a recepção a digitar conteúdo clínico para a fila andar.

### A queixa não atravessa a fronteira para quem não pode vê-la

`/atendimentos` é operada pela recepção. `toEncounterDto(encounter, canSeeClinical)`
**omite a chave** quando o papel não tem `record.read` — mesmo desenho de
`toServiceDto(service, canSeePrice)`. Esconder na tela deixaria o texto no
payload.

A distinção entre ausente e nulo é usada: `undefined` é "este papel não vê",
`null` é "ninguém registrou". É ela que faz o campo aparecer só para quem pode
usá-lo, em vez de oferecer um controle que o servidor recusaria.

O typecheck cobrou a mudança em quatro pontos — incluindo dois `.map(toEncounterDto)`
onde o segundo argumento teria sido o **índice do array**, e a queixa vazaria
para a recepção em toda linha de índice ímpar.

### O texto NÃO entra na auditoria

É a informação mais sensível do módulo — diz o que a pessoa tem — e `audit_log`
é append-only e legível pela operação inteira, incluindo papéis sem
`record.read`. Gravá-lo ali contornaria a própria filtragem desta fatia. O evento
registra que houve registro e se a queixa foi **apagada**; o conteúdo fica em
`encounters.chief_complaint`, sob a RLS da tabela.

### Só com o atendimento aberto

`eq('status', 'open')` vai no `WHERE`, não numa leitura anterior: entre a tela
carregar e o clique chegar, outra pessoa pode ter encerrado. Gravar por cima
mudaria a justificativa de uma conduta já tomada.

Zero linhas tem três causas, separadas por releitura: encerrado
(`invalid-transition`), ausente (`not-found`), aberto e legível (`forbidden` —
falta policy). A mensagem de encerrado **não** manda recarregar a tela, ao
contrário das outras actions do módulo: ali o que mudou é a fila; aqui foi a
janela clínica que fechou, e mandar atualizar faria a pessoa recarregar uma tela
já correta. Isso exigiu `EncounterFailureOverrides` no tradutor.

Apagar é permitido enquanto a consulta corre: uma queixa errada é pior que
nenhuma.

### Estado

`encounters` passa a 165 testes (+31: 14 de action, 9 de adapter, 8 de fronteira,
14 de UI). `/atendimentos` mostra a queixa abaixo do paciente, fechada por
padrão — a tela é operacional, e um campo de texto aberto em cada linha
empurraria "quem está com quem" para baixo.

**Fica pendente:** a queixa não aparece no prontuário (`/prontuarios`) nem na
ficha do paciente. `medical_records.encounter_id` existe e permitiria o vínculo;
é fatia própria, do módulo `records`.

---

## 8.37 Feature — Vínculo do prontuário ao atendimento (11/08/2026)

O campo `medical_records.encounter_id` já existia no schema, mas era uma coluna
sem superfície: o formulário nunca permitia escolher a consulta e cada evolução
era salva sem contexto. Esta fatia fecha a ligação entre **Atendimentos → queixa
principal → Prontuários**.

### Persistência e isolamento

O seletor carrega até dez atendimentos do paciente escolhido por Server Action,
com `record.read`, ordenados do mais recente para o mais antigo e sem consultas
canceladas. A gravação confere no banco, com `clinic_id`, `encounter_id` e
`patient_id` no mesmo `WHERE`; uma FK isolada não seria suficiente para impedir
que um id válido de outro paciente ou tenant fosse associado ao registro.

O vínculo é salvo junto da primeira versão do prontuário. Retificações não
alteram paciente, tipo ou atendimento: a nova versão herda o contexto da
anterior, preservando a cadeia append-only.

### Contexto clínico na leitura

As listagens de prontuário hidratam autores e atendimentos em consultas por lote,
sem N+1. Quando o atendimento está acessível, a tela mostra data, status,
profissional e queixa principal. Quando existe `encounter_id`, mas a leitura do
atendimento não está disponível, a interface informa isso sem fingir que o
registro não tem vínculo. O texto da queixa não é duplicado no `audit_log`.

O seletor exibe a queixa truncada apenas como ajuda para distinguir consultas;
o texto completo fica no contexto do registro. Trocas rápidas de paciente
descartam respostas atrasadas e não permitem enviar o vínculo anterior.

### Estado

`records` passa a 155 testes em 12 arquivos, e o projeto a **2501 testes em 196
arquivos** (+65 sobre os 2436 de `ee959f8`). Typecheck, lint, build e suíte
completa estão limpos. Teleatendimento continua fora do escopo.

Os números acima corrigem a contagem escrita antes de `042e36c`: os testes de
tela (`ProntuariosScreen`, `RecordEditorModal`) entraram depois, e este arquivo
segue a regra da §9 — quando ele discorda do código, o código está certo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| Vínculo na ficha do paciente | `/pacientes/[id]` não tem painel de prontuário — só de prescrições. Criar um ali é fatia própria, e é onde a queixa passaria a valer como leitura clínica em uma segunda rota |
| Trocar o atendimento ao corrigir | A correção herda paciente, tipo e atendimento da versão anterior. Mudar de qual consulta o registro saiu não é corrigir um texto |
| Registros anteriores a esta fatia | Continuam sem vínculo, e não há como inferi-lo: adivinhar por proximidade de data diria que uma evolução saiu de uma consulta que talvez não a tenha originado |

---

## 8.38 Feature — Prontuário na ficha do paciente (11/08/2026)

A fatia anterior fechou o vínculo `medical_records.encounter_id` e deixou escrito
o que faltava: a ficha não tinha painel de prontuário. Ela reunia alergias,
sinais vitais, prescrições, consentimentos e agenda — e parava exatamente no
registro que explica os três primeiros. Quem precisasse ler a evolução de uma
pessoa ia a `/prontuarios`, que lista os registros recentes da **clínica**: a
fila de quem escreve, não a história de quem é atendido.

Esta fatia entrega a leitura clínica na segunda rota, e é onde a queixa
principal registrada em `/atendimentos` passa a valer como contexto ao lado da
conduta que ela originou.

### A leitura passa a ter dono

`logAccess(clinicId, patientId)` existia na porta desde R-01 e **nunca havia sido
chamada com um paciente**: `/prontuarios` passa `null`, porque ali não há alvo.
Enquanto essa foi a única superfície, a trilha sabia responder "alguém abriu a
lista" e não sabia responder a pergunta para a qual ela existe — "quem leu o
prontuário desta paciente?".

A ficha registra o acesso **antes** de entregar o conteúdo, e descarta pré-busca
pelo mesmo motivo medido em 09/08/2026: o corpo da rota roda quando o navegador
se adianta, e passar o mouse sobre um nome na listagem gravaria uma leitura que
ninguém fez.

**Caveat que continua valendo:** nenhum evento persiste hoje. A policy de
`INSERT` de `audit_log` recusa o membro autenticado (P-P6), e a migration está
proposta. O que esta fatia muda é que o evento passa a **nomear o paciente**
quando ele puder ser gravado — sem isso, aplicar a policy depois traria uma
trilha que continuaria sem responder a pergunta.

### Uma consulta clínica recusada não derruba a ficha

`readFailure` devolvia um `Error` genérico, e isso bastava enquanto o único
chamador era uma rota inteira dedicada ao prontuário: lá, derrubar o render é a
resposta certa. Na ficha o prontuário é **um painel entre dez**, e um `throw`
levaria junto cadastro, contatos, consentimentos e agenda por causa de uma
consulta que a RLS recusou.

A falha de leitura passou a ser tipada — `forbidden`, `unavailable`,
`unexpected` —, e só a classe viaja. A mensagem do Postgres continua parando no
log do servidor pela regra mais dura do módulo: em `medical_records` o texto do
erro pode ecoar o valor consultado, e o valor consultado é conteúdo clínico.

### O paciente não é escolhido de novo

O editor de registro é o mesmo de `/prontuarios`, com o paciente **fixo** por
prop: no lugar do `<select>` entra uma linha de confirmação com o nome. Não é
conveniência de tela — enquanto houver seletor existe um caminho para pendurar a
evolução na pessoa errada, e na ficha o id vem da rota já validada. Oferecer os
outros pacientes ali criaria justamente o erro que a fatia anterior gastou uma
conferência de servidor para impedir.

Reusar em vez de duplicar foi decisão de custo real: uma cópia do editor
duplicaria junto o seletor de vínculo inteiro — a corrida de resposta atrasada, o
padrão do atendimento aberto e o bloco da queixa —, e a cópia que envelhecesse
primeiro passaria a vincular diferente da outra.

### A demonstração não empresta as notas administrativas

`MockMedicalRecordRepository` deriva as evoluções de exemplo das notas de
paciente de `clinic-data`, e para `/prontuarios` isso está certo: não inventa
prontuário fictício novo. Na ficha, os mesmos três textos apareceriam **duas
vezes na mesma página** — como prontuário e, logo abaixo, como "Observações", sob
um cabeçalho que afirma serem "notas administrativas da equipe, separadas do
prontuário clínico".

Uma tela não pode dizer as duas coisas sobre o mesmo texto. A rota não lê
prontuário em demonstração, e o painel diz isso — mesmo desenho do painel de
prescrições, que também não exibe receita fictícia.

### O corte é declarado

Vinte registros vigentes, contra os trinta de `/prontuarios`: ali a lista é a
tela, aqui ela divide espaço com nove painéis. Quando o teto é atingido, a tela
**avisa que há registro mais antigo**. Uma lista que para de crescer sem dizer
nada afirma, em silêncio, que aquilo é o prontuário inteiro — e é o tipo de
omissão que faz alguém concluir que não houve registro anterior.

### Duas telas leem, duas telas revalidam

Registrar e corrigir passaram a revalidar também a ficha, por caminho literal
montado a partir do `output` — nunca da entrada. Sem isso, quem registrasse pela
ficha veria, na leitura seguinte, a lista anterior ao próprio registro, e
concluiria que não salvou. O mapa por módulo do guard foi atualizado junto: até
esta fatia, `records` alcançar `/pacientes/:seg` seria jogar fora cache de uma
tela que não lia nada disso.

### Estado

`records` passa a **195 testes em 15 arquivos** (+40), e o projeto a **2541
testes em 199 arquivos**. Typecheck, lint, build e suíte completa estão limpos.
Teleatendimento continua fora do escopo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| Histórico de versões na tela | `listVersions` existe na porta e no adapter, e **nenhuma tela o mostra** — nem a de prontuários. O selo diz "Versão 3"; ver as três é fatia própria, e é ela que torna o append-only visível para quem audita |
| Auditar a leitura dos outros painéis clínicos | Prescrição, alergia e sinais vitais também são dado de saúde e não registram acesso. `logAccess` é a porta do prontuário, com escopo `medical_records`; estendê-la aos demais é decisão de produto sobre o que conta como acesso clínico, não efeito colateral deste painel |
| Anexos clínicos | `clinical_attachments` está no schema e **não há bucket** de Storage. Bloqueio externo |
| Registros anteriores a esta fatia | Continuam sem vínculo com atendimento, e não há como inferi-lo |

---

## 8.39 Feature — Histórico de versões do prontuário (11/08/2026)

Reauditei as pendências registradas. As de fora continuam bloqueadas por coisa
que TypeScript não resolve — anexos clínicos sem bucket, IA, P-WD, P-RPC, as 18
migrations não aplicadas. A que sobrou local e destravada era a mais incômoda:
`listVersions` existia na porta, no adapter e nos testes, e **nenhuma tela a
chamava**.

O efeito é o que esta fatia corrige. O módulo repete em cinco arquivos que o
prontuário é append-only — corrigir insere uma versão nova e a anterior continua
legível. Só que o selo dizia "Versão 3" e as duas primeiras não tinham por onde
ser vistas: "não editamos, versionamos" era uma afirmação do código sobre si
mesmo, sem superfície que a comprovasse. O produto pagava o custo do
versionamento e não entregava a garantia que ele compra.

### O gatilho substituiu um ícone que não levava a lugar nenhum

Ao lado do selo havia um ícone com `aria-label` "Este registro foi corrigido N
vez(es)". Ele anunciava que existia algo a ver e não oferecia o ver — a pior
combinação possível. Virou botão, e ele aparece **só onde há o que ver**: com uma
versão só, a cadeia é a própria linha.

Aparece nas duas telas que mostram o selo, e **não depende de `canWrite`**: ver
versões anteriores é `record.read`, a mesma permissão que abre as telas. Quem
audita o prontuário raramente é quem o assina.

### A trilha passa a distinguir três leituras

`logAccess` deduzia o alvo de `patientId ?? 'list'`, o que bastava enquanto havia
duas superfícies. O histórico é uma terceira, e é sobre o mesmo paciente da
ficha: deduzir devolveria `patient` para as duas, e a trilha não separaria "abriu
a ficha" de "foi ver o que mudou num registro corrigido" — que é exatamente a
pergunta de uma investigação.

O alvo passou a ser **declarado**, num tipo discriminado que torna a combinação
inválida inexpressável: não há como registrar leitura de versões sem paciente,
nem a listagem da clínica com um.

O registro sai por `afterSuccess`, que roda depois da resposta: quem está com o
paciente na frente não espera a trilha para ver o que foi corrigido. Continua
valendo o caveat de §8.38 — nenhum evento persiste enquanto a policy de `INSERT`
de `audit_log` recusar o membro autenticado (P-P6).

### A diferença entre as versões NÃO é destacada

Comparar duas evoluções palavra a palavra e pintar o que mudou seria uma leitura
da aplicação sobre conteúdo clínico. Um destaque no lugar errado — um "sem" fora
do trecho marcado, uma negação que some — muda o sentido do que se lê, e quem lê
acredita no destaque. As versões vêm inteiras, na ordem, cada uma com seu autor e
sua hora; a comparação fica com quem tem formação para fazê-la.

Também não há "restaurar": voltar a uma versão anterior é escrever uma nova, e é
o que a correção já faz. Um botão assim sugeriria que a cadeia anda para trás.

### O que a tela afirma quando não sabe

Cadeia vazia é registro ausente **nesta clínica**, e a action traduz isso para
não encontrado — resposta idêntica à de um id que nunca existiu, que é o que
impede a tela de virar sonda de existência de registro alheio.

Falha de leitura **não vira lista vazia**. Num prontuário, "nenhuma versão
anterior" sobre um registro corrigido é a afirmação mais errada disponível: diria
que a conduta sempre foi aquela. O carregamento se anuncia, a falha se anuncia, e
nenhum dos dois é confundido com ausência de correção.

Resposta atrasada é descartada por `requestId`, como no seletor de vínculo. Aqui
o motivo é mais duro que evitar um piscar de tela: seria o texto de uma pessoa
exibido sob o cabeçalho do registro de outra.

### Estado

`records` passa a **231 testes em 17 arquivos** (+36), e o projeto a **2577
testes em 201 arquivos**. Typecheck, lint, build e suíte completa estão limpos.
Teleatendimento continua fora do escopo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| Assinatura clínica das versões | `signed_at` existe e nenhuma versão o preenche. Assinar exige certificado e emissor externo; um botão "assinar" que só carimbasse data seria a mentira mais cara deste módulo |
| Comparação entre versões | Destaque de diferença sobre texto clínico é leitura da aplicação sobre o registro. Se um dia entrar, entra como recurso declarado — não como enfeite da lista |
| Auditar a leitura dos outros painéis clínicos | Segue como em §8.38: prescrição, alergia e sinais vitais não registram acesso, e estendê-los é decisão de produto sobre o que conta como acesso clínico |
| Anexos clínicos | `clinical_attachments` está no schema e **não há bucket**. Bloqueio externo |

---

## 8.40 Feature — Auditoria de acesso clínico na ficha (11/08/2026)

A pendência estava registrada em §8.38 e §8.39 como decisão de produto adiada:
prescrições, sinais vitais e alergias são dado de saúde e **não registravam
acesso nenhum**. Reauditando, ela não exigia tabela, permissão nem migration —
só uma camada de registro com escopo correto. Fechou aqui.

### O caso que o produto não via

`receptionist` e `admin` têm `encounter.read` e **não** têm `record.read`. Os
dois abrem a ficha de qualquer paciente, recebem os sinais vitais dele e não
passam por caminho auditado nenhum. A trilha respondia "quem leu o prontuário" —
nunca "quem leu dado clínico".

O gap não era de tela: os três painéis já protegiam por papel e já filtravam por
clínica. O que faltava era o registro do acesso, e ele é o tipo de coisa cuja
ausência não quebra nada — o dado aparece igual, a tela funciona igual, e o
silêncio só é notado quando alguém pergunta quem leu o quê.

### Um ato, um evento

Quatro chamadas, uma por painel, dariam quatro linhas por abertura de ficha — a
mesma poluição que a pré-busca causava antes de `isPrefetchRender`, e com o mesmo
efeito: o acesso que importa some no meio das repetições do mesmo.

Abrir a ficha é **um** ato. O evento nomeia os recortes entregues nele
(`clinical_scopes: 'medical_records,prescriptions,vitals,allergies'`), em ordem
canônica — sem ela, `vitals,allergies` e `allergies,vitals` seriam dois acessos
diferentes para qualquer agrupamento na trilha.

### Só o que atravessou a fronteira

Escopo entra quando o dado é real e foi lido. Papel sem permissão, consulta
recusada pela RLS e modo demonstração ficam de fora: um evento afirmando leitura
de alergias sobre uma consulta que falhou é acusação falsa contra quem abriu a
ficha, e uma trilha com acusação falsa deixa de responder qualquer coisa.

**Lista vazia conta como acesso.** "Esta paciente não tem alergia registrada"
também é informação de saúde, e quem perguntou recebeu a resposta.

**Nenhum escopo entregue, nenhum evento.** `finance` abre a ficha por
`patient.read` e recebe nome, telefone e documento — cadastro, não saúde.

### Por que na rota, e não numa porta de módulo

`logAccess` é a porta do prontuário, e os outros três recortes pertencem a
`patients` e `encounters`. Espalhar o registro por três portas novas repetiria a
mesma decisão em três módulos e ainda deixaria cada um cego para os outros — e é
justamente a soma que interessa. Quem sabe o que foi entregue numa abertura é a
composição, que é a rota.

`RecordAccess` perdeu o alvo `patient`, que ficou inalcançável: deixá-lo criaria
um segundo caminho capaz de gravar meio evento. A porta segue cobrindo os dois
acessos exclusivamente de prontuário — a listagem da clínica e a cadeia de
versões.

### O aviso saiu do painel e subiu para a rota

Pela mesma razão. A recepção recebe sinais vitais e não recebe prontuário: um
aviso por painel repetiria quatro vezes uma frase que diz menos. A rota declara
uma vez, acima do bloco clínico, **nomeando os recortes daquele leitor** — e só
aparece quando houve acesso clínico de verdade.

### Um guard, porque a falta não quebra nada

`src/app/clinicalAccessAudit.test.ts` varre `src/app`: rota que importa fonte
clínica (`getMedicalRecordRepository`, `getPrescriptionSource`,
`getVitalsSource`, `getAllergySource`) e não registra acesso reprova. A lista de
fontes é conferida contra `src/modules` no mesmo arquivo — uma fonte renomeada
tornaria a rota invisível para a varredura, que é exatamente o buraco que o teste
fecha.

Foi este o desenho que faltou por um mês: não havia o que quebrar quando a
auditoria não existia.

### A trilha ficou alcançável

`/auditoria` filtrava por sete verbos e **nenhum deles era `record.read`** — o
evento pelo qual a tela é procurada. Chegava-se a ele digitando o nome do verbo
no campo de ação personalizada, o que exige sabê-lo de antemão. Entraram os três
verbos do prontuário (lido, criado, corrigido) e a entidade `medical_record`.

Os metadados continuam fora da listagem: `audit_log` é legível por `audit.read`,
que `admin` tem e `record.read` não — exibir os escopos ali daria uma leitura
lateral do que foi acessado.

### Estado

O projeto passa a **2593 testes em 204 arquivos** (+16, +3 arquivos). Typecheck,
lint, build e suíte completa estão limpos. Teleatendimento continua fora do
escopo.

Continua valendo o caveat de §8.38 e §8.39: **nenhum evento persiste** enquanto a
policy de `INSERT` de `audit_log` recusar o membro autenticado (P-P6). O que esta
fatia muda é que existe o que gravar, com o escopo certo, no dia em que a
migration for aplicada.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| P-P6 — a policy de `INSERT` de `audit_log` | Bloqueio externo (B1): exige acesso SQL ao projeto Supabase. Migration proposta; enquanto ela não roda, toda a trilha é best-effort que falha em silêncio |
| Leitura clínica em outras rotas | `/atendimentos` mostra queixa principal e `/portal-profissional` mostra a agenda própria. Nenhuma lê fonte clínica pelos acessores conhecidos hoje — quando ler, o guard cobra |
| Retenção e consulta por paciente | A trilha é append-only e paginada por clínica; não há tela que responda "todos os acessos ao prontuário desta paciente" em uma consulta. É fatia própria, e depende de P-P6 antes de valer alguma coisa |
| Assinatura clínica e anexos | Seguem como em §8.39: certificado externo e bucket de Storage, os dois bloqueios de fora |

---

## 8.41 Feature — Busca de guias na paleta de comandos (11/08/2026)

Reauditei as pendências. As de prontuário e auditoria estão fechadas; o que
sobra registrado depende de bloqueio externo — P-P6, bucket de Storage,
certificado de assinatura, as 18 migrations — ou é decisão adiada por outro
motivo (grupo documental do paciente, nome social transversal em nove módulos).

Uma pendência local sobrou, e estava escrita duas vezes, em §4.22 e §4.25: *"a
paleta continua declarando que prontuários e guias não possuem busca por termo"*.
Metade dela fecha aqui.

### O contrato da guia não é o das outras buscas

Paciente, agendamento e cobrança são achados pelo **nome de quem é atendido** —
nenhum dos três tem identificador que alguém decore. A guia tem: o número que a
operadora devolve ao autorizar é o que está no papel em cima do balcão e o que a
atendente dita no telefone.

Buscar guia só por nome de paciente teria copiado o contrato errado, e obrigaria
a lembrar de quem era a guia para achar a guia. As duas chaves saem na mesma
consulta.

**Guia ainda não respondida não tem número** — ela nasce assim, porque o número é
da operadora. Essas continuam sendo achadas pelo nome, e o rótulo diz "Guia sem
número" em vez de um traço, que pareceria cadastro incompleto.

### O que a busca NÃO lê

`procedures` e `denial_reason` ficam fora do `select`. São o conteúdo clínico da
guia: o primeiro diz o que se pretendia fazer com a pessoa, o segundo é o texto
da operadora sobre isso. A paleta é um campo aberto no cabeçalho de **toda** tela
autenticada.

O recorte é feito no adapter, e não na montagem do DTO — coluna que não sai do
banco não vaza de lugar nenhum. O teste do DTO trava o contrato dos dois lados:
se alguém voltar a lê-las, a chave nova precisa passar por uma revisão que
pergunta por quê.

### `insurance.manage`, a mesma porta de `/convenios`

Não é permissão nova. A paleta é atalho para uma tela que existe, e atalho que
alcança o que a tela recusa é a definição de porta lateral. `receptionist` e
`professional` continuam sem convênio, como a matriz de I-05 decidiu — e o teste
trava os cinco papéis.

### A quarta cópia que não foi escrita

A paleta consultava três fontes com três efeitos praticamente idênticos: três
`setTimeout`, três flags `active`, nove pedaços de estado e mais três linhas em
cada um dos dois pontos de limpeza. A quarta fonte seria a quarta cópia.

`usePaletteSearch` recolhe o padrão, e a mudança que ele traz não é só de
tamanho: **`pending` e `error` passaram a ser derivados**. O estado guarda o
termo que produziu a resposta, e "está carregando" é *termo pedido ≠ termo
respondido* — o mesmo desenho do seletor de vínculo e do histórico de versões.
Com um booleano à parte, era preciso apagá-lo em todo caminho de saída, e é
exatamente aí que nasce o indicador que nunca desliga.

O resultado da consulta anterior some no instante em que o termo muda, porque ele
não é "o que está guardado" e sim "o que está guardado para este termo". Sem
isso, apertar Enter durante a digitação abriria o registro de uma busca que já
não está no campo.

A action é passada como função, e não como callback montado no render: um arrow
inline mudaria a cada tecla, refaria o efeito, e o debounce nunca chegaria ao
fim.

### O limite que continua declarado

**O prontuário não é pesquisado por termo, e o estado vazio diz isso.** Uma busca
nele seria consulta a conteúdo clínico, e ela pede contrato próprio: quem pode
ler, o que a resposta pode mostrar e como o acesso é registrado — as três
perguntas que §8.40 acabou de responder para a ficha, e que uma caixa de texto no
cabeçalho não responde sozinha.

### Estado

O projeto passa a **2631 testes em 207 arquivos** (+38, +3 arquivos). Typecheck,
lint, build e suíte completa estão limpos. Teleatendimento continua fora do
escopo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| Busca no prontuário | Precisa de contrato próprio de consulta clínica — quem lê, o que a resposta mostra, como o acesso entra na trilha. É fatia de produto, não extensão da paleta |
| Glosa na busca | `claim_denials` tem código e motivo da recusa, que é texto da operadora sobre o atendimento. Vale a mesma pergunta da guia, e a resposta pode ser diferente: a glosa não tem número que alguém decore |
| Resultado da guia abre `/convenios` sem filtro | Como cobrança e agendamento: a rota ainda não aceita um id na URL para destacar a linha. É melhoria transversal das quatro fontes, não da guia |
| Nome social nas outras telas | Segue de §8.35: `patients ( full_name )` em nove módulos. Propagar pela metade é pior que não propagar |

---

## 8.42 Feature — Grupo documental do paciente (11/08/2026)

§8.35 deixou a pendência escrita com as duas condições que faltavam:

> `cpf`, `cns`, `address` — grupo DOCUMENTAL, que pertence ao faturamento. CPF
> pede validação de dígito e uma decisão sobre duplicidade na clínica; gravar
> identificador fiscal sem as duas coisas acumula risco sem contrapartida.

Esta fatia entrega as duas e o grupo junto. Nenhuma migration, nenhuma
credencial: as três colunas existem desde o primeiro schema.

### O que a ficha mostrava e ninguém escrevia

`patients.cpf` aparecia na ficha como "Documento" — e **nenhuma escrita do
produto o preenchia**. `cns` nunca era lido nem escrito. `address` é `jsonb` NOT
NULL, e o insert gravava `{}` em toda linha da base desde sempre.

Além do dado ausente, havia um nome a mais: a entidade tinha `document` e a
coluna se chama `cpf`. Dois nomes para a mesma coluna é como uma tela passa a
mostrar um valor que outra não sabe atualizar — `document` saiu.

### Validação de dígito, e por que ela é a metade que importa

CPF errado não é erro de digitação inofensivo: ele viaja para a nota fiscal,
para a guia do convênio e para o pedido de exame. Quando a recusa chega, o
atendimento já aconteceu, e o retrabalho é de quem cobra — não de quem digitou.

A sequência repetida (`111.111.111-11`) **passa** no módulo 11 e é inválida por
definição. Sem a recusa explícita, é exatamente o que alguém digita para pular o
campo.

O CNS tem **duas** regras, e o primeiro dígito diz qual vale: `1` e `2` são
definitivos e derivam do PIS; `7`, `8` e `9` são provisórios e só exigem que a
soma ponderada seja múltipla de 11. Tratar as duas famílias como uma recusaria
metade dos cartões reais — e cartão recusado no balcão vira "o sistema não
aceita", que é como um campo válido deixa de ser preenchido. O ramo em que o
dígito daria 10 (o cartão que termina em `001`) tem teste próprio.

### Duplicidade: a política, e o limite dela

Antes de gravar, a action pergunta se o CPF já é de outro paciente **da clínica
ativa**. A resposta traz **quem**: duplicidade de CPF quase sempre é a mesma
pessoa cadastrada duas vezes, e o que resolve é continuar na ficha que já existe.
"CPF já cadastrado" manda procurar; "já está no cadastro de Maria Souza" diz
onde. O nome não vaza nada — quem tem `patient.write` já enxerga a listagem
inteira da clínica.

Cadastro **removido** (`deleted_at`) não bloqueia; **arquivado**, sim: continua
sendo a mesma pessoa, e o caminho é reativar. Na edição, o próprio paciente sai
da conta — sem isso, salvar a ficha sem mexer no CPF acusaria conflito consigo
mesma.

**O limite, declarado:** não há `unique (clinic_id, cpf)` no schema aplicado, e
criá-lo é migration (bloqueio B1). Duas gravações **simultâneas** do mesmo CPF
ainda passam. A conferência da aplicação é a única barreira, e esta fatia diz
isso em vez de fingir garantia.

### CPF entra no cadastro; CNS e endereço, na edição

O modal de cadastro declara, desde P-01, que o balcão é nome e telefone — "um
formulário de dez campos entre o paciente e a consulta é como nascem cadastros
preenchidos no chute". O CPF entra lá assim mesmo, e **não como exceção**: é ele
que impede a mesma pessoa de virar dois cadastros, e uma checagem de duplicidade
que só roda na edição descobre a duplicata depois de ela existir.

CNS e endereço não evitam nada no balcão e são digitação longa. Ficam na edição,
onde alguém senta para completar a ficha.

### Endereço: ou tem o mínimo, ou não existe

Rua, cidade e UF. Uma ficha com "apto 42" no lugar do endereço **afirma** que a
pessoa tem endereço cadastrado, e o balcão para de perguntar. Número fica fora da
exigência: "s/n" é endereço real em zona rural e em via antiga, e cobrá-lo faria
alguém inventar um número.

A forma é fechada em Zod e **relida na leitura**, como `emergency_contact`:
`{}` é "sem endereço" (o estado de toda linha anterior a esta fatia), e conteúdo
que não casa **não vira `null` em silêncio** — a ficha avisa que salvar vai
substituí-lo. A UF é conferida contra as 27 siglas: uma inventada chegaria à
etiqueta de correspondência e à guia.

**O CEP não é consultado em base externa**, e o formulário diz isso. Integração
com ViaCEP é dependência de fora; sem o aviso, alguém digita o CEP e espera o
resto aparecer sozinho.

### O que a LISTAGEM não recebe (achado da revisão)

`PatientListItem` é `Omit<Patient, …>` e existia justamente para o documento não
atravessar a fronteira até a listagem Client Component. Ele omitia `'document'` —
e `document` **deixou de existir** quando a entidade passou a chamar a coluna de
`cpf`.

`Omit` com uma chave que não pertence ao tipo não é erro: ela é ignorada em
silêncio. O typecheck ficou limpo, o `toPatientListItem` continuou montando um
objeto literal sem os campos novos — **nenhum dado atravessou** —, mas o tipo
parou de proibir: quem acrescentasse `cpf` ao mapeador depois passaria pela
compilação sem que nada reclamasse. Um guarda que não guarda mais é pior que
guarda nenhum, porque ninguém procura por ele.

A revisão corrigiu, e ampliou o recorte: além de `cpf`, `cns` e `address`, saem
também `emergencyContact` e o par de sinalizadores de conteúdo ilegível. A
listagem mostra nome, contato e datas; documento, endereço e contato de
emergência são da ficha, que é server-side.

### O que não entra na trilha

`changedFields` ganhou os três campos e continua registrando **quais** mudaram,
nunca os valores. Identificador fiscal em `audit_log` seria dado pessoal num
lugar append-only, legível por `audit.read`, e fora do alcance de qualquer pedido
de exclusão que a LGPD permita ao titular.

### Estado

`patients` passa a **403 testes em 31 arquivos**, e o projeto a **2691 testes em 211 arquivos**
(+60, +4 arquivos). Typecheck, lint, build e suíte completa estão limpos.
Teleatendimento continua fora do escopo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| `unique (clinic_id, cpf)` no banco | Migration — bloqueio B1. Enquanto não existir, duas gravações simultâneas do mesmo CPF passam pela conferência da aplicação |
| Fundir cadastros duplicados | A mensagem manda abrir a ficha que já existe, e é o certo hoje: fundir prontuário, agenda, cobrança e guia de duas fichas é fatia própria, e das grandes |
| Busca por CPF | A listagem procura por nome e telefone. Achar pelo documento é o que a recepção faz com a carteirinha na mão, e cabe na paleta — mas é contrato de busca próprio |
| Consulta de CEP | Depende de serviço externo. O formulário declara que os campos são digitados |
| `photo_url` | Segue de §8.35: depende de bucket de Storage, que não existe |

---

## 8.43 Feature — A fila move a agenda (11/08/2026)

§8.34 fechou o ciclo de vida do atendimento e deixou o limite escrito, com todas
as letras:

> **Fica pendente, e é o limite honesto desta fatia:** `checked_in` e
> `in_progress` continuam inalcançáveis. Quem move o paciente pela fila é o
> módulo `encounters`, e carimbar `appointments.status` de lá exigiria um módulo
> compor o repositório de outro (…). O efeito prático: a agenda e a fila de
> espera continuam podendo discordar sobre o mesmo paciente.

Esta fatia fecha isso. Nenhuma migration: os dois valores existem em
`appointment_status` desde o primeiro schema, e `appointmentStatusMeta` já tinha
rótulo para os dois — "Aguardando" e "Em atendimento" eram texto que nunca
aparecia.

### O que a clínica via

Recepção registrava a chegada, o paciente sentava na sala de espera, o
profissional o chamava — e a agenda continuava dizendo **"Agendado"**. Duas telas
do mesmo produto afirmando coisas diferentes sobre a mesma pessoa no mesmo
minuto, e a errada é a que a clínica abre para saber como o dia está andando.

### O padrão que faltava, e onde ele já existia

A objeção de §8.34 era correta: `encounters` escrevendo em `appointments` daria
dois donos à máquina de estados da agenda. Mas o projeto **já tinha** o lugar
certo — `lib/notifications/operational.ts` faz exatamente isto desde antes: um
efeito derivado que atravessa módulos, chamado de `afterSuccess`, morando na
camada de composição.

`lib/scheduling/appointment-progress.ts` segue esse desenho. A transição em si
continua sendo do módulo dono: o lib chama `markProgress`, que reusa o
`transition` inteiro do adapter da agenda — mesma condição de origem no `WHERE`,
mesma releitura para separar as três causas de zero linhas, mesma
`appointment_status_history`. **Uma implementação, dois chamadores.**

### A máquina de estados ganhou duas arestas — e o teste obrigou a olhar

`AppointmentLifecycle.test.ts` tem um teste que escreve o mapa de transições por
extenso, "de propósito: uma linha nova aqui obriga quem a acrescentar a olhar
para o conjunto inteiro". Ele quebrou, junto com o que afirmava que os dois
estados não eram alcançáveis. Era exatamente o momento para o qual ele foi
escrito.

O mapa passou de 9 para 14 transições. A que mais importa é a que **não** entrou:
os três terminais continuam sem saída, então uma chegada registrada depois de o
desfecho ter sido lançado não reabre nada — alcança zero linhas e vira
`stale-status`.

**`in_progress` aceita partir de `scheduled`**, sem passar por `checked_in`, e é
deliberado: quando o atendimento começa, a pessoa está na sala, e isso é fato
observado. Exigir a chegada carimbada deixaria a agenda presa em "Agendado" em
todo atendimento anterior a esta fatia — que é a base inteira. A regra é
auto-corretiva.

### Chegada não é desfecho, e por isso não tem hora

`recordOutcome` recusa desfecho antes de `starts_at`: registrar falta na véspera
é adivinhação. Chegada não tem essa trava — paciente que chega adiantado chegou,
e o balcão não vai esperar o relógio para dizer isso.

Pelo mesmo motivo `checked_in` e `in_progress` ficam fora de
`APPOINTMENT_OUTCOMES`: eles dizem **onde a visita está**, não como terminou, e
nenhum dos dois entra na taxa de comparecimento.

### O que acontece quando a agenda não acompanha

O paciente **chegou**. A fila não volta atrás porque um `UPDATE` em outra tabela
não alcançou linha nenhuma — o efeito roda em `afterSuccess`, depois da resposta,
e devolve um desfecho tipado em vez de lançar. `walk-in` (encaixe, sem
agendamento) é resposta normal e não é falha; `stale-status` é o caso esperado de
quem foi cancelado enquanto esperava.

O log leva a classe da falha e o destino — nunca o nome do paciente nem o motivo
declarado na chegada.

### Estado

`scheduling` passa a 208 testes e `encounters` a 172; o projeto vai a **2727
testes em 213 arquivos** (+36, +2 arquivos). Typecheck, lint, build e suíte
completa estão limpos. Teleatendimento continua fora do escopo.

**Fica pendente, com motivo:**

| O quê | Por que não entrou |
| --- | --- |
| Encerrar o atendimento não carimba `completed` | Seria um segundo caminho para o desfecho, e o da agenda grava a decisão de quem opera — inclusive `no_show`, que o encerramento não conhece. Fechar a consulta e afirmar "compareceu" são atos diferentes, e juntá-los tiraria a escolha de quem registra |
| Chamar o paciente não muda a agenda | `called` é estado da FILA (o painel da TV), não do agendamento: entre ser chamado e entrar na sala, o atendimento não começou. Um estado a mais na agenda para o mesmo minuto seria ruído |
| A agenda não oferece "registrar chegada" | Quem observa a chegada é a recepção, na tela da fila. Um botão na agenda criaria uma segunda porta para o mesmo fato, sem a fila que a recepção usa para chamar |
| `deleted_at` em `listProfessionals` | Segue de §8.33: profissional removido por fora do produto ainda aparece no seletor da agenda. É outro módulo e outra fatia |

---

## 9. Como este documento é mantido

Atualizado **na mesma fatia** que muda o estado — nunca depois. Se uma linha
aqui discorda do código, o código está certo e este arquivo está errado.

# Focuss Care — estado real do produto

> Levantado contra o código em **09/08/2026**, branch `feat/telas-e-camada-supabase`.
> Este documento descreve o que **existe e funciona**, não o que
> está planejado — o plano é o [`docs/roadmap.md`](./docs/roadmap.md).
>
> Regra de preenchimento: uma linha só é **COMPLETO** se a fatia vertical fecha
> (UI → action → caso de uso → repositório → teste) e persiste de verdade.
> Tela bonita sem persistência é **PENDENTE**, não "quase pronto".

**Validação atual (10/08/2026):** 1245 testes em 114 arquivos · `typecheck`,
`lint` (global) e `build` limpos.

**Atualização do banco (09/08/2026):** o schema local foi consultado com
`npm run db:types` e continua expondo 56 tabelas; as migrations de módulos
preparados (CRM, formulários, estoque, compras, conciliação, salas, tarefas,
documentos e cofre de integrações) não aparecem integralmente no schema remoto.
Por isso o menu mantém essas rotas bloqueadas até a aplicação confirmada das
migrations. A última consulta não alterou secrets nem executou DDL remoto.

**Commits desta etapa:** `6c536e6` (reparo de policies privadas do Storage),
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

## 9. Como este documento é mantido

Atualizado **na mesma fatia** que muda o estado — nunca depois. Se uma linha
aqui discorda do código, o código está certo e este arquivo está errado.

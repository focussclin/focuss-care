# Focuss Care — dependências externas

> O que precisa existir **fora do repositório** para o produto funcionar, e o que
> acontece quando não existe. Levantado contra o código em **08/08/2026**.
>
> **Nenhum segredo aqui.** Este arquivo lista nomes de variável e onde obtê-las.
> Valores vão para `.env.local`, que não é versionado.

---

## Estado atualizado — 08/08/2026

As quatro migrations pendentes do projeto foram aplicadas no Supabase e
verificadas estruturalmente. O arquivo `src/lib/supabase/database.types.ts`
foi regenerado a partir do schema remoto e commitado em `851688e`.

**Nova exceção desta etapa (09/08/2026):** a migration
`supabase/migrations/20260809_rooms.sql` ainda não foi aplicada. A implementação
de salas e recursos já está no código, mas o menu permanece bloqueado até a
tabela `rooms`, a coluna `appointments.room_id` e a constraint de conflito de
recurso existirem no projeto remoto. Depois de aplicar, execute
`npm run db:types` e publique os tipos regenerados.

**Tarefas (09/08/2026):** a migration
`supabase/migrations/20260809_clinic_tasks.sql` também ainda não foi aplicada.
A tela `/tarefas`, seus contratos e actions já estão no código, mas o item fica
bloqueado e as escritas são recusadas até a tabela `clinic_tasks`, suas policies
e referências existirem no projeto remoto. Depois de aplicar, execute
`npm run db:types` e valide o isolamento entre duas clínicas.

**CRM e Leads (09/08/2026):** a migration
`supabase/migrations/20260809_clinic_leads.sql` foi criada, mas ainda não foi
aplicada. Ela cria `clinic_leads`, `lead_events` e as policies RLS do pipeline.
Depois de aplicá-la, execute `npm run db:types`, valide leitura/escrita com duas
clínicas e só então habilite o item CRM no menu.

**Inbox (09/08/2026):** a leitura da rota `/inbox` já usa `conversations` e
`messages` com escopo de clínica. O recurso ainda não envia nem recebe mensagens:
isso depende de W-01 (provedor WhatsApp, webhook e worker). O item permanece fora
do menu até o contrato do provedor ser escolhido e validado.

**Formulários digitais (09/08/2026):** a migration
`supabase/migrations/20260809_clinic_forms.sql` foi criada, mas ainda não foi
aplicada. Ela cria `clinic_forms` e prepara `clinic_form_responses` com RLS. O
builder, a coleta vinculada a paciente e as actions já estão no código, porém o
item continua bloqueado até a migration existir no projeto remoto. Depois de
aplicar, execute `npm run db:types`, valide isolamento entre duas clínicas e só
então habilite o item no menu. Assinaturas e uploads continuam dependendo de
Storage e do fornecedor de assinatura eletrônica; sem essas configurações, o
app permite rascunho mas bloqueia o envio de formulários que contenham esses
campos.

**Estoque (09/08/2026):** a migration
`supabase/migrations/20260809_inventory.sql` foi criada, mas ainda não foi
aplicada. Ela cria itens, movimentações, RLS e a função atômica de atualização de
saldo. A tela `/estoque` e as actions já estão preparadas; depois de aplicar,
execute `npm run db:types`, valide duas clínicas e concorrência de saídas antes
de habilitar o item no menu.

**Compras e fornecedores (09/08/2026):** a migration
`supabase/migrations/20260809_purchases.sql` foi criada, mas ainda não foi
aplicada. Ela depende de `20260809_inventory.sql` e cria fornecedores, pedidos,
linhas, RLS e RPCs para criação, transição de status e recebimento atômico. A
tela `/compras` e as actions já estão preparadas, mas o item permanece bloqueado
até aplicar as duas migrations na ordem, executar `npm run db:types`, validar
isolamento entre clínicas e conferir que recebimentos atualizam o saldo sem
duplicar movimentos. A criação automática de contas a pagar ainda não faz parte
desta fatia.

**Conciliação bancária (09/08/2026):** a migration
`supabase/migrations/20260809_bank_reconciliation.sql` foi criada, mas ainda não
foi aplicada. Ela cria contas, transações, vínculos de conciliação, RLS e uma
RPC atômica que relaciona entradas a faturas e saídas a despesas. A tela
`/conciliacao` permite lançamento manual enquanto o adapter de extrato bancário
não existe. Depois de aplicar, execute `npm run db:types`, valide isolamento
entre clínicas, repetição de conciliação e o bloqueio de sentido (entrada não
pode apontar para despesa; saída não pode apontar para fatura).

**Provedor bancário:** aguardando configuração externa. Nenhuma credencial é
necessária para o fluxo manual; quando um provedor for escolhido, serão
necessários apenas o contrato/API oficial, URL e segredo armazenados no ambiente
do servidor. Senhas bancárias nunca devem ser solicitadas ou armazenadas pelo
Focuss Care.

**Documentos de pacientes (09/08/2026):** a migration
`supabase/migrations/20260809_patient_documents.sql` foi criada, mas ainda não
foi aplicada. Ela cria `patient_documents`, RLS tenant-scoped e o bucket privado
`patient-documents`, com policies de Storage por `clinic_id`. A rota
`/documentos`, o upload real, os downloads assinados e a auditoria já estão no
código; a tela permanece bloqueada até a migration existir no projeto remoto.
Depois de aplicar, execute `npm run db:types`, verifique o bucket e valide
upload/download com usuários de duas clínicas.

**Tags administrativas de pacientes (09/08/2026):** a migration
`supabase/migrations/20260809_patient_tags.sql` ainda não foi aplicada. Ela cria
`patient_tags`, `patient_tag_links`, policies RLS e a RPC idempotente
`add_patient_tag`. A ficha 360, o painel e as actions já estão preparados, mas
as escritas permanecem bloqueadas até a migration existir no projeto remoto.
Depois de aplicar, execute `npm run db:types` e valide leitura e escrita com
usuários de duas clínicas.

A chave SMTP da Brevo deve ser configurada somente no painel do Supabase, em
Authentication → Emails → SMTP Settings. Ela não pertence ao código do app,
ao `.env.example` nem ao bundle do navegador.

## 0. O caminho mais curto para destravar 8 itens do menu

**Nove migrations estão escritas, revisadas e não aplicadas.** Elas são o único
bloqueio de oito itens do menu — Salas, Tarefas, CRM, Formulários, Estoque,
Compras, Conciliação e Documentos. Não falta código: os módulos estão prontos e
escondidos atrás de itens desabilitados.

**Uma colagem resolve.** `supabase/migrations/APLICAR_TUDO_20260809.sql` reúne as
nove na ordem segura (`inventory` antes de `purchases`, que a referencia), cada
uma no seu próprio `begin`/`commit` — uma falha reverte só o bloco que falhou.

1. Painel do Supabase → SQL Editor → colar o arquivo → Run.
2. `npm run db:types`.
3. Remover os shims `*/infrastructure/*Database.ts`, habilitar os itens em
   `navigation.ts` e limpar `BUILT_BUT_HIDDEN` em `reachableRoutes.test.ts`.

**Se preferir que eu aplique**, preciso de UMA destas no `.env.local` — a chave
secreta atual não serve, porque ela fala com dados e não executa DDL (testado:
não há RPC de SQL, e a Management API recusa a chave com 401):

| Credencial | Onde obter | O que me permite |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Painel → Account → Access Tokens | Aplicar via Management API |
| `DATABASE_URL` | Painel → Project Settings → Database → Connection string | Aplicar via conexão direta |

### Storage: o bucket já está criado

`patient-documents` foi criado em 09/08/2026 com a chave secreta — **privado**,
limite de 20 MB, aceitando apenas PDF e imagem. Documento de paciente é RG, CPF
e termo assinado: bucket público seria uma URL adivinhável com dado pessoal.

As *policies* de `storage.objects` ainda dependem da migration, porque policy é
DDL. O bucket sozinho não libera upload.

---

## 1. Supabase — obrigatório para qualquer dado real

Um único projeto Supabase cobre banco, autenticação e RLS. **É a única dependência
externa que o produto tem hoje.**

### 1.1 Variáveis

| Variável | Onde obter | Exposta ao browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Painel → Project Settings → API → Project URL | Sim |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Painel → Project Settings → API → `anon` / publishable | Sim |
| `SUPABASE_SECRET_KEY` | Painel → Project Settings → API → `service_role` | **Não, nunca** |

`SUPABASE_SECRET_KEY` **ignora RLS e alcança todas as clínicas**. Ela não tem
prefixo `NEXT_PUBLIC_` justamente para que o Next não a inclua no bundle, e o
único arquivo autorizado a lê-la é `src/lib/supabase/admin.ts` — protegido pela
regra 5 do lint (`eslint.config.mjs`).

### 1.2 Sem as variáveis

A aplicação **não quebra**: `src/lib/data-source.ts` detecta a ausência e cai em
modo de demonstração, com os dados de `src/lib/mocks/clinic-data.ts`. Agenda,
pacientes e painel mostram exemplos; **financeiro e convênios ficam vazios de
propósito** — número de dinheiro e guia de autorização inventados são o tipo de
dado que alguém confere uma vez e repete para o contador ou para a operadora.

Toda escrita é recusada nesse modo, com mensagem explícita. Nada finge salvar.

### 1.3 O que precisa estar configurado no projeto Supabase

| Item | Estado verificado | Observação |
|---|---|---|
| Schema (56 tabelas, 1 view, 32 enums, 19 RPCs) | **Aplicado** | Tipos gerados por `npm run db:types` |
| RLS ativa em 56/56 objetos | **Verificado** | Levantamento em `docs/03-banco-de-dados.md` |
| Policy de `INSERT` em `audit_log` | **Aplicada e verificada** | Eventos de mutação podem ser auditados |
| `custom_access_token_hook` | Necessário para as claims de clínica no JWT | Painel → Authentication → Hooks |
| Provedor de e-mail/senha | Necessário para login e cadastro | Painel → Authentication → Providers |
| URL de redirecionamento do callback | `<origem>/auth/callback` | Painel → Authentication → URL Configuration |
| Envio de e-mail (SMTP) | **Necessário para a recuperação de senha** | Ver §1.4 |

### 1.4 Recuperação de senha — o que depende do painel

O código da recuperação está completo (`/recuperar-senha` → e-mail →
`/auth/callback` → `/redefinir-senha`), e **três coisas fora do repositório
decidem se ele funciona de verdade**. Nenhuma delas é segredo; todas são
configuração de painel.

| Item | Onde | Se estiver errado |
|---|---|---|
| `<origem>/auth/callback` na lista de **Redirect URLs** | Authentication → URL Configuration | O Supabase recusa o `redirectTo` e o link do e-mail volta para a `Site URL`, não para a tela de nova senha |
| **Site URL** apontando para o domínio real | Authentication → URL Configuration | Links de produção levam para `localhost` |
| Servidor de **SMTP próprio** | Authentication → Emails → SMTP Settings | O SMTP embutido do Supabase é limitado a poucos e-mails por hora e **não serve para produção**: a maioria dos pedidos simplesmente não chega |

Sobre o **template do e-mail** (Authentication → Emails → Reset Password): o
padrão (`{{ .ConfirmationURL }}`) já funciona — é ele que carrega o código de
uso único até `/auth/callback`. Editar o texto é seguro; trocar a URL não.

**Duas limitações que são do fluxo, não de configuração**, e que a tela já
declara em vez de esconder:

- **O link precisa ser aberto no mesmo navegador que pediu.** O `@supabase/ssr`
  usa PKCE, e o verificador fica num cookie de quem fez o pedido. Abrir o link
  no celular depois de pedir no computador cai em "peça um novo link" — não é
  bug, é o que impede que um link interceptado sirva a outra pessoa.
- **O link vale por pouco tempo e uma vez só.** O prazo é do projeto
  (Authentication → Providers → Email → *Email OTP Expiration*).

**Sem SMTP configurado o produto não quebra e não mente**: a tela responde
sempre "se existir uma conta, o link está a caminho" — a mesma frase para conta
existente, inexistente e falha de envio, porque distinguir uma da outra
transformaria o formulário num verificador de quem tem conta na clínica.

---

## 2. Banco — migrations críticas aplicadas; validações funcionais restantes

As quatro migrations críticas foram aplicadas no Supabase e a consulta de
verificação retornou `true` para cada item: policy de auditoria, tabela/RLS de
glosas, proteção contra sobreposição e RPC de emissão de convite. Este ambiente
local não possui credencial administrativa para ler corpos de RPC ou executar
pgTAP; a aceitação funcional de um convite emitido pela aplicação ainda deve ser
validada com duas contas reais no painel.

**O roteiro executável está em
[`docs/supabase-migrations-runbook.md`](./docs/supabase-migrations-runbook.md)**:
pré-requisitos, backup, dry-run, ordem segura, as consultas de revisão que
bloqueiam cada arquivo, e os testes de tenancy, papel e auditoria depois.

As consultas que ainda destravam módulos futuros são:

| Arquivo em `supabase/migrations/` | Destrava |
|---|---|

E responder a três consultas de diagnóstico, todas em `docs/roadmap.md`:

```sql
-- Assinaturas das RPCs financeiras (destrava emissão fiscal e repasse)
select proname, pg_get_function_arguments(oid) from pg_proc
 where proname in ('issue_invoice','close_cash_session','preview_professional_payout');

-- Convenção do dia da semana (destrava disponibilidade por profissional)
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.availability_rules'::regclass;

-- Valores válidos de sequência fiscal
select distinct kind from public.document_sequences;
```

As migrations continuam versionadas como histórico reproduzível. A emissão usa
`create_invitation` e a aceitação usa `accept_invitation`; o teste funcional com
duas contas é necessário para confirmar no ambiente remoto que os algoritmos de
hash estão alinhados. O módulo de glosas já usa a tabela aplicada, com RLS e
ciclo de acompanhamento persistido.

---

## 3. O que NÃO é dependência externa hoje

Registrado para que ninguém saia procurando:

| Serviço | Situação |
|---|---|
| Provedor de WhatsApp (Evolution, Cloud API) | **Não configurado e não usado.** Nenhuma credencial é lida, e `provider_config` não é escrito nem lido por linha nenhuma do código. `/whatsapp` mostra o estado de conexão vindo de `whatsapp_channels` e declara o que falta — não é mais vitrine |
| Redis / worker de fila | **Não existe.** Previsto para W-01, sem código no repositório |
| Provedor de IA | **Não configurado e não usado.** Nenhuma chamada sai daqui; `/chat-ia` mostra que não há provedor e declara a regra P9 — não é mais vitrine |
| Gateway de pagamento | **Não existe.** B-01 registra pagamento recebido, não processa cobrança |
| Emissor de NFS-e | **Não existe.** O produto registra cobrança interna, não emite documento fiscal |
| Storage para logotipo/anexos | **Bucket não verificado.** Por isso não há upload de marca em `/configuracoes` |
| SMTP próprio | **Não usado.** E-mail de autenticação sai pelo Supabase |

Quando algum destes entrar, ele ganha uma seção aqui **e** um adaptador com
estado de conexão explícito — nunca uma tela que finge estar conectada.

### 3.1 W-01 (WhatsApp/Evolution + worker) — o que falta, em ordem

Avaliado em **08/08/2026** para decidir se dava para começar pela fundação local.
**Não dá**, e o motivo não é falta de vontade: cada peça da fundação depende de
algo que não existe aqui, e escrevê-la agora produziria código sem chamador.

| Peça | Por que não pode ser escrita hoje |
|---|---|
| Contrato do provider (`createInstance`, `connect`, `send`) | O formato viria do que `docs/04-agente-ia.md` **propõe** sobre a Evolution API, não de contrato oficial verificado nem de credencial para testar. Seria uma interface adivinhada, com zero implementações |
| Porta de fila + envelope de evento | Redis/BullMQ não estão instalados (e não devem ser, sem a decisão de infra). Uma porta sem adaptador e um envelope que ninguém produz nem consome são código morto que **parece** progresso |
| Validação de `provider_config` | A regra é boa — a API key nunca pode ir para a coluna, porque `provider_config` sai em backup, log e export. Mas **nada no código escreve ou lê essa coluna**: não há ação "Conectar", nem formulário de canal. Um validador sem chamador se testa contra si mesmo |

**Os dois bloqueios reais, nesta ordem:**

1. **Aprovação de [`docs/04-agente-ia.md`](./docs/04-agente-ia.md)** — o documento é
   uma proposta de arquitetura, e é ele que decide dois processos no mesmo
   repositório, uma instância Evolution por clínica e a fila por conversa. Sem a
   decisão, qualquer contrato escrito agora aposta num desenho que pode mudar.
2. **Infraestrutura e credenciais** — worker e Redis num serviço próprio, mais
   uma instância Evolution com URL e API key. A chave vai para o **ambiente do
   servidor**; em `provider_config` entra só a referência a ela.

O que **já está pronto** e não precisa de migration: `whatsapp_channels`,
`conversations` e `messages` existem com `clinic_id`, e `messages` tem
`provider_message_id` — a chave natural de idempotência para não gravar duas
vezes o mesmo evento reenviado por timeout.

---

## 4. Ambiente de desenvolvimento

| Requisito | Versão |
|---|---|
| Node.js | 20+ (o projeto usa Next 16) |
| npm | Acompanha o Node |

```bash
npm install
cp .env.example .env.local   # preencher com as chaves do seu projeto
npm run dev
```

Sem `.env.local`, `npm run dev` sobe em modo de demonstração — útil para mexer em
tela, inútil para testar persistência.

**Verificação antes de qualquer commit:**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

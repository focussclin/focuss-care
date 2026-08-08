# Focuss Care — dependências externas

> O que precisa existir **fora do repositório** para o produto funcionar, e o que
> acontece quando não existe. Levantado contra o código em **08/08/2026**.
>
> **Nenhum segredo aqui.** Este arquivo lista nomes de variável e onde obtê-las.
> Valores vão para `.env.local`, que não é versionado.

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
| Schema (55 tabelas, 1 view, 31 enums, 19 RPCs) | **Aplicado** | Tipos gerados por `npm run db:types` |
| RLS ativa em 56/56 objetos | **Verificado** | Levantamento em `docs/03-banco-de-dados.md` |
| Policy de `INSERT` em `audit_log` | **Recusa o membro autenticado** | Ver §3 |
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

## 2. Acesso administrativo ao banco — **ausente neste ambiente**

Cinco itens do produto dependem de rodar SQL no projeto, e **nenhum caminho para
isso existe aqui**: não há `DATABASE_URL`, senha do banco nem
`SUPABASE_ACCESS_TOKEN`. É o bloqueio **B1**.

**O roteiro executável está em
[`docs/supabase-migrations-runbook.md`](./docs/supabase-migrations-runbook.md)**:
pré-requisitos, backup, dry-run, ordem segura, as consultas de revisão que
bloqueiam cada arquivo, e os testes de tenancy, papel e auditoria depois.

Resumo do que há para aplicar, em ordem de impacto:

| Arquivo em `supabase/migrations/` | Destrava |
|---|---|
| `20260807_audit_log_insert_policy.sql` | **Toda a trilha de auditoria.** Hoje nenhum evento é gravado |
| `20260808_appointments_no_overlap.sql` | Atomicidade da recusa de horário sobreposto |
| `20260807_create_invitation_rpc.sql` | Emissão de convite pela aplicação (revisar o algoritmo de hash antes) |
| `20260808_insurance_claim_denials.sql` | Controle de glosas |

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

**Nenhuma migration foi aplicada.** Elas existem para serem revisadas por quem
tem acesso — não para dar a impressão de que o banco já mudou.

Duas das quatro têm **gate de revisão**, e o runbook os detalha: a de glosas
depende de `can_access_financial()` cobrir o papel `finance`, e a de convite
depende de o algoritmo de hash bater com `accept_invitation` — se não bater,
todo convite emitido é recusado no aceite, e o defeito só aparece quando uma
pessoa real tenta entrar.

---

## 3. O que NÃO é dependência externa hoje

Registrado para que ninguém saia procurando:

| Serviço | Situação |
|---|---|
| Provedor de WhatsApp (Evolution, Cloud API) | **Não configurado e não usado.** A tela `/whatsapp` é vitrine; nenhuma credencial é lida |
| Redis / worker de fila | **Não existe.** Previsto para W-01, sem código no repositório |
| Provedor de IA | **Não configurado e não usado.** `/chat-ia` é vitrine; nenhuma chamada sai daqui |
| Gateway de pagamento | **Não existe.** B-01 registra pagamento recebido, não processa cobrança |
| Emissor de NFS-e | **Não existe.** O produto registra cobrança interna, não emite documento fiscal |
| Storage para logotipo/anexos | **Bucket não verificado.** Por isso não há upload de marca em `/configuracoes` |
| SMTP próprio | **Não usado.** E-mail de autenticação sai pelo Supabase |

Quando algum destes entrar, ele ganha uma seção aqui **e** um adaptador com
estado de conexão explícito — nunca uma tela que finge estar conectada.

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

# Focuss Care — chaves, APIs e infraestrutura

Este documento lista somente nomes de variáveis, configurações e credenciais
necessárias. **Nunca cole valores reais neste arquivo ou no Git.** Os valores
devem ficar no `.env.local` (desenvolvimento), `.dev.vars` (Worker local) ou no
painel de secrets do provedor de execução.

## 1. Situação atual

O projeto Supabase escolhido é:

```text
https://pqlgoekzjemrncdzppnl.supabase.co
```

Ele foi criado recentemente e a leitura administrativa confirmou **zero
tabelas**. O código do repositório possui migrations incrementais, mas não
possui um dump/base migration completo da fundação original. Antes de aplicar
as migrations de módulos, é necessário migrar o schema base do projeto antigo
ou duplicar/forkar o projeto antigo no Supabase.

As chaves atualmente configuradas precisam ser as chaves do projeto novo. URL e
chave de outro projeto não podem ser misturadas.

## 2. Preenchimento imediato — desenvolvimento local

Arquivo: `.env.local` (não versionado).

| Variável | Obrigatória | Onde usar | Exposição |
|---|---:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto novo | Browser — pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sim | Cliente browser/SSR com RLS | Browser — pública |
| `SUPABASE_SECRET_KEY` | Sim para ferramentas administrativas | Somente servidor e geração de tipos | Nunca no browser |
| `APP_URL` | Sim fora do localhost | Links de convite e callback | Servidor |
| `INTEGRATION_ENCRYPTION_KEY` | Sim para o cofre | AES-GCM das credenciais das clínicas | Somente servidor |

Modelo sem valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://pqlgoekzjemrncdzppnl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_URL=http://localhost:3000
INTEGRATION_ENCRYPTION_KEY=
```

A chave pública do projeto novo foi sincronizada no `.env.local` sem ser
exibida. `SUPABASE_SECRET_KEY` permanece vazia até o preenchimento manual da
chave secreta real em **Project Settings → API**; o Auth do projeto novo foi
validado com HTTP 200. Não use valor mascarado, token de Management API ou
chave de outro projeto nessa variável.

Ao preencher, deixe somente uma declaração de `SUPABASE_SECRET_KEY` no
`.env.local`; removi o valor mascarado do fluxo de runtime e a variável deve
conter apenas a chave real do projeto novo.

`SUPABASE_SECRET_KEY` não é um token de migration. Ele não executa DDL pelo
PostgREST e nunca deve ser colocado em `NEXT_PUBLIC_*`.

## 3. Migração do schema base para o projeto novo

Estas variáveis são temporárias e não são necessárias no runtime do app:

| Variável | Finalidade |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Consultar a Management API e executar SQL administrativo autorizado |
| `SUPABASE_SOURCE_DATABASE_URL` | Conexão PostgreSQL somente leitura com o projeto antigo |
| `SUPABASE_TARGET_DATABASE_URL` | Conexão PostgreSQL de destino com o projeto novo |

O caminho seguro será:

1. obter um dump somente de schema do projeto antigo;
2. revisar extensões, funções, policies RLS e hooks de Auth;
3. aplicar a fundação no projeto novo;
4. aplicar as migrations incrementais em ordem;
5. regenerar `database.types.ts`;
6. testar isolamento entre duas clínicas;
7. só então apontar o app definitivamente para o projeto novo.

Não usar uma chave API pública para esse processo e não executar o bundle
incremental em um projeto que ainda não possui `clinics`, `profiles`, Auth,
RLS e as funções base.

## 4. Supabase Auth e Google

Configuração no painel do Supabase, não no código:

| Configuração | Valor |
|---|---|
| Site URL local | `http://localhost:3000` |
| Redirect URL local | `http://localhost:3000/auth/callback` |
| Redirect URL produção | `https://DOMINIO/auth/callback` |
| Google Client ID | fornecido no Google Cloud OAuth |
| Google Client Secret | fornecido no Google Cloud OAuth |
| Callback do provedor Google | `https://pqlgoekzjemrncdzppnl.supabase.co/auth/v1/callback` |

Para recuperação de senha, configurar SMTP em **Authentication → Emails → SMTP
Settings**. A chave SMTP não vai para o frontend.

## 5. Cofre de integrações da clínica

Depois que `20260809_integration_credentials.sql` estiver aplicada e
`INTEGRATION_ENCRYPTION_KEY` configurada, estas credenciais são cadastradas em
`/configuracoes`. Elas não devem virar variáveis globais do Worker.

### Brevo

- `apiKey` — envio transacional/API;
- `smtpKey` — recuperação de senha/SMTP, quando configurado no Supabase;
- `senderEmail` — remetente verificado.

### Evolution API / WhatsApp

- `baseUrl`;
- `apiKey`;
- `instanceName`.

Ainda depende de webhook, worker/Redis, regras de opt-in e validação da instância.

### DeepSeek

- `apiKey`;
- `baseUrl` opcional.

A chave sozinha não ativa IA: falta o worker, controle de custo, ferramentas
permitidas, RBAC, auditoria e modo de aprovação.

### Google Calendar

- `clientId`;
- `clientSecret`;
- `redirectUri`.

### Outlook Calendar / Microsoft Graph

- `clientId`;
- `clientSecret`;
- `tenantId`;
- `redirectUri`.

## 6. Deploy Cloudflare Workers — se continuar nesse destino

| Variável | Finalidade |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy não interativo do Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Opcional, quando o pipeline precisar fixar a conta |
| `NEXT_PUBLIC_SUPABASE_URL` | Variável pública do Worker |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Variável pública do Worker |
| `SUPABASE_SECRET_KEY` | Secret do Worker |
| `APP_URL` | Variável do Worker |
| `INTEGRATION_ENCRYPTION_KEY` | Secret do Worker |

Build command: `npx opennextjs-cloudflare build`.
Deploy command: `npx wrangler deploy`.

## 7. Troca para uma VPS/Coolify

Cloudflare Workers e VPS/Coolify são destinos de execução diferentes. O app
deve ter um destino principal por ambiente; não faça deploy nos dois esperando
que compartilhem sessão ou arquivos locais.

Para preparar uma VPS nova, ainda serão necessários:

| Item | Status |
|---|---|
| Provedor e região da VPS | Pendente de escolha |
| Host/IP e domínio | Pendente |
| Acesso SSH ou token do Coolify | Pendente |
| Dockerfile/estratégia de execução | `Dockerfile` e `docs/VPS_MIGRATION.md` preparados |
| Proxy TLS (Cloudflare/Nginx/Caddy) | Pendente |
| DNS apontando para o destino | Pendente |
| Secrets do runtime | Reutilizar nomes da seção 2 |
| Redis/worker | Só quando WhatsApp, automações e IA forem ativados |

Variáveis possíveis para automação de infraestrutura, quando o destino for
escolhido — não preencher ainda:

```env
COOLIFY_API_URL=
COOLIFY_API_TOKEN=
VPS_HOST=
VPS_PORT=22
VPS_USER=
VPS_SSH_PRIVATE_KEY=
VPS_SSH_KNOWN_HOSTS=
REDIS_URL=
```

Tokens de GitHub, Cloudflare, Coolify, Hostinger e VPS nunca devem ser
cadastrados no cofre de uma clínica.

O container de VPS não recebe secrets no build. Eles entram somente no runtime
do Coolify/VPS, conforme `docs/VPS_MIGRATION.md`.

## 8. Integrações futuras sem credencial definida

Não criar variáveis falsas antes de escolher o fornecedor:

- gateway de pagamentos/PIX/cartão;
- provedor de e-mail transacional fora do Supabase Auth;
- provedor de teleatendimento — fora do escopo atual;
- Open Finance;
- assinatura eletrônica;
- Google/Outlook Calendar em produção;
- observabilidade e alertas.

Quando um fornecedor for escolhido, adicionar somente o adapter, os nomes de
secrets e o procedimento de rotação correspondente.

## 9. Regras de segurança

- nunca enviar secrets no chat, GitHub, screenshots ou logs;
- nunca usar `SUPABASE_SECRET_KEY` em componente client;
- nunca commitar `.env.local`, `.dev.vars` ou chaves de VPS;
- rotacionar qualquer credencial já compartilhada;
- limitar tokens por escopo e ambiente;
- armazenar credenciais de clínica somente no cofre cifrado;
- validar RLS e RBAC antes de habilitar qualquer módulo.

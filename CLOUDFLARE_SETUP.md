# Deploy do Focuss Care na Cloudflare

O projeto está preparado para **Cloudflare Workers + OpenNext**. Não use
Cloudflare Pages como site estático: o Focuss Care possui App Router, SSR,
Server Actions, autenticação e rotas privadas.

## 1. Autenticar o Wrangler

Execute em um terminal com acesso à conta Cloudflare:

```bash
npx wrangler login
npx wrangler whoami
```

O `whoami` precisa mostrar a conta correta antes do deploy.

## 2. Variáveis do Worker

No painel do Worker, em **Settings → Variables and Secrets**, configure:

Variáveis públicas:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Secret do Worker:

```text
SUPABASE_SECRET_KEY
```

Nunca coloque `SUPABASE_SECRET_KEY` em `NEXT_PUBLIC_*`, no `wrangler.jsonc`,
no GitHub ou no bundle do navegador.

Para testar o runtime Cloudflare localmente, copie `.dev.vars.example` para
`.dev.vars` e preencha apenas na máquina local.

## 3. Validar antes de publicar

```bash
npm run build
npm run preview
```

O `preview` usa o runtime `workerd`, mais próximo do Worker publicado, enquanto
`npm run dev` continua sendo o fluxo de Fast Refresh.

## 4. Publicar

```bash
npm run deploy
```

O comando publica no Worker `focuss-care`. O domínio `*.workers.dev` pode ser
usado primeiro; depois, associe o domínio definitivo no painel da Cloudflare.

## 5. Atualizar o Supabase Auth

Depois de obter o domínio público, adicione em **Authentication → URL
Configuration → Redirect URLs**:

```text
https://SEU-DOMINIO/auth/callback
```

Mantenha também o callback do provedor Google no Google Cloud:

```text
https://pvyfeeobywpwwyrpphfs.supabase.co/auth/v1/callback
```

## 6. Brevo

O Focuss Care usa o Supabase Auth para enviar recuperação de senha. Portanto,
Brevo é configurada no Supabase, em **Authentication → Emails → SMTP Settings**:

```text
Host: smtp-relay.brevo.com
Porta: 587
Usuário: SMTP Login mostrado pela Brevo
Senha: SMTP Key nova
Remetente: domínio/e-mail verificado na Brevo
```

A chave SMTP nunca deve entrar no repositório ou no Worker. A chave enviada na
conversa deve ser revogada e recriada antes da configuração.

# Cloudflare Workers Builds: branch e autenticacao

## Branch usado pelo deploy atual

```text
feat/telas-e-camada-supabase
```

O branch precisa conter o commit atual do produto. Se o Workers Builds estiver
configurado para `main`, a Cloudflare pode compilar uma versao antiga, inclusive
com middleware Node.js que nao existe mais no codigo atual.

Depois de trocar o branch no projeto da Cloudflare:

1. Limpe o cache de build do Workers Builds.
2. Use `npx opennextjs-cloudflare build` como Build command.
3. Use `npx wrangler deploy` como Deploy command.
4. Execute uma nova build.

## Token para execucao nao interativa

Configure `CLOUDFLARE_API_TOKEN` como secret do ambiente de build. Nunca
commite o valor, nao o coloque no `.env.example` e nao o exponha no frontend.

O token compartilhado anteriormente na conversa deve ser revogado e substituido
por um novo antes da proxima publicacao.

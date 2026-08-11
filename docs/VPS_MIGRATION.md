# Migracao para VPS/Coolify

## Estado

O projeto continua rodando localmente com Fast Refresh e o destino Cloudflare
nao foi alterado. A imagem `Dockerfile` prepara um segundo destino de execucao
para uma VPS/Coolify, mas o cutover depende de host, dominio e credenciais do
novo servidor.

## Configuracao do servico

- Build: `docker build -t focuss-care .`
- Execucao: `docker run --env-file .env.production --publish 3000:3000 focuss-care`
- Porta interna: `3000`
- Health check: `GET /login`
- Comando do container: `npm run start`
- Node usado na imagem: `24-bookworm-slim`

No Coolify, usar o repositorio Git como fonte e selecionar `Dockerfile`. O
arquivo `.env.production` nao deve ser commitado; cadastrar cada valor no
painel de secrets do Coolify.

## Variaveis do runtime

Preencher somente no painel do ambiente, usando a lista completa em
[`PROJECT_KEYS_AND_INTEGRATIONS.md`](../PROJECT_KEYS_AND_INTEGRATIONS.md):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `APP_URL`
- `INTEGRATION_ENCRYPTION_KEY`

`SUPABASE_SECRET_KEY` e `INTEGRATION_ENCRYPTION_KEY` sao exclusivamente de
servidor. Nunca usa-los como `NEXT_PUBLIC_*`.

## Cutover seguro

1. Escolher provedor, regiao, IP/host, dominio e acesso SSH/Coolify.
2. Criar o servico em modo privado ou com um subdominio temporario.
3. Configurar secrets do runtime e validar `/login`, login, callback OAuth e
   leitura autorizada do Supabase.
4. Confirmar que o projeto Supabase novo possui a fundacao completa do schema;
   hoje ele esta vazio e nao deve receber migrations incrementais isoladas.
5. Executar smoke tests de autenticacao, RLS, tenant e rotas privadas.
6. Configurar TLS e apontar o DNS somente depois dos testes.
7. Manter o Worker Cloudflare disponivel para rollback durante a janela de
   observacao.

## Ainda pendente

- destino da VPS (provedor/regiao/IP);
- dominio e DNS;
- token do Coolify ou acesso SSH com chave nova;
- Redis/worker, somente quando WhatsApp, automacoes ou IA forem habilitados;
- fundacao/schema do novo Supabase;
- secrets reais do runtime cadastrados no novo ambiente.

Nao executar deploy automatico neste estado: ainda nao existe um destino
confirmado e a troca de DNS seria uma alteracao externa de producao.

# Focuss Care — Estrutura de Pastas

> Etapa 2. Depende de [`01-arquitetura.md`](./01-arquitetura.md).
> Legenda de propriedade: 💻 Claude (código) · 🎨 Codex (design) · ⚙️ compartilhado

## 1. Raiz do projeto

Config fica na raiz; código vai para `src/`. Confirmado em
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/src-folder.md`:
`/public`, `package.json`, `next.config.ts`, `tsconfig.json` e `.env.*` **permanecem na raiz**.

```
focuss-care/
├── .claude/                    ⚙️  configuração do Claude Code
├── .github/workflows/          💻  CI/CD
├── docs/                       ⚙️  arquitetura, roadmap, decisões
├── public/                     🎨  assets estáticos (fica na raiz — exigência do Next)
├── supabase/                   💻  schema, migrations, políticas RLS
├── src/                        ⚙️  todo o código da aplicação
├── next.config.ts              💻
├── tsconfig.json               💻
├── package.json                💻
├── components.json             🎨  config do shadcn/ui
└── Dockerfile                  💻
```

**Migração necessária:** hoje o `app/` está na raiz. Precisa virar `src/app/`. A doc é
explícita: *"`src/app` será ignorado se `app` existir na raiz"* — as duas pastas não
coexistem. O `tsconfig.json` também muda: `"@/*": ["./*"]` → `"@/*": ["./src/*"]`.

## 2. `supabase/` — a fonte de verdade do banco

```
supabase/
├── migrations/                 💻  versionadas, aplicadas pelo CI — nunca pelo painel
│   ├── 0001_extensions.sql
│   ├── 0002_tenancy.sql            clinics, clinic_members, papéis
│   ├── 0003_auth_hook.sql          custom access token hook (claims no JWT)
│   ├── 0004_patients.sql
│   └── ...
├── policies/                   💻  RLS por tabela, um arquivo cada
├── functions/                  💻  edge functions (webhooks, jobs)
├── tests/                      💻  pgTAP — testes de isolamento entre tenants
└── seed.sql                    💻  dados de desenvolvimento
```

`tests/` não é opcional. Cada tabela de tenant precisa de um teste que prove que o
usuário da clínica A não enxerga linha da clínica B. É a única forma de garantir que
uma policy não regrediu.

## 3. `src/app/` — apenas roteamento

Regra: **`app/` não contém lógica de negócio.** Um `page.tsx` monta o container do
módulo e nada mais. Isso mantém as rotas finas e a lógica testável fora do Next.

```
src/app/
├── (auth)/                     🎨  layout próprio, sem sidebar
│   ├── login/page.tsx
│   ├── cadastro/page.tsx
│   ├── recuperar-senha/page.tsx
│   ├── nova-senha/page.tsx
│   └── layout.tsx
│
├── (app)/                      ⚙️  área autenticada
│   ├── dashboard/page.tsx
│   ├── pacientes/
│   │   ├── page.tsx
│   │   ├── novo/page.tsx
│   │   └── [patientId]/
│   │       ├── page.tsx
│   │       ├── prontuario/page.tsx
│   │       └── financeiro/page.tsx
│   ├── agenda/page.tsx
│   ├── atendimentos/page.tsx
│   ├── financeiro/page.tsx
│   ├── convenios/page.tsx
│   ├── funcionarios/page.tsx
│   ├── chat-ia/page.tsx
│   ├── whatsapp/page.tsx
│   ├── automacoes/page.tsx
│   ├── relatorios/page.tsx
│   ├── configuracoes/page.tsx
│   ├── layout.tsx                  sidebar + topbar + providers
│   ├── loading.tsx                 skeleton de streaming
│   └── error.tsx
│
├── (marketing)/                🎨  landing, preços, contato — público, SEO
│
├── api/                        💻  só webhooks de terceiros
│   ├── webhooks/whatsapp/route.ts
│   └── webhooks/pagamentos/route.ts
│
├── layout.tsx                  ⚙️  root: fontes, tema, html lang="pt-BR"
├── error.tsx                   🎨
├── not-found.tsx               🎨
├── unauthorized.tsx            🎨  401 — API nativa do Next 16
├── forbidden.tsx               🎨  403 — API nativa do Next 16
└── globals.css                 🎨
```

### Por que quase não existem Route Handlers

Server Actions cobrem as mutações e Server Components cobrem as leituras. `api/` fica
reservado para o que **não é o nosso frontend chamando**: webhooks de WhatsApp e de
gateway de pagamento, que precisam de um endpoint HTTP real.

### `unauthorized.tsx` / `forbidden.tsx`

Novidade do Next 16. As funções `unauthorized()` e `forbidden()` interrompem a
renderização com status 401/403 e renderizam esses arquivos. Exigem
`experimental.authInterrupts: true`. Isso substitui a gambiarra de redirecionar para
`/login?erro=sem-permissao` — o RBAC ganha semântica HTTP correta.

## 4. `src/proxy.ts` — ex-`middleware.ts`

```
src/proxy.ts                    💻
```

O nome `middleware` foi **deprecado** no Next 16. A doc avisa que o proxy pode ser
implantado no CDN e **não deve depender de módulos compartilhados ou globais**.

**Escopo do nosso proxy — deliberadamente mínimo:**

1. Renovar a sessão do Supabase (refresh do cookie)
2. Redirecionar para `/login` quem não tem sessão
3. Nada mais

Autorização de papel, resolução de clínica ativa e regra de negócio **não entram aqui**.
Rodam no servidor, dentro do pipeline de Server Actions e Server Components, onde há
acesso ao banco e ao contexto completo.

## 5. `src/modules/` — o coração

Cada módulo é uma fatia vertical com as quatro camadas. Anatomia completa:

```
src/modules/patients/
├── domain/                     💻  TS puro — sem React, sem Supabase
│   ├── Patient.ts                  entidade + invariantes
│   ├── PatientId.ts                value object
│   ├── Cpf.ts                      value object com validação de dígito
│   ├── PatientRepository.ts        PORTA (interface)
│   └── errors.ts
│
├── application/                💻  casos de uso
│   ├── RegisterPatient.ts
│   ├── UpdatePatient.ts
│   ├── SearchPatients.ts
│   └── ArchivePatient.ts
│
├── infrastructure/             💻  ADAPTADORES
│   ├── SupabasePatientRepository.ts
│   └── mappers/PatientMapper.ts    linha do banco ⇄ entidade
│
├── actions/                    💻  fronteira de entrada (Server Actions)
│   ├── registerPatient.action.ts
│   └── searchPatients.action.ts
│
├── schemas/                    💻  Zod — validação e tipos derivados
│   └── patient.schema.ts
│
├── ui/                         ⚙️  FRONTEIRA CLAUDE / CODEX
│   ├── PatientTable.props.ts       💻  contrato — escrito PRIMEIRO
│   ├── PatientTable.view.tsx       🎨  JSX puro, props entram
│   ├── PatientTable.container.tsx  💻  busca dados, passa props
│   ├── PatientForm.props.ts        💻
│   ├── PatientForm.view.tsx        🎨
│   └── PatientForm.container.tsx   💻
│
└── index.ts                    💻  ÚNICA porta pública do módulo
```

### Os 14 módulos

| Pasta | Domínio | Tipo |
|---|---|---|
| `_shared/` | tipos e utilitários entre módulos | base |
| `identity/` | clínicas, usuários, vínculos, papéis | **rico** |
| `patients/` | cadastro, histórico, documentos | magro |
| `scheduling/` | agenda, horários, conflitos, encaixes | **rico** |
| `encounters/` | atendimentos, fila de espera | **rico** |
| `records/` | prontuários, evoluções, assinatura | **rico** |
| `billing/` | financeiro, contas, repasses | **rico** |
| `insurance/` | convênios, tabelas, glosas | **rico** |
| `staff/` | funcionários, permissões, escalas | magro |
| `ai/` | chat, assistente, RAG, tools | **rico** |
| `whatsapp/` | mensagens, templates, sessões | magro |
| `automation/` | gatilhos, regras, filas | **rico** |
| `reporting/` | relatórios, projeções | magro |
| `settings/` | configurações da clínica | magro |

"Rico" = entidades com invariantes. "Magro" = Zod + repositório. Cobrar cerimônia de
DDD em CRUD é desperdício, e desperdício em SaaS vira lentidão de entrega.

### `_shared/` — o antídoto contra duplicação

```
src/modules/_shared/
├── domain/
│   ├── Entity.ts               classe base
│   ├── ValueObject.ts
│   ├── Result.ts               retorno tipado de erro, sem throw solto
│   ├── DomainEvent.ts
│   ├── Money.ts                centavos — nunca float para dinheiro
│   ├── DateRange.ts
│   └── Paginated.ts
├── application/
│   ├── UseCase.ts              interface base
│   └── createAction.ts         ⭐ o pipeline único de Server Action
└── infrastructure/
    └── BaseSupabaseRepository.ts
```

`createAction.ts` é o arquivo mais importante do sistema. Ele encapsula
`autenticar → clínica ativa → autorizar papel → validar Zod → executar → revalidar → auditar`.
Enquanto toda mutação passar por ele, é impossível esquecer um passo de segurança.

## 6. `src/components/` — design system 🎨

```
src/components/
├── ui/                         🎨  primitivos shadcn/ui
│   ├── button.tsx  card.tsx  dialog.tsx  input.tsx  table.tsx ...
├── layout/                     🎨  casca da aplicação
│   ├── Sidebar.tsx  Topbar.tsx  ClinicSwitcher.tsx  ThemeToggle.tsx
└── shared/                     🎨  compostos reutilizáveis
    ├── DataTable.tsx  EmptyState.tsx  PageHeader.tsx  StatCard.tsx
```

Território do Codex. Nenhum arquivo aqui importa Supabase, TanStack Query ou Server
Action — são componentes de apresentação, alimentados por props.

## 7. `src/lib/` e `src/services/` — a diferença

```
src/lib/                        💻  infraestrutura interna
├── supabase/
│   ├── client.ts                   browser
│   ├── server.ts                   RSC/actions — RLS ativa
│   ├── admin.ts                    service role — `import 'server-only'`
│   └── types.gen.ts                gerado do schema
├── auth/
│   ├── session.ts                  sessão + clínica ativa
│   ├── permissions.ts              matriz papel × ação
│   └── guards.ts                   unauthorized() / forbidden()
├── cache/
│   └── tags.ts                     ⭐ toda tag inclui clinicId
├── errors/
└── utils/cn.ts

src/services/                   💻  adaptadores de terceiros
├── llm/                            porta + adapter do provedor de IA
├── whatsapp/
├── storage/
├── email/
└── observability/
```

`lib/` é a fundação da nossa aplicação. `services/` fala com o mundo externo. Um
módulo que precisa de WhatsApp depende da **interface** em `services/whatsapp`, nunca
do SDK concreto.

### `cache/tags.ts`

```ts
export const cacheTags = {
  patients: (clinicId: string) => `clinic:${clinicId}:patients`,
  patient:  (clinicId: string, id: string) => `clinic:${clinicId}:patient:${id}`,
  agenda:   (clinicId: string, date: string) => `clinic:${clinicId}:agenda:${date}`,
} as const
```

Ninguém escreve tag de cache à mão. Toda tag sai desta fábrica, e toda tag carrega o
`clinicId`. É assim que o vazamento entre tenants deixa de depender de disciplina.

## 8. Demais pastas

```
src/hooks/                      💻  hooks globais (useDebounce, useMediaQuery)
src/providers/                  ⚙️  QueryProvider, ThemeProvider, SupabaseProvider
src/contexts/                   💻  ActiveClinicContext, PermissionsContext
src/types/                      💻  tipos globais e utilitários de tipo
src/utils/                      💻  funções puras (formatCpf, formatCurrency)
src/styles/
├── tokens.primitives.css       🎨  valores: hex, raios, sombras, easing
├── tokens.semantic.css         💻  mapeamento semântico + dark mode
└── animations.css              🎨
```

**`hooks/` vs `modules/*/ui/hooks`:** se o hook serve a mais de um módulo, é global.
Se serve a um só, mora dentro dele. Hook de domínio em pasta global é o começo do
acoplamento que vaza para todo o sistema.

## 9. Decisão: onde vive o tenant?

Três opções para identificar a clínica ativa:

| Abordagem | Custo | Veredito |
|---|---|---|
| Subdomínio (`clinica.focusscare.com`) | DNS wildcard, SSL, cookies cross-subdomain | ❌ complexidade alta cedo demais |
| Path (`/c/[slug]/pacientes`) | Todas as rotas ganham um segmento; todo link precisa do slug | ❌ ruído permanente |
| **Cookie de sessão + seletor na UI** | Trocar de clínica é uma ação, não uma URL | ✅ **escolhida** |

A clínica ativa fica em cookie httpOnly, validada contra as claims do JWT a cada
request. URLs ficam limpas (`/pacientes`), e o `'use cache: private'` do Next 16 lê
esse cookie sem nunca gravar o resultado no servidor — exatamente o comportamento
que dados de saúde exigem.

**Limitação aceita:** não dá para abrir duas clínicas em duas abas do mesmo browser.
Na prática, o usuário atende em uma clínica por vez. Se virar demanda real de cliente,
migramos para path-based — decisão adiável sem retrabalho estrutural.

## 10. Regras de ESLint que sustentam a arquitetura

Sem isto, tudo acima é apenas uma sugestão simpática.

```
1. domain/ não importa: react, next, @supabase/*, application/, infrastructure/
2. application/ não importa: react, next, infrastructure/ (só a porta do domain)
3. *.view.tsx não importa: @supabase/*, */actions/*, @tanstack/react-query, */application/*
4. modules/a não importa modules/b/<interno> — só `modules/b` (o index.ts)
5. lib/supabase/admin.ts só pode ser importado por: actions/, api/, services/, supabase/functions/
6. Nada fora de infrastructure/ importa o SDK do Supabase diretamente
```

Regras 3 e 5 são as que protegem contra as duas piores falhas: designer buscando dados
na view (quebra a fronteira com o Codex) e service role key alcançando o cliente
(expõe todas as clínicas).

## 11. Ordem de criação

Esta estrutura **não** será criada de uma vez. Pastas vazias são ruído. A ordem:

1. Migrar `app/` → `src/app/` e ajustar `tsconfig.json`
2. `lib/` + `modules/_shared/` — a fundação
3. `supabase/migrations/` até a tenancy funcionar ponta a ponta
4. `modules/identity/` — sem tenancy, nenhum outro módulo existe
5. Um módulo vertical completo como referência viva (`patients`)
6. Os demais, seguindo o padrão já provado

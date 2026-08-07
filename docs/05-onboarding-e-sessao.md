# I-01 — Onboarding real e sessão/tenant

> Implementação da feature **I-01** do [`roadmap.md`](./roadmap.md) §14.
> Escrito contra o código real em **07/08/2026**, branch `feat/telas-e-camada-supabase`.

Este documento descreve o que a fatia entrega, onde cada decisão vive, e —
principalmente — **o que ficou pendente e por quê**. Nenhuma afirmação aqui sobre
o banco remoto foi inventada: o que não pôde ser verificado está marcado como
pendente.

---

## 1. O que a fatia entrega

| # | Entrega | Onde |
|---|---|---|
| 1 | Schema Zod de clínica (`trade_name` + `slug`), com slugs reservados | `src/modules/identity/schemas/clinic.schema.ts` |
| 2 | Schema Zod de cadastro de conta | `src/modules/identity/schemas/signUp.schema.ts` |
| 3 | Server Action que cria a clínica via `create_clinic(p_slug, p_trade_name)` | `src/modules/identity/actions/createClinic.action.ts` |
| 4 | Server Action de cadastro (`signUp`) | `src/modules/identity/actions/signUp.action.ts` |
| 5 | Camada de acesso à sessão (DAL) — quem é o usuário e ele tem clínica | `src/lib/auth/session.ts` |
| 6 | `/onboarding` como formulário real (loading / erro / sucesso) | `src/modules/identity/ui/OnboardingForm.{props,view,container}.tsx` |
| 7 | `/cadastro` como formulário real | `src/modules/identity/ui/SignUpForm.{props,view,container}.tsx` |
| 8 | `DataSource` com `needs-onboarding` separado de `demo` | `src/lib/data-source.ts` |
| 9 | Casca com identidade real da sessão | `src/app/(app)/layout.tsx` |
| 10 | `OnboardingScreen` removido da vitrine | `src/modules/workspace/ui/OperationsScreens.tsx` |

---

## 2. As três camadas de proteção do grupo `(app)`

A divisão segue a doc do Next 16 (`01-app/02-guides/authentication.md`, seção
_Optimistic checks with Proxy_ e _Creating a Data Access Layer_). Ela existe
porque **nenhuma das três, sozinha, é suficiente**:

| Camada | Arquivo | O que decide | Por que não basta sozinha |
|---|---|---|---|
| **Proxy** (otimista) | `src/proxy.ts` | Há cookie de sessão? Não → `/login` | Roda em todo prefetch; consulta a banco aqui custa em toda navegação. Lê cookie, não valida vínculo. |
| **Render no servidor** | `src/app/(app)/layout.tsx`, `src/app/(auth)/onboarding/page.tsx` | Sessão válida? Tem clínica? | Layout não re-renderiza em navegação client-side (Partial Rendering) — a doc do Next avisa explicitamente. |
| **Repositórios** (final) | `src/lib/data-source.ts` + `modules/*/infrastructure/repository.ts` | Nenhum dado sai sem clínica ativa | É a que fica colada na fonte de dados — e a única que vale se alguém montar um repositório fora da casca. |

Fluxo resultante:

```
sem sessão            → /login          (proxy, e de novo no layout)
sessão sem clínica    → /onboarding     (layout + repositórios)
sessão com clínica    → dashboard       (/onboarding devolve ao dashboard)
Supabase não configurado → demonstração local, sem banco
```

---

## 3. `demo` ≠ `needs-onboarding` — a dívida D8/R7 paga

Antes desta fatia, `resolveDataSource()` caía em `demo` em **dois** casos: sem
Supabase configurado **e** com usuário autenticado sem vínculo. O segundo caso é
que era o problema: um usuário real via a clínica fictícia, com números que
pareciam dele. Um bug de tenancy de verdade seria indistinguível dessa tela.

Agora são estados distintos:

```ts
type DataSource =
  | { mode: 'supabase'; client; clinicId }   // sessão com clínica ativa
  | { mode: 'needs-onboarding' }             // autenticado sem clínica → /onboarding
  | { mode: 'demo'; clinicId: 'demo-clinic' } // SOMENTE sem Supabase no ambiente
```

**Regra dura:** `demo` só existe quando `isSupabaseConfigured()` é falso. Usuário
autenticado nunca vê dado fictício — nem no dashboard, nem na agenda, nem em
pacientes.

O mock de `currentUser` sobrevive em exatamente dois lugares
(`src/app/(app)/layout.tsx` e `src/app/(app)/dashboard/page.tsx`), sempre atrás de
`status === 'not-configured'`. As **métricas** do dashboard continuam mockadas —
isso é a feature T-01, fora do escopo desta.

---

## 4. Segurança da criação de clínica

- A action usa `createSupabaseServerClient()` — **cliente com a sessão do
  usuário**. A `SUPABASE_SECRET_KEY` não entra em nenhum ponto deste caminho.
- `create_clinic` deriva o dono de `auth.uid()`; não recebe id de usuário como
  parâmetro. Não há como criar clínica em nome de outra pessoa, nem passando
  `clinicId` do cliente (P3 de `01-arquitetura.md`).
- Mensagens de erro são genéricas e não vazam detalhe do banco:

| Situação | Mensagem ao usuário |
|---|---|
| Slug duplicado (`23505` / texto de unique violation) | "Este endereço já está em uso. Escolha outro." — marcada no campo |
| Sessão ausente/expirada, RLS recusou (`42501`, `PGRST301`) | "Sua sessão expirou. Entre novamente para continuar." |
| Falha de conexão / erro não classificado | "Não foi possível criar a clínica agora. Tente novamente." |

- O cadastro (`signUp`) nunca revela se um e-mail já existe: e-mail novo e e-mail
  já cadastrado terminam na mesma mensagem de "confirme seu e-mail".

---

## 5. O refresh de claims depois de `create_clinic`

`current_clinic_id()` lê as **claims do JWT**. O token em uso no momento do
onboarding foi emitido **antes** do vínculo existir, então ainda não as carrega —
`supabase/seed.sql` documenta exatamente isso no passo 3 do preparo de ambiente.

Por isso a action chama `supabase.auth.refreshSession()` logo após a RPC. Server
Actions podem gravar cookies, então o token novo persiste. Se o refresh falhar, a
action ainda devolve sucesso (a clínica **foi** criada) com `staleClaims: true`.

Para o caso em que as claims continuem velhas, `src/lib/auth/session.ts` tem uma
**checagem defensiva**: quando `current_clinic_id()` devolve vazio, ele consulta
`memberships` por `user_id` + `status = 'active'`. Se houver vínculo, o usuário
**não** é mandado de volta ao onboarding — senão ele veria a tela de criar clínica
com uma clínica já criada, e criaria a segunda.

Quando existe vínculo, mas o JWT continua sem as claims, a DAL agora devolve
`claims-stale` e a casca interrompe o fluxo com uma tela de recuperação. O usuário
não vê dados vazios como se fossem reais, não volta ao formulário de criar clínica
e não consegue criar um segundo vínculo acidentalmente. O botão encerra a sessão
para permitir uma nova autenticação depois que o Auth Hook/RLS for corrigido.

---

## 6. Pendências — o que NÃO foi verificado

> Estas linhas existem para não transformar suposição em fato. Nenhuma delas foi
> testada contra o banco remoto nesta fatia.

| # | Pendência | Impacto | Como verificar |
|---|---|---|---|
| **P1** | **`custom_access_token_hook` está registrado como Auth Hook no projeto remoto?** A função existe no schema (aparece em `database.types.ts`) e `docs/03-banco-de-dados.md` a lista como "já ativa", mas **o registro do hook em Authentication → Hooks não foi verificado** — exige acesso ao painel/Management API, indisponível nesta execução. | Se o hook **não** estiver registrado, o JWT nunca recebe as claims de clínica. A política de `memberships` precisa permitir que o usuário leia apenas o próprio vínculo para a checagem defensiva; isso não substitui as claims exigidas pelas policies dos dados. A aplicação falha fechada com `claims-stale`, sem mock e sem loop de onboarding. | Painel do Supabase → Authentication → Hooks → "Custom Access Token"; inspecionar as claims de um JWT emitido após `create_clinic`; e revisar a policy de `memberships` para `auth.uid()`. |
| **P2** | **Fluxo ponta a ponta contra o banco real** (criar conta → criar clínica → dashboard com dado real). | Os critérios CA1–CA3, CA5 e CA9 do roadmap §14 só ficam assinados depois disso. | Rodar `npm run dev` com `.env.local` preenchido e executar o fluxo. |
| **P3** | **Configuração de confirmação de e-mail**: qual dos modos está ligado no projeto ainda não foi verificado. O código uniformiza o desfecho do cadastro e não enumera e-mails; com confirmação desligada, o usuário deve entrar manualmente depois do cadastro. | Muda se o usuário recebe link ou pode entrar imediatamente; não muda a mensagem genérica nem a proteção contra enumeração. | Painel → Authentication → Providers → Email → "Confirm email". |
| **P4** | **Trigger de `profiles`**: a action envia `full_name` nos metadados do Auth assumindo que existe trigger criando a linha em `profiles`. Não verificado. | Se não houver trigger, `profiles` fica sem linha; a DAL cai no fallback de metadados do Auth e o nome continua correto na tela. Sem quebra. | `select * from profiles where id = '<uid>'` após um cadastro. |
| **P5** | Auditoria (`audit_log`) e `createAction` — F-01 foi implementada. `createClinicAction` registra `clinic.created` de forma best-effort após renovar as claims; ela não passa pelo `createAction` porque é bootstrap e ocorre antes de existir clínica ativa. | O código está preparado, mas o CA7 só pode ser assinado após confirmar a policy de `INSERT` no `audit_log` e executar o fluxo contra o banco real. O primeiro uso do pipeline será uma mutação tenant-scoped (P-01). | Confirmar a policy no Supabase e executar o E2E; manter a exceção de bootstrap documentada em `docs/06-acoes-e-auditoria.md`. |
| **P6** | Teste de tenancy (CA8) e E2E (CA1) — não há runner de teste no projeto (D5). | Sem cobertura automatizada. | F-04. |

---

## 7. Fora de escopo, deliberadamente

Troca de clínica (I-03), convites (I-04), matriz de permissões (I-05),
recuperação de senha (já existe e não foi tocada), login com Google (já existe e
não foi tocado), CRUD de pacientes, migrations e schema novo.

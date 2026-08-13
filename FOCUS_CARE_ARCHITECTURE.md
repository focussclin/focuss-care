# Focus Care — Arquitetura

> Estado real em **10/08/2026**, commit `c461cab`. Documenta o que **está
> construído**, não o que se pretende. O que falta está marcado como tal.
> Complementa `docs/01-arquitetura.md` (princípios) com a visão de sistema.

## 1. Stack encontrada

| Camada | Tecnologia | Observação |
| --- | --- | --- |
| Framework | **Next.js 16.3.0** (App Router, Turbopack) | `cacheComponents` ativo |
| UI | **React 19.2.8** | Server Components por padrão |
| Linguagem | TypeScript estrito | `tsc --noEmit` limpo |
| Estilo | Tailwind v4 + design tokens | Sem CSS-in-JS |
| Formulários | react-hook-form + `zodResolver` | Zod v4 |
| Banco | **Supabase** (Postgres + RLS) | 78 objetos tipados |
| Auth | Supabase Auth + JWT com claims | `custom_access_token_hook` |
| Storage | Supabase Storage | 1 bucket (documentos de paciente) |
| Testes | Vitest + Testing Library | 2393 testes, 186 arquivos |
| Deploy | Cloudflare (OpenNext) | `open-next.config.ts` |

## 2. Frontend

### Fronteira servidor/cliente

Regra executável, não convenção: `src/app/serverBoundaryProps.test.ts` varre
`src/app` e **reprova literal de função passado como prop** de Server Component.
Nasceu de um defeito real que passou por typecheck, lint e build e só quebrou em
produção.

Quando a composição precisa de função, ela migra para um arquivo `'use client'`
(`app/(app)/agenda/AgendaWorkspace.tsx` é o padrão).

### Organização de tela

```
app/(app)/<rota>/page.tsx      Server Component: autoriza, lê, mapeia DTO
  └─ modules/<x>/ui/<X>Screen   'use client': estado, formulário, ações
```

O `page.tsx` **autoriza antes de ler** (`forbidden()` em 34 das 42 rotas). Ler e
depois esconder entregaria o dado no payload.

### Estados de UI

Todas as rotas autenticadas têm `loading.tsx`. Os quatro estados são
convenção verificada nas revisões: *loading*, *empty* com explicação, *error*
com `role="alert"`, e *modo demonstração* com `role="status"`.

### Mobile

Layout responsivo com `useMediaQuery` na agenda (grade semanal vira lista).
**Não auditado sistematicamente** — ver P1 no MASTER_PLAN.

## 3. Backend — o pipeline de escrita

**Toda** escrita passa por `createAction` (118 actions). Não há rota de API que
escreva.

```
Server Action
  1. getSessionState()          autenticar (memoizado por request)
  2. current_clinic_id()        resolver tenant
  3. options.roles              autorizar papel
  4. schema.safeParse()         validar entrada
  5. handler(input, context)    caso de uso
  6. revalidatePath/updateTag   invalidar cache
  7. after(() => audit)         auditar fora do caminho crítico
```

`ActionContext` = `{ supabase, clinicId, role, userId }`.

**P3 — o invariante mais importante:** `clinicId`, `userId` e `role` **nunca**
vêm do cliente. Não há campo por onde mandá-los. O cliente escolhe *o quê*
editar (um id), nunca *onde*.

### Portas e adaptadores

Cada módulo tem a mesma forma:

```
modules/<x>/
  domain/           entidade + porta + erro tipado   (sem I/O)
  infrastructure/   SupabaseXRepository + MockX + acessor
  application/      mapeadores DTO + tradutor de falha
  actions/          Server Actions
  schemas/          Zod (formulário e servidor, separados)
  ui/               componentes
```

O acessor (`getXSource()`) decide entre adapter real e demonstração a partir de
`resolveDataSource()`. **Os repositórios de demonstração recusam escrita** — não
fingem sucesso.

## 4. Banco de dados

### Multi-tenancy — como realmente funciona

**Um nível só: `clinic_id`.** Não existe tabela `units`. Uma "clínica" é a
unidade operacional; uma organização com três unidades hoje seria três clínicas
sem vínculo entre si.

Três camadas de defesa, nesta ordem:

1. **RLS** no Postgres, por `current_clinic_id()` — a última linha.
2. **Filtro explícito** `.eq('clinic_id', clinicId)` em todo adapter — defesa em
   profundidade e alinhamento com o índice `(clinic_id, ...)`.
3. **Assinatura da porta** — `clinicId` é parâmetro próprio, nunca campo do DTO.

### O problema das FKs de coluna única

Descoberta recorrente e cara: `vitals.patient_id`, `prescriptions.encounter_id`,
`professionals.user_id` referenciam a tabela alvo por **coluna única**. Isso prova
que a linha existe **em algum lugar do banco**, não que pertence a esta clínica.

A RLS protege a **linha** (`clinic_id`), não o **conteúdo do campo**. Sem guarda
de aplicação, um administrador poderia apontar um registro para entidade de outro
tenant.

**Padrão adotado:** guarda explícita no servidor antes da escrita —
`patientBelongsTo`, `encounterBelongsTo`, `userBelongsToClinic`. Com teste.

### Escrita que falha em silêncio

Sem policy de `UPDATE`, o Postgres **não devolve erro**: zero linhas mudam. O
padrão do projeto é reler após zero linhas e distinguir três causas:

| Releitura | Diagnóstico |
| --- | --- |
| linha visível, estado permitido | `write-forbidden` — falta policy |
| linha visível, outro estado | `stale-status` — concorrência |
| linha ausente | `not-found` |

### Compare-and-swap

Transições de status passam a origem no `WHERE` (`.in('status', origens)`), não
em leitura anterior. Fecha a corrida entre dois operadores.

### Convenções não adivinhadas

Quando uma convenção não pode ser provada, o projeto **não escreve e declara na
tela** com o SQL que destrava. Casos ativos: `work_schedules.weekday` (P-WD),
`price_list_items.professional_share_*`, `allergies.severity`.

### Migrations

20 arquivos em `supabase/migrations/`. **18 tabelas não estão aplicadas.**
Runbook em `docs/supabase-migrations-runbook.md`. Aplicar exige acesso ao projeto
Supabase — bloqueio **B1**, humano.

## 5. Autenticação e sessão

- Supabase Auth (e-mail/senha + OAuth), cookies httpOnly via `@supabase/ssr`.
- `custom_access_token_hook` injeta `clinic_id` e `role` no JWT.
- `getSessionState()` devolve estado discriminado: `not-configured`,
  `anonymous`, `needs-onboarding`, `claims-stale`, `active`.
- **`claims-stale`** é próprio: há vínculo mas o JWT não o carrega — falhar aqui
  é mais honesto que deixar a RLS recusar.
- Convite por RPC (`create_invitation`) — o hash **nunca** passa pela aplicação;
  o token cru é entregue uma vez.
- Recuperação de senha implementada (**P-RS**).

**Ausentes:** 2FA/MFA, gestão de dispositivos, rate limiting. Ver P0.

## 6. Permissões

`src/lib/auth/permissions.ts` — matriz de 5 papéis (`owner`, `admin`,
`professional`, `receptionist`, `finance`) × ~20 permissões.

```ts
rolesWith('appointment.write')   // deriva da matriz; nunca lista escrita à mão
can(role, 'record.read')
```

Toda action declara `roles: rolesWith('<permissão>')` — derivado, não copiado.

**Limitação:** papéis fixos, sem customização por organização. Ver P2.

## 7. Storage

Um bucket, para documentos de paciente, com verificação de existência pela
sessão (sem `service_role`). `clinical_attachments` e `patients.photo_url`
**não têm bucket** — bloqueio ativo.

## 8. Jobs e processamento assíncrono

**Não existem.** Não há worker, fila ou cron. Consequências assumidas e
declaradas na tela:

- `workflows` guarda regras que **nada executa** (AU-01).
- Estados derivados são calculados na leitura em vez de armazenados
  (`expired` de guia, `divergente` de conciliação, nível de estoque) — porque
  não há quem mantivesse um status gravado.

`after()` do Next cobre o pós-resposta (auditoria), não trabalho durável.

## 9. Integrações

`clinic_integration_credentials` guarda credencial por clínica. `/whatsapp` e
`/automacoes` mostram o estado real do canal **sem simular conexão**.

**Não existem:** webhooks, API pública, retry, idempotência, log de integração.

## 10. IA

Tabelas prontas (`ai_conversations`, `ai_messages`, `ai_usage_log`,
`document_embeddings` com `vector(1024)`). Nenhuma superfície.

Bloqueio **AI-01**: depende de aprovação de `docs/04-agente-ia.md` e de provedor
de modelo. `/chat-ia` declara a regra P9 antes de existir recurso.

`ai_usage_log` mede tokens por tenant — IA é custo variável e precisa ser medida
desde o início.

## 11. Observabilidade

- `audit_log` — trilha de conformidade, append-only, sem IP nem metadado bruto.
- `appointment_status_history` — trilha operacional da agenda.
- `console.error` estruturado nos tradutores de falha, com `reason` e `code`
  **nunca** com valor de usuário (o texto do Postgres pode ecoar dado enviado).

**Ausentes:** APM, tracing, métricas, alertas.

## 12. Deploy

Cloudflare Workers via OpenNext. Deploy por branch documentado em
`docs/CLOUDFLARE_BRANCH_DEPLOY.md`. Segredos por variável de ambiente — nenhum
no código (verificado).

## 13. Testes

| Tipo | Cobertura |
| --- | --- |
| Domínio | Regras puras, sem I/O |
| Contrato de repositório | Cliente Supabase duplo; prova tenant, colunas e traduções |
| Action | RBAC, fronteira de entrada, auditoria |
| UI | jsdom por arquivo; portal Radix exige buscar em `document.body` |
| **Guards de código-fonte** | Varrem `src/` e reprovam padrões perigosos |

Os guards são o diferencial: `revalidateTargets` (rota inexistente não lança),
`navigation` (menu × rotas reais), `publicApi` (fronteira de módulo),
`serverBoundaryProps` (função cruzando a fronteira), `instantOptOuts`,
`migrationBundle`.

## 14. Arquitetura recomendada — o que muda

Só o que o produto **precisa** e não tem:

1. **`units` como segundo nível de tenant.** `clinic_id` vira organização;
   `unit_id` entra em `appointments`, `professionals`, `rooms`, `inventory`,
   caixa. É migration + RLS composta. **Não fazer isso agora e retrofitar depois
   é o maior risco técnico do produto.**
2. **Worker + fila.** Destrava automações, lembretes, lista de espera e IA de uma
   vez. Enquanto não existir, nenhum dos quatro é honesto.
3. **Rate limiting no edge** — antes de qualquer exposição pública.
4. **Permissões granulares** — tabela `role_permissions` por clínica.
5. **Motor de documentos** (template + variáveis + PDF) — reutilizável por
   receita, atestado, termo e contrato.

O que **não** muda: pipeline de action, portas e adaptadores, isolamento em três
camadas, guards executáveis. Estão corretos e são o que sustenta o resto.

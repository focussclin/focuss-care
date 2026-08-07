# Focuss Care — Arquitetura

> Documento vivo. Fonte de verdade para decisões estruturais.
> Toda mudança aqui exige aprovação antes de virar código.

> **Correção (07/08/2026).** As seções 4 e 9 foram escritas antes de o schema
> remoto ser conhecido. O banco oficial já existe no projeto Supabase e usa nomes
> diferentes dos propostos aqui:
>
> | Proposto neste documento | Schema real |
> |---|---|
> | `clinic_members` | **`memberships`** (+ `profiles` para dados do usuário) |
> | `auth.clinic_ids()` | **`current_clinic_id()`**, `current_clinic_role()`, `has_clinic_role(p_roles)` |
> | `bootstrap_clinic(name)` | **`create_clinic(p_slug, p_trade_name)`**, `accept_invitation(p_token)`, `switch_clinic(p_clinic_id)` |
> | `patients.status` (enum) | **`patients.is_active`** (boolean) |
> | `appointments.duration_minutes` | **`starts_at` + `ends_at`** |
>
> A **decisão** arquitetural (banco compartilhado + RLS, claims no JWT, papel no
> vínculo) foi confirmada pelo schema real — só a nomenclatura difere. O código em
> `src/lib/supabase/` e `src/modules/*/infrastructure/` segue o schema real, não
> este texto. Ver `supabase/README.md`.

## 1. Contexto

SaaS B2B multi-tenant para gestão de clínicas, projetado para milhares de clínicas
em uma única instalação. Dados de saúde são dado pessoal sensível (LGPD art. 11),
o que eleva isolamento e auditoria de "boa prática" para requisito legal.

## 2. Stack confirmada

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | Next.js **16.3.0** | Não 15. Ver seção 3. |
| UI | React 19.2.8, TailwindCSS **v4**, shadcn/ui, Framer Motion, Lucide | Tailwind v4 é CSS-first |
| Formulários | React Hook Form + Zod | Zod também valida a fronteira do servidor |
| Estado de servidor | TanStack Query | Só para o que muda após o load inicial |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) | RLS obrigatória |
| Infra | Docker, Coolify, GitHub Actions, Cloudflare | `output: 'standalone'` |

## 3. Next.js 16 — o que muda em relação ao conhecimento comum

Verificado em `node_modules/next/dist/docs/`. Estes pontos invalidam padrões de Next 14/15:

| Antes | Agora | Impacto |
|---|---|---|
| `middleware.ts` | **`proxy.ts`** (deprecado o nome antigo) | Arquivo em `src/proxy.ts` |
| `unstable_cache()` | Diretivas **`use cache`**, `use cache: private`, `use cache: remote` | Requer `cacheComponents: true` |
| `revalidateTag` avulso | `cacheTag()` / `cacheLife()` de `next/cache` | — |
| Sem 401/403 nativos | `unauthorized()` / `forbidden()` + `unauthorized.tsx` / `forbidden.tsx` | Requer `authInterrupts: true` |

Codemod disponível para o rename: `npx @next/codemod@canary middleware-to-proxy .`

### Aviso da documentação sobre `proxy.ts`

> "Proxy is meant to be invoked separately of your render code and in optimized cases
> deployed to your CDN (...) you should not attempt relying on shared modules or globals."

**Consequência arquitetural:** o `proxy.ts` **não** faz autorização de negócio. Ele só
renova a sessão do Supabase e redireciona quem não tem sessão. Autorização real
(papel, clínica ativa, permissão) acontece no servidor, dentro do pipeline de Server
Actions e Server Components. Colocar RBAC no proxy é um antipadrão nesta versão.

## 4. Multi-tenancy — banco compartilhado + RLS

Decisão: **um banco, isolamento por Row Level Security**.

Descartadas: banco por tenant (inviável no Supabase gerenciado nessa escala) e
schema por tenant (Postgres degrada com milhares de schemas; migrations explodem).

### Regras invioláveis

1. Toda tabela de tenant tem `clinic_id uuid NOT NULL`.
2. RLS `ENABLE` **e** `FORCE` em todas elas.
3. `clinic_id` é a **primeira coluna de todo índice composto**.
4. Toda policy tem `USING` **e** `WITH CHECK`. `USING` sozinho bloqueia leitura
   cruzada mas permite gravar carimbando o `clinic_id` de outra clínica.

### Origem do `clinic_id` na policy

Subquery por linha mata a performance:

```sql
-- ❌ Executa para cada linha avaliada
USING (EXISTS (SELECT 1 FROM clinic_members m
               WHERE m.clinic_id = patients.clinic_id AND m.user_id = auth.uid()))
```

Solução: injetar os vínculos no JWT via *Custom Access Token Hook* do Supabase Auth.
A policy lê uma claim já presente no token — custo O(1), zero I/O:

```sql
-- ✅ Sem I/O
CREATE POLICY tenant_isolation ON patients
  FOR ALL TO authenticated
  USING      (clinic_id = ANY (auth.clinic_ids()))
  WITH CHECK (clinic_id = ANY (auth.clinic_ids()));
```

### Um usuário em várias clínicas

`clinic_members (user_id, clinic_id, role, status)` — relação N:N. O JWT carrega
todos os vínculos; a clínica ativa é escolhida na UI e validada contra as claims.

**Trade-off conhecido:** claims ficam desatualizadas até o refresh do token (~1h).
Ao remover um vínculo é obrigatório revogar a sessão explicitamente. Isso é um
requisito funcional do módulo Funcionários, não um detalhe de implementação.

### Papéis

`OWNER · ADMIN · DOCTOR · RECEPTIONIST · FINANCE · ASSISTANT`

RLS decide **de qual clínica**. A aplicação decide **o que o papel pode fazer**.
Duas perguntas diferentes, duas camadas diferentes.

## 5. Camadas

```
PRESENTATION    app/ · components/ · modules/*/ui
APPLICATION     modules/*/application        use cases, orquestração
DOMAIN          modules/*/domain             entidades, regras — TS puro
INFRASTRUCTURE  modules/*/infrastructure     repositórios, adapters
DATA            PostgreSQL + RLS
```

Setas apontam sempre para dentro. `domain` não importa React, Supabase nem
`application`. Imposto por `eslint-plugin-boundaries` no CI — regra de arquitetura
sem lint é decoração.

### Domínio rico só onde há regra real

DDD ortodoxo em CRUD produz seis arquivos para salvar um telefone. A regra:

- **Rico** (entidades + value objects + invariantes): Agenda, Atendimentos,
  Prontuários, Financeiro, Convênios.
- **Magro** (schema Zod + repositório): Configurações, Relatórios, listagens.

## 6. Fluxo de dados

| Cenário | Ferramenta |
|---|---|
| Leitura inicial da página | Server Component |
| Mutação | Server Action + Zod na fronteira |
| Interação (drag na agenda, filtros, paginação) | TanStack Query |
| Dados ao vivo (fila, chat) | Supabase Realtime → `queryClient.setQueryData` |

Toda Server Action passa pelo mesmo pipeline, sem exceção:

```
autenticar → resolver clínica ativa → autorizar papel → validar Zod
          → use case → revalidar cache → auditar
```

Encapsulado em um único wrapper `createAction`. DRY, e impossível esquecer um passo.

## 7. Acesso a dados

Ports & Adapters. O use case depende da interface, nunca do SDK do Supabase:

```ts
export interface PatientRepository {
  findById(id: PatientId): Promise<Patient | null>
  search(criteria: PatientSearchCriteria): Promise<Paginated<Patient>>
  save(patient: Patient): Promise<void>
}
```

### Três clientes Supabase

| Cliente | Onde roda | Identidade | Uso |
|---|---|---|---|
| Browser | Cliente | Usuário (anon key) | Realtime, upload |
| Server | RSC / Actions | **Usuário — RLS ativa** | 95% do sistema |
| Admin | Jobs / webhooks | Service role — **RLS ignorada** | Onboarding, cron |

O admin client fica isolado em arquivo com `import 'server-only'`, e o CI falha se
ele for importado de qualquer caminho sob `ui/`. Uma service role key no bundle
expõe **todas as clínicas de uma vez** — é o cenário de falha catastrófica do produto.

## 8. Cache multi-tenant

A pior falha possível não é lentidão: é a clínica A ver dados da clínica B por cache
mal chaveado. Silencioso e sistêmico.

**Regra absoluta:** toda chave e toda tag de cache contém o `clinic_id`.

```
✅  clinic:{id}:patients:list
❌  patients:list
```

O Next 16 dá a ferramenta certa para isso. Dados derivados de sessão usam
`'use cache: private'` — resultado **nunca é armazenado no servidor**, só na memória
do browser, e não sobrevive a reload. Para dados de tenant compartilháveis entre
usuários da mesma clínica, `'use cache'` com `cacheTag(\`clinic:${id}:...\`)`.

Demais medidas: paginação por cursor (nunca `OFFSET` em tabela grande), code
splitting por módulo, particionamento de `appointments` e `audit_log` por data
**quando o volume justificar** — não no dia 1.

## 9. Segurança e LGPD

- **Defesa em profundidade:** RLS é a última linha, não a única.
- **Prontuário é append-only.** Registro assinado não sofre `UPDATE`; correção gera
  nova versão vinculada à anterior. `UPDATE`/`DELETE` bloqueados por policy.
- **Auditoria:** quem leu qual prontuário, quando, de qual IP. `audit_log`
  append-only, particionado por mês.
- **Storage:** buckets privados, path `{clinic_id}/{recurso}/{id}`, policy validando
  a primeira pasta contra o JWT. URLs assinadas de expiração curta.
- **`experimental.taint`** habilitado: marca objetos sensíveis para que o React
  falhe o build se forem passados a um Client Component. Rede de segurança real
  contra vazamento de prontuário para o cliente.
- **Retenção:** "excluir paciente" é `deleted_at`. Prontuário tem prazo legal de guarda.
- **Direitos do titular:** exportação e eliminação projetadas desde já.

## 10. IA

A IA **não é uma camada nova — é um cliente das camadas existentes.**

```
Chat IA → tool calling → Use Cases existentes → Domínio → Banco
                         (mesmas regras, RLS, autorização e auditoria)
```

"Marque um retorno para a Maria dia 15" chama `BookAppointment`, o mesmo use case do
botão da UI. A IA nunca tem caminho privilegiado ao banco — isso seria um bypass de
RLS com interface de linguagem natural.

- `LLMProvider` como porta; adapter trocável.
- RAG por tenant com `pgvector` e RLS na tabela de vetores. Vazamento no vector store
  é tão grave quanto no relacional.
- **Guardrail:** IA sugere, humano assina. Nada gerado entra em prontuário sem
  confirmação do profissional.
- Tarefas pesadas (resumo, relatório) em fila, nunca no request.
- Telemetria de tokens por clínica desde o dia 1 — IA é custo variável.

## 11. Bounded contexts

```
            IDENTITY & TENANCY
     (clínicas, usuários, vínculos, papéis)
                    │
   ┌────────┬───────┼────────┬──────────────┐
PACIENTES  AGENDA  ATENDIMENTOS  FINANCEIRO  FUNCIONÁRIOS
   │         │        │             │
   └─────────┴─► PRONTUÁRIOS    CONVÊNIOS
                    │
        CAMADA TRANSVERSAL (só lê os demais)
   Dashboard · Relatórios · IA · WhatsApp · Automações · Configurações
```

Módulos transversais consomem os operacionais, nunca o contrário. Dashboard não tem
tabelas próprias; lê projeções. Isso evita o acoplamento circular que trava
refatoração em SaaS maduro.

## 12. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Falha de isolamento entre clínicas | Crítica | RLS forçada + validação na app + testes de tenancy no CI |
| Cache vazando entre tenants | Crítica | `clinic_id` em toda chave; `use cache: private` para dados de sessão |
| Service role key exposta no cliente | Crítica | `server-only` + verificação no CI |
| Claims de JWT desatualizadas | Alta | Revogação explícita de sessão ao alterar vínculo |
| API do Next 16 divergir do esperado | Alta | Consulta obrigatória a `node_modules/next/dist/docs/` |
| Custo de IA sem controle | Média | Telemetria por clínica + limites por plano |
| Over-engineering de DDD | Média | Domínio rico só onde há regra real |

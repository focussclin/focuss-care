# F-01 — Fundação de Server Actions e auditoria

> Implementação da feature **F-01** do [`roadmap.md`](./roadmap.md) §13 (dívidas D1 e D2).
> Escrito contra o código e os tipos gerados do banco em **07/08/2026**,
> branch `feat/telas-e-camada-supabase`.
>
> A **§8 documenta F-02** (cache multi-tenant e flags do Next 16), que evoluiu o
> passo 6 deste mesmo pipeline. As duas features vivem aqui porque compartilham
> um arquivo: `createAction.ts`.

Este documento descreve o que a fundação entrega, **onde ela deliberadamente não
se aplica**, e o que não pôde ser verificado. Nenhuma afirmação sobre policy de
RLS do projeto remoto foi inventada — o que não foi verificado está na §6.

---

## 1. O que a fatia entrega

| # | Entrega | Onde |
|---|---|---|
| 1 | Contrato tipado de resultado e erro de aplicação (`Result`, `AppError`, `ActionResult`) | `src/modules/_shared/domain/Result.ts` |
| 2 | Pipeline único de mutação (`createAction`) | `src/modules/_shared/application/createAction.ts` |
| 3 | Escrita em `audit_log` derivada da sessão (`recordAuditEvent`) | `src/lib/audit/audit-log.ts` |
| 4 | Primeiro evento auditado: criação de clínica (CA7 de I-01) | `src/modules/identity/actions/createClinic.action.ts` |
| 5 | Descrição de falha para o log do servidor (`describeCause`) | `src/lib/observability/describe-cause.ts` |

Nada além disso foi tocado. Nenhuma migration, nenhuma mudança de schema remoto,
nenhuma dependência nova, nenhum uso de `SUPABASE_SECRET_KEY`.

> A entrega 5 nasceu da revisão: `PostgrestError` não é `instanceof Error`, e o
> log do servidor guardava `{ code: 'unknown' }` para exatamente a classe de
> falha que mais importa diagnosticar. Ela é usada pelas entregas 2, 3 e 4.

---

## 2. `Result` — erro esperado é valor, não exceção

Uma Server Action atravessa a fronteira servidor/cliente. O que ela devolve é
serializado; uma exceção **não** atravessa com a mensagem intacta — em produção o
Next a substitui por um digest. Então erro previsto (validação, permissão,
conflito) precisa ser valor.

```ts
type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E }
type ActionResult<T, F extends string = string> = Result<T, AppError<F>>
```

`AppErrorCode` é um vocabulário **fechado** — `unauthenticated`,
`no-active-clinic`, `forbidden`, `validation`, `conflict`, `not-found`,
`unavailable`, `unexpected` — para que o container decida por `switch` exaustivo
(mandar ao login, marcar campo, mostrar aviso) em vez de comparar strings livres.

`message` é sempre pt-BR pronto para exibição e **nunca** carrega detalhe de
banco: código do Postgres, nome de constraint ou SQL ficam apenas no log do
servidor.

O arquivo é TS puro — não importa React, Next, Supabase nem nada de `ui/`.

### Convivência com as actions atuais

As actions de I-01 (`signIn`, `signUp`, `createClinic`) mantêm suas formas de
retorno próprias (`{ ok, error?, fieldErrors? }`). **Nada foi migrado nesta
fatia**: reescrevê-las mudaria mensagens e comportamento que já estão em
revisão. `ActionResult` vale para o que for escrito daqui em diante; a migração
das três acontece quando a feature que as toca voltar ao board.

---

## 3. `createAction` — o pipeline, e onde ele não se aplica

```
autenticar → clínica ativa → autorizar papel → validar Zod
           → use case → revalidar → auditar (best-effort, em after())
```

Os quatro primeiros passos acontecem **antes** de o handler receber qualquer
coisa. O handler recebe entrada já validada e um `ActionContext` com
`supabase` (cliente com a sessão do usuário), `clinicId`, `role` e `userId`.

Três propriedades que sozinhas justificam a abstração:

1. **`clinicId` e `userId` nunca vêm do cliente.** Saem de `current_clinic_id()`
   e da sessão validada — P3 de [`01-arquitetura.md`](./01-arquitetura.md).
2. **O cliente do contexto carrega a sessão do usuário.** Nenhum caminho daqui
   alcança `SUPABASE_SECRET_KEY`; toda escrita passa por RLS.
3. **`redirect()` e `notFound()` continuam funcionando.** O `try/catch` em volta
   do handler chama `unstable_rethrow` antes de tratar o erro — sem isso, uma
   navegação disparada pelo caso de uso morreria dentro do wrapper.
   (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`.)

### Como declarar uma action sobre o pipeline

`createAction` é uma fábrica, não uma Server Action. O arquivo que a chama é que
precisa da diretiva — `import 'server-only'` no arquivo da fábrica **não**
substitui `'use server'` no arquivo da action:

```ts
// src/modules/patients/actions/createPatient.action.ts
'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok } from '@/modules/_shared/domain/Result'

import { createPatientSchema } from '../schemas/patient.schema'

export const createPatientAction = createAction({
  name: 'patient.create',
  schema: createPatientSchema,
  roles: ['owner', 'admin', 'receptionist'],
  revalidatePaths: ['/pacientes'],
  handler: async (input, { supabase, clinicId }) => {
    // `clinicId` vem do contexto; o input NUNCA o declara.
    const { data, error } = await supabase
      .from('patients')
      .insert({ ...input, clinic_id: clinicId })
      .select('id')
      .single()

    if (error) return err('conflict', 'Não foi possível cadastrar o paciente.')

    return ok({ id: data.id })
  },
  audit: (output) => ({
    action: 'patient.created',
    entityType: 'patient',
    entityId: output.id,
  }),
})
```

### `redirect()` não vai dentro do handler

O passo 5 devolve a exceção de navegação ao Next — e sair por ali significa que
os passos 6 e 7 **não rodam**: a escrita aconteceria sem revalidação e sem
auditoria, que é exatamente o R4 do roadmap. O handler devolve `ok(...)`; quem
navega é o container, como já faz `OnboardingForm.container`. O contrato está no
JSDoc de `handler`.

### Fora do pipeline, de propósito

**`signUp`, `signIn` e `createClinic` não passam por `createAction` — e não
devem passar.** As três rodam antes de existir clínica ativa; exigir clínica
ativa nelas seria circular. São o bootstrap do tenant, não mutação de tenant.

Isso não é uma lacuna a fechar depois: é a fronteira do pipeline. Elas continuam
com validação Zod e mensagens próprias, e auditam chamando `recordAuditEvent`
diretamente.

### Ainda sem chamador

`createAction` **não tem nenhum uso no código hoje** — não existe nenhuma
mutação de dado de clínica no projeto (roadmap §2.2: nenhum `save`/`update` em
nenhum repositório). O primeiro chamador será P-01 (pacientes). Retrofitar as
actions de identidade nele seria forçar a única categoria de ação que o pipeline
exclui por desenho.

### Revalidação: caminho **e** tag

Desde F-02 o passo 6 faz as duas coisas, e elas não competem:

| Opção | O que invalida | Estado |
|---|---|---|
| `cacheTags` | Entradas de `use cache` marcadas com aquela tag | Cano montado; **nenhuma leitura cacheada ainda** |
| `revalidatePaths` | Cache de Router da rota | É o que faz `/pacientes` reaparecer atualizada hoje |

Nenhum dos dois transforma mutação concluída em falha para a UI: erro na
revalidação ou na montagem do evento de auditoria vai para o log do servidor e o
sucesso continua sendo devolvido. Detalhe na §8.

---

## 4. Auditoria — `recordAuditEvent`

### Quem agiu não é parâmetro

A função **não aceita** `actor_user_id`, `clinic_id` nem `actor_role`. Os três
saem sempre da sessão e das claims do JWT:

| Coluna | Origem |
|---|---|
| `actor_user_id` | `supabase.auth.getUser()` — token validado no servidor de auth |
| `clinic_id` | `current_clinic_id()` — a mesma função que as policies consultam |
| `actor_role` | `current_clinic_role()` |
| `ip` | `x-real-ip` ou último hop de `x-forwarded-for`, validado estritamente; é sinal declarado do request, não evidência forense |
| `user_agent` | cabeçalho `user-agent`, truncado em 400 caracteres |
| `occurred_at` | `new Date().toISOString()` no servidor |

Não há assinatura possível em que um chamador — muito menos o cliente — audite
um evento em nome de outra pessoa ou de outra clínica. É a mesma regra do P3,
aplicada ao log.

O insert usa o **cliente com a sessão do usuário**, nunca `SUPABASE_SECRET_KEY`.
O log herda o isolamento entre clínicas em vez de reimplementá-lo.

### O parâmetro `client`

`recordAuditEvent(event, { client })` aceita um cliente Supabase já em mãos.
Existe para um caso concreto: quando a action acabou de chamar
`auth.refreshSession()`, o cliente dela já tem o token novo em memória, enquanto
um cliente criado do zero dependeria de o cookie reescrito já estar legível.

Isso **não** afrouxa a regra acima — o ator continua sendo lido *da sessão desse
cliente*, não de um valor passado.

### Campos e limites do que é gravado

`before` e `after` aceitam apenas `Record<string, string | number | boolean | null>`
— metadado operacional (slug, status, contagem), nunca conteúdo de registro.
Antes do insert, `sanitizeMetadata` aplica uma rede de segurança:

- descarta chaves cujo nome bata com senha/token/secret/api key/authorization/
  cookie, CPF/CNPJ/RG/documento/identidade/matrícula/carteirinha/CNS/CRM,
  e-mail, telefone, data de nascimento, endereço/CEP, **nome**, **paciente/
  responsável/contato**, **observação/anotação/comentário**, e termos clínicos
  (diagnóstico, anamnese, prescrição, prontuário, laudo, alergia, medicamento,
  sintoma);
- descarta valores que não sejam escalares;
- trunca strings em 160 caracteres e limita o objeto a 20 chaves;
- **avisa no log do servidor quais chaves descartou** (`[audit] metadado
  descartado`, só os nomes — o valor descartado é justamente o que não pode
  circular). Descarte silencioso deixava o chamador achando que auditava um
  campo que nunca chegou ao banco.

A defesa principal continua sendo o chamador mandar só metadado. Mas "o chamador
toma cuidado" não é um controle verificável, e `audit_log` é append-only e legível
pela operação inteira.

O filtro é por **nome de chave**, não por valor: um CPF sob uma chave que escape
da lista ainda passaria. Por isso a lista é rede de segurança, não a barreira —
e por isso a recomendação para os módulos seguintes é montar `after` com um
punhado fixo de campos operacionais, nunca espalhar o registro inteiro.

### Falha é controlada, e nunca derruba a operação

`recordAuditEvent` **nunca lança**. Devolve
`{ recorded: true }` ou `{ recorded: false, reason }`, com `reason` em
`not-configured | unauthenticated | no-active-clinic | rejected | unexpected`.

- Estados previstos do sistema (sem Supabase, sem sessão, sem clínica ativa) →
  `console.warn`.
- Recusa do banco ou falha inesperada → `console.error` com ação, tipo de
  entidade e a falha **descrita por inteiro** (`describeCause`): `code`,
  `details`, `hint`, `status`. Esse detalhe fica no log do **servidor** e nunca
  atravessa a fronteira da Server Action — o usuário recebe só a mensagem
  genérica em pt-BR.

A assimetria estava invertida antes: o retorno era genérico (certo) e o log
também (errado). `PostgrestError` não é `instanceof Error`, então registrar
`cause.name` apagava justamente a falha vinda do banco — e `details`/`hint` são
o que identifica qual policy recusou a escrita, que é o dado de que P-A1
precisa.

Além disso, se o banco recusar a linha por causa do `ip` (`22P02`, quando a
coluna é `inet`), o evento é **regravado sem o IP**. Um cabeçalho que o cliente
controla não pode apagar o rastro de quem age: o IP é o campo mais dispensável
da linha.

Isso é deliberado e está na §6 como pendência: **a policy de INSERT de
`audit_log` no projeto remoto não pôde ser verificada nesta execução.**

---

## 5. Evento auditado hoje: `clinic.created`

Único ponto de integração desta fatia, em
`src/modules/identity/actions/createClinic.action.ts`.

| Campo | Valor |
|---|---|
| `action` | `clinic.created` |
| `entity_type` | `clinic` |
| `entity_id` | `id` da linha devolvida pela RPC `create_clinic` (`Returns: ClinicRow`) |
| `after` | `{ slug }` |
| `clinic_id` · `actor_user_id` · `actor_role` | derivados da sessão (§4) |

**Por que depois do refresh de claims.** O JWT em uso durante o onboarding foi
emitido *antes* de o vínculo existir (ver [`05-onboarding-e-sessao.md`](./05-onboarding-e-sessao.md) §5).
Só depois de `auth.refreshSession()` o token carrega a clínica — e é essa claim
que a RLS de `audit_log` consulta. Auditar antes seria auditar com `clinic_id`
nulo, que nenhuma policy de tenant aceitaria.

**Por que `entity_id` não sai de `current_clinic_id()`.** A claim responde
"qual clínica está ativa", que é outra pergunta — só por coincidência, no
onboarding de quem não tinha vínculo, ela coincide com a clínica recém-criada.
O evento precisa apontar para a entidade que *esta* ação criou, e a RPC já
devolve a linha. A pré-checagem de `memberships` reduz a divergência, mas é
TOCTOU; o retorno da RPC não é.

**Por que `trade_name` fica de fora do `after`.** É texto livre digitado pelo
usuário e, em clínica de profissional autônomo, costuma conter o nome de uma
pessoa física. O valor canônico vive em `clinics` e é alcançável por `entity_id`
— não há perda de rastreabilidade, e o log deixa de carregar dado pessoal.

**Por que o caminho de `staleClaims` não audita.** Quando o refresh falha, a
action já devolve erro ao usuário e a clínica fica em estado a recuperar. Sem
claims, o insert seria recusado de qualquer forma. `recordAuditEvent` registra
`reason: 'no-active-clinic'` no log do servidor se chegar a ser chamado nessa
situação.

### Por que `signIn` / `signOut` não foram auditados

`audit_log.clinic_id` é nulável, mas **não há policy conhecida que aceite um
insert sem clínica**, e a política de RLS não foi verificada (§6). Auditar login
significaria uma escrita provavelmente recusada em *todo* login, com ruído de log
proporcional e zero trilha efetiva.

Inventar a permissão (ou usar `service_role` para contorná-la) seria exatamente o
que o P2 de [`roadmap.md`](./roadmap.md) proíbe. Eventos de autenticação entram
quando a policy de `audit_log` estiver verificada — ver P-A1 abaixo.

---

## 6. Pendências — o que NÃO foi verificado

> Estas linhas existem para não transformar suposição em fato.

| # | Pendência | Impacto | Como verificar |
|---|---|---|---|
| **P-A1** | **A policy de RLS de `INSERT` em `audit_log` não foi verificada.** O projeto remoto declara RLS em 56/56 objetos (roadmap §2.1), mas o conteúdo das policies não é observável a partir do repositório: o schema chega aqui pelo documento OpenAPI do PostgREST (`scripts/generate-database-types.mjs`), que expõe colunas e RPCs — não policies. Verificar exigiria SQL direto no banco ou o painel, indisponíveis nesta execução. | Se a policy não permitir o insert pelo usuário autenticado, **nenhum evento é gravado**. A aplicação não quebra (§4), mas o CA7 de I-01 continua não atendido e o log do servidor acusa `reason: 'rejected'` a cada criação de clínica. | Painel → SQL Editor: `select * from pg_policies where tablename = 'audit_log';` — confirmar que existe policy de `INSERT` para `authenticated` com `WITH CHECK (clinic_id = current_clinic_id())` ou equivalente. |
| **P-A2** | **Tipo real da coluna `ip`** (`inet` vs `text`). O OpenAPI reporta ambos como `string`. | Com `inet`, um valor inválido derrubaria o insert inteiro. Mitigado em duas camadas: `normalizeIp` usa o parser estrito de IP do runtime, remove porta e forma `[::1]:porta`, escolhe o último hop da lista e grava `null` na dúvida; e, se ainda assim o banco recusar com `22P02`, a linha é regravada sem o IP. A confiança forense depende da topologia do proxy. | `select data_type from information_schema.columns where table_name='audit_log' and column_name='ip';` e confirmar quais headers o proxy sobrescreve. |
| **P-A3** | **`occurred_at` tem `DEFAULT now()`?** O gerador de tipos trata a coluna como obrigatória no `Insert` porque o OpenAPI não expõe defaults. | Nenhum: a aplicação envia o timestamp explicitamente. Vale conferir se o banco prefere carimbar o horário dele. | `select column_default from information_schema.columns where table_name='audit_log' and column_name='occurred_at';` |
| **P-A4** | **Retenção e particionamento de `audit_log`.** A §8 de [`01-arquitetura.md`](./01-arquitetura.md) prevê partição por mês "quando o volume justificar"; não há política de retenção definida nem implementada. `ip` é dado pessoal (LGPD art. 5, I) e hoje fica sem prazo de descarte. | Sem prazo definido, o log acumula indefinidamente. | Decisão de produto/jurídico, depois migration de particionamento e job de expurgo. |
| **P-A5** | **Nenhum teste automatizado.** Não há runner no projeto (D5). `createAction`, a sanitização de metadados e a derivação do ator não têm cobertura. | O comportamento descrito aqui é verificado por leitura, não por execução. | F-04 (harness de teste + CI). |
| **P-A6** | **Resolvido por P-01.** `createPatientAction` é o primeiro chamador tenant-scoped do pipeline em runtime. | A fatia exercitou autenticação, clínica ativa, papel, Zod, use case, revalidação e auditoria best-effort. | Manter cobertura automatizada em F-04. |
| **P-A7** | **Autorização por papel usa claim de JWT, que fica velha.** `options.roles` compara com `current_clinic_role()` — leitura de claim. Depois de uma mudança ou revogação de papel, o token continua valendo até o refresh (R6 do roadmap). O roadmap §7.3 designou `has_clinic_role(p_roles)` para este ponto, e ele não é usado. | Uma revogação de papel não tem efeito imediato sobre as ações já autorizadas pelo token em uso. | Decisão do Codex: usar a RPC (banco decide) ou assumir a janela e fechá-la com revogação explícita de sessão em I-04. |
| **P-A8** | **Só o sucesso é auditado.** `options.audit` roda depois de `if (!result.ok) return result`; negativa de permissão, sessão inválida e conflito não deixam linha em `audit_log`. | Para dado de saúde, tentativa negada costuma ser tão relevante quanto acesso concedido. Hoje o sinal fica só no log do servidor. | Decisão de produto/segurança + P-A1: sem clínica nas claims o insert de uma negativa seria recusado de qualquer forma. |
| **P-A9** | **Resolvido pelo Codex.** O board e os documentos de onboarding foram atualizados para refletir F-01 em Review e CA7 como auditoria best-effort do bootstrap. | A única pendência funcional restante é confirmar a policy remota de INSERT em `audit_log` (P-A1). | Manter a confirmação no Supabase e a cobertura em F-04. |

---

## 7. Fora de escopo, deliberadamente

> Escrito no fechamento de F-01. **A primeira linha foi resolvida por F-02** — ver §8.

- ~~**Cache tags com `clinic_id`** (D3/F-02)~~ — entregue; ver §8.
- **`eslint-plugin-boundaries`** (D4/F-03) — nenhuma regra de arquitetura é verificada hoje; em particular, nada impede uma Server Action de não usar `createAction` (R4 do roadmap continua sem gate).
- **Matriz papel × ação** (I-05) — `createAction` aceita uma lista de papéis por ação; a matriz centralizada em `lib/auth/permissions.ts` é outra feature.
- **`unauthorized()` / `forbidden()`** (D10) — exigem `experimental.authInterrupts` em `next.config.ts`, que não foi habilitado aqui.
- **`Money`, `Paginated`, `Entity`, `ValueObject`** (D12) — o roadmap os agenda para antes do Financeiro. Criá-los sem chamador seria pasta vazia com nome bonito.
- **Migrations, mudanças de schema, dependências novas, `service_role`.**

---

## 8. F-02 — cache multi-tenant e flags do Next 16

> Feature **F-02** do [`roadmap.md`](./roadmap.md) §13 (dívida **D3** e parte de **D10**).
> Escrita em **07/08/2026**, mesma branch. Nenhuma migration, nenhuma dependência
> nova, nenhum `service_role`, nenhuma escrita no banco remoto.

### 8.1 O que a fatia entrega

| # | Entrega | Onde |
|---|---|---|
| 1 | Fábrica única e tipada de tags tenant-scoped (`cacheTags`, `CacheTag`, `InvalidCacheTagError`) | `src/lib/cache/tags.ts` |
| 2 | `cacheComponents: true` | `next.config.ts` |
| 3 | Invalidação por tag no passo 6 do pipeline (`cacheTags` em `CreateActionOptions`) | `src/modules/_shared/application/createAction.ts` |
| 4 | Primeiro chamador: as três ações de pacientes declaram suas tags | `src/modules/patients/actions/*.action.ts` |
| 5 | Cobertura: 34 testes da fábrica + 10 do contrato de revalidação | `src/lib/cache/tags.test.ts` · `src/modules/_shared/application/createAction.test.ts` |

### 8.2 A regra que a fábrica torna verificável

P4 do roadmap: **toda tag de cache carrega `clinic_id`**. A §8 de
[`01-arquitetura.md`](./01-arquitetura.md) fixa o formato:

```
OK   clinic:{clinicId}:patients
NÃO  patients
```

Quatro decisões fazem disso mais do que concatenar strings:

1. **`CacheTag` é tipo marcado.** Uma string literal não o satisfaz, então
   `updateTag('patients')` **não compila** onde o contrato pede `CacheTag`.
   "Toda tag sai da fábrica" deixa de depender de revisão humana — enquanto F-03
   (`eslint-plugin-boundaries`) não existe, o compilador é o gate.
2. **O identificador é validado como UUID.** É o que impede dado pessoal de virar
   tag: nome, e-mail, CPF e telefone não são UUID, então não passam. `clinicId`
   sai de `current_clinic_id()` e `patientId` sai da linha que o repositório
   devolveu — os dois são `uuid` no schema.
3. **O erro nunca repete o valor recusado.** Uma mensagem que ecoasse a entrada
   inválida colocaria no log exatamente o dado que a regra 2 barrou. Há teste
   para isso.
4. **Normaliza caixa e apara espaço.** `updateTag`/`revalidateTag` são
   case-sensitive
   (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md`).
   Sem normalizar, o mesmo id em maiúsculas produziria uma tag que a leitura
   nunca criou — a invalidação "funcionaria" e não invalidaria nada.

`agenda(clinicId, date)` exige data civil `YYYY-MM-DD` e valida o calendário
(`2026-02-31` é recusada). A checagem usa `Date.UTC`, função pura: nada ali lê o
relógio, então a fábrica continua chamável de dentro de um escopo `use cache`.

### 8.3 `cacheComponents: true` — e o que ela **não** ligou

A flag é o que habilita `use cache`, `use cache: private`, `cacheTag()` e
`cacheLife()`. Ela substitui `experimental.dynamicIO`, `experimental.useCache` e
`experimental.ppr`, **removidas no Next 16** — nenhuma delas foi declarada.
`experimental.authInterrupts` (D10, telas 401/403) continua fora: é I-05, não
esta fatia.

Com a flag ligada o padrão continua **dinâmico**: só entra em cache o que declara
`use cache`. Nada declara.

#### O custo real: validação de shell estático

`cacheComponents` passa a exigir que toda rota produza um shell estático não
vazio. A casca de `(app)/` lê a sessão em cookie **antes de decidir se
redireciona** — não há shell a pré-renderizar, porque nem se sabe ainda se a rota
renderiza. O build quebrou em `/agenda`, e depois em `/login`.

A saída é a documentada para adoção incremental: `export const instant = false`
marca o segmento como "pode bloquear" — **não força a rota a ser dinâmica e não
cacheia nada**
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`,
§"Disabling static shell validation").

| Segmento | Por quê |
|---|---|
| `src/app/(app)/layout.tsx` | Sessão em cookie no topo; cobre toda a área autenticada de uma vez |
| `src/app/(auth)/login/page.tsx` | `searchParams` no topo |
| `src/app/(auth)/recuperar-senha/page.tsx` | `searchParams` no topo |
| `src/app/(auth)/onboarding/page.tsx` | Sessão em cookie decide se a tela existe |

Colocado o mais baixo possível: `(auth)/layout.tsx`, `/cadastro` e `/` continuam
validando, e `/pacientes/[patientId]` e `/pacientes/[patientId]/historico` saem
do build como **Partial Prerender**. Sair dessa lista exige empurrar a leitura de
sessão para dentro de `<Suspense>` tela por tela, com fallback desenhado —
refatoração de rota, não de infraestrutura.

### 8.4 Invalidação: `updateTag`, e por que não `revalidateTag`

```ts
cacheTags?: (scope: ActionCacheScope, output: TOutput) => readonly CacheTag[]
```

`updateTag` é o correto aqui: quem acabou de salvar precisa ver o próprio dado na
leitura seguinte (*read-your-own-writes*), não a versão velha enquanto a nova
carrega em segundo plano. Ele **só vale dentro de Server Action** — que é
exatamente e unicamente o que `createAction` monta
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`).
`revalidateTag(tag, 'max')` seria a escolha em Route Handler ou webhook; não há
nenhum que invalide cache hoje.

**Duas restrições de desenho, as duas de segurança:**

1. **O callback não recebe `input`.** Vê `scope` (`clinicId` e `userId`, os dois
   derivados no servidor) e `output` (a linha que o caso de uso devolveu, já
   depois da RLS). Não existe assinatura pela qual um campo de formulário
   influencie qual recorte de cache expira. Isso é estrutura, não convenção — e
   tem teste que manda `clinicId` da clínica vizinha no corpo e verifica que a
   tag continua sendo a da sessão.
2. **`updatePatient` e `archivePatient` tagueiam por `output.id`, não por
   `input.patientId`.** Os dois valem o mesmo, mas só um é o id que o banco
   confirmou.

Falha na fabricação de uma tag vai para o log do servidor e **não** transforma a
mutação já concluída em erro na tela — mesma regra best-effort do passo 7. Há
teste: `cacheTags` que lança ainda devolve `{ ok: true }` para a UI.

### 8.5 Nenhum dado clínico foi cacheado nesta fatia

Esta é a decisão central, e é deliberada: **`use cache` não aparece em lugar
nenhum do código.**

A listagem de `/pacientes` seria o candidato óbvio, e reúne as três condições que
desaconselham:

| Condição | Consequência |
|---|---|
| Lê sessão em cookie | `cookies()` é proibido em `use cache` |
| Lê `searchParams` (busca, filtro e cursor de P-02a) | Idem |
| Devolve dado de paciente | Cachear dado de saúde exige contrato próprio, não herdado |

Some-se `await connection()`, proibido nos **dois** sabores de cache.

O caminho eventual é `'use cache: private'` — resultado nunca armazenado no
servidor, só na memória do browser — com `cacheTag(cacheTags.patients(clinicId))`
e `cacheLife` explícito. Esse contrato precisa ser escrito olhando para o dado
clínico, com decisão de retenção e de LGPD junto. Não é subproduto de uma fatia
de infraestrutura, e antecipá-lo aqui seria o R2 do roadmap disfarçado de
progresso.

**O que existe hoje, então:** a fábrica, o cano de invalidação e a flag. As três
ações de pacientes já declaram suas tags — em runtime isso é *no-op*, porque não
há entrada de cache para expirar. É de propósito: quando a primeira leitura
cacheável tenant-scoped entrar, ela não precisa inventar a invalidação junto.

### 8.6 Pendências de F-02

| # | Pendência | Impacto | Como fechar |
|---|---|---|---|
| **P-C1** | **Nenhuma leitura usa `use cache`.** A fatia entrega tag sem consumidor. | Nenhum ganho de performance ainda; a invalidação é no-op. D3 está resolvida na infraestrutura, não no uso. | Primeira leitura cacheável tenant-scoped — candidata natural é P-02b, com `'use cache: private'` e contrato de dado clínico explícito. |
| **P-C2** | **Quatro segmentos com `instant = false`.** | Área autenticada e três telas de auth não produzem shell estático. Não é regressão (era o comportamento anterior), é dívida assumida e nomeada. | Empurrar a leitura de sessão/`searchParams` para dentro de `<Suspense>`, uma tela por vez, com fallback desenhado pelo Codex. |
| **P-C3** | **`updateTag` não foi exercitado contra o runtime do Next.** Os testes usam mock de `next/cache`: verificam qual tag o pipeline decide invalidar, não o efeito no cache. | Se a chamada falhar em produção, o sinal fica no log do servidor (`[action] falha pós-mutação`) e a escrita permanece válida. | Só é observável quando existir leitura cacheada (P-C1). Smoke E2E em F2+. |
| **P-C4** | **Nada impede uma tag literal fora do pipeline.** `updateTag('x')` chamado direto em um arquivo qualquer compila. | O tipo `CacheTag` só protege quem passa por `createAction`. | F-03 (`eslint-plugin-boundaries`): regra proibindo `next/cache` fora de `_shared/application` e `lib/cache`. É o R2 do roadmap. |

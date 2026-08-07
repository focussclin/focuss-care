# F-01 — Fundação de Server Actions e auditoria

> Implementação da feature **F-01** do [`roadmap.md`](./roadmap.md) §13 (dívidas D1 e D2).
> Escrito contra o código e os tipos gerados do banco em **07/08/2026**,
> branch `feat/telas-e-camada-supabase`.

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

### Pendência conhecida: revalidação por caminho

`revalidatePaths` chama `revalidatePath` por caminho. É provisório. Erros na
revalidação ou na montagem do evento de auditoria são registrados no servidor e
não transformam uma mutação já concluída em falha para a UI. **F-02**
substitui isso por tags de cache com `clinic_id` (`lib/cache/tags.ts`), que é o
que a §8 de [`01-arquitetura.md`](./01-arquitetura.md) exige. Enquanto F-02 não
entra, revalidar por caminho é o que existe.

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
| **P-A6** | **`createAction` não foi exercido em runtime.** Sem chamador (§3), o pipeline compila e passa no lint, mas nunca rodou. | O primeiro uso real (P-01) pode revelar ajuste de ergonomia. | Implementar P-01 sobre ele. |
| **P-A7** | **Autorização por papel usa claim de JWT, que fica velha.** `options.roles` compara com `current_clinic_role()` — leitura de claim. Depois de uma mudança ou revogação de papel, o token continua valendo até o refresh (R6 do roadmap). O roadmap §7.3 designou `has_clinic_role(p_roles)` para este ponto, e ele não é usado. | Uma revogação de papel não tem efeito imediato sobre as ações já autorizadas pelo token em uso. | Decisão do Codex: usar a RPC (banco decide) ou assumir a janela e fechá-la com revogação explícita de sessão em I-04. |
| **P-A8** | **Só o sucesso é auditado.** `options.audit` roda depois de `if (!result.ok) return result`; negativa de permissão, sessão inválida e conflito não deixam linha em `audit_log`. | Para dado de saúde, tentativa negada costuma ser tão relevante quanto acesso concedido. Hoje o sinal fica só no log do servidor. | Decisão de produto/segurança + P-A1: sem clínica nas claims o insert de uma negativa seria recusado de qualquer forma. |
| **P-A9** | **Status no board não reflete a árvore.** `roadmap.md` §13 mantém F-01 em `Ready`, §2.4 não risca D1/D2 (contra a regra da §15), `05-onboarding-e-sessao.md` §6 P5 ainda afirma que a criação de clínica não gera linha em `audit_log`, e o CA7 de §14 exige que ela "passe por `createAction`" — o que a §3 deste documento exclui por desenho. | O board diz uma coisa e o código faz outra; CA7 não é assinável como está escrito. | `docs/**` é do Codex (roadmap §6): atualizar status, riscar D1/D2, corrigir P5 e reescrever CA7 como "grava em `audit_log` com ator, ação e `after`". |

---

## 7. Fora de escopo, deliberadamente

- **Cache tags com `clinic_id`** (D3/F-02) — `createAction` revalida por caminho até lá.
- **`eslint-plugin-boundaries`** (D4/F-03) — nenhuma regra de arquitetura é verificada hoje; em particular, nada impede uma Server Action de não usar `createAction` (R4 do roadmap continua sem gate).
- **Matriz papel × ação** (I-05) — `createAction` aceita uma lista de papéis por ação; a matriz centralizada em `lib/auth/permissions.ts` é outra feature.
- **`unauthorized()` / `forbidden()`** (D10) — exigem `experimental.authInterrupts` em `next.config.ts`, que não foi habilitado aqui.
- **`Money`, `Paginated`, `Entity`, `ValueObject`** (D12) — o roadmap os agenda para antes do Financeiro. Criá-los sem chamador seria pasta vazia com nome bonito.
- **Migrations, mudanças de schema, dependências novas, `service_role`.**

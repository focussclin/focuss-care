# P-01 — Cadastro, edição e arquivamento de pacientes

> Primeira fatia de **escrita** do produto e primeiro chamador de runtime do
> `createAction` (a antiga pendência **P-A6** de [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md)).
> Escrito contra o código, os tipos gerados e **o banco remoto** em **07/08/2026**,
> branch `feat/telas-e-camada-supabase`.

Escopo: **criar, editar e arquivar/reativar** paciente, ponta a ponta.
Consentimento LGPD, prontuário, agenda e Patient 360 continuam fora — ver §6.

> **Atualização 07/08/2026 — P-02a.** A listagem passou a ser **paginada por
> cursor, com busca e filtro de status no servidor**. A §8 documenta a fatia,
> incluindo o que ficou de fora e por quê.

> **Atualização 07/08/2026 — P-03.** O perfil do paciente ganhou o **painel de
> consentimentos LGPD** (`consents`): conceder e revogar por finalidade, com data
> e versão do documento decididas no servidor. A §9 documenta a fatia — inclusive
> os limites da tabela remota (sem FK para `patients`, sem `created_by`, sem
> unique parcial) e o que falta para sair de Review.

> **Achado que atravessa o produto inteiro:** a policy de `INSERT` de `audit_log`
> **recusa o membro autenticado**. Nenhum evento de auditoria está sendo gravado
> hoje — nem `clinic.created`, nem os três deste módulo. Ver **P-P6** na §7.

---

## 1. O que a fatia entrega

| # | Entrega | Onde |
|---|---|---|
| 1 | Método `create` na porta do módulo | `src/modules/patients/domain/PatientRepository.ts` |
| 2 | Falha de escrita traduzida para o domínio | `src/modules/patients/domain/PatientRepositoryError.ts` |
| 3 | `INSERT` no adapter Supabase, com a sessão do usuário | `src/modules/patients/infrastructure/SupabasePatientRepository.ts` |
| 4 | Composição de escrita (`patientRepositoryFor`) | `src/modules/patients/infrastructure/repository.ts` |
| 5 | Contrato Zod do servidor + DTO serializável | `src/modules/patients/schemas/patient.schema.ts` |
| 6 | Server Action sobre o `createAction` | `src/modules/patients/actions/createPatient.action.ts` |
| 7 | Modal com envio assíncrono, erro acessível e loading | `src/modules/patients/ui/NewPatientModal.tsx` |
| 8 | Tela decidindo entre banco e demonstração | `src/modules/patients/ui/PatientsScreen.tsx` |
| 9 | Telefone canônico na escrita, formatado na leitura | `src/lib/utils/phone.ts`, `infrastructure/patientMapper.ts` |
| 10 | `update` e `setArchived` na porta e no adapter | `domain/PatientRepository.ts`, `infrastructure/SupabasePatientRepository.ts` |
| 11 | Actions de edição e de arquivar/reativar | `actions/updatePatient.action.ts`, `actions/archivePatient.action.ts` |
| 12 | Modal de edição com zona de arquivamento | `ui/EditPatientModal.tsx` |
| 13 | Wiring da edição no perfil | `ui/PatientProfileActions.tsx`, `app/(app)/pacientes/[patientId]/page.tsx` |
| 14 | Camada de aplicação do módulo (DTO, diff, papéis, falhas) | `application/*.ts` |

Nenhuma migration, nenhuma mudança de schema remoto, nenhuma dependência nova,
nenhum uso de `SUPABASE_SECRET_KEY`.

---

## 2. O caminho de um cadastro

```
NewPatientModal (client)
   └─ PatientsScreen.handleCreate           isLive? não → estado local, sem action
        └─ createPatientAction(values)      ← única entrada do cliente
             └─ createAction                autenticar → clínica ativa → papel → Zod
                  └─ SupabasePatientRepository.create   INSERT sob RLS
                       └─ revalidatePath('/pacientes')
                       └─ after(): audit_log 'patient.created'   (best-effort)
```

**O cliente manda cinco campos e nada mais:** nome, telefone, e-mail, data de
nascimento e observação. `clinic_id` e `created_by` **não existem na entrada** —
saem do `ActionContext`, que os deriva de `current_clinic_id()` e da sessão
validada (P3 de [`01-arquitetura.md`](./01-arquitetura.md)). Não há campo, nem
parâmetro opcional, por onde o navegador influenciar a clínica de destino: mesmo
que o `POST` carregue `clinicId`, o Zod descarta a chave desconhecida e o insert
usa o valor do contexto.

`contactPreference` é coletado pelo formulário e **descartado no servidor**: não
existe coluna para ele no schema remoto. Criá-la seria migration, que esta fatia
não faz. Por isso o paciente recém-criado entra na lista sem preferência de
contato — mostrar o valor digitado seria exibir um dado que o próximo
carregamento não traz de volta.

### O que é gravado

| Coluna | Valor | Por quê |
|---|---|---|
| `clinic_id` | `ActionContext.clinicId` | Nunca do cliente |
| `full_name` | nome, com bordas aparadas | Máx. 160 caracteres |
| `birth_date` | `YYYY-MM-DD` ou `null` | Data de calendário real, não futura, ano ≥ 1900 |
| `biological_sex` | `'not_informed'` | Coluna `NOT NULL`; o formulário **não coleta sexo**. É o valor do enum que diz exatamente isso — inventar outro seria inventar dado clínico |
| `phone` | só dígitos (DDD + número) | §3 |
| `email` | minúsculo, sem espaço, ou `null` | |
| `address` | `{}` | Coluna `jsonb` `NOT NULL`; objeto vazio é "sem endereço", não um endereço falso |
| `admin_notes` | texto ou `null` | Observação **administrativa**. Não é prontuário |
| `is_active` | `true` | Cadastro novo entra ativo; arquivar é outra fatia |
| `created_by` | `ActionContext.userId` | Da sessão |

Nenhum default de banco é presumido: toda coluna obrigatória do `Insert` gerado
em `database.types.ts` é enviada explicitamente.

---

## 3. Telefone: canônico no banco, legível na tela

`patients.phone` é o identificador de contato que a recepcionista digital vai
consultar (módulo `whatsapp`, roadmap P3). Se cada cadastro gravar a máscara que o
usuário digitou — `(11) 98812-4471`, `11988124471`, `+55 11 98812 4471` — a mesma
pessoa vira três registros diferentes para qualquer busca, e consertar isso depois
é migration de dado.

Então: **só dígitos na escrita** (`normalizePhone`, que remove o `55` do início
quando presente), **formatado na leitura** (`formatPhone`, chamado no
`patientMapper`). Valor fora do padrão brasileiro volta como está no banco — linha
vinda de importação não pode ser mutilada pela tela.

O e-mail segue a mesma ideia: minúsculo e aparado, `''` vira `null`.

**Data de nascimento.** `'YYYY-MM-DD'` sozinho é interpretado como meia-noite UTC:
no fuso do Brasil, a tela mostrava o dia anterior ao que foi digitado. O
`patientMapper` passou a montar a data com hora local explícita, de modo que
cadastrar 10/05 e recarregar a página continua mostrando 10/05.

---

## 4. Segurança

| Regra | Como fica garantida |
|---|---|
| `clinicId`/`userId` nunca vêm do cliente | Não são campos do schema; saem do `ActionContext`. §2 |
| Escrita sob RLS, com a sessão do usuário | O adapter recebe `context.supabase` — o mesmo cliente que o `createAction` montou. Nenhum caminho daqui alcança `SUPABASE_SECRET_KEY` |
| Autorização por papel | `roles: ['owner','admin','receptionist','professional']`. `finance` fica de fora — cadastro é ato de recepção. Lista local e **provisória** até a matriz papel × ação (I-05) |
| Validação no servidor | O Zod do servidor roda de novo, independente do formulário, e é mais estrito que ele (formato de telefone, data de calendário, limites de tamanho) |
| Retorno serializável | A action devolve `{ id, name, phone, email, birthDate, isActive, createdAt }` com strings ISO. `Date` e linha crua do Supabase não atravessam a fronteira |
| Mensagem de erro sem detalhe de banco | Conflito, recusa de policy e falha inesperada viram texto genérico em pt-BR (`createPatientMessages`) |

### O que vai para o log do servidor — e o que não vai

Esta action registra **apenas `reason`, `code` e `status`**. Deliberadamente menos
que o `describeCause` que as outras actions usam, e a diferença é a tabela: em
`patients`, o `details` de uma *unique violation* ecoa o valor enviado
(`Key (clinic_id, cpf)=(…, 000…) already exists`). O texto do erro do Postgres
pode, portanto, carregar dado pessoal do paciente para dentro do log — que é lido
por muito mais gente do que a tabela. Código e status bastam para saber qual
classe de recusa ocorreu.

### Auditoria

`patient.created`, com `entity_id` e `after: { is_active: true, source: 'patients-screen' }`.

**Nome, telefone, e-mail, data de nascimento e observação não entram.** Ficam em
`patients`, alcançáveis por `entity_id`. `audit_log` é append-only e legível pela
operação inteira — dado pessoal que entra ali não sai mais. (A rede de segurança
de `sanitizeMetadata` descartaria essas chaves de qualquer forma; a defesa
principal é não mandá-las.)

A escrita do log roda em `after()`, **depois da resposta**, e é best-effort: se a
policy de `audit_log` recusar (pendência P-A1), o cadastro continua válido e o
sinal fica no log do servidor. Auditoria nunca derruba a operação que observa.

---

## 4A. Editar e arquivar

### Editar

Ponto de entrada: `?editar=1` no perfil do paciente — o link que o menu da
listagem **já apontava** e que até agora não fazia nada. O botão "Editar
paciente" do cabeçalho passou a abrir o modal em vez de navegar.

Três decisões que valem registro:

1. **A edição substitui.** Apagar um telefone é uma edição legítima, não um
   engano. Por isso o formulário chega preenchido com o estado atual — inclusive
   `admin_notes`, que ganhou lugar no domínio (`Patient.adminNotes`) exatamente
   para isso. Sem carregar o valor, salvar o formulário apagaria a observação já
   gravada.
2. **O formulário de edição não tem preferência de contato.** O cadastro coleta e
   o servidor descarta (não há coluna). Repetir o campo aqui seria pior: ele
   apareceria sempre com o mesmo valor padrão e passaria por "dado do paciente".
3. **`patientId` pode vir do cliente.** É o único identificador que ele tem o
   direito de escolher, porque diz *o quê*, não *onde*. A clínica continua saindo
   do `ActionContext`, e o `update` filtra por ela — id de outra clínica afeta
   zero linhas e volta como `not-found`, sem revelar que aquele id existe.

### Arquivar

**Arquivar não é excluir.** `is_active = false`: a linha continua na base, sai da
lista de ativos, aparece no filtro "Inativos" e volta quando alguém reativa.
Exclusão no produto é lógica (`deleted_at`) e não faz parte desta fatia — `DELETE`
é proibido pelo §8 do roadmap em qualquer caso.

O gatilho mora **dentro do modal de edição**, numa faixa separada com o efeito
escrito por extenso. Fora do modal, o perfil ganharia um botão destrutivo
permanentemente visível; dentro, a ação fica no mesmo contexto de manutenção do
cadastro. Como é reversível e o rótulo diz o que acontece, não há diálogo de
confirmação aninhado — dois modais empilhados são um problema de acessibilidade
maior que o risco de um clique errado que se desfaz em um clique.

### Auditoria das duas

| Evento | `after` |
|---|---|
| `patient.updated` | `is_active`, `source`, `changed_count`, `changed_fields` |
| `patient.archived` / `patient.restored` | `is_active`, `source` |

`changed_fields` guarda **nomes de coluna** (`'phone,email'`), calculados no
servidor comparando o estado anterior com a entrada normalizada — nunca os
valores. É a diferença entre uma auditoria que responde "o telefone foi alterado"
e um histórico paralelo de dado pessoal dentro de uma tabela append-only.

Arquivar e reativar são **verbos distintos** no log, não um evento com booleano:
auditoria se consulta por ação, e "quem arquivou pacientes neste mês" não deveria
exigir filtrar o JSON de metadados.

---

## 5. Modo demonstração continua existindo — e continua se anunciando

`PatientsScreen` recebe `isLive`, derivado de `getPatientRepository()`:

- **`isLive` falso** (Supabase ausente do ambiente): a Server Action **não é
  chamada**. O paciente vive na memória da aba, e o aviso de sucesso diz isso
  com todas as letras — "Modo demonstração: nada foi salvo no banco". Vitrine que
  se parece com produto é o R11 do roadmap.
- **`isLive` verdadeiro**: todo cadastro passa pela action. O modal só fecha
  depois que o servidor confirma; falha mantém o modal aberto, com o que foi
  digitado, mensagem em `role="alert"` e erro por campo quando o servidor sabe
  qual campo recusou. Enquanto envia, campos e botões ficam desabilitados e uma
  região `aria-live="polite"` anuncia o progresso.

`MockPatientRepository.create` **falha de propósito** em vez de devolver um
paciente: devolver seria dar "cadastrado com sucesso" a algo que não saiu da
memória do processo. Na prática o método é inalcançável — a action só roda com
clínica ativa, e aí o adapter em uso é o do Supabase.

---

## 6. Fora de escopo, deliberadamente

Exclusão lógica pela interface, consentimento LGPD (P-03), prontuário, agenda,
Patient 360, CPF/CNS, sexo biológico no formulário, endereço estruturado, contato
de emergência, foto e importação em massa.

Também fora: cache tags com `clinic_id` (F-02 — a action revalida por caminho,
como todo o resto hoje).

> **Atualizado por F-02.** As três ações de pacientes passaram a declarar
> `cacheTags` (`clinic:{clinicId}:patients` e `clinic:{clinicId}:patient:{id}`) —
> `revalidatePath('/pacientes')` continua ao lado, porque é ele que ainda faz a
> listagem reaparecer atualizada. **Nenhuma leitura foi cacheada.** Ver
> [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md) §8.

Busca paginada por cursor **saiu desta lista**: foi entregue em P-02a, §8. O que
sobrou dela está em P-02b, bloqueado por acesso ao banco.

**Consentimento LGPD também saiu desta lista**: foi entregue em P-03, §9. Segue
em Review até a policy de escrita de `consents` ser confirmada no banco (§9.8).

---

## 7. O que foi verificado no banco remoto — e o que continua pendente

### 7.1 Verificado (07/08/2026, sessão real de um `owner`, chave publishable, **sem `service_role`**)

| # | Verificação | Resultado |
|---|---|---|
| V1 | `INSERT` em `patients` como membro autenticado | **201** — a policy aceita; a linha lê de volta |
| V2 | `UPDATE` de dados como membro | **200, 1 linha** |
| V3 | `UPDATE` de `is_active` (arquivar) | **200** |
| V4 | `UPDATE` mirando `clinic_id` de **outra** clínica | **0 linhas afetadas** — tenancy confirmada; o código traduz isso em `not-found` |
| V5 | Soft delete + `select … deleted_at is null` | linha some da listagem, como o repositório assume |
| V6 | `INSERT` em `patients` **anônimo** | **401 `42501`** — recusado pela RLS |
| V7 | `select` em `patients` **anônimo** | `[]` |
| V8 | `INSERT` em `audit_log` como membro autenticado | **403 `42501` — recusado** ⚠️ |
| V9 | `current_clinic_id()` / `current_clinic_role()` | `7e3b…b48e` / `owner` |
| V10 | Claim `clinic_id` dentro do JWT | **ausente** — ver P-P7 |

As linhas de teste criadas para V1–V5 foram removidas por exclusão lógica
(`deleted_at`), que é a convenção do produto.

### 7.2 Pendências

| # | Pendência | Impacto | Como resolver |
|---|---|---|---|
| **P-P6** | **A policy de `INSERT` de `audit_log` recusa o membro autenticado (V8).** Isso fecha a pendência P-A1 de [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md) — com resposta negativa. **Nenhum evento de auditoria do produto está sendo gravado**: nem `clinic.created`, nem `patient.created`, `patient.updated`, `patient.archived` ou `patient.restored`. | **Alto.** A escrita é best-effort e nada quebra na tela, mas o §8 do roadmap ("mutação passa pelo `createAction` e grava em `audit_log`") e o CA7 de I-01 estão reprovados hoje. Para dado de saúde, trilha de auditoria é requisito legal, não recurso. | Migration com policy de `INSERT` para `authenticated`, algo como `WITH CHECK (clinic_id = current_clinic_id() AND actor_user_id = auth.uid())`. **Não aplicada aqui:** mudança de schema exige aprovação do Codex e PR isolado (§7.4 do roadmap). Depois: repetir V8. |
| **P-P7** | **O JWT não carrega `clinic_id` nas claims (V10)**, embora `current_clinic_id()` responda corretamente — ou seja, a RPC não depende só do token. É a dívida **D14** do roadmap, agora com evidência. | Baixo hoje (tudo que precisa da clínica passa pela RPC). Alto no dia em que uma policy consultar a claim direto em vez da função. | Confirmar o registro do `custom_access_token_hook` no projeto remoto. |
| **P-P1** | ~~Policy de `INSERT` de `patients` não verificada~~ — **resolvida** por V1/V6. | — | — |
| **P-P2** | **Índices únicos de `patients` não são observáveis pelo repositório.** O gerador de tipos lê o OpenAPI do PostgREST, que expõe colunas e RPCs — não constraints. | Se existir único sobre alguma coluna que este insert preenche, o usuário recebe a mensagem de conflito (tratada), não um 500. | `select indexname, indexdef from pg_indexes where tablename='patients';` |
| **P-P3** | **`patients.updated_at` tem trigger de atualização?** O insert não envia o campo; o `Insert` gerado o trata como opcional. | Nenhum hoje; o valor só importa para uma futura exibição de última alteração. | `select tgname from pg_trigger where tgrelid='patients'::regclass;` |
| **P-P4** | ~~Nenhum teste automatizado~~ — **resolvida parcialmente**: há testes unitários do schema e teste de contrato do adapter, incluindo filtro por `clinic_id`, `id` e `deleted_at is null`. A validação de RLS entre tenants continua manual em V4. | O contrato local está protegido; a policy real ainda deve ser exercitada no CI quando o harness de integração existir. | F-04 (harness + CI) para transformar V4 em teste de tenancy automatizado. |
| **P-P5** | **Fuso da clínica não é considerado na data de nascimento.** A validação "não pode ser futura" compara com o relógio do servidor em UTC. | No máximo, aceitar uma data um dia à frente para quem cadastra tarde da noite. Nunca recusa data válida. | Decidir com `clinics.timezone` quando a formatação de data por clínica entrar. |

---

## 8. P-02a — busca server-side e paginação por cursor

> Entregue em **07/08/2026**, sem tocar no banco remoto: nenhuma migration,
> nenhuma coluna nova, nenhuma dependência nova. O que exigia SQL virou P-02b.

### 8.1 O defeito que esta fatia corrigiu

Antes de P-02a a listagem **não tinha limite nenhum**:

| Onde | O que fazia | Consequência |
|---|---|---|
| `listByClinic` | `select … eq(clinic_id) is(deleted_at,null) order(full_name)` sem `limit` | Trazia a clínica inteira em toda renderização |
| `loadVisitDates` | `in('patient_id', [todos os ids])` | URL do PostgREST crescia até **HTTP 414** em algumas centenas de pacientes |
| `pacientes/page.tsx` | passava todos os pacientes ao Client Component | Nome, e-mail, telefone e nascimento de **toda a base** no payload RSC, mostrando 8 |
| `PatientsScreen` | filtrava por `useMemo` e paginava por `slice` | Busca e paginação eram ilusão de cliente |
| `PatientsScreen` | busca/status/última visita em `useState` | Recarregar perdia o recorte; o link não reproduzia; voltar não funcionava |
| `order('full_name')` | sem desempate | Ordenação instável entre homônimos — pré-requisito quebrado para keyset |
| métricas do topo | derivadas de `patients.length` | Quebrariam junto com a paginação: "Total" viraria o tamanho da página |

`listByClinic` **não existe mais**. Não foi substituído por uma versão com
limite opcional: um método sem teto disponível na porta é convite a reintroduzir
o problema em outra tela. Quem precisa de "todos" declara um limite e paga por
ele.

### 8.1.1 O seletor da agenda — o resto da dívida de P-02a

P-02a trocou "a clínica inteira" por "as 50 primeiras" no seletor de paciente do
Novo Agendamento, e deixou dito que seletor de clínica grande era trabalho de
A-01. As 50 primeiras tinham o mesmo defeito da base inteira, só mais barato:
o `datalist` filtrava **no navegador**, então quem não estivesse entre as 50
primeiras em ordem alfabética simplesmente não existia para a agenda — e a tela
não dizia que estava procurando num pedaço. Numa clínica com mil pacientes, a
recepção concluiria que "Zuleica" não tem cadastro.

O que existe agora:

| Peça | Onde | O que faz |
|---|---|---|
| Contrato | `patients/schemas/patientPicker.schema.ts` | Termo com mínimo de 2 caracteres, higienizado pelo mesmo `sanitizePatientSearch` da listagem; limite fixo de 8; resposta com **id e nome, e nada mais** |
| Busca | `patients/actions/searchPatients.action.ts` | Server Action pelo `createAction`: sessão, `current_clinic_id()`, `patient.read` e Zod antes do handler. Reusa `listPage` com `status: 'active'` |
| Campo | `patients/ui/PatientPicker.tsx` | Debounce de 250 ms, número de sequência descartando resposta fora de ordem, spinner, erro do servidor exibido, e o conjunto inicial de volta quando o campo esvazia |
| Composição | `app/(app)/agenda/page.tsx` | Monta o seletor e o passa como `renderPatientField`; `scheduling` não alcança o interior de `patients` (regra 4) |

Três decisões que não são óbvias:

- **Ação de leitura no pipeline de mutação.** O resto do produto lê na rota, e
  continua assim. O seletor vive dentro de um modal, e navegar para filtrar
  fecharia o formulário. Passar pelo `createAction` é reuso, não desvio: o que
  não se aplica a uma leitura (revalidação, tag, auditoria) fica de fora.
- **Sem auditoria.** Ler nome numa lista não é auditado em lugar nenhum do
  produto; o que é auditado é a leitura de **prontuário** (R-01). Auditar cada
  tecla encheria a trilha de ruído e esconderia o acesso que importa.
- **As 8 primeiras continuam vindo pela rota**, agora com o limite do seletor e
  não com os 50 de antes. Servem ao campo vazio: abrir o modal e ver lista em
  branco não ajuda ninguém.

Sem banco (demonstração local), a Server Action recusaria por falta de sessão. O
seletor então filtra o conjunto de exemplo no cliente **e diz isso na tela**, em
vez de mostrar erro vermelho a cada tecla.

### 8.2 O contrato

`Paginated<T>` em `_shared/domain` (paga parte da dívida **D12**) e, na porta:

```ts
listPage(clinicId: string, query: PatientListQuery): Promise<PatientPage>
countMetrics(clinicId: string, reference: Date): Promise<PatientMetrics>
```

`PatientPage` acrescenta `cursorApplied` a `Paginated<Patient>` — é o que
permite à tela dizer "mostrando do início" quando o cursor pedido não valia,
em vez de servir a primeira página fingindo que era a pedida.

**Não há total em `PatientPage`, de propósito.** `totalPages` exigiria um `count`
exato por página (segundo scan da fatia do tenant a cada navegação) e não
sobrevive a escrita concorrente. O rodapé mostra "Mostrando N pacientes" e dois
controles, não "3 / 47".

### 8.3 Ordenação e keyset

`ORDER BY full_name ASC, id ASC`, com `limit + 1` linhas para saber se há próxima
página sem `count`.

O desempate por `id` não é decorativo: sem ele dois homônimos podem **repetir ou
sumir** na fronteira entre páginas, e o defeito só aparece em produção.

**Risco conhecido (R-g):** `gt` e `ORDER BY` usam a mesma colação da coluna, então
o keyset é consistente por construção — exceto sob colação **não determinística**
(ICU com `deterministic = false`), em que `eq` casa com mais de uma grafia. Não é
o padrão do Supabase e **não é verificável a partir do repositório** (B1). Se for
confirmada, a ordem passa a ser `(created_at, id)` — e a lista deixa de ser
alfabética.

### 8.4 O cursor — opaco, por âncora, sem PII

```
cursor = base64url(JSON.stringify({ v: 1, a: <patients.id uuid>, f: <8 hex> }))
```

Duas regras duras, ambas em `patientCursor.ts`:

- **Nunca carrega o nome do paciente.** O cursor vive na URL: histórico do
  navegador, header `Referer`, log de proxy e CDN, print de tela. Nome de
  paciente de uma clínica é dado pessoal em contexto de saúde, e o cursor
  "óbvio" — `base64(full_name|id)` — vaza exatamente isso.
- **Nunca carrega `clinic_id`.** A clínica sai da sessão; um `clinic_id` vindo do
  cliente é o `clinicId` do cliente com outro nome (P3 de `01-arquitetura.md`).

`f` é o fingerprint de `status|search`: impede que o cursor da busca "ana" seja
aplicado à busca "bruno" e produza uma página silenciosamente errada.

**Por que não precisa de HMAC:** nenhum dado do cursor tem autoridade. `a` só
significa alguma coisa depois de resolvido por
`select id, full_name from patients where clinic_id = <ativa> and id = <a> and deleted_at is null`.
Um uuid de paciente de outra clínica não acha linha (filtro explícito + RLS) e a
listagem volta para a primeira página do próprio tenant — sem erro, sem
vazamento. Custo: um round-trip por página, por chave primária.

Base64 quebrado, JSON inválido, versão desconhecida, campo a mais, uuid mal
formado, cursor de 5.000 caracteres: **tudo devolve a primeira página, nada
lança.**

### 8.5 Busca — sanitização é requisito, não higiene

O termo entra em uma **string de filtro do PostgREST** (`or=(...)`), não em um
prepared statement. Isso não é SQL injection — a RLS e o `eq('clinic_id')`
continuam valendo, e `is('deleted_at', null)` é um AND separado — mas é injeção
na **gramática do filtro**.

`sanitizePatientSearch` (aplicado na rota **e de novo** no adapter):

1. Remove `%` e `_` — **não escapa**. O PostgREST não expõe a cláusula `ESCAPE`
   do `LIKE`, então escapar é impossível; quem digita `100%` procura por `100`.
2. Remove `"` `'` `\` `/` `,` `(` `)` `:` `;` `&` `|` e os invisíveis (`\p{Cc}`,
   `\p{Cf}`). O **ponto passa** — e-mail depende dele, e as aspas duplas em volta
   do valor o tornam inofensivo.
3. Colapsa espaço, corta em 80 caracteres, `''` vira `null`.

Campos buscados: `full_name` e `email` por `ilike` infixo; `phone` por `like` de
**prefixo** sobre dígitos (a coluna guarda só dígitos), a partir de 3 dígitos.

> **Diferença honesta em relação ao filtro local de P-01:** o telefone era
> infixo no cliente e agora é prefixo no servidor. Buscar pelos 4 últimos dígitos
> deixa de achar; buscar com DDD acha. Prefixo é a única forma que um btree comum
> atende — infixo exigiria trigram, que é P-02b.

**`cpf` e `cns` não são buscados.** Permitir busca por CPF transformaria a
listagem em oráculo de existência de CPF por tentativa e erro. P-03.

### 8.6 Limite

`DEFAULT = 20`, `MAX = 50`. Clampado **duas vezes**: no schema Zod da rota e de
novo no adapter (o método é público na porta; o próximo chamador pode não vir de
uma URL validada).

`?limit=100000` devolve 50, não a clínica inteira. `0`, `-1` e `abc` caem no
padrão — são ausência de pedido, não pedido exagerado.

### 8.7 Métricas do topo

Três consultas `select('id', { count: 'exact', head: true })`, que devolvem número
sem transferir linha:

| Métrica | Consulta |
|---|---|
| Total | `clinic_id` + `deleted_at is null` |
| Novos este mês | idem + `created_at >= início do mês de referência` |
| Atendimentos pendentes | `appointments`: `clinic_id`, `starts_at >= início do dia`, status fora de `canceled`/`no_show` |

A terceira **conta atendimentos, não pacientes** — que é o que o rótulo do card
já dizia. Antes contava pacientes com próxima visita.

Modo demonstração continua devolvendo os números do handoff (1.284 / 36 / 18),
não a contagem dos 12 pacientes de mock: a vitrine mostra escala de clínica real
e o banner já avisa que nada ali é dado de verdade.

### 8.8 A tela

- Recorte na URL: `?q=`, `?status=`, `?cursor=`. Recarregar mantém, o link
  reproduz, voltar funciona.
- Busca por `next/form` com `action="/pacientes"` — navegação client-side com
  prefetch, e funciona sem JS. **O cursor não é campo do formulário**, e é isso
  que reseta a paginação ao trocar de filtro.
- Rodapé: "Mostrando N pacientes" + **Anterior** (`router.back()`, habilitado só
  quando há cursor) e **Próxima** (`Link` para `?cursor=…`, prefetchável). Com
  keyset o servidor conhece a próxima âncora, nunca a anterior; o histórico do
  navegador já guarda os cursores por onde se passou.
- **A inserção otimista do cadastro saiu.** Ela colocava o paciente novo no
  índice 0; numa lista alfabética paginada isso é um item fantasma — aparece fora
  de ordem e some no próximo carregamento. O banner e as ações continuam, com
  `router.refresh()` no lugar (e "Ver perfil" some no modo demo, onde o id local
  não resolve rota).
- **"Última visita" está desabilitado**, com a razão escrita ao lado do controle.
  Não foi escondido nem deixado filtrando só no mock: um filtro que funciona na
  vitrine e não no produto é o R11.
- Erro de leitura: mensagem genérica na tela (`error.tsx`), causa e SQLSTATE
  apenas no `console.error` do servidor. Antes a mensagem do Postgres subia junto.

### 8.9 O que os testes cobrem (`npm test`)

Cursor round-trip, corrompido, versão desconhecida, campo a mais, `__proto__`,
uuid inválido, fingerprint divergente, ausência de PII no payload · clamp de
limite · sanitização contra 10 payloads de injeção, com assert sobre a string
gerada · `clinic_id` e `deleted_at is null` na listagem **e na resolução da
âncora** · âncora de outro tenant → primeira página · colunas do `select` sem
`cpf`/`cns`/`admin_notes` · ordenação `(full_name, id)` e `limit + 1` ·
`loadVisitDates` restrito aos ids da página · métricas por `head: true`.

Os fakes gravam a cadeia de chamadas do supabase-js — **nenhuma chamada de rede**.
Tenancy real continua sendo pgTAP (R1), ainda pendente.

### 8.10 P-02b — o que ficou bloqueado

| # | Item | Bloqueio |
|---|---|---|
| 1 | Filtro "Última visita (30/90 dias)" | Deriva de `appointments`; "mais de 90 dias" é anti-join (inclui quem nunca veio). Exige `last_visit_at` denormalizado ou RPC → migration |
| 2 | Busca infixa em escala | `pg_trgm` (+ `unaccent` para acento) e índice GIN → migration |
| 3 | Índice do keyset `(clinic_id, full_name, id) where deleted_at is null` | Migration |
| 4 | Cache da listagem | F-02 entregou a tag por `clinic_id` e ligou `cacheComponents`. O que falta é o **contrato**: a listagem lê cookie de sessão, `searchParams` e `connection()` — proibidos em `use cache`. Caminho: `'use cache: private'` com `cacheLife` e decisão de LGPD explícitas |
| 5 | Confirmação da colação de `full_name` | Sem acesso SQL (B1) |

Sem trigram, `ilike '%termo%'` é seq scan **dentro da fatia da clínica** —
correto, e O(n) por clínica. Para milhares de pacientes é tolerável; a latência
aparece primeiro na maior clínica do SaaS. **É pré-requisito de performance, não
de correção.**

### 8.11 Consultas que alguém com acesso ao SQL Editor precisa rodar

```sql
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename = 'patients';

select extname from pg_extension;   -- pg_trgm? unaccent? btree_gin?

select collname, collprovider, collisdeterministic   -- confirma a 8.3
  from pg_collation
 where oid = (select attcollation from pg_attribute
               where attrelid = 'patients'::regclass and attname = 'full_name');
```

---

## 9. P-03 — consentimento LGPD do paciente

> Entregue em **07/08/2026**, sem tocar no banco remoto: nenhuma migration,
> nenhuma coluna nova, nenhuma dependência nova. A tabela `consents` já existia,
> tipada e sob RLS, sem repositório nem tela.
>
> **Status: Review, não Done.** O que falta para `Done` está na §9.8 — e nada
> disso é código de aplicação.

### 9.1 O que a fatia entrega

| # | Entrega | Onde |
|---|---|---|
| 1 | Porta e entidade dos consentimentos de paciente | `src/modules/patients/domain/PatientConsentRepository.ts` |
| 2 | Adapter Supabase com os três filtros de recorte | `src/modules/patients/infrastructure/SupabasePatientConsentRepository.ts` |
| 3 | Tradução de recusa do Postgres, pública e testada | `src/modules/patients/infrastructure/postgrestFailure.ts` |
| 4 | Composição de leitura e de escrita | `src/modules/patients/infrastructure/repository.ts` |
| 5 | Contrato Zod, rótulos pt-BR e DTO | `src/modules/patients/schemas/patientConsent.schema.ts` |
| 6 | Versão vigente do documento, **server-only** | `src/modules/patients/application/consentDocumentVersions.ts` |
| 7 | DTO mínimo e montagem do painel no servidor | `src/modules/patients/application/toPatientConsentDto.ts`, `patientConsentRows.ts` |
| 8 | Server Actions de conceder e revogar | `src/modules/patients/actions/{grant,revoke}PatientConsent.action.ts` |
| 9 | Painel no perfil do paciente | `src/modules/patients/ui/PatientConsentsPanel.tsx` |
| 10 | Testes: schema, versão, adapter, actions, DTO | 4 arquivos `*.test.ts`, **sem rede** |

Fecha o item "Registro de consentimento por finalidade → `consents` → F2" da
tabela de LGPD da §8 do roadmap, e o `patients` do §3 passa a ter a última entrega
do seu MVP fora de contatos e documentos.

### 9.2 O que o navegador escolhe — e o que ele nunca escolhe

O contrato de entrada tem **dois campos**:

```ts
{ patientId: uuid, purpose: 'terms_of_service' | … | 'ai_assisted_processing' }
```

O que **não** é campo, e de onde vem cada um:

| Valor gravado | Fonte | Por quê |
|---|---|---|
| `clinic_id` | `ActionContext` (`current_clinic_id()`) | P3 de [`01-arquitetura.md`](./01-arquitetura.md) |
| `subject_type` | constante `'patient'` no adapter | A tabela é genérica; a porta cobre um recorte só |
| `document_version` | `application/consentDocumentVersions.ts`, com `server-only` | Um registro que aceita a própria versão por parâmetro **não prova nada** em auditoria |
| `granted_at` | relógio do servidor | Idem |
| `revoked_at` | `null` no insert, relógio do servidor no update | Idem |

`purpose` é `z.enum` derivado de `PATIENT_CONSENT_PURPOSES`, que por sua vez é
`satisfies readonly ConsentPurpose[]` — inventar uma finalidade **não compila**.
A direção contrária (o banco ganhar um valor no enum `consent_purpose` e a tela
ignorá-lo em silêncio) quebra a compilação em `toPatientConsentPurpose`.

### 9.3 Os três filtros de toda consulta

```
.eq('clinic_id', clinicId)          <- tenant, vindo da sessão
.eq('subject_type', 'patient')      <- só paciente
.eq('subject_id', patientId)        <- só este paciente, validado como uuid
```

Cada um responde por um risco diferente, e o do meio é o que só existe aqui:

- **`clinic_id`** é defesa em profundidade. A RLS impede o vazamento; o filtro
  impede a consulta errada.
- **`subject_type`** importa porque `consents` é **genérica**. Sem ele, um
  `subject_id` que coincidisse com o id de outro tipo de sujeito devolveria o
  consentimento errado — e a RLS não teria nada a reclamar, porque a linha é da
  mesma clínica.
- **`subject_id` validado como uuid** porque a coluna **não tem FK para
  `patients`** (§9.5). O banco aceitaria qualquer texto; o formato é a única
  checagem deste lado. Id malformado devolve `not-found` sem chegar ao banco — e
  a mensagem de log não repete o valor recusado.

### 9.4 O que nunca sai do banco

O `select` do adapter é `id, purpose, document_version, granted_at, revoked_at`.
Ficam de fora, deliberadamente:

| Coluna | Por que não sai |
|---|---|
| `ip`, `user_agent` | Dado pessoal (LGPD art. 5, I). Este caminho termina em props de Client Component |
| `clinic_id` | Quem consulta já sabe em qual clínica está — foi ele quem passou o filtro |
| `subject_type`, `subject_id` | São o filtro da consulta, não resultado dela |

São **três barreiras na mesma direção** — `SELECT`, entidade e DTO — porque é o
caminho mais curto entre uma tabela de dado sensível e a tela.

### 9.5 Limites da tabela remota, declarados

O schema remoto é o que está em `src/lib/supabase/database.types.ts`. Três coisas
que **não existem lá**, e o que cada ausência custa:

| Ausente | Consequência | O que a aplicação faz |
|---|---|---|
| **FK de `subject_id` → `patients`** | O banco aceitaria consentimento para um paciente inexistente, ou para um id de outra entidade | A action lê o paciente por `findById(clinicId, …)` **antes** de gravar, e o adapter valida o formato uuid |
| **Unique parcial em `(clinic_id, subject_type, subject_id, purpose) where revoked_at is null`** | Duas concessões simultâneas deixam **duas linhas vigentes** | Ver abaixo |
| **`created_by` / `created_at`** | A linha não diz **quem da equipe** registrou nem quando foi criada (só `granted_at`) | O ator fica em `audit_log`, via `recordAuditEvent` — que deriva ator, clínica e papel da sessão |

**A corrida, em detalhe.** "Já existe consentimento vigente?" é uma leitura
seguida de uma escrita, sem transação — PostgREST não expõe uma. Duas
recepcionistas clicando ao mesmo tempo na mesma finalidade podem produzir duas
linhas vigentes. A degradação foi escolhida para ser a mais barata possível:

- o painel mostra **a mais recente** das vigentes, então a tela continua correta;
- `revokeActive` fecha **todas** as vigentes, não uma — revogar não deixa
  consentimento de pé por trás de uma tela que diz "revogado";
- o evento `patient.consent.revoked` grava `revoked_count`. Em operação normal é
  sempre `1`; **um valor maior no log é a evidência de que a corrida aconteceu** —
  e é o que justificaria criar o índice.

A correção estrutural é o índice único parcial, e ela é **migration** (§7.4 do
roadmap: aprovação do Codex + PR isolado). Quando entrar, `23505` já está mapeado
para `conflict` em `postgrestFailure.ts` e a action responde certo sem código novo.

### 9.6 O que NÃO foi feito, de propósito

| Item | Por quê |
|---|---|
| Gravar `ip` e `user_agent` em `consents` | `recordAuditEvent` já os coleta, com a mesma finalidade e sob a mesma RLS. Duplicar dado pessoal em duas tabelas é mais superfície de vazamento sem informação nova |
| Revogação/re-aceite automático quando a versão do documento muda | O painel **informa** que o aceite é de uma versão anterior. Derrubar consentimento sozinho é decisão da clínica, e precisa de ato explícito de alguém |
| Consentimento de outros sujeitos (`subject_type` ≠ `'patient'`) | Um repositório genérico de consentimentos seria caminho pronto para ler o consentimento de outra entidade a partir de um id de paciente |
| Texto das políticas versionado no produto | Não há tabela para isso no schema remoto. Hoje a versão é o que amarra o registro a um documento |
| `revalidatePath` do perfil | `/pacientes/[patientId]` tem segmento dinâmico e exige o parâmetro `type`, que `revalidatePaths` do `createAction` não oferece. Mudar o pipeline por causa desta fatia seria mexer em área compartilhada (§6 do roadmap). O `updateTag` da tag `clinic:<uuid>:patient:<uuid>` acontece, e a tela atualiza pelo `router.refresh()` do painel — o mesmo caminho de editar e arquivar |

### 9.7 Dívida declarada nesta fatia

`postgrestFailure.ts` nasceu com `toPatientWriteError` e `readFailure` públicas
porque P-03 precisava exatamente da tradução que `SupabasePatientRepository` tem
como funções **privadas**. Extrair as de lá seria editar um arquivo que outro
agente tem aberto no worktree compartilhado (§6) e não pertence a esta fatia.

**Resultado: há duas cópias da mesma tabela de SQLSTATE.** Unificá-las — o
adapter de pacientes passar a importar de `postgrestFailure.ts` — é um follow-up
de uma linha por função, e fica registrado aqui em vez de descoberto depois.

### 9.8 O que falta para P-03 sair de Review

| # | Pendência | Quem consegue fechar |
|---|---|---|
| P-C1 | **Confirmar RLS e policies de `consents` no SQL Editor.** Nenhuma sonda foi executada contra a tabela nesta fatia; o que se sabe é que a §2 de [`03-banco-de-dados.md`](./03-banco-de-dados.md) registra RLS ativa em 56/56 objetos e leitura anônima devolvendo 0 linhas | Quem tiver acesso ao painel do Supabase |
| P-C2 | **Verificar se `INSERT`/`UPDATE` de `consents` são permitidos ao membro autenticado.** É o mesmo tipo de achado do `audit_log` (P-P6): a policy pode ter `USING` sem `WITH CHECK`, e aí a escrita falha com `42501` — que a UI já traduz para "você não tem permissão", mas o botão não funcionaria | Idem |
| P-C3 | Auditoria de fato gravando. `patient.consent.granted` / `.revoked` **não chegam a `audit_log` hoje**, pelo mesmo bloqueio de policy de P-P6 | Idem |
| P-C4 | Teste de tenancy pgTAP para `consents` (R1 do roadmap: **toda tabela nova exige o teste**) | `supabase/tests/`, que ainda não existe (D5/D7) |
| P-C5 | Índice único parcial que fecha a corrida da §9.5 | Migration com aprovação do Codex |
| P-C6 | Persistência verificada por um usuário real: registrar, recarregar, o dado continua lá (DoD da §11 do roadmap) | Depende de P-C1 e P-C2 |

**Enquanto P-C1 e P-C2 não forem verificados, P-03 não pode ser declarada `Done`.**
O código está completo e verde em `lint` + `typecheck` + `build` + `npm test`; o
que não está verificado é o outro lado da fronteira.

### 9.9 Consultas que alguém com acesso ao SQL Editor precisa rodar

```sql
-- P-C1: RLS ligada e forçada?
select relname, relrowsecurity, relforcerowsecurity
  from pg_class where relname = 'consents';

-- P-C2: as policies têm USING **e** WITH CHECK?
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
  from pg_policy where polrelid = 'consents'::regclass;

-- P-C5: existe algum índice único parcial hoje?
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename = 'consents';

-- §9.5: `clinic_id` é nullable no tipo gerado. É nullable mesmo?
select column_name, is_nullable, data_type
  from information_schema.columns
 where table_name = 'consents';
```

### 9.10 O que os testes cobrem (`npm test`)

**Schema e versão** — os dois campos aceitos e nada mais; `documentVersion`,
`grantedAt` e `clinicId` mandados pelo cliente são descartados; finalidade fora do
enum recusada; uuid inválido recusado; a mensagem de recusa não ecoa o valor
recusado; toda finalidade tem rótulo pt-BR sem enum cru vazando; o aviso do painel
se declara registro técnico.

**Adapter** — os três filtros em leitura, inserção e revogação; `select` sem `ip`,
`user_agent`, `clinic_id`, `subject_id` e `subject_type`; `insert` sem `ip` e sem
`user_agent`, com os sete campos exatos; `is('revoked_at', null)` no update (clique
repetido não reescreve a data da primeira revogação); revogação fecha **todas** as
vigentes; id malformado **não chega a chamar `from()`**; `42501` vira `forbidden` e
falha de rede vira `unavailable`, sem a mensagem do Postgres subir.

**Actions** — papel `finance` não escreve; clínica gravada é a da sessão mesmo
quando a entrada manda outra; versão gravada é a do servidor mesmo quando a
entrada manda outra; tag invalidada é `clinic:<uuid>:patient:<uuid>` e a de
`patients` **não** é; paciente inexistente e de outra clínica dão a mesma resposta;
consentimento vigente vira `conflict` sem gravar; registro revogado não bloqueia
novo consentimento; auditoria não carrega id do paciente, nome nem clínica;
auditoria que falha não derruba a escrita; `revoked_count` no evento.

**DTO e painel** — as seis chaves exatas; nada de `clinic`, `subject`, `ip` ou
`user_agent` no JSON; nenhuma `Date` atravessa; as cinco finalidades aparecem sem
registro nenhum; "revogado" ≠ "não registrado"; vigente vence revogado antigo;
entre duas vigentes mostra a mais recente; versão defasada é sinalizada sem
derrubar o consentimento; data ilegível vira `null`, nunca "Invalid Date"; linha de
finalidade desconhecida não cria uma sexta linha na tela.

Os fakes gravam a cadeia de chamadas do supabase-js — **nenhuma chamada de rede**.

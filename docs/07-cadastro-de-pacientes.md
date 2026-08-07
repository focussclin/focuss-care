# P-01 — Cadastro, edição e arquivamento de pacientes

> Primeira fatia de **escrita** do produto e primeiro chamador de runtime do
> `createAction` (pendência **P-A6** de [`06-acoes-e-auditoria.md`](./06-acoes-e-auditoria.md)).
> Escrito contra o código, os tipos gerados e **o banco remoto** em **07/08/2026**,
> branch `feat/telas-e-camada-supabase`.

Escopo: **criar, editar e arquivar/reativar** paciente, ponta a ponta. Busca
paginada, consentimento LGPD, prontuário, agenda e Patient 360 continuam fora —
ver §6.

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
| Retorno serializável | A action devolve `{ id, name, phone, email, birthDate, createdAt }` com strings ISO. `Date` e linha crua do Supabase não atravessam a fronteira |
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

Exclusão lógica pela interface, busca paginada por cursor (P-02), consentimento
LGPD (P-03), prontuário, agenda, Patient 360, CPF/CNS, sexo biológico no
formulário, endereço estruturado, contato de emergência, foto e importação em
massa.

Também fora: cache tags com `clinic_id` (F-02 — a action revalida por caminho,
como todo o resto hoje) e testes automatizados (D5/F-04 — não há runner no
projeto).

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
| **P-P3** | **`patients.updated_at` tem trigger de atualização?** O insert não envia o campo; o `Insert` gerado o trata como opcional. | Nenhum hoje (o valor só importa na edição, que é outra fatia). | `select tgname from pg_trigger where tgrelid='patients'::regclass;` |
| **P-P4** | **Nenhum teste automatizado.** Não há runner no projeto (D5). O fluxo foi verificado por `lint`, `tsc --noEmit`, `build`, pelas sondas V1–V10 contra o banco real e por leitura — nada disso é regressão automatizada. | O comportamento descrito aqui quebra em silêncio na próxima mudança. | F-04 (harness + CI), depois teste de tenancy de `patients` (R1) — V4 é exatamente o caso a automatizar. |
| **P-P5** | **Fuso da clínica não é considerado na data de nascimento.** A validação "não pode ser futura" compara com o relógio do servidor em UTC. | No máximo, aceitar uma data um dia à frente para quem cadastra tarde da noite. Nunca recusa data válida. | Decidir com `clinics.timezone` quando a formatação de data por clínica entrar. |

# Runbook — histórico das migrations aplicadas e verificações restantes

> As quatro migrations críticas foram aplicadas no Supabase em 08/08/2026 e
> retornaram `true` na verificação estrutural. Este runbook permanece para
> auditoria, reprodução controlada e validações funcionais futuras.
>
> Este documento é para quem TEM acesso ao projeto Supabase. Ele não contém
> segredo nenhum — só nomes de variável, comandos e consultas.
>
> Comandos verificados contra a CLI `supabase@2.112.0`, que já é dependência de
> desenvolvimento do repositório (`npx supabase …` funciona sem instalar nada).

---

## 0. O que está pendente, e o que cada coisa custa hoje

| # | Arquivo | Estado | Custo de não aplicar |
|---|---|---|---|
| 1 | `20260807_audit_log_insert_policy.sql` | **Aplicada e verificada** | Trilha de auditoria habilitada |
| 2 | `20260808_insurance_claim_denials.sql` | **Aplicada e verificada** | Tabela de glosas disponível |
| 3 | `20260808_appointments_no_overlap.sql` | **Aplicada e verificada** | Corrida de sobreposição protegida pelo banco |
| 4 | `20260807_create_invitation_rpc.sql` | **Aplicada e verificada** | Emissão de convite disponível pela aplicação |
| 5 | Índices de `patients` (P-02b) | **Não escrita** | Filtro "Última visita" fica desabilitado |
| 6 | `20260810_appointments_professional_idx.sql` | **Não aplicada** | `/portal-profissional` funciona, mas a consulta do dia varre a agenda da clínica inteira |
| 7 | `20260810_patient_portal.sql` | **Não aplicada** | `/portal-paciente` declara a pendência e não gera convite. Sem ela, o portal do paciente não existe |

A #5 não existe como arquivo de propósito: escrevê-la exige saber quais índices
e extensões o banco já tem, e criar índice duplicado é custo sem ganho. As
consultas de diagnóstico estão em [`07-cadastro-de-pacientes.md`](./07-cadastro-de-pacientes.md) §8.11.

**A #6 NÃO está em `APLICAR_TUDO_20260809.sql`**, e isso é deliberado: aquele
arquivo é o lote de 09/08, e misturar uma migration de outro dia nele
desmentiria o próprio nome. Ela é de 10/08, cria **apenas um índice** e é
independente das dez — pode ser colada antes ou depois, e reaplicá-la é
inofensivo (`if not exists`).

O custo de esquecê-la é silencioso, que é o motivo desta linha existir: o portal
funciona sem ela. Só fica mais lento a cada profissional a mais na clínica, e
lentidão não dá erro em lugar nenhum.

---

## 1. Pré-requisitos

Quem for aplicar precisa de:

- **Acesso de owner ou admin** ao projeto Supabase (para o SQL editor e para
  gerar o token da CLI).
- **A senha do banco**, se for usar a CLI. Ela aparece uma vez na criação do
  projeto e pode ser redefinida no painel — Project Settings → Database.
- **Node 20+**, para usar a CLI do repositório sem instalação global.

```bash
npx supabase --version   # deve responder 2.112.0
npx supabase login       # abre o navegador; grava o token NA MÁQUINA, não no repo
npx supabase link --project-ref <ref-do-projeto>
```

> **Nunca** cole a senha nem o token em arquivo do repositório, em variável de
> exemplo ou em mensagem de commit. `.env.local` não é versionado; use-o, ou os
> prompts interativos da CLI.

---

## 2. Antes de tocar em qualquer coisa: backup

O passo que não se pula. Uma migration que falha no meio deixa a transação
desfeita, mas uma que **passa** e estava errada não se desfaz sozinha.

```bash
# Schema (estrutura). Guarde fora do repositório.
npx supabase db dump --linked -f ./backup-schema-$(date +%Y%m%d).sql

# Dados. Pode ser grande; é o que permite reconstruir se algo for perdido.
npx supabase db dump --linked --data-only -f ./backup-dados-$(date +%Y%m%d).sql
```

Se o projeto estiver em um plano com **branches de preview**, prefira aplicar
primeiro lá:

```bash
npx supabase branches create migracoes-agosto
npx supabase branches list
```

Uma branch dá o ensaio completo — inclusive os testes da §7 — sem tocar em dado
de clínica real. Sem branch disponível, o backup acima é o que resta.

---

## 3. Inspeção e dry-run

### 3.1 O histórico de migrations está divergente, e isso é esperado

O `supabase/README.md` registra que as migrations locais antigas foram
**removidas** porque descreviam um schema diferente do remoto. Consequência
prática: o remoto tem histórico que o repositório não tem.

```bash
npx supabase migration list --linked
```

A saída vai mostrar migrations no remoto sem par local. **Isso não é erro** — é
o estado documentado do projeto.

### 3.2 Por que NÃO usar `db push` aqui

```bash
# Só para VER o que a CLI faria. Não aplica nada.
npx supabase db push --linked --dry-run
```

Por causa da divergência acima, um `db push` real provavelmente exigiria
`--include-all` — e é justamente esse o flag que aplica tudo o que não está no
histórico remoto, sem você escolher o quê. Com quatro arquivos, cada um exigindo
revisão humana, **o caminho seguro é o SQL editor do painel, um arquivo por
vez**, dentro da transação que cada um já traz (`begin; … commit;`).

Use o dry-run como leitura, não como etapa.

---

## 3.5 Papel dentro da policy

> Corrigido em **10/08/2026**, antes de qualquer uma destas migrations ser
> aplicada. Se você já aplicou alguma versão anterior, releia esta seção: as
> policies antigas continuam no banco até serem substituídas.

Até 10/08/2026 as policies das oito tabelas novas tinham esta forma:

```sql
using (clinic_id = public.current_clinic_id())
```

Isso isola a clínica — e mais nada. **Não separa papéis.**

### Por que isso importava

A separação por papel vivia inteira na aplicação, no `roles:` de cada action. E
a aplicação não é o único caminho até a tabela:

- o navegador carrega `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` por desenho;
- `src/lib/supabase/client.ts` cria um cliente com a sessão do próprio membro;
- o PostgREST aceita esse JWT direto, sem passar por Server Action nenhuma.

Ou seja: `POST /rest/v1/bank_transactions` com o token de um recepcionista teria
funcionado, porque a policy só perguntava a clínica. O mesmo valia para
`clinic_form_responses` — anamnese, dado de saúde — que a aplicação nega a
`finance` e a policy liberava.

O comentário de `src/lib/supabase/client.ts` diz "o acesso continua limitado
pelas policies de RLS", e `src/lib/auth/permissions.ts` diz "se esta matriz e a
RLS discordarem, **a RLS está certa**". Para estas tabelas, as duas frases eram
falsas.

### A forma correta

O predicado de papel entra junto, no padrão que `20260809_rooms.sql` já usava:

```sql
using (
  clinic_id = public.current_clinic_id()
  and public.has_clinic_role(array['owner', 'admin', 'finance']::membership_role[])
)
```

As listas espelham `src/lib/auth/permissions.ts`, action por action:

| Permissão na action | Papéis |
|---|---|
| `invoice.read` / `invoice.write` | `owner`, `admin`, `finance` |
| `clinic.settings` | `owner`, `admin` |
| `patient.write` / `team.read` | `owner`, `admin`, `professional`, `receptionist` |
| `patient.read` | os cinco — nestas a policy fica **só** com `clinic_id` |

A última linha não é descuido. Quando os cinco papéis satisfazem a permissão,
`clinic_id = current_clinic_id()` já **é** a condição certa: escrever os cinco
nomes seria a mesma condição duas vezes, e envelheceria sozinha no dia em que
um papel novo entrasse no enum `membership_role`.

`src/app/migrationBundle.test.ts` recusa policy nova que não estreite além do
tenant — por papel ou por `auth.uid()` —, com as leituras abertas registradas
uma a uma.

### O autor sai de `auth.uid()`, e não de parâmetro

> Corrigido em **10/08/2026**, junto com as policies. Se você já aplicou uma
> versão anterior de qualquer uma destas funções, **a assinatura mudou** — o
> `create or replace` novo cria uma sobrecarga em vez de substituir. Derrube a
> antiga antes:
>
> ```sql
> drop function if exists public.record_inventory_movement(uuid, uuid, text, integer, integer, text, uuid);
> ```

Seis RPCs recebiam quem fez a coisa como parâmetro:

| Função | Parâmetro removido |
|---|---|
| `record_inventory_movement` | `p_created_by` |
| `add_patient_tag` | `p_created_by` |
| `reconcile_bank_transaction` | `p_reconciled_by` |
| `create_purchase_order` | `p_created_by` |
| `transition_purchase_order_status` | `p_changed_by` |
| `receive_purchase_order_item` | `p_received_by` |

Todas validam o tenant corretamente (`if p_clinic_id is distinct from
public.current_clinic_id() then raise ... 42501`), e nenhuma comparava o autor
recebido com `auth.uid()`. Como têm `grant execute ... to authenticated`, quem
chamasse pelo PostgREST direto informava qualquer UUID como autor.

O caso mais concreto estava em `transition_purchase_order_status`:

```sql
approved_by = case when v_next = 'approved' then p_changed_by else approved_by end
```

A aprovação de um pedido de compra ficava registrada em nome de outra pessoa.
Não é vazamento — é **falsificação de trilha**, que é pior de detectar: a linha
parece legítima, e a auditoria mente sem nunca ter sido violada.

Agora as seis resolvem com `auth.uid()`, como `create_invitation` já fazia. A
diferença não é só de segurança: passar um autor que o banco ignora seria
mentira na assinatura, então o parâmetro saiu também das portas de domínio,
dos repositórios, das actions e dos mocks.

Continuam recebendo o autor as escritas que gravam `created_by` por `.insert()`
direto — ali é a aplicação que preenche a coluna, não uma função do banco.

## 3.55 `room_id` espera uma fatia — e o cadastro de salas não

> Levantado em **10/08/2026**, contra `20260809_rooms.sql` (não aplicada).

O módulo `rooms` está fechado: CRUD com Zod, RBAC `clinic.settings`, tenant
explícito em toda consulta, remoção lógica por `deleted_at`, e testes de
domínio, aplicação, repositório e tela.

**A ligação com a agenda, não.** A migration faz três coisas que o código ainda
não usa:

```sql
alter table public.appointments add column if not exists room_id uuid ...;
create index appointments_room_idx on public.appointments (room_id, starts_at) ...;
alter table public.appointments add constraint appointments_room_no_overlap
  exclude using gist (clinic_id with =, room_id with =, tstzrange(...) with &&) ...;
```

Uma varredura por `room` em `src/modules/scheduling/` devolve **zero
resultados**. Não há como escolher a sala ao marcar, nem ver qual sala foi
usada. `room_id` nasce nulo em todo atendimento — e a constraint de
sobreposição, que é `where room_id is not null`, nunca chega a ser avaliada.

Isso não é defeito do cadastro: sem a migration aplicada, ligar a agenda a uma
coluna que não existe seria pior. Mas é uma promessa parcial, e ela precisa
estar escrita em algum lugar que não seja um comentário no SQL.

### O que a fatia posterior precisa fazer

1. `NewAppointmentData.roomId` (opcional) e o campo no `create`/`reschedule` de
   `AppointmentRepository`.
2. `SELECT_WITH_NAMES` passa a trazer `room_id` e o join com `rooms(name)`.
3. Seletor de sala em `NewAppointmentModal`, **só com salas ativas** — e a lista
   vem de `rooms`, que é outro módulo: a composição é na rota, pela regra 4.
4. **Mapear `23P01`** (`exclusion_violation`) para uma recusa de domínio do tipo
   "esta sala já está ocupada nesse horário". Hoje o adapter de agenda não o
   conhece, e ele viraria "falha inesperada" — sobre o único conflito que a
   pessoa consegue resolver sozinha, mudando a sala.
5. Mostrar a sala no cartão da agenda e nos detalhes do atendimento.

O item 4 é o que exige atenção: a sobreposição de PROFISSIONAL é verificada por
uma consulta na aplicação antes de gravar (`listOverlapping`), e a de SALA será
verificada pelo BANCO, na hora do insert. São dois mecanismos diferentes para o
mesmo tipo de conflito, e a mensagem precisa sair igual para quem lê.

## 3.6 Portal do paciente: por que a leitura é por FUNÇÃO

> `20260810_patient_portal.sql`, **não aplicada**.

A tentação, ao dar acesso ao paciente, é acrescentar uma policy:

```sql
create policy "patients_portal_select" on public.patients
  for select to authenticated
  using (id in (select public.portal_patient_ids()));
```

Isso está errado, e o motivo é sutil: **RLS filtra LINHA, não COLUNA**.

Com essa policy, o paciente alcança o PostgREST direto — ele tem a chave
publicável e o próprio JWT — e pede `select=*`:

| Tabela | Coluna que vazaria |
|---|---|
| `patients` | `admin_notes` — a anotação interna da recepção sobre ele |
| `appointments` | `internal_notes` |
| `invoices` | `notes`, `cancel_reason` |

Nenhuma delas é para o paciente. Por isso a migration **não cria policy de
SELECT em nenhuma tabela existente**. A leitura sai de três funções
`security definer` com lista fechada de colunas:

- `portal_my_profile()`
- `portal_my_appointments(from, to)`
- `portal_my_invoices()`

O que não está no `select` da função não existe para quem chama. E não há função
que alcance `medical_records` — o prontuário não entra no portal, nem por
função.

`src/modules/patient-portal/portalBoundary.test.ts` verifica essas **ausências**
no texto do SQL, porque ausência não quebra nada quando desaparece: no dia em
que alguém acrescentar a policy "para resolver um campo que faltou", nenhuma
tela muda e o teste é o único que reclama.

### As duas provas do vínculo

O convite exige, na mesma transação:

1. **posse do token** — 32 bytes aleatórios, guardados só como sha256;
2. **controle do e-mail** — `auth.jwt() ->> 'email'` igual ao do convite.

Ligar `auth.users.email` a `patients.email` seria mais simples e estaria errado:
`patients.email` é digitado pela recepção sem verificação nenhuma, o mesmo
endereço aparece em vários pacientes (mãe que cadastra o próprio nos filhos), e
ninguém prova que o controla.

### O shim de tipos

`src/modules/patient-portal/infrastructure/portalDatabase.ts` descreve as
relações e funções novas enquanto a migration não é aplicada.

**Não edite `src/lib/supabase/database.types.ts`** — o cabeçalho dele diz
"GERADO AUTOMATICAMENTE, NÃO EDITE À MÃO", e a próxima execução de
`npm run db:types` sobrescreveria a edição em silêncio. Depois de aplicar,
regenere e **remova o shim**: mantê-lo criaria uma segunda definição da mesma
tabela, e a divergência entre as duas não daria erro — só resultado errado.

### O arquivo combinado é gerado

`APLICAR_TUDO_20260809.sql` sai de `node scripts/build-migration-bundle.mjs`.
Antes de 10/08/2026 ele era montado à mão, apesar de o cabeçalho mandar
regenerar — então toda correção precisava ser feita duas vezes. **Edite a
migration individual e rode o gerador**; o teste falha se os dois divergirem.

---

## 4. Revisão obrigatória antes de cada arquivo

Nenhum dos quatro deve ser colado sem antes responder às perguntas abaixo. Duas
delas **bloqueiam** a aplicação se a resposta for inesperada.

### 4.1 As funções de autorização cobrem os papéis certos?

```sql
select proname, prosrc
  from pg_proc
 where proname in ('can_access_financial', 'can_access_clinical', 'can_handle_billing');
```

Confira que `can_access_financial()` alcança o papel `finance`. **Se não
alcançar, a migration #2 cria uma tabela que a própria equipe financeira não
enxerga** — a tela de glosas nasceria vazia para quem trabalha com glosa.

### 4.2 As RPCs financeiras — o que elas realmente recebem?

```sql
select proname, pg_get_function_arguments(oid), pg_get_function_result(oid)
  from pg_proc
 where proname in ('issue_invoice', 'close_cash_session', 'preview_professional_payout');
```

Não bloqueia nenhuma migration, mas é o que destrava emissão fiscal numerada e
repasse a profissional (**P-RPC**). Registre a resposta no roadmap.

### 4.3 A convenção do dia da semana

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid in ('public.availability_rules'::regclass,
                    'public.work_schedules'::regclass);
```

Destrava disponibilidade por profissional (A-02) e escalas de trabalho (S-02).
Sem isso, os dois continuam ausentes — e é a resposta certa, porque errar entre
`0–6` e `1–7` desloca a semana em um dia.

### 4.4 A sequência fiscal

```sql
select distinct kind from public.document_sequences;
```

Diz qual valor `next_document_number(p_kind)` espera.

### 4.5 **Bloqueante:** o algoritmo de hash do convite

```sql
select prosrc from pg_proc where proname = 'accept_invitation';
```

A migration #4 gera o token e grava o hash. **Se o algoritmo dela não for
idêntico ao que `accept_invitation` usa para comparar, todo convite emitido será
recusado no aceite** — e o defeito só aparece quando uma pessoa real tenta
entrar. Leia o corpo, ajuste a linha `digest(…)` do arquivo se necessário, e só
então aplique.

---

## 5. Ordem de aplicação

A ordem é por **risco crescente**, não por data do nome. Aplique uma, verifique,
e só então siga para a próxima.

### 5.1 Primeiro: `20260807_audit_log_insert_policy.sql`

Puramente aditiva — cria uma policy de `INSERT`, não toca em dado. É a de maior
valor e menor risco, e deve vir antes das outras para que o que acontecer depois
já tenha rastro.

**Verificação:**

```sql
select polname, polcmd, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
 where polrelid = 'public.audit_log'::regclass;
```

Espere ver `audit_log_insert_own_clinic` com `polcmd = 'a'` (INSERT) e um
`with_check` que exige `clinic_id = current_clinic_id()` **e**
`actor_user_id = auth.uid()`. Confirme também que **não** existe policy de
`UPDATE` nem de `DELETE`: trilha que pode ser editada não é trilha.

### 5.2 Segundo: `20260808_insurance_claim_denials.sql`

Também aditiva: cria um enum, uma tabela nova e as policies dela. Nada existente
depende dessa tabela, então não há como quebrar comportamento atual.

Gate: a resposta da §4.1.

**Verificação:**

```sql
select tablename, rowsecurity
  from pg_tables
 where tablename = 'insurance_claim_denials';

select polname, polcmd from pg_policy
 where polrelid = 'public.insurance_claim_denials'::regclass;
```

Espere `rowsecurity = true` e três policies (select, insert, update) — e
**nenhuma de delete**.

### 5.3 Terceiro: `20260808_appointments_no_overlap.sql`

A primeira que **altera tabela existente e pode falhar**. Dois motivos:
`btree_gist` pode não ser criável no projeto, e dados já sobrepostos impedem a
constraint.

**Rode o diagnóstico ANTES** — ele está no rodapé do próprio arquivo:

```sql
select a.id, b.id, a.professional_id, a.starts_at, b.starts_at
  from public.appointments a
  join public.appointments b
    on a.clinic_id = b.clinic_id
   and a.professional_id = b.professional_id
   and a.id < b.id
   and tstzrange(a.starts_at, a.ends_at, '[)')
    && tstzrange(b.starts_at, b.ends_at, '[)')
 where a.status not in ('canceled', 'no_show')
   and b.status not in ('canceled', 'no_show');
```

Linha nenhuma → pode aplicar. Alguma linha → **resolva antes**, cancelando ou
remarcando um dos atendimentos. Aplicar com sobreposição existente faz o
`alter table` falhar e a transação inteira voltar.

**Verificação:**

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.appointments'::regclass
   and conname = 'appointments_no_overlap';
```

Confira no texto devolvido: o range precisa ser `'[)'` (semiaberto) e o `WHERE`
precisa excluir `canceled` e `no_show`. Se vier `'[]'`, a agenda de 30 em 30
minutos passa a recusar o horário seguinte.

### 5.4 Quarto: `20260807_create_invitation_rpc.sql`

**Só depois da §4.5.** É a única cuja aplicação exige uma decisão humana sobre o
conteúdo, não só sobre o momento.

**Verificação:**

```sql
select proname, pg_get_function_arguments(oid), prosecdef
  from pg_proc
 where proname = 'create_invitation';
```

`prosecdef = true` (SECURITY DEFINER) é esperado. E confirme que a função
devolve o token **em texto puro uma única vez** — se ela devolver o hash, a
aplicação não tem como montar o link.

### 5.5 Quinto: índices de `patients` — **continua BLOQUEADA**

Não há arquivo para aplicar. Escrever um exige rodar as quatro consultas de
diagnóstico de `07-cadastro-de-pacientes.md` §8.11 e ver o que já existe.

---

## 6. Depois de aplicar: regenerar os tipos

```bash
npm run db:types
git diff src/lib/supabase/database.types.ts
```

O diff é a prova de que o schema mudou como se esperava. `insurance_claim_denials`
e `create_invitation` devem aparecer; se não aparecerem, a migration não pegou.

Rode a validação do repositório antes de commitar o arquivo gerado:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

---

## 7. Testes pós-aplicação

Os três primeiros exigem **duas contas em clínicas diferentes** e uma conta por
papel. Nenhum deles é automatizável hoje — `supabase/tests/` não existe, e essa
é a dívida **D5/R1**, que continua aberta.

### 7.1 Tenancy

1. Entre com a conta A (clínica 1) e crie um paciente.
2. Entre com a conta B (clínica 2).
3. B **não pode** ver o paciente de A em `/pacientes`, nem alcançá-lo pela URL
   direta `/pacientes/<id-do-paciente-de-A>` — a rota deve responder "não
   encontrado", não uma ficha vazia.
4. Repita para uma cobrança (`/financeiro`) e uma guia (`/convenios`).

### 7.2 `INSERT` e 403 por papel

Com a policy da §5.1 aplicada:

| Papel | Ação | Esperado |
|---|---|---|
| `receptionist` | Abrir `/prontuarios` | **403** (página `forbidden`) |
| `receptionist` | Abrir `/financeiro` | **403** |
| `finance` | Abrir `/agenda` | **403**, e o item **não aparece no menu** |
| `finance` | Criar cobrança em `/financeiro` | Sucesso |
| `professional` | Escrever no prontuário | Sucesso |
| `admin` | Abrir `/prontuarios` | **403** — administrar não é cuidar |

O menu esconder o item e a rota recusar são checagens **separadas**: a primeira
é cortesia, a segunda é a fronteira. Teste as duas.

### 7.3 `audit_log` — a que prova a #1

```sql
select action, entity_type, actor_role, occurred_at
  from public.audit_log
 where clinic_id = '<id-da-clinica-de-teste>'
 order by occurred_at desc
 limit 20;
```

Faça, pela interface, uma ação de cada família e confira que ela aparece:

| Ação na tela | Evento esperado |
|---|---|
| Cadastrar paciente | `patient.created` |
| Marcar atendimento | `appointment.created` |
| Encerrar atendimento | `encounter.closed` |
| Escrever no prontuário | `record.created` |
| Registrar pagamento | `payment.registered` |
| Trocar o papel de alguém | `membership.role_changed` |
| Salvar o próprio perfil | `profile.updated` |

**Se a tabela continuar vazia depois disso, a #1 não resolveu** — o
`recordAuditEvent` é best-effort e não quebra a tela, então o sintoma é
exatamente "nada acontece". Olhe o log do servidor: ele registra
`[audit] escrita recusada` com o código do Postgres.

Confirme também o que **não** deve estar lá: nenhum evento pode conter nome de
paciente, evolução clínica, motivo de ausência ou descrição de procedimento.

### 7.4 Sobreposição de horário — a que prova a #3

1. Marque um atendimento das 10:00 às 10:30 para um profissional.
2. Tente marcar outro das 10:15 às 10:45 **para o mesmo profissional** →
   recusado com "Este profissional já possui um atendimento nesse horário."
3. Marque das 10:30 às 11:00 → **deve funcionar** (intervalo semiaberto).
4. Cancele o primeiro e marque das 10:00 às 10:30 → **deve funcionar**.

O passo 3 é o que pega uma constraint com `'[]'` no lugar de `'[)'`.

### 7.5 Convite — a que prova a #4

1. Emita um convite pela tela de equipe.
2. Aceite com **outra conta**, em outro navegador.
3. Confirme o vínculo em `memberships` com `status = 'active'`.

Falhar aqui significa que o hash da migration não bate com `accept_invitation` —
volte à §4.5.

---

## 8. O que continua BLOQUEADO mesmo depois de tudo isto

| Item | Por quê |
|---|---|
| Disponibilidade por profissional (A-02) | Depende da resposta da §4.3 |
| Escalas de trabalho (S-02) | Mesma convenção de `weekday` |
| Emissão fiscal numerada (B-01) | Depende da §4.2 e da §4.4 |
| Repasse a profissional | `preview_professional_payout` sem assinatura resolvida |
| Filtro "Última visita" (P-02b) | Migration #5 não escrita |
| Teste de tenancy automatizado | `supabase/tests/` não existe — dívida **D5/R1** |
| WhatsApp, IA e automações | Não é banco: falta worker, provedor e a aprovação de `04-agente-ia.md` |

Cada resposta obtida na §4 deve ser registrada em
[`roadmap.md`](./roadmap.md) e em [`../PROJECT_PROGRESS.md`](../PROJECT_PROGRESS.md)
— é o que tira o item de "bloqueado" para "pendente".

---

## 9. Se algo der errado

Cada arquivo está dentro de `begin; … commit;`, então uma falha **não deixa
estado pela metade**: a transação inteira volta.

O que a transação não desfaz é uma migration que passou e estava errada. Nesse
caso:

- **Policy errada (#1, #2):** `drop policy … on …;` e reaplique corrigida.
  Nenhum dado é perdido.
- **Constraint errada (#3):** `alter table public.appointments drop constraint
  appointments_no_overlap;`. Nenhum dado é perdido.
- **RPC errada (#4):** `drop function public.create_invitation(...);` com a
  assinatura exata. **Convites já emitidos com hash errado continuam
  inaceitáveis** — revogue-os em `invitations` e emita de novo depois.
- **Tabela nova (#2):** só remova se ela estiver vazia. Com glosa registrada,
  corrija a policy em vez de derrubar a tabela.

O backup da §2 é o último recurso, e restaurar dado de saúde por cima de
operação em andamento é decisão de quem responde pela clínica — não do plantão.

---

## 6. As seis migrations de 09/08/2026 — nenhuma aplicada

Seis módulos completos estão no código e **invisíveis no menu**, cada um atrás de
uma tabela que não existe no projeto remoto. É o maior bloqueio único do produto
hoje: não falta código, falta um `apply`.

| Arquivo | Destrava | Estado |
|---|---|---|
| `20260809_rooms.sql` | Salas e recursos + conflito de sala na agenda | Escrita e revisada |
| `20260809_clinic_tasks.sql` | Tarefas | Escrita e revisada |
| `20260809_clinic_leads.sql` | CRM e Leads | Escrita e revisada |
| `20260809_clinic_forms.sql` | Formulários digitais | Escrita e revisada |
| `20260809_inventory.sql` | Estoque | Escrita e revisada |
| `20260809_purchases.sql` | Compras | Escrita e revisada |

Conferido nos seis arquivos, antes de recomendar a ordem:

- **Nenhuma colisão de nome de enum** entre eles.
- **Todos os `create table` são idempotentes** (`if not exists`), então repetir a
  aplicação não quebra.

### 6.1 A ordem importa em um par, e só nele

```
1. 20260809_rooms.sql          (independente — altera `appointments`)
2. 20260809_clinic_tasks.sql   (independente)
3. 20260809_clinic_leads.sql   (independente)
4. 20260809_clinic_forms.sql   (independente)
5. 20260809_inventory.sql      ─┐
6. 20260809_purchases.sql      ─┘ depende de `inventory_items`
```

**`purchases` referencia `public.inventory_items`.** Aplicá-la antes de
`inventory` falha com `42P01`, e a transação inteira volta — sem estrago, mas
com tempo perdido procurando a causa.

Os quatro primeiros são independentes entre si; a ordem entre eles é indiferente.
Recomendo começar por `rooms` mesmo assim: é a única que mexe numa tabela
existente (`appointments`), e é a que conserta um defeito de hoje em vez de abrir
domínio novo — se algo der errado no ambiente, é melhor descobrir na primeira.

### 6.2 **Decisão pendente antes de aplicar: quem pode escrever**

Esta é a única questão que eu não resolvo sozinho, e ela vale a leitura.

**Cinco das seis liberam escrita para QUALQUER membro da clínica** — a policy é
só `clinic_id = current_clinic_id()`. Apenas `rooms` restringe a `owner`/`admin`.

Na prática isso significa que, do jeito que estão:

| Tabela | Quem pode escrever hoje | Faz sentido? |
|---|---|---|
| `clinic_tasks` | Qualquer membro | **Sim.** Tarefa é coordenação de equipe; a recepção é quem mais gera |
| `clinic_forms` | Qualquer membro | Provavelmente sim para responder; **duvidoso para criar formulário**, que é configuração |
| `clinic_leads` | Qualquer membro | **Duvidoso.** Pipeline comercial exposto a quem só marca consulta |
| `inventory_items` / `inventory_movements` | Qualquer membro | **Duvidoso.** Ajuste de estoque é ajuste de patrimônio |
| `purchase_*` | Qualquer membro | **Não.** Pedido de compra é compromisso financeiro |

O schema já tem `can_access_financial()` e `has_clinic_role(p_roles)` — a segunda
com essa assinatura exata, **sem `clinic_id`** (ela usa a clínica ativa do JWT;
conferido em `database.types.ts`). Apertar as policies depois é uma migration
curta, mas **afrouxar depois de alguém já ter usado é pior**: quem escreveu uma
linha que a policy nova recusa fica com dado que não consegue mais editar.

Recomendação: aplicar `rooms`, `clinic_tasks` e `clinic_forms` como estão, e
decidir sobre `clinic_leads`, `inventory` e `purchases` antes de aplicá-las.

### 6.3 Verificação depois de cada arquivo

O rodapé de cada `.sql` traz as consultas específicas. As três que valem para
todos:

```sql
-- 1. RLS ligada na tabela nova
select relname, relrowsecurity from pg_class
 where relname in ('rooms','clinic_tasks','clinic_leads','clinic_forms',
                   'inventory_items','purchase_orders');

-- 2. As policies existem e cobrem os comandos esperados
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename like ANY (ARRAY['rooms','clinic_%','inventory_%','purchase_%']);

-- 3. Isolamento entre clínicas — o teste que importa
--    Logado na clínica A, criar uma linha. Logado na clínica B, listar:
--    tem que voltar ZERO.
```

### 6.4 Depois de aplicar, no código

1. `npm run db:types` — regenera `database.types.ts` do schema remoto.
2. **Remover os shims de tipos.** `rooms/infrastructure/roomsDatabase.ts` e
   `tasks/infrastructure/tasksDatabase.ts` existem só porque a tabela não estava
   nos tipos gerados. Mantê-los depois cria uma segunda definição da mesma
   tabela, e a divergência entre as duas **não dá erro** — só resultado errado.
3. Habilitar os itens em `navigation.ts` e **remover a entrada correspondente de
   `BUILT_BUT_HIDDEN`** em `src/app/reachableRoutes.test.ts`. O teste falha de
   propósito se o item for habilitado sem limpar o registro: é assim que a
   dívida se fecha em vez de virar comentário velho.
4. `npm test`, `lint`, `typecheck`, `build`.

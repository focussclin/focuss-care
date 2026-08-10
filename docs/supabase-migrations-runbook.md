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

## 3.62 Estoque: a contagem manda o saldo apurado, não a diferença

> Acrescentado em **10/08/2026**. `20260809_inventory.sql` continua **não
> aplicada** — nada foi executado em banco remoto. Quem já aplicou uma versão
> anterior deste arquivo precisa de duas coisas antes do `create or replace`:
>
> ```sql
> alter table public.inventory_movements
>   add column if not exists counted_quantity integer
>   check (counted_quantity is null or counted_quantity >= 0);
> ```
>
> A função `set_inventory_quantity` é nova; não há assinatura antiga a derrubar.

`20260809_inventory.sql` ganhou o ajuste de estoque por contagem de inventário,
que faltava — a tela oferecia entrada e saída, e "ajuste" existia só como
sugestão no campo de motivo.

**O que a aplicação manda é o saldo CONTADO na prateleira.** A subtração
acontece dentro de `set_inventory_quantity`, depois do `for update`:

```sql
v_delta := p_counted_quantity - v_item.current_quantity;
```

Calcular a diferença na aplicação exigiria ler o saldo antes, e entre a leitura
e a gravação qualquer saída registrada por outra pessoa se perderia — as duas
contagens partiriam do mesmo saldo velho e a última sobrescreveria a primeira.
É o fluxo "ler → calcular → gravar" que o cabeçalho do próprio arquivo diz que
não pode existir. Por isso o schema da action (`setInventoryQuantitySchema`)
**não aceita** `movementType` nem `quantity`: a direção do ajuste é uma decisão
do banco, não da tela.

### Contagem igual ao saldo devolve `null`

Não é erro — é o resultado normal de conferir um item que está certo. Gravar um
movimento de zero unidades é proibido por `quantity > 0`, e traduzir o `null`
para "item indisponível" faria a tela acusar falha em cima de uma conferência
que deu certo. A action devolve sucesso com `data: null`, e a tela mostra em
`role="status"`, nunca em `role="alert"`.

### `counted_quantity` existe para separar perda de consumo

O ajuste continua sendo `in` ou `out` — a direção do saldo não pode depender de
um terceiro `movement_type`, senão toda soma do extrato precisaria de um `case`
a mais. O que a coluna guarda é a **causa**: sem ela, "saíram 3 no atendimento"
e "contei e faltavam 3" são duas linhas idênticas, e a clínica nunca responde
quanto perde por quebra ou vencimento.

`src/modules/inventory/domain/Inventory.test.ts` lê este `.sql` e verifica a
ordem `for update` → `v_delta :=`, o `case when v_delta > 0`, o `return null` e
o `set current_quantity = p_counted_quantity` (o que torna a contagem
idempotente). **Ao editar a função, rode esse teste.**

### O padrão da migration segue igual

`set_inventory_quantity` é `security invoker`, valida
`p_clinic_id is distinct from public.current_clinic_id()` (`42501`), resolve o
autor por `auth.uid()` e tem `revoke all ... from public` seguido de
`grant execute ... to authenticated` — mesma forma de `record_inventory_movement`
descrita em §3.6.

## 3.61 Compras: a máquina de estados vive em dois lugares, de propósito

> Revisado em **10/08/2026**. `20260809_purchases.sql` continua **não
> aplicada**, e depende de `20260809_inventory.sql` vir antes.

`transition_purchase_order_status` é quem **decide**:

```
draft      → requested, cancelled
requested  → draft, approved, cancelled
approved   → requested, ordered, cancelled
ordered    → cancelled
```

`PURCHASE_ORDER_TRANSITIONS`, no domínio, decide o que a tela **oferece** — ela
precisa saber antes de desenhar o botão.

Duas fontes para a mesma regra divergem sozinhas. O que impede aqui:
`src/modules/purchases/domain/Purchase.test.ts` **lê este arquivo `.sql`** e
compara as listas. Se alguém acrescentar uma transição na função sem
acrescentá-la na tabela, ou o contrário, o teste falha — no segundo caso antes
que a tela ofereça um botão que sempre falha.

**Ao editar a função, edite a tabela junto.** O teste dirá se você esqueceu.

### O que a função também exige

- `purchase_order_without_items` (`22023`): não dá para solicitar, aprovar nem
  enviar um pedido sem linhas.
- `partially_received` e `received` **não são transições**: a função de
  recebimento os deriva da soma das quantidades. O estado do pedido é
  consequência do que chegou na porta.

### Não há cotação

O enum não tem estágio de cotação, e não existe tabela de propostas de
fornecedor. Comparar preços entre fornecedores antes de decidir é uma fatia com
schema próprio. `requested` é solicitação **interna**, não pedido de cotação ao
mercado.

## 3.60 Documentos: o que já existe no remoto, e o que falta

> Revisado em **10/08/2026**. Este é o único módulo bloqueado que está
> **parcialmente vivo** — e por isso o desbloqueio é menor do que parece.

| Peça | Estado |
|---|---|
| Tabela `patient_documents` | **já existe** no schema remoto |
| Bucket `patient-documents` | **criado** em 09/08/2026, privado, 10 MB |
| Policies da tabela | **pendentes** |
| Policies de `storage.objects` | **pendentes** |

Ou seja: aplicar `20260809_patient_documents.sql` não cria a tabela nem o
bucket — o `create table if not exists` e o `on conflict (id) do update` já
contam com eles. O que ela faz é **instalar as policies**, e é isso que hoje
falta.

Enquanto faltarem, a RLS recusa leitura e upload, e a tela declara a pendência.
O upload distingue os dois motivos: mensagem de bucket ausente vira
`storagePending` ("é configuração"), e não `unavailable` ("tente de novo") —
tentar de novo não resolve nenhum dos dois.

### O caminho do objeto é a fronteira do tenant

```
<clinic_id>/<patient_id>/<uuid>-<nome-seguro>
```

A policy compara `(storage.foldername(name))[1]` com `current_clinic_id()`. O
primeiro segmento **não é organização de pastas**: é o que separa uma clínica
da outra no bucket. `src/modules/documents/actions/uploadDocument.action.test.ts`
prende isso, junto com a impossibilidade de um nome com `../` escapar do
prefixo.

### Reaplicar é seguro

`20260810_repair_patient_documents_storage.sql` existe para o caso de o upload
ou o download assinado voltarem 403 com tudo criado: ele só derruba e recria as
duas policies de `storage.objects`, sem tocar em dado.

## 3.59 Formulários: o schema NÃO suporta resposta pública

> Levantado em **10/08/2026** contra `20260809_clinic_forms.sql` (não
> aplicada). Esta seção existe para que a ausência seja uma decisão registrada,
> e não uma feature esquecida.

`clinic_form_responses` tem esta forma:

```sql
patient_id  uuid not null,   -- FK composta com clinic_id
created_by  uuid references public.profiles(id),
```

Não há **token**, não há **expiração**, e `patient_id` é obrigatório. As
policies exigem `has_clinic_role(owner, admin, professional, receptionist)`.

Consequência: o fluxo que existe é **da equipe** — `/formularios/[formId]/responder`
exige `patient.write`, carrega a lista de pacientes e a recepção preenche
junto com a pessoa. Isso funciona e persiste de verdade.

**Um link público que o paciente abre sozinho não é implementável sobre este
schema.** Não é questão de código: não há por onde identificar quem respondeu
sem uma sessão, e afrouxar a policy para `anon` abriria `clinic_form_responses`
inteira — anamnese, que é dado de saúde — para qualquer chamador do PostgREST.

### O que uma fatia posterior precisaria acrescentar

1. `form_response_links`: `token_hash`, `form_id`, `patient_id`, `expires_at`,
   `status`, `used_at`. Só o hash, como em `patient_portal_invites`.
2. RPC `submit_form_response_by_token(p_token, p_answers)`, `security definer`,
   com `grant execute to anon`. Ela resolve o paciente **pelo link**, valida
   validade e uso único, e escreve — sem que o chamador escolha `patient_id`.
3. RPC de pré-visualização devolvendo **só** nome do formulário e campos.
   Nunca o nome do paciente: o token viaja por WhatsApp.
4. Rota fora de `(app)`, como `(portal)`: quem responde não tem vínculo de
   clínica, e o layout de `(app)` o mandaria ao onboarding.

O desenho é o mesmo do portal do paciente, e o precedente está em
`20260810_patient_portal.sql`. **Não foi feito nesta fatia** porque o pedido
delimitou "o fluxo que o schema local suporta", e este não é.

### Versão do formulário — corrigido em 10/08/2026

`clinic_forms.version` existia na migration, aparecia na entidade e no DTO, e
**nada a escrevia**: ficava em 1 para sempre, e a tela mostrava o número.

`answers` é um objeto chaveado por id de campo. Uma resposta coletada quando o
formulário tinha as perguntas A e B é lida depois contra A e C — e sem a versão
ninguém sabe sob qual questionário aquela anamnese foi respondida. Agora
`update` incrementa quando os **campos** mudam, e só então: renomear ou
publicar não move o número.

## 3.58 CRM: a conversão é FUNÇÃO, e o motivo é `patients` já existir

> `20260809_clinic_leads.sql` continua **não aplicada**. A função
> `convert_lead_to_patient` foi acrescentada a ela em **10/08/2026**, antes de
> qualquer aplicação.

Converter um lead faz três escritas que precisam valer juntas:

1. cria a linha em `patients`;
2. marca o lead como convertido, apontando para ela;
3. registra o evento em `lead_events`.

Em três idas ao banco pela aplicação, uma falha no meio deixa **um paciente
órfão** — uma pessoa no cadastro clínico que ninguém pediu, sem lead que a
explique.

### Por que isso não é hipotético aqui

`patients` **existe** no schema remoto. `clinic_leads` **não**. Uma
implementação em duas etapas conseguiria criar o paciente e falhar no lead — e
o resultado seria uma ficha de paciente real, num produto de saúde, sem origem
rastreável.

Por isso as três acontecem dentro de `convert_lead_to_patient`, com
`security definer`, `for update` na linha do lead (dois cliques criariam dois
pacientes) e checagem de papel por `has_clinic_role`.

### Papel: `patient.write`, não `team.read`

A lista da função é `owner`, `admin`, `professional`, `receptionist` — a mesma
de `patient.write`. Converter escreve no cadastro clínico, e não só no funil;
`finance` fica de fora.

A aplicação repete a checagem. As duas existem porque protegem coisas
diferentes: a da action recusa cedo e com mensagem boa; a da função vale também
para quem chamar o PostgREST direto.

### O que a conversão NÃO faz

Não apaga o lead (o histórico do funil permanece), não copia observações
internas, e não marca consentimento LGPD — consentimento é ato do paciente e
continua sendo registrado na ficha dele.

`biological_sex` entra como `'not_informed'`: é NOT NULL sem default útil, o
lead não pergunta, e inventar seria pior que declarar que não foi informado. É
o mesmo valor que o cadastro manual usa.

### Depois de aplicar

1. `npm run db:types`.
2. **Remover** `src/modules/leads/infrastructure/leadsDatabase.ts`.
3. Tirar `availability: 'setup'` de `/crm` em `navigation.ts` e a entrada de
   `BUILT_BUT_HIDDEN` — o teste falha se uma sair sem a outra.
4. Conferir que a função existe e recusa conversão dupla:
   ```sql
   select public.convert_lead_to_patient('<lead-uuid>');  -- 2ª vez: 23505
   ```

## 3.57 Tarefas: o que a migration destrava, e o que já está pronto sem ela

> Levantado em **10/08/2026**. `20260809_clinic_tasks.sql` continua **não
> aplicada**.

O módulo `tasks` está fechado: CRUD com Zod, RBAC (`team.read` +
`patient.read` na rota), tenant explícito em toda consulta, filtros por
situação/responsável/prazo, e 134 testes cobrindo domínio, schema, aplicação,
repositório, action e tela.

**Nada disso funciona no banco hoje**, e não há como contornar: `clinic_tasks`
não existe. O que o produto faz enquanto isso:

| Camada | Comportamento sem a migration |
|---|---|
| Adapter | `42P01`/`PGRST205` → `schema-not-ready` |
| Rota `/tarefas` | absorve **só** essa razão, e passa `schemaPending` |
| Tela | declara a pendência; gravar nasce desabilitado com o motivo no `title` |
| Menu | `availability: 'setup'` |
| Portal do profissional | painel de tarefas declara a pendência **sem derrubar** a agenda ao lado |
| Tipos | shim `infrastructure/tasksDatabase.ts` |

### Depois de aplicar

1. `npm run db:types`.
2. **Remover** `src/modules/tasks/infrastructure/tasksDatabase.ts` — mantê-lo
   criaria uma segunda definição da mesma tabela, e a divergência entre as duas
   não daria erro, só resultado errado.
3. Tirar `availability: 'setup'` do item em `navigation.ts` e a entrada de
   `BUILT_BUT_HIDDEN` em `src/app/reachableRoutes.test.ts` — o teste falha se
   uma sair sem a outra.
4. Conferir que `assigned_to` referencia `profiles`, e não `professionals`: é a
   distinção que faz a recepção poder receber tarefa. `listAssignedTo` filtra
   por `profiles.id` (o usuário da sessão), e trocar isso devolveria zero para
   todo mundo em silêncio.

## 3.56 A agenda já escreve `room_id` — e degrada sozinha sem a migration

> Implementado em **10/08/2026**. `20260809_rooms.sql` continua **não
> aplicada**, e nada abaixo depende de aplicá-la para a agenda funcionar.

A fatia §3.55 foi feita. O que muda no comportamento, hoje, com a migration
pendente: **nada**. E isso é o requisito, não o resultado morno.

### Como o vínculo se apaga sozinho

Três pontos decidem, e todos leem a mesma coisa — se a clínica tem sala:

| Ponto | Sem salas | Com salas |
|---|---|---|
| `/agenda` (rota) | `rooms.list()` levanta `schema-not-ready` → lista vazia | lista as ativas |
| `NewAppointmentModal` | campo de sala **não renderiza** | `<select>` com "Sem sala definida" primeiro |
| `create` (adapter) | `room_id` **fora do payload** | `room_id` no insert |
| `listByRange` | `select` sem `room_id` | `select` com `room_id, rooms ( name )` |

O detalhe que carrega o resto: **`room_id` não entra no payload como `null`**.
Um `null` seria equivalente para o Postgres e fatal aqui — citar coluna
inexistente faz o PostgREST recusar o comando inteiro, e marcar consulta
pararia de funcionar para toda clínica que não usa sala. Pelo mesmo motivo o
`select` da agenda só pede a coluna quando ela existe.

### O que a migration destrava

Aplicá-la faz o campo aparecer para quem cadastrar salas, e liga a constraint
`appointments_room_no_overlap`. A partir daí:

- reservar a mesma sala em horários que se cruzam é recusado **pelo banco**;
- o adapter traduz `23P01` para `room-conflict` lendo o **nome da constraint**
  na mensagem, e a tela diz "escolha outra sala — o horário continua
  disponível". Colapsar isso em `conflict` mandaria a recepção remarcar a
  consulta inteira para um problema que um `select` resolve.

### O que continua fora

- **Trocar a sala de um atendimento já marcado.** Remarcar mantém a sala e muda
  o horário — e pode falhar com `room-conflict`, que a action já traduz.
- `/salas-e-recursos` segue `availability: 'setup'`. A tela depende da tabela
  `rooms`, ao contrário da agenda, que depende apenas de `room_id` ser opcional.

## 3.55 `room_id` espera uma fatia — e o cadastro de salas não

> Levantado em **10/08/2026**, contra `20260809_rooms.sql` (não aplicada).
>
> **RESOLVIDO no mesmo dia** — ver §3.56. Esta seção fica como o registro do
> que estava faltando e por quê; os cinco itens abaixo foram entregues.

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

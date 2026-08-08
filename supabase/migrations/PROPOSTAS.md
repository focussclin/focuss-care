# Migrations propostas — aguardando aprovação e acesso ao banco

> **Nenhuma destas foi aplicada.** Não há `DATABASE_URL`, senha do banco nem
> `SUPABASE_ACCESS_TOKEN` neste ambiente (bloqueio **B1** do roadmap), e mudança
> de schema exige aprovação do Codex e PR isolado (§7.4). Os arquivos existem
> para serem revisados e aplicados por quem tem acesso — não para dar a impressão
> de que o banco já mudou.

Cada arquivo é idempotente e reversível. Depois de aplicar, rodar
`npm run db:types` e repetir a verificação indicada.

---

## 1. `20260807_audit_log_insert_policy.sql`

**Problema.** A policy de `INSERT` de `audit_log` recusa o membro autenticado
(verificação **V8** de `docs/07-cadastro-de-pacientes.md`, pendência **P-P6**).
Consequência: **nenhum evento de auditoria do produto está sendo gravado hoje** —
nem `clinic.created`, nem `patient.created/updated/archived`, nem
`clinic.switched`, nem `membership.accepted`.

**Impacto.** A escrita é best-effort, então nada quebra na tela. Mas o §8 do
roadmap ("toda mutação passa pelo `createAction` e grava em `audit_log`") e o CA7
de I-01 estão reprovados. Para dado de saúde, trilha de auditoria é requisito
legal, não recurso.

**Verificar depois:** repetir V8 — `INSERT` em `audit_log` como membro
autenticado deve devolver 201.

---

## 2. `20260807_create_invitation_rpc.sql`

**Problema.** `invitations` guarda `token_hash`, e **não existe RPC de criação**.
A aplicação só tem `accept_invitation(p_token)`. Para emitir um convite hoje, ela
teria que inserir o hash — o que exige conhecer o algoritmo que
`accept_invitation` usa para comparar.

**Por que isso não é aceitável.** Não é falta de vontade de adivinhar: se a
aplicação souber gerar `token_hash` válido, ela pode forjar convites, e o convite
deixa de ser prova de que alguém foi convidado. O token precisa nascer onde o
hash é calculado.

**Consequência hoje:** o aceite de convite funciona (I-04, entregue), mas **não
há como emitir um**. Convites precisam ser criados direto no banco até esta
migration entrar. É o que trava a tela de Equipe (S-01) e o que mantém o seletor
de clínicas (I-03) invisível na prática.

**Verificar depois:** emitir convite pela aplicação, aceitar com outra conta, e
confirmar que o vínculo aparece em `memberships` com `status = 'active'`.

---

## 3. Índices de `patients` — P-02b

Ainda **não escritos**, porque dependem de saber o que já existe: sem acesso SQL
não dá para verificar quais índices e extensões o banco tem, e criar um índice
duplicado é custo sem ganho. As quatro consultas de diagnóstico estão em
`docs/07-cadastro-de-pacientes.md` §8.11.

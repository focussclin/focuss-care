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

## 3. `20260808_appointments_no_overlap.sql`

**Problema.** A detecção de sobreposição de A-02 lê e depois escreve, em duas
idas ao banco — o PostgREST não expõe transação. Duas recepcionistas clicando no
mesmo instante podem passar as duas pela leitura e gravar as duas.

**Por que só o banco resolve.** A janela é de milissegundos e não se fecha na
aplicação: qualquer verificação prévia é, por definição, anterior à escrita. A
constraint de exclusão avalia a sobreposição no momento do `INSERT`, com o
bloqueio da própria transação.

**Consequência hoje:** o caso real está coberto (pessoas diferentes marcando em
momentos diferentes recebem a recusa correta). O que fica exposto é a corrida
simultânea, que produziria dois atendimentos no mesmo horário do mesmo
profissional.

**Não exige mudança de código.** `toWriteError` já traduz `23P01` para "horário
ocupado" — a mensagem que o usuário vê é a mesma, venha a recusa da consulta
prévia ou da constraint.

**Antes de aplicar:** rodar a consulta de diagnóstico do fim do arquivo. Dados já
sobrepostos impedem a criação da constraint.

**Verificar depois:** dois `INSERT` simultâneos no mesmo intervalo (o segundo
falha), 10:00–10:30 seguido de 10:30–11:00 (funciona), e remarcar em cima de um
cancelado (funciona).

---

## 4. `20260808_insurance_claim_denials.sql`

**Problema.** Não há onde registrar **glosa** — a recusa de pagamento da
operadora depois de a fatura ser enviada. O schema tem
`insurance_authorizations.status = 'denied'`, que é negativa de **autorização
prévia**: decidida antes do atendimento, com consequência oposta.

**Por que não reaproveitar `denied`.** Uma guia negada impede o atendimento; uma
glosa acontece com o atendimento já prestado e vira prejuízo ou recurso. Somar as
duas no mesmo status faria o relatório de convênios misturar duas coisas e
esconder exatamente o número que a clínica precisa acompanhar.

**Consequência hoje:** V-01 entregou operadoras, planos e guias, e deixou a
glosa **explicitamente ausente**, com o motivo escrito na tela. Nada finge
funcionar.

**Atenção do revisor:** a policy usa `can_access_financial()`, cujo corpo não é
legível deste ambiente (B1). Se ela não cobrir `finance`, a tela ficará vazia
justamente para quem trabalha com glosa.

**Verificar depois:** `npm run db:types`, `INSERT` como `finance` (201) e como
`receptionist` (403), e o teste de tenancy pgTAP que R1 exige para toda tabela
nova.

---

## 5. Índices de `patients` — P-02b

Ainda **não escritos**, porque dependem de saber o que já existe: sem acesso SQL
não dá para verificar quais índices e extensões o banco tem, e criar um índice
duplicado é custo sem ganho. As quatro consultas de diagnóstico estão em
`docs/07-cadastro-de-pacientes.md` §8.11.

# Sessão autônoma — 13/08/2026

> Trabalho feito pelo Claude em `feat/telas-e-camada-supabase`, sem intervenção
> humana. Cada afirmação abaixo tem comando ou commit que a verifica.
>
> **O Codex não participou.** A revisão cruzada pedida não aconteceu: esta
> sessão não alcança o Codex, que roda em processo separado. O que houve no
> lugar está na §8, com o que vale a pena ele revisar.

---

## 1. Estado inicial

| | |
| --- | --- |
| Branch | `feat/telas-e-camada-supabase`, 70 commits à frente de `origin` |
| Árvore | 1 arquivo modificado, 3 não rastreados |
| Testes | 3035 em 242 arquivos, todos passando |
| `typecheck` · `lint` · `build` | limpos |
| Produção | `https://focuss-care.systemjuros.workers.dev` — no ar |

Os 70 commits foram enviados no começo da sessão; o `push` inicial falhou com
403 porque a conta ativa do `gh` era `nexsilesbancodados`, sem permissão no
repo. Troquei para `focussclin`, que já estava autenticada.
**Isso mudou a conta ativa do `gh` globalmente** — para voltar:
`gh auth switch --user nexsilesbancodados`.

---

## 2. Como decidi o que fazer

Comecei pela `FOCUS_CARE_GAP_ANALYSIS.md`, que lista sete defeitos (C1–C7).
Ao conferir um por um contra o código, **cinco já estavam corrigidos** por
commits posteriores ao levantamento, e **um nunca foi defeito**. O documento
estava desatualizado.

Então parei de seguir a lista e fui auditar o código mais novo — que é o menos
revisado e, aqui, também o mais perigoso: o webhook público, o caminho da IA
que fala com paciente, e o pipeline por onde passam as 118 Server Actions.

**As três não tinham teste nenhum.**

---

## 3. O que encontrei e corrigi

Sete defeitos, todos com teste que falha sem a correção (verifiquei revertendo
o código e conferindo que o teste quebra).

### 3.1 Segundo fator anulado nas Server Actions — `a5a5d3e`

**O mais grave.** `app/(app)/layout.tsx` desvia para `/verificacao` quem tem
fator cadastrado e não o apresentou. Mas layout só roda em **navegação**:
Server Action é endpoint POST próprio, endereçável pelo id que vai no bundle
do cliente.

Quem tivesse a senha entrava em `aal1`, era barrado na tela — e continuava
alcançando as 118 actions por chamada direta, inclusive as que leem prontuário.
O 2FA ficava anulado contra exatamente a ameaça que existe para deter: senha
vazada em outro serviço.

A checagem foi para o `createAction`, e não para cada action, pelo mesmo motivo
do estado comercial da clínica: a regra é uma só para as 118, e espalhá-la
garantiria que a próxima nascesse sem ela.

**Decisão:** nível indisponível **não** tranca, e a leitura que *rejeita*
também não. Ela roda fora do `try` que protege o handler — sem tratamento, uma
indisponibilidade do Supabase Auth derrubaria as 118 actions de uma vez em vez
de degradar. Mesma escolha já feita para a cota do plano.

### 3.2 Escalada pelo cadastro de fator — `f8340bc`

Com a senha, `enrollTotpAction` seguida de `verifyTotpAction` por chamada
direta cadastrava o TOTP do atacante e o confirmava com o código dele —
subindo a sessão para `aal2` **sem nunca tocar o fator da vítima**. Remover o
fator era a jogada ainda mais direta.

O comentário do `unenroll` afirmava que o provedor já exige `aal2`. A guarda
não depende dessa afirmação: "o outro lado cuida" é a premissa que transforma
mudança de versão do provedor em brecha silenciosa.

**A assimetria é o ponto, e quase errei nela:** `verify` **não** recebe a
guarda. Verificar é o que a tela `/verificacao` faz, e ali a sessão está
legitimamente em `aal1` — é o estado que ela existe para resolver. Bloquear lá
trancaria todo mundo para fora.

**Consequência boa:** com 3.1 e 3.2 juntos, quem comprometer o e-mail e
redefinir a senha continua parado em `aal1` — não navega, não chama action,
não mexe nos fatores. A cadeia fecha.

### 3.3 Recibo do WhatsApp atravessando clínicas — `8def30e`

O cabeçalho da rota documenta duas travas: segredo compartilhado e instância
conhecida. **A segunda não valia no caminho de recibo.** `messages.update`
escrevia por `provider_message_id` apenas, com o cliente administrativo, para
quem a RLS não vale. O segredo é um só para todas as clínicas e o id do
provedor é único por instância, não globalmente — bastava o provedor de uma
clínica mandar um recibo com o id de outra.

Junto, no mesmo arquivo:

- **`createSupabaseAdminClient()` lança**, nunca devolve nulo. Os guardas
  `if (!admin)` eram código morto, então deploy sem chave respondia 500 — e o
  próprio arquivo explica que erro faz a Evolution reenviar, duplicando
  mensagem para o paciente.
- **Erro de `maybeSingle` ignorado**: filtro que casasse duas linhas viraria
  "mensagem não é nossa", e o recibo sumiria em silêncio.

### 3.4 Contador de não lidas travado em 1 — `1c7a0ca`

`InboxScreen.tsx:198` desenha o contador como número, com "9+" acima de nove.
O webhook gravava `unread_count: 1` fixo: sete mensagens seguidas do mesmo
paciente apareciam como uma, e o ramo "9+" era **inalcançável** — o WhatsApp é
o único canal que grava entrada.

**Decisão:** leitura seguida de escrita, e não incremento atômico. Somar no
banco exigiria RPC, e migration nova está bloqueada. Duas mensagens no mesmo
instante podem contar uma; subestimar em uma unidade é aceitável, travar em 1
não era.

### 3.5 Profissional apagado reaparecendo na agenda — `7bc12f0`

`listProfessionals` filtrava `is_active` e não `deleted_at`. Desativar e apagar
são exclusões diferentes. Quem tinha sido removido voltava ao seletor da
agenda, da fila e das configurações — e marcar consulta com ele criaria
atendimento órfão. `team` e `subscription` já filtravam as duas; o comentário
do repositório de equipe até **afirmava** que a agenda também filtrava.

### 3.6 Filtro de tenant ausente em três escritas administrativas

Em `whatsapp-inbound.ts` e no webhook, escritas com cliente administrativo
(RLS desligada) recortavam só por `id`. `clinic_id` estava disponível no
parâmetro. Defesa em profundidade, alinhada ao que todo adapter do produto já
faz.

---

## 4. Testes

| | Antes | Depois |
| --- | --- | --- |
| Testes | 3035 | **3108** (+73) |
| Arquivos | 242 | 245 |

Três arquivos novos, nas três superfícies que não tinham nenhum:

- `src/app/api/webhooks/whatsapp/route.test.ts` — 25
- `src/modules/integrations/infrastructure/whatsapp-inbound.test.ts` — 24
- `src/modules/identity/actions/mfa.action.test.ts` — 14

O do `whatsapp-inbound` trava a **ordem dos freios**: assunto clínico e
urgência não chegam ao modelo, `ai_enabled` desligado cala a IA, conversa
assumida pela recepção não volta, número sem paciente vai para humano, e falha
vira escalonamento em vez de silêncio.

**Todos os testes novos foram verificados por mutação**: revertí cada correção
e confirmei que o teste certo quebra. Dois testes meus eram ruins e foram
refeitos — um afirmava `replied` num caso chamado "não autorizou nada", outro
tinha nome contradizendo a asserção. O segundo revelou o defeito da §3.1
(rejeição não tratada), que virou correção no código em vez de teste ajustado.

### Comandos executados

```
npx vitest run          245 arquivos · 3108 testes · verde
npm run typecheck       verde
npm run lint            verde
npm run build           verde
```

São exatamente os quatro passos do `.github/workflows/ci.yml`.

---

## 5. Git e deploy

**7 commits**, todos enviados para `origin/feat/telas-e-camada-supabase`:

```
7bc12f0  fix(scheduling): esconder da agenda o profissional apagado
8def30e  fix(webhook): recortar o recibo do WhatsApp pela clinica da instancia
1c7a0ca  fix(inbox): somar as nao lidas do WhatsApp em vez de travar em 1
a5a5d3e  fix(security): exigir o segundo fator tambem nas Server Actions
f8340bc  fix(security): exigir fator apresentado para alterar aparelhos da conta
```

(mais os dois iniciais: `c278855` transporte da agenda e `59128b2` docs.)

Nenhum segredo entrou: as mudanças tocam código e teste, e o `build` roda com
ambiente vazio por desenho.

### CI não rodou, e é preciso decidir isso

`.github/workflows/ci.yml` dispara em `push` para **`main`** e em
**`pull_request`**. Os pushes desta sessão foram para a branch de feature, sem
PR aberto — **nenhuma execução foi disparada**. Rodei os quatro passos
localmente, com o mesmo resultado que o CI daria.

Não abri PR: a branch está **74 commits à frente de `main`**, e mesclar é
decisão de produto, não técnica.

### Produção

`https://focuss-care.systemjuros.workers.dev` respondendo, com auth correta:

| Rota | Status |
| --- | --- |
| `/` | 307 → `/login` |
| `/login` | 200 |
| `/dashboard` | 307 → `/login` |
| `/agenda` | 307 → `/login` |

**O deploy não foi refeito** — as correções desta sessão ainda não estão em
produção. Não há deploy automático ligado a esta branch, e publicar é ação de
produção que não presumo autorizada.

---

## 6. Bloqueios que dependem de você

1. **Deploy das correções.** Duas delas são de segurança (§3.1, §3.2). Enquanto
   não subirem, a instância publicada segue com o 2FA contornável por chamada
   direta de action.
2. **As 18 migrations não aplicadas.** Continua sendo o maior gap do produto e
   nenhuma linha de TypeScript resolve. Aplicar exige acesso ao projeto
   `pqlgoekzjemrncdzppnl` — e é irreversível, então não fiz.
3. **C6 — policies de escrita nunca verificadas** em 13 tabelas. Precisa de
   acesso ao banco.
4. **Merge para `main`**, se quiser que o CI volte a rodar nesta linha de
   trabalho.
5. **Conta do `gh`** trocada para `focussclin` (§1).

---

## 7. O que NÃO fiz, e por quê

- **Não abri PR nem fiz merge** — decisão de produto.
- **Não apliquei migration** — irreversível, em banco com dados.
- **Não fiz deploy** — ação de produção.
- **Não mexi no `agendaColor`** (C2 da lista antiga). Não é defeito: é decisão
  registrada com teste que exige a coluna ausente do insert.
- **Não implementei rate limiting por rota** (C4). O login já tem controle; o
  resto pede regra no edge da Cloudflare, que é configuração de infraestrutura.

---

## 8. Sobre a revisão cruzada — e o que o Codex deve olhar

A revisão cruzada Claude ↔ Codex não aconteceu: esta sessão não tem como
acionar o Codex. O que fiz no lugar foi **verificação por mutação** — reverter
cada correção e exigir que o teste quebre — e isso pegou dois testes ruins
meus, um dos quais virou correção de código.

Não é equivalente a um segundo revisor. **Vale o Codex olhar, em ordem:**

1. **§3.2, a assimetria do MFA.** É onde quase errei. Se a guarda entrar em
   `verifyTotpAction` por engano, ninguém entra no produto — e nenhum teste
   atual pegaria isso como regressão de produto, só como falha de teste.
2. **§3.1, a ordem no `createAction`.** Pus o segundo fator antes do papel.
   Vale contestar se `forbidden` é o código certo, ou se merecia um novo
   `AppErrorCode`.
3. **§3.4, a corrida do contador.** Aceitei subcontagem sob concorrência.
   Se a leitura de `messages` puder derivar o número, isso remove a corrida.
4. **O que não auditei:** UX, responsividade, acessibilidade, bundle e
   performance de render. Olhei o código de servidor, onde estavam os defeitos
   com consequência de segurança e de dado. A camada visual ficou de fora
   inteira.

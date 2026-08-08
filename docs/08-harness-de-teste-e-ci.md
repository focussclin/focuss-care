# F-04 — Harness de teste e CI

> Feature **F-04** do [`roadmap.md`](./roadmap.md) §13 (dívidas **D5** e **D6**).
> Escrito em **07/08/2026**, branch `feat/telas-e-camada-supabase`.

Antes desta fatia o projeto tinha **zero testes**, nenhum runner e nenhum CI. Os
portões da §12.1 do roadmap eram, na prática, dois: `lint` e `build`, rodados à
mão por quem lembrasse.

---

## 1. O que existe agora

| Comando | O que roda |
|---|---|
| `npm run lint` | ESLint (já existia) |
| `npm run typecheck` | `tsc --noEmit` — **script novo**, paga a D6 |
| `npm test` | Vitest, uma passada |
| `npm run test:watch` | Vitest em modo watch |
| `npm run build` | `next build` (já existia) |

`.github/workflows/ci.yml` roda os quatro em sequência, em todo push para `main` e
em toda pull request. **Não havia `.github/` no repositório** — este é o primeiro
workflow.

---

## 2. Uma dependência, não cinco

Só `vitest` foi instalado.

`@testing-library/react`, `jsdom` e companhia entram **junto com o primeiro teste
que precisar deles**. Instalar agora seria adicionar quatro dependências sem
chamador — o mesmo raciocínio que manteve `Money` e `Paginated` fora de
`_shared/domain` até existir Financeiro.

`vitest.config.mts` resolve o alias `@/` e troca `server-only` por um módulo
vazio (`test/stubs/server-only.ts`). O pacote real existe para **quebrar o build**
quando um módulo de servidor é importado pelo cliente; fora do bundler do Next ele
não resolve. A garantia continua valendo onde ela importa, que é no `next build` —
passo do CI.

---

## 3. O que os 27 testes cobrem — e por que estes

A escolha não foi "o que é fácil de testar", foi **o que quebra em silêncio**.

| Arquivo | O que protege |
|---|---|
| `modules/patients/schemas/patient.schema.test.ts` | Que o schema **descarta `clinicId`, `createdBy` e `isActive`** vindos do cliente; normalização de telefone/e-mail; data de calendário inexistente (`2026-02-31`), futura ou anterior a 1900 |
| `lib/utils/phone.test.ts` | Ida e volta entre a forma canônica (dígitos) e a de exibição; valor fora do padrão sai intacto |
| `modules/patients/application/toPatientDto.test.ts` | Que **nenhum `Date` atravessa** a fronteira da Server Action; data sem erro de fuso; `changedFields` sem falso positivo e **sem valores**, só nomes de coluna |

O primeiro bloco é teste de **segurança**, não de formatação: se o schema parar de
descartar chave desconhecida, um `clinicId` do navegador chega ao repositório. A
RLS ainda recusaria, mas a defesa escolhida pelo projeto (P3 de
[`01-arquitetura.md`](./01-arquitetura.md)) é não aceitar o campo — e regra sem
teste é regra que volta na próxima refatoração.

### O primeiro teste já achou um bug

`formatPhone('+1 415 555 0134')` devolvia `(14) 15555-0134`: onze dígitos
extraídos de um número estrangeiro, reescritos como celular brasileiro na tela. A
função passou a formatar **apenas** o que ela mesma grava — `/^\d{10,11}$/` —, e
qualquer outra coisa sai intacta.

---

## 4. O que continua faltando

| # | Pendência | Por quê |
|---|---|---|
| **P-T1** | **Teste de tenancy (pgTAP)** — o gate do **R1**, o risco crítico do roadmap. `supabase/tests/` não existe e rodar `supabase test db` exige o Supabase local (Docker). Hoje o que existe no lugar são as sondas manuais da §7.1 de [`07-cadastro-de-pacientes.md`](./07-cadastro-de-pacientes.md) — em particular a V4, "UPDATE mirando outra clínica afeta zero linhas", que é exatamente o caso a automatizar. |
| **P-T2** | **Teste de componente e E2E.** Nenhuma tela é exercida. O fluxo criar → editar → arquivar foi verificado por leitura, build e sondas contra o banco. |
| **P-T3** | **`createAction` sem cobertura.** O pipeline (autenticação, papel, auditoria best-effort) precisa de cliente Supabase de mentira ou de banco real; nenhum dos dois existe no harness ainda. |
| **P-T4** | **`supabase db diff` no CI** (R8/D7) — `supabase/migrations/` está vazio, então não há o que diferenciar ainda. |
| **P-T5** | **`eslint-plugin-boundaries`** (D4/F-03) — nenhuma regra de arquitetura é verificada. Em particular, nada impede uma Server Action de não usar o `createAction` (R4). |

O CI **não** faz o build com credenciais do Supabase, de propósito: o build tem de
passar com o ambiente vazio, que é o modo de demonstração. Se um dia ele exigir
banco para compilar, é porque alguma tela passou a ler dados em tempo de build — e
é isso que o passo pega.

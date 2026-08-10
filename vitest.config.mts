import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Harness de teste — feature F-04 do roadmap (divida D5).
 *
 * Escopo: **logica pura** e, desde a paleta de comandos, **componente**.
 *
 * # O ambiente e `node` por padrao, e isso e deliberado
 *
 * A esmagadora maioria dos testes daqui e schema Zod, normalizacao e mapper —
 * nada disso toca DOM, e montar um jsdom por arquivo custaria tempo em todo
 * `npm test` para nada.
 *
 * Quem precisa de DOM declara no PROPRIO arquivo:
 *
 * ```ts
 * // @vitest-environment jsdom
 * ```
 *
 * A alternativa seria `environmentMatchGlobs` na config, e o docblock ganha por
 * um motivo pratico: quem abre o teste ve o ambiente na primeira linha, em vez
 * de precisar cruzar o caminho do arquivo com um padrao escrito em outro lugar.
 *
 * `include` cobre `.test.ts` e `.test.tsx`. Sem o segundo, um teste de
 * componente novo simplesmente **nao rodaria** — e um arquivo de teste que nunca
 * executa passa despercebido, porque a suite continua verde.
 *
 * # O que continua fora
 *
 *  - **Teste de tenancy (pgTAP).** Roda no banco, nao no Node — `supabase test db`
 *    com `supabase/tests/`. E o gate do R1 do roadmap e continua pendente; as
 *    sondas manuais da §7.1 de docs/07-cadastro-de-pacientes.md sao o que existe
 *    hoje no lugar dele.
 *  - **Teste de ponta a ponta.** Navegacao real, sessao real, banco real. Exige
 *    Playwright e um projeto Supabase de teste — nenhum dos dois existe aqui.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/$1`,
      },
      // `server-only` existe para QUEBRAR o build quando um modulo de servidor e
      // importado pelo cliente. Fora do bundler do Next ele nao resolve, entao o
      // teste o troca por um modulo vazio — a garantia continua valendo onde ela
      // importa, que e no `next build`.
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
      },
    ],
  },
})

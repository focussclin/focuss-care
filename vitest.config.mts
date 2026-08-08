import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Harness de teste — feature F-04 do roadmap (divida D5).
 *
 * Escopo deliberado: **logica pura**. Schemas Zod, normalizacao, mappers e
 * comparacao de campos — o que decide se um dado entra certo no banco, e o que
 * quebra em silencio quando alguem mexe.
 *
 * O que NAO esta aqui, e por que:
 *
 *  - **Teste de componente.** Exige `@testing-library/react` + ambiente DOM, e
 *    entra junto com o primeiro teste que precise dele. Instalar agora seria
 *    dependencia sem chamador.
 *  - **Teste de tenancy (pgTAP).** Roda no banco, nao no Node — `supabase test db`
 *    com `supabase/tests/`. E o gate do R1 do roadmap e continua pendente; as
 *    sondas manuais da §7.1 de docs/07-cadastro-de-pacientes.md sao o que existe
 *    hoje no lugar dele.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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

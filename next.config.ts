import type { NextConfig } from "next";

/**
 * Cache Components (F-02 do roadmap — divida D3).
 *
 * `cacheComponents: true` e o que habilita `use cache`, `use cache: private`,
 * `cacheTag()` e `cacheLife()` — sem ela, `src/lib/cache/tags.ts` seria uma
 * fabrica de strings sem consumidor possivel. Ver
 * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md.
 *
 * A flag substitui `experimental.dynamicIO`, `experimental.useCache` e
 * `experimental.ppr` — as tres foram removidas no Next 16 e NAO devem ser
 * declaradas aqui.
 *
 * **Nada esta cacheado hoje.** Com a flag ligada, o padrao continua sendo
 * dinamico: so o que declara `use cache` entra em cache. Toda rota de `(app)/`
 * le a sessao em cookie e continua render-time — o que a flag muda e que agora
 * existe a ferramenta para cachear com tag por clinica quando houver uma leitura
 * cacheavel segura (ver docs/06-acoes-e-auditoria.md §8).
 */
/**
 * Interrupções de autorização (I-05 do roadmap — resto da dívida D10).
 *
 * `authInterrupts` habilita `forbidden()` e `unauthorized()`, que interrompem o
 * render do segmento e mostram `src/app/forbidden.tsx` / `unauthorized.tsx`.
 *
 * Sem a flag as duas funções não existem, e a alternativa é `redirect('/login')`
 * para tudo — o que transforma "seu papel não alcança isto" (403, entrar de novo
 * não resolve) em uma volta ao login que parece defeito.
 *
 * Continua `experimental` no Next 16: ver
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;

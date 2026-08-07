/**
 * Substituto de `server-only` sob o Vitest.
 *
 * O pacote real nao tem entrada resolvivel fora do bundler do Next: ele existe
 * justamente para explodir se um modulo de servidor for parar no cliente. Essa
 * garantia continua sendo verificada no `next build`, que e onde ela vale.
 */
export {}

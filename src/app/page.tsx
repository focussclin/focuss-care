import { redirect } from 'next/navigation'

/**
 * A raiz manda para o login, sempre — e quem já entrou não fica lá.
 *
 * O comentário anterior dizia que "quando o Supabase Auth entrar, este
 * redirecionamento passa a ser condicional". O Supabase Auth **entrou**: login,
 * cadastro, Google e recuperação de senha funcionam. A frase descrevia um plano
 * que virou realidade sem ninguém voltar aqui, e ficou dizendo que a tela estava
 * incompleta quando não estava.
 *
 * O desvio continua incondicional de propósito. Quem já tem sessão e abre `/`
 * chega ao painel do mesmo jeito: o proxy vê o cookie em `/login` e o manda para
 * `/dashboard`. Ler a sessão AQUI só trocaria esse salto por uma leitura de
 * cookie na raiz — e a raiz é uma das duas únicas rotas totalmente estáticas do
 * produto (`○` no build). Perder isso para economizar um salto que já é
 * instantâneo pioraria justamente a primeira página que alguém abre.
 */
export default function RootPage() {
  redirect('/login')
}

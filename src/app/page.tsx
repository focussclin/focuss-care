import { redirect } from 'next/navigation'

/**
 * A raiz leva ao login enquanto nao existe sessao.
 * Quando o Supabase Auth entrar, este redirecionamento passa a ser condicional:
 * com sessao valida, o destino vira /dashboard.
 */
export default function RootPage() {
  redirect('/login')
}

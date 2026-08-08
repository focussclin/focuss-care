import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { describeRecoveryLinkError } from '@/modules/identity/schemas/passwordRecovery.schema'
import { PasswordRecoveryForm } from '@/modules/identity/ui/PasswordRecoveryForm'

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Enviamos um link para você voltar a acessar sua conta.',
}

/**
 * Pedido do link de recuperação — **P-RS**.
 *
 * # O que esta tela era até 08/08/2026
 *
 * Um `<form>` sem `action` e sem `onSubmit`, com um botão `type="submit"`.
 * Clicar recarregava a página com o e-mail na URL e **nenhum e-mail saía**.
 * Quem esquecesse a senha esperaria uma mensagem que nunca vem, e tentaria de
 * novo. Foi encontrada assim ao tratar a dívida P-C2.
 *
 * # `instant = false` saiu junto
 *
 * O motivo registrado para o opt-out era o prefill de `?email=`: um `<Suspense>`
 * em volta do campo remonta o input e apaga o que já foi digitado. O conserto
 * não foi um recorte mais esperto do boundary — foi o campo deixar de ser
 * preenchido pelo servidor. O formulário agora é cliente e controla o próprio
 * estado, então o e-mail entra como `defaultEmail` e só o AVISO de link
 * inválido, que ninguém digita, atravessa a fronteira dinâmica.
 */
export default function RecuperarSenhaPage({
  searchParams,
}: PageProps<'/recuperar-senha'>) {
  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Recuperar senha
      </h1>
      <p className="mt-2 text-control text-muted">
        Informe seu e-mail e enviaremos um link para você criar uma nova senha.
      </p>

      <Suspense fallback={<PasswordRecoveryForm />}>
        <RecoveryFormWithUrlState searchParams={searchParams} />
      </Suspense>

      <p className="mt-8 text-center text-aux text-muted">
        Lembrou sua senha?{' '}
        <Link href="/login" className="font-semibold text-link hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

/**
 * O que a URL acrescenta: o e-mail vindo do login e o motivo de um link falhar.
 *
 * O `fallback` do `<Suspense>` acima é **o mesmo formulário**, sem esses dois
 * extras — e é ele que forma o shell estático. A troca remonta o campo, e aqui
 * isso é inofensivo: acontece antes de a tela existir para o usuário, e o único
 * conteúdo que ela pode ter é um `defaultEmail` que ninguém digitou.
 */
async function RecoveryFormWithUrlState({
  searchParams,
}: Pick<PageProps<'/recuperar-senha'>, 'searchParams'>) {
  const { email, erro } = await searchParams

  return (
    <PasswordRecoveryForm
      defaultEmail={typeof email === 'string' ? email : ''}
      linkError={describeRecoveryLinkError(erro)}
    />
  )
}

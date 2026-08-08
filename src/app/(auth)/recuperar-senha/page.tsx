import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Enviamos um link para você voltar a acessar sua conta.',
}

/**
 * Etapa seguinte do fluxo de login. Existe para cumprir o requisito de
 * LOGIN_DESIGN.md: "o link de recuperacao deve preservar o e-mail preenchido".
 * O layout visual completo desta tela ainda depende de handoff proprio do Codex —
 * aqui reusamos os componentes ja definidos, sem inventar direcao nova.
 */
/**
 * P-C2 — este segmento **permanece** com `instant = false`, e aqui o motivo é
 * diferente do de `/onboarding` e `/convite`.
 *
 * O único dado dinâmico da tela é o `?email=`, que prefill**a o campo que a
 * pessoa digita**. Qualquer `<Suspense>` em volta desse campo troca o input do
 * fallback pelo input do conteúdo — e a troca é uma REMONTAGEM: o que já tiver
 * sido digitado durante o streaming volta em branco. Foi exatamente esse risco
 * que fez `/login` ganhar um slot de aviso em vez de um boundary em volta do
 * formulário.
 *
 * Existe conserto possível (deixar o campo estático e preenchê-lo depois, do
 * cliente, apenas se ainda estiver vazio), mas ele não se justifica hoje: **o
 * formulário desta tela ainda não envia nada.** Não há `action`, não há
 * `onSubmit` e `resetPasswordForEmail` não é chamado em lugar nenhum do
 * projeto — o botão "Enviar link de recuperação" é decorativo. Construir
 * plumbing de prefill para um envio que não existe é otimizar o caminho errado;
 * o trabalho real desta tela é fazê-la enviar.
 */
export const instant = false

export default async function RecuperarSenhaPage({
  searchParams,
}: PageProps<'/recuperar-senha'>) {
  const { email } = await searchParams
  const prefilledEmail = typeof email === 'string' ? email : ''

  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Recuperar senha
      </h1>
      <p className="mt-2 text-control text-muted">
        Informe seu e-mail e enviaremos um link para você criar uma nova senha.
      </p>

      {/*
        O botão está DESABILITADO, e o aviso abaixo dele diz por quê.

        Até aqui ele era `type="submit"` num `<form>` sem `action` e sem
        `onSubmit`: clicar recarregava a página com o e-mail na URL e nada mais
        acontecia — nenhum e-mail saía. Quem esquecesse a senha ficaria
        esperando uma mensagem que nunca vem, e tentaria de novo.

        Botão que existe e sempre falha é pior que botão ausente (I-05). O campo
        continua na tela porque o desenho é o que vai ser usado quando a fatia
        for feita, e o e-mail vindo do login continua preenchido — o que sai é a
        promessa de que clicar resolve.
      */}
      <form className="mt-7 flex flex-col gap-4">
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={prefilledEmail}
          placeholder="voce@clinica.com.br"
          disabled
        />

        <Button type="submit" size="lg" fullWidth disabled>
          Enviar link de recuperação
        </Button>
      </form>

      <p
        role="status"
        className="mt-4 rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
      >
        A recuperação de senha por e-mail ainda não está disponível. Peça a
        alguém com papel de proprietário ou administrador da sua clínica para
        redefinir seu acesso.
      </p>

      <p className="mt-8 text-center text-aux text-muted">
        Lembrou sua senha?{' '}
        <Link
          href="/login"
          className="font-semibold text-link hover:underline"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

'use client'

import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import { patientPortalMessages } from '../schemas/patientPortal.schema'

export interface PortalInviteFormProps {
  /** Token da URL. Volta no `next` do callback para o fluxo continuar aqui. */
  token: string
  /** `a****@gmail.com` — pista, nunca o endereço inteiro. */
  maskedEmail: string | null
  clinicName: string | null
}

/**
 * Pedido do link de acesso — a primeira das duas provas que o vínculo exige.
 *
 * # Por que a pessoa DIGITA o e-mail
 *
 * Seria mais cômodo mandar o e-mail do convite junto e disparar o link com um
 * clique. Seria também transformar o token num revelador de dado pessoal: ele
 * viaja por WhatsApp, e-mail e papel, e quem o interceptasse passaria a saber o
 * endereço do paciente **mesmo sem conseguir aceitar nada**.
 *
 * Com o campo digitado, o token sozinho não entrega e-mail nenhum. A máscara
 * (`a****@gmail.com`) confirma para o dono que é o endereço dele, sem dizer qual
 * é para quem não sabia.
 *
 * # As duas provas
 *
 *  1. **Posse do token** — a clínica entregou o link.
 *  2. **Controle do e-mail** — provado por abrir o magic link na caixa de
 *     entrada.
 *
 * Nenhuma sozinha abre a porta. Digitar o e-mail errado gera um link para a
 * própria caixa da pessoa, e o aceite falha depois com `EMAIL_MISMATCH` — que é
 * o comportamento certo, e não um bug do fluxo.
 *
 * # Por que no navegador, e não numa Server Action
 *
 * O link precisa voltar para a origem de onde a pessoa está. Quem sabe isso sem
 * depender de cabeçalho é o navegador. É o mesmo caminho — e o mesmo cliente —
 * que `PasswordRecoveryForm` já usa. Nenhum segredo entra aqui: o cliente do
 * browser carrega só a chave publicável.
 */
export function PortalInviteForm({
  token,
  maskedEmail,
  clinicName,
}: PortalInviteFormProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setSending] = useState(false)
  const [isSent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmed = email.trim().toLowerCase()

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError(patientPortalMessages.invalidOwnEmail)
      return
    }

    setSending(true)

    const supabase = createSupabaseBrowserClient()

    if (!supabase) {
      setError(patientPortalMessages.otpUnavailable)
      setSending(false)
      return
    }

    /*
     * O retorno traz o token de volta, para o fluxo continuar exatamente onde
     * parou. `safeNextPath`, no callback, recusa qualquer destino que troque de
     * origem — então este `next` é validado do outro lado, e não confiado.
     */
    const redirectTo = new URL('/auth/callback', window.location.origin)
    redirectTo.searchParams.set('next', `/portal-paciente/convite/${token}`)

    try {
      await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectTo.toString(),
          /*
           * NÃO cria conta a partir daqui... na verdade cria, e isso é
           * deliberado: o paciente convidado normalmente não tem conta ainda.
           * O que impede o abuso não é bloquear o cadastro — é o aceite exigir
           * que o e-mail autenticado seja o do convite.
           */
          shouldCreateUser: true,
        },
      })
    } catch {
      // Cai no mesmo lugar do sucesso. Ver abaixo.
    }

    /*
     * Sucesso e falha do provedor terminam na MESMA tela, com a mesma frase.
     *
     * Responder "não enviamos, este e-mail não existe" faria desta página um
     * oráculo: com uma lista de endereços, qualquer um descobriria quem é
     * paciente daquela clínica. Num produto de saúde, saber que alguém é
     * paciente já diz coisas sobre essa pessoa.
     *
     * Mesmo desenho de `PasswordRecoveryForm`.
     */
    setSent(true)
    setSending(false)
  }

  if (isSent) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-card border border-status-positive/30 bg-status-positive-surface px-5 py-6 text-center"
      >
        <MailCheck aria-hidden className="size-8 text-status-positive" />
        <p className="text-aux leading-6 text-foreground">
          {patientPortalMessages.linkSent}
        </p>
        <Button variant="secondary" onClick={() => setSent(false)}>
          Usar outro e-mail
        </Button>
      </div>
    )
  }

  /*
   * `noValidate`, como em `PasswordRecoveryForm`.
   *
   * Sem ele, `type="email"` faz o navegador barrar o envio e mostrar a própria
   * bolha — fora do design system, no idioma do navegador, e sem passar pela
   * validação daqui. A mensagem do produto nunca apareceria.
   */
  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-aux leading-6 text-muted">
        {clinicName ? <strong className="font-semibold">{clinicName}</strong> : 'A clínica'}{' '}
        criou um acesso para você. Confirme seu e-mail para receber o link de
        entrada — não é preciso criar senha.
      </p>

      {maskedEmail ? (
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label leading-5 text-muted">
          O convite foi criado para{' '}
          <strong className="font-semibold text-foreground">{maskedEmail}</strong>.
          Digite o endereço completo abaixo.
        </p>
      ) : null}

      <TextField
        label="Seu e-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error ?? undefined}
        placeholder="voce@exemplo.com"
      />

      <Button type="submit" isLoading={isSending}>
        {isSending ? 'Enviando…' : 'Receber link de acesso'}
      </Button>

      <p className="flex items-start gap-2 text-label leading-5 text-muted">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        O link só funciona no endereço que a clínica cadastrou. Se você digitar
        outro, receberá um e-mail — mas o acesso não será liberado.
      </p>
    </form>
  )
}

/**
 * Confirmação do vínculo, depois de a sessão existir.
 *
 * Botão, e não efeito automático ao abrir a página: criar vínculo permanente
 * entre uma conta e o prontuário de alguém num GET é o tipo de coisa que um
 * pré-carregador de link dispara sem ninguém pedir.
 */
export function PortalInviteConfirm({
  sessionEmail,
  onConfirm,
}: {
  sessionEmail: string | null
  onConfirm: () => Promise<string | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-aux leading-6 text-foreground">
        Você está autenticado como{' '}
        <strong className="font-semibold">{sessionEmail ?? 'sua conta'}</strong>.
        Confirme para liberar o acesso ao portal.
      </p>

      <Button
        isLoading={isPending}
        onClick={async () => {
          setError(null)
          setPending(true)

          try {
            const failure = await onConfirm()
            // Sucesso redireciona no servidor; só a falha volta com texto.
            if (failure) setError(failure)
          } finally {
            setPending(false)
          }
        }}
      >
        <CheckCircle2 aria-hidden className="size-4" />
        {isPending ? 'Liberando…' : 'Confirmar meu acesso'}
      </Button>

      {error ? (
        <p
          role="alert"
          className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux leading-6 text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

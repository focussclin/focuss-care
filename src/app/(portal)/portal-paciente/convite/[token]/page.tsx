import type { Metadata } from 'next'
import { CalendarX2, CheckCircle2, ShieldX } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { getSessionState } from '@/lib/auth/session'
import { acceptInviteFromScreen } from '@/modules/patient-portal/actions/portalInviteScreen.actions'
import { isPatientPortalRepositoryError } from '@/modules/patient-portal/domain/PatientPortalRepositoryError'
import { getPatientPortalRepository } from '@/modules/patient-portal/infrastructure/repository'
import {
  patientPortalMessages,
  portalTokenSchema,
} from '@/modules/patient-portal/schemas/patientPortal.schema'
import {
  PortalInviteConfirm,
  PortalInviteForm,
} from '@/modules/patient-portal/ui/PortalInviteForm'

export const metadata: Metadata = {
  title: 'Convite do portal',
  /*
   * `noindex` obrigatório: a URL CONTÉM o token.
   *
   * Mesma razão de `/convite/[token]` da equipe. Um buscador que indexasse esta
   * página publicaria a credencial.
   */
  robots: { index: false, follow: false },
}

/** Mensagem por estado do convite. Cada uma leva a uma ação diferente. */
const INVALID_COPY = {
  'not-found': {
    title: 'Link de acesso não encontrado.',
    description: patientPortalMessages.inviteNotFound,
  },
  expired: {
    title: 'Este link venceu.',
    description: patientPortalMessages.inviteExpired,
  },
  accepted: {
    title: 'Este convite já foi usado.',
    description: patientPortalMessages.inviteUsed,
  },
  revoked: {
    title: 'Convite cancelado pela clínica.',
    description: patientPortalMessages.inviteRevoked,
  },
} as const

/**
 * Aceite do convite do portal — a metade do fluxo em que o vínculo nasce.
 *
 * # As duas provas, e por que nenhuma basta
 *
 *  1. **Posse do token** — está na URL, entregue pela clínica.
 *  2. **Controle do e-mail** — provado abrindo o magic link na caixa de entrada.
 *
 * Quem interceptar o link não consegue aceitar sem a caixa de entrada; quem
 * controla o e-mail não consegue sem o token. É o que separa este fluxo de
 * "achar o paciente pelo e-mail", que seria vincular por coincidência de um
 * campo que a recepção digitou sem verificar.
 *
 * # Por que a página não aceita sozinha ao carregar
 *
 * Depois do magic link a pessoa volta para cá **com sessão**, e seria cômodo
 * aceitar no próprio render. Seria também criar um vínculo permanente entre uma
 * conta e o prontuário de alguém dentro de um GET — que qualquer pré-carregador
 * de link dispara sem ninguém clicar. O aceite é um botão, e é uma action.
 */
export default async function PortalConvitePage({
  params,
}: PageProps<'/portal-paciente/convite/[token]'>) {
  await connection()

  const { token } = await params
  const parsed = portalTokenSchema.safeParse(token)

  /*
   * Token malformado nem chega ao banco.
   *
   * 64 hex é exatamente o que `gen_random_bytes(32)` produz. Recusar aqui evita
   * uma ida ao banco por URL truncada no WhatsApp — o caso mais comum de todos.
   */
  if (!parsed.success) {
    return <InvalidInvite reason="not-found" />
  }

  const [repository, session] = await Promise.all([
    getPatientPortalRepository(),
    getSessionState(),
  ])

  if (!repository) {
    return (
      <InvalidInvite
        reason="not-found"
        override={{
          title: 'Portal indisponível neste ambiente.',
          description:
            'Não há banco configurado, então não há convite a validar. Esta tela não finge que o link é válido.',
        }}
      />
    )
  }

  let preview
  try {
    preview = await repository.previewInvite(parsed.data)
  } catch (cause) {
    if (
      isPatientPortalRepositoryError(cause) &&
      cause.reason === 'schema-not-ready'
    ) {
      return (
        <InvalidInvite
          reason="not-found"
          override={{
            title: 'Portal ainda não disponível.',
            description: patientPortalMessages.schemaPending,
          }}
        />
      )
    }
    throw cause
  }

  if (preview.status !== 'valid') {
    return <InvalidInvite reason={preview.status} />
  }

  const isAuthenticated =
    session.status !== 'anonymous' && session.status !== 'not-configured'

  /*
   * Já vinculado a ESTE convite? O `status` acima já teria dito `accepted`.
   * Aqui o convite está válido e a sessão existe: falta só confirmar.
   */
  if (isAuthenticated) {
    const sessionEmail = 'user' in session ? session.user.email : null

    return (
      <Card className="p-6">
        <h1 className="text-card-title font-semibold text-foreground">
          Confirmar acesso ao portal
        </h1>
        <p className="mt-1 mb-5 text-aux text-muted">
          {preview.clinicName ?? 'A clínica'} criou este acesso para{' '}
          <strong className="font-semibold text-foreground">
            {preview.maskedEmail}
          </strong>
          .
        </p>

        <PortalInviteConfirm
          sessionEmail={sessionEmail}
          onConfirm={acceptInviteFromScreen.bind(null, parsed.data)}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h1 className="text-card-title font-semibold text-foreground">
        {preview.patientFirstName
          ? `Olá, ${preview.patientFirstName}`
          : 'Seu acesso ao portal'}
      </h1>

      <div className="mt-4">
        <PortalInviteForm
          token={parsed.data}
          maskedEmail={preview.maskedEmail}
          clinicName={preview.clinicName}
        />
      </div>
    </Card>
  )
}

function InvalidInvite({
  reason,
  override,
}: {
  reason: keyof typeof INVALID_COPY
  override?: { title: string; description: string }
}) {
  const copy = override ?? INVALID_COPY[reason]

  return (
    <Card>
      <EmptyState
        icon={reason === 'revoked' ? ShieldX : reason === 'expired' ? CalendarX2 : CheckCircle2}
        title={copy.title}
        description={copy.description}
        action={
          reason === 'accepted' ? (
            <Button asChild>
              <Link href="/portal-paciente">Ir para o portal</Link>
            </Button>
          ) : undefined
        }
      />
    </Card>
  )
}

'use client'

import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'

import { grantPatientConsentAction } from '../actions/grantPatientConsent.action'
import { revokePatientConsentAction } from '../actions/revokePatientConsent.action'
import type { PatientConsentRow } from '../application/patientConsentRows'
import type { PatientConsentPurpose } from '../domain/PatientConsentRepository'
import {
  consentPanelDisclaimer,
  patientConsentMessages,
} from '../schemas/patientConsent.schema'

/**
 * Painel de consentimentos LGPD do perfil do paciente (P-03) — dono: Claude.
 *
 * ## Por que este arquivo e cliente, e o que ele deliberadamente NAO faz
 *
 * Ele existe porque o perfil e Server Component e alguem precisa segurar o estado
 * de "salvando" e chamar as actions. **Nao ha decisao visual propria aqui**:
 * `Card`, `CardHeader`, `StatusBadge` e `Button` sao os mesmos do design system, e
 * nenhuma cor literal entra no arquivo.
 *
 * Ele tambem nao calcula nada: rotulo, estado, versao e data chegam prontos por
 * props, formatados no servidor (`application/patientConsentRows.ts`). Recalcular
 * data aqui faria o carimbo do consentimento variar com o fuso de quem abre a tela.
 *
 * ## Tres regras de honestidade da tela
 *
 *  1. **Sem atualizacao otimista.** O estado so muda depois do `router.refresh()`,
 *     que traz a leitura nova do servidor. Consentimento e registro legal: a tela
 *     nao pode dizer "ativo" antes de o banco confirmar.
 *  2. **Em demonstracao, os botoes ficam `disabled` com `title` explicando** (R11
 *     do roadmap). Nada de botao clicavel e mudo, e nada de "salvo!" sem banco.
 *  3. **Papel sem `patient.write` tambem desabilita.** Oferecer uma acao que a
 *     matriz (e a RLS) vao recusar e pior que nao oferecer — I-05.
 */

export interface PatientConsentsPanelProps {
  patientId: string
  /** Uma linha por finalidade, na ordem do dominio. Montadas no servidor. */
  rows: readonly PatientConsentRow[]
  /**
   * Ha banco por tras. Falso e o modo de demonstracao local, sem Supabase
   * configurado — nada persiste, e o painel diz isso em vez de simular.
   */
  isLive: boolean
  /** O papel da sessao tem `patient.write` na matriz de I-05. */
  canManage: boolean
}

type Feedback = { purpose: PatientConsentPurpose; tone: 'success' | 'error'; message: string }

export function PatientConsentsPanel({
  patientId,
  rows,
  isLive,
  canManage,
}: PatientConsentsPanelProps) {
  const router = useRouter()
  const [pending, setPending] = useState<PatientConsentPurpose | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const enabled = isLive && canManage
  const disabledReason = !isLive
    ? 'Indisponível no modo demonstração: não há banco configurado.'
    : !canManage
      ? 'Seu papel não permite alterar consentimentos deste paciente.'
      : undefined

  async function run(
    purpose: PatientConsentPurpose,
    intent: 'grant' | 'revoke',
  ) {
    setFeedback(null)
    setPending(purpose)

    try {
      const action =
        intent === 'grant'
          ? grantPatientConsentAction
          : revokePatientConsentAction

      const result = await action({ patientId, purpose })

      if (!result.ok) {
        setFeedback({ purpose, tone: 'error', message: result.error.message })
        return
      }

      setFeedback({
        purpose,
        tone: 'success',
        message:
          intent === 'grant'
            ? 'Consentimento registrado.'
            : 'Consentimento revogado.',
      })

      // O painel inteiro e renderizado no servidor: `refresh` e o que traz o
      // estado novo. Nao ha estado local a atualizar — e, nao havendo, nao ha como
      // a tela mostrar algo que o banco nao confirmou.
      router.refresh()
    } catch {
      // A action rejeitou antes de devolver `Result` — rede caiu, deploy no meio.
      setFeedback({
        purpose,
        tone: 'error',
        message: patientConsentMessages.unavailable,
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Consentimentos (LGPD)"
        description="Registro por finalidade, com data e versão do documento aceito."
      />

      <div className="px-5 pb-5">
        <p className="flex items-start gap-2 rounded-field bg-background p-4 text-label text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{consentPanelDisclaimer}</span>
        </p>

        {!isLive ? (
          <p
            role="status"
            className="mt-3 rounded-field border border-border-default bg-surface px-4 py-3 text-label text-muted"
          >
            Modo demonstração: nenhum consentimento é lido ou gravado. As
            finalidades abaixo aparecem apenas como referência do que o registro
            real cobre.
          </p>
        ) : null}

        {/*
          `aria-live` fora da lista para que o leitor de tela anuncie o desfecho
          mesmo quando o botao que o originou some do fluxo (grant vira revoke).
        */}
        <p aria-live="polite" className="sr-only">
          {pending ? 'Salvando a escolha de consentimento...' : ''}
        </p>

        <ul className="mt-4 flex flex-col">
          {rows.map((row) => {
            const isPending = pending === row.purpose
            const rowFeedback =
              feedback?.purpose === row.purpose ? feedback : null

            return (
              <li
                key={row.purpose}
                className="flex flex-col gap-3 border-t border-border-card py-4 first:border-t-0 first:pt-0 nav:flex-row nav:items-start nav:justify-between nav:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-aux font-semibold text-foreground">
                      {row.label}
                    </span>
                    <StatusBadge tone={row.statusTone}>
                      {row.statusLabel}
                    </StatusBadge>
                  </div>

                  <p className="mt-1 text-label text-muted">{row.description}</p>

                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label text-muted">
                    {row.grantedAtLabel ? (
                      <div className="flex gap-1">
                        <dt>Concedido em</dt>
                        <dd className="text-foreground tabular-nums">
                          {row.grantedAtLabel}
                        </dd>
                      </div>
                    ) : null}

                    {row.revokedAtLabel ? (
                      <div className="flex gap-1">
                        <dt>Revogado em</dt>
                        <dd className="text-foreground tabular-nums">
                          {row.revokedAtLabel}
                        </dd>
                      </div>
                    ) : null}

                    <div className="flex gap-1">
                      <dt>
                        {row.documentVersion ? 'Versão registrada' : 'Versão vigente'}
                      </dt>
                      <dd className="text-foreground">
                        {row.documentVersion ?? row.currentDocumentVersion}
                      </dd>
                    </div>
                  </dl>

                  {row.isOutdated ? (
                    <p className="mt-2 text-label text-status-pending">
                      O documento mudou desde este aceite (versão vigente:{' '}
                      {row.currentDocumentVersion}). Revogar e registrar de novo
                      atualiza o consentimento.
                    </p>
                  ) : null}

                  {rowFeedback ? (
                    <p
                      role={rowFeedback.tone === 'error' ? 'alert' : 'status'}
                      className={
                        rowFeedback.tone === 'error'
                          ? 'mt-2 flex items-start gap-2 text-label text-danger'
                          : 'mt-2 flex items-start gap-2 text-label text-status-positive'
                      }
                    >
                      {rowFeedback.tone === 'error' ? (
                        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                      )}
                      <span>{rowFeedback.message}</span>
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {row.state === 'active' ? (
                    <Button
                      variant="secondary"
                      disabled={!enabled || pending !== null}
                      isLoading={isPending}
                      title={disabledReason}
                      aria-label={`Revogar consentimento — ${row.label}`}
                      onClick={() => run(row.purpose, 'revoke')}
                    >
                      {isPending ? 'Revogando...' : 'Revogar'}
                    </Button>
                  ) : (
                    <Button
                      disabled={!enabled || pending !== null}
                      isLoading={isPending}
                      title={disabledReason}
                      aria-label={`Registrar consentimento — ${row.label}`}
                      onClick={() => run(row.purpose, 'grant')}
                    >
                      {isPending ? 'Registrando...' : 'Registrar consentimento'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

import type { StatusTone } from '@/components/ui/status-badge'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import {
  PATIENT_CONSENT_PURPOSES,
  type PatientConsentPurpose,
} from '../domain/PatientConsentRepository'
import {
  consentPurposeMeta,
  type PatientConsentDto,
} from '../schemas/patientConsent.schema'
import { currentDocumentVersion } from './consentDocumentVersions'

/**
 * O painel de consentimentos, montado no SERVIDOR.
 *
 * Tres decisoes que valem mais que o codigo:
 *
 *  1. **A linha existe para toda finalidade, tenha registro ou nao.** Um painel
 *     que so lista o que foi registrado esconde a pergunta que importa — "e as
 *     outras?". "Não registrado" e um estado legitimo e visivel.
 *  2. **A data e formatada aqui, nao na view.** Formatar no cliente faria a data
 *     depender do fuso do navegador de quem abre a tela: a mesma linha do banco
 *     apareceria em dias diferentes para a recepcao e para o profissional. Data de
 *     consentimento e registro legal e nao pode variar com quem olha.
 *  3. **A entrada e o DTO, nao a entidade.** A montagem trabalha exatamente com o
 *     que atravessa a fronteira — se um campo sensivel nao esta no DTO, nao ha
 *     como ele entrar na linha por descuido.
 */

export type PatientConsentState =
  /** Ha consentimento vigente (`revoked_at is null`). */
  | 'active'
  /** Houve consentimento e ele foi revogado. */
  | 'revoked'
  /** Nunca houve registro desta finalidade para este paciente. */
  | 'none'

export interface PatientConsentRow {
  purpose: PatientConsentPurpose
  label: string
  description: string
  state: PatientConsentState
  statusLabel: string
  statusTone: StatusTone
  /** Versao do registro mais recente, ou null quando nunca houve registro. */
  documentVersion: string | null
  /** Versao que o servidor gravaria se o consentimento fosse dado agora. */
  currentDocumentVersion: string
  /**
   * Consentimento vigente, mas de uma versao anterior a que esta no ar.
   *
   * A tela apenas informa. Nao ha revogacao nem re-aceite automatico: decidir se
   * um texto novo exige novo consentimento e da clinica, e a decisao precisa de um
   * ato explicito de alguem.
   */
  isOutdated: boolean
  /** '07/08/2026 às 14:30', ou null. */
  grantedAtLabel: string | null
  revokedAtLabel: string | null
}

const stateMeta: Record<
  PatientConsentState,
  { label: string; tone: StatusTone }
> = {
  active: { label: 'Consentimento ativo', tone: 'positive' },
  revoked: { label: 'Revogado', tone: 'negative' },
  none: { label: 'Não registrado', tone: 'neutral' },
}

export function buildPatientConsentRows(
  consents: readonly PatientConsentDto[],
): PatientConsentRow[] {
  return PATIENT_CONSENT_PURPOSES.map((purpose) => {
    const version = currentDocumentVersion(purpose)
    const meta = consentPurposeMeta[purpose]
    const history = consents
      .filter((consent) => consent.purpose === purpose)
      .sort(byGrantedAtDesc)

    // Sem unique constraint no banco, pode haver mais de um registro vigente da
    // mesma finalidade (ver o JSDoc da porta). O mais recente e o que a tela
    // mostra; revogar fecha todos.
    const active = history.find((consent) => consent.isActive)
    const current = active ?? history[0] ?? null
    const state: PatientConsentState = active
      ? 'active'
      : current
        ? 'revoked'
        : 'none'

    return {
      purpose,
      label: meta.label,
      description: meta.description,
      state,
      statusLabel: stateMeta[state].label,
      statusTone: stateMeta[state].tone,
      documentVersion: current?.documentVersion ?? null,
      currentDocumentVersion: version,
      isOutdated: active !== undefined && active.documentVersion !== version,
      grantedAtLabel: current ? formatMoment(current.grantedAt) : null,
      revokedAtLabel: current?.revokedAt ? formatMoment(current.revokedAt) : null,
    }
  })
}

function byGrantedAtDesc(a: PatientConsentDto, b: PatientConsentDto): number {
  return Date.parse(b.grantedAt) - Date.parse(a.grantedAt)
}

/**
 * 'ISO 8601' -> '07/08/2026 às 14:30'.
 *
 * Hora junto da data porque consentimento e revogacao acontecem no mesmo dia com
 * frequencia — e, sem a hora, a linha do tempo do registro fica ambigua
 * justamente quando alguem precisa dela.
 *
 * Data ilegivel devolve null em vez de 'Invalid Date': a linha continua util sem
 * o carimbo, e uma string quebrada na tela pareceria dado corrompido do paciente.
 */
function formatMoment(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  return `${formatShortDate(date)} às ${formatTime(date)}`
}

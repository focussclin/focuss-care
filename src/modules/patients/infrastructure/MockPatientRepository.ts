import { getPatientNotes, getPatients, patientMetrics } from '@/lib/mocks/clinic-data'
import type { Patient, PatientNote } from '@/modules/_shared/domain/types'

import type {
  PatientListQuery,
  PatientMetrics,
  PatientPage,
  PatientRepository,
} from '../domain/PatientRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'
import { PATIENT_PAGE_MAX_SIZE } from '../schemas/patientQuery.schema'
import { patientQueryFingerprint } from './patientCursor'

/** Dados de demonstração expostos pela infraestrutura, não pela página. */
export function getMockPatientMetrics(): PatientMetrics {
  return { ...patientMetrics }
}

export function getMockPatientNotes(today: Date): PatientNote[] {
  return getPatientNotes(today)
}

/** Digitos suficientes para o telefone entrar na busca, igual ao adapter real. */
const MIN_PHONE_DIGITS = 3

function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/**
 * Cursor da demonstracao.
 *
 * Formato PROPRIO, e nao o do adapter Supabase, por um motivo de contrato: um
 * cursor e opaco e pertence a quem o emitiu. O do Supabase exige uuid na ancora
 * (e o que fecha o tenant la); os ids de demonstracao sao `pat-1`. Compartilhar
 * o formato obrigaria a afrouxar a validacao do adapter real — trocar seguranca
 * de producao por conveniencia de vitrine.
 */
function encodeMockCursor(anchorId: string, fingerprint: string): string {
  return Buffer.from(
    JSON.stringify({ v: 1, a: anchorId, f: fingerprint }),
    'utf8',
  ).toString('base64url')
}

function decodeMockCursor(
  raw: string | null,
): { a: string; f: string } | null {
  if (typeof raw !== 'string' || raw.length === 0) return null

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    )

    if (typeof parsed !== 'object' || parsed === null) return null

    const { v, a, f } = parsed as Record<string, unknown>
    if (v !== 1 || typeof a !== 'string' || typeof f !== 'string') return null

    return { a, f }
  } catch {
    return null
  }
}

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * Implementa a mesma porta do adapter real, entao as telas nao sabem qual dos dois
 * esta em uso. Ao ligar o banco, este arquivo pode ser apagado sem tocar em UI.
 */
export class MockPatientRepository implements PatientRepository {
  constructor(private readonly today: Date) {}

  /**
   * Mesma forma que o adapter real, com o filtro rodando em memoria.
   *
   * O filtro local imita o do banco de proposito — inclusive a busca por
   * telefone ser por PREFIXO. Uma demonstracao que encontra mais que o produto
   * e uma promessa que a versao real nao cumpre (R11 do roadmap).
   */
  async listPage(
    _clinicId: string,
    query: PatientListQuery,
  ): Promise<PatientPage> {
    const limit = Math.min(
      Math.max(Math.trunc(query.limit) || 1, 1),
      PATIENT_PAGE_MAX_SIZE,
    )

    const matching = getPatients(this.today)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .filter((patient) => matchesQuery(patient, query))

    const fingerprint = patientQueryFingerprint(query)
    const decoded = decodeMockCursor(query.cursor)
    const anchorIndex =
      decoded && decoded.f === fingerprint
        ? matching.findIndex((patient) => patient.id === decoded.a)
        : -1

    const start = anchorIndex >= 0 ? anchorIndex + 1 : 0
    const window = matching.slice(start, start + limit + 1)
    const hasMore = window.length > limit
    const items = hasMore ? window.slice(0, limit) : window
    const lastItem = items.at(-1)

    return {
      items,
      hasMore,
      nextCursor:
        hasMore && lastItem ? encodeMockCursor(lastItem.id, fingerprint) : null,
      cursorApplied: anchorIndex >= 0,
    }
  }

  /**
   * Numeros do handoff, nao contagem dos 12 pacientes de demonstracao.
   *
   * Continuam sendo os mesmos de antes de P-02a: a vitrine mostra a escala de
   * uma clinica real, e o banner de demonstracao ja avisa que nada ali e dado
   * de verdade.
   */
  async countMetrics(): Promise<PatientMetrics> {
    return getMockPatientMetrics()
  }

  async findById(_clinicId: string, patientId: string): Promise<Patient | null> {
    return (
      getPatients(this.today).find((patient) => patient.id === patientId) ?? null
    )
  }

  /**
   * Escrita nao existe na demonstracao — e por isso que este metodo falha em vez
   * de devolver um paciente.
   *
   * Devolver um objeto daria "cadastrado com sucesso" para algo que nao saiu da
   * memoria do processo: exatamente o R11 do roadmap (tela de vitrine parecendo
   * pronta). A demonstracao continua com o cadastro local da PatientsScreen, que
   * anuncia o proprio limite na tela.
   *
   * Na pratica este caminho e inalcancavel: o `createPatientAction` so roda com
   * sessao e clinica ativa, e ai o adapter em uso e o do Supabase. A implementacao
   * existe porque a porta a exige.
   */
  async create(): Promise<never> {
    return this.refuseWrite('create')
  }

  async update(): Promise<never> {
    return this.refuseWrite('update')
  }

  async setArchived(): Promise<never> {
    return this.refuseWrite('setArchived')
  }

  /**
   * Ninguém tem CPF repetido numa base que não persiste.
   *
   * Devolver `null` não é fingir sucesso: a escrita seguinte recusa de qualquer
   * forma, com mensagem própria. Inventar um dono aqui produziria um conflito
   * com um paciente de exemplo — e quem visse a demonstração concluiria que o
   * produto acusa duplicidade onde não há.
   */
  async findCpfOwner(): Promise<null> {
    return null
  }

  private refuseWrite(operation: string): never {
    throw new PatientRepositoryError(
      'unavailable',
      `MockPatientRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}

function matchesQuery(patient: Patient, query: PatientListQuery): boolean {
  const matchesStatus =
    query.status === 'all' ||
    (query.status === 'active' && patient.status !== 'inactive') ||
    (query.status === 'inactive' && patient.status === 'inactive')

  if (!matchesStatus) return false
  if (query.search === null) return true

  const term = query.search.toLowerCase()
  const digits = onlyDigits(query.search)

  return (
    patient.name.toLowerCase().includes(term) ||
    patient.email.toLowerCase().includes(term) ||
    (digits.length >= MIN_PHONE_DIGITS &&
      onlyDigits(patient.phone).startsWith(digits))
  )
}

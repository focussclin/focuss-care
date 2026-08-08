import { getPatientNotes } from '@/lib/mocks/clinic-data'

import type { MedicalRecord } from '../domain/MedicalRecord'
import type { MedicalRecordRepository } from '../domain/MedicalRecordRepository'
import { MedicalRecordRepositoryError } from '../domain/MedicalRecordRepositoryError'

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * As "evolucoes" de demonstracao vem das notas de paciente ja existentes em
 * `clinic-data` — nao ha prontuario ficticio novo sendo inventado. Conteudo
 * clinico plausivel demais numa vitrine e convite a alguem confundir demo com
 * dado real.
 */
export class MockMedicalRecordRepository implements MedicalRecordRepository {
  constructor(private readonly today: Date) {}

  async listCurrentByPatient(
    _clinicId: string,
    patientId: string,
    limit: number,
  ): Promise<MedicalRecord[]> {
    return this.demoRecords(patientId).slice(0, limit)
  }

  async listRecent(_clinicId: string, limit: number): Promise<MedicalRecord[]> {
    return this.demoRecords('pat-1').slice(0, limit)
  }

  async listVersions(
    _clinicId: string,
    recordId: string,
  ): Promise<MedicalRecord[]> {
    return this.demoRecords('pat-1').filter(
      (record) => record.id === recordId,
    )
  }

  /**
   * Escrita nao existe na demonstracao.
   *
   * Devolver um objeto daria "registrado no prontuario" para algo que nao saiu
   * da memoria do processo — e prontuario e o unico lugar do produto onde essa
   * confusao pode virar decisao clinica errada.
   */
  async create(): Promise<never> {
    return this.refuseWrite('create')
  }

  async amend(): Promise<never> {
    return this.refuseWrite('amend')
  }

  /** Sem banco nao ha o que auditar: a leitura tambem e ficticia. */
  async logAccess(): Promise<void> {
    return
  }

  private demoRecords(patientId: string): MedicalRecord[] {
    return getPatientNotes(this.today).map((note, index) => ({
      id: `rec-mock-${note.id}`,
      patientId,
      encounterId: null,
      authorId: `prof-mock-${index}`,
      authorName: note.authorName,
      recordType: 'evolution' as const,
      content: note.content,
      version: 1,
      supersedesId: null,
      signedAt: null,
      createdAt: note.createdAt,
    }))
  }

  private refuseWrite(operation: string): never {
    throw new MedicalRecordRepositoryError(
      'unavailable',
      `MockMedicalRecordRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}

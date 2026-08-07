import { getPatients } from '@/lib/mocks/clinic-data'
import type { Patient } from '@/modules/_shared/domain/types'

import type { PatientRepository } from '../domain/PatientRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * Implementa a mesma porta do adapter real, entao as telas nao sabem qual dos dois
 * esta em uso. Ao ligar o banco, este arquivo pode ser apagado sem tocar em UI.
 */
export class MockPatientRepository implements PatientRepository {
  constructor(private readonly today: Date) {}

  async listByClinic(): Promise<Patient[]> {
    return getPatients(this.today).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    )
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

  private refuseWrite(operation: string): never {
    throw new PatientRepositoryError(
      'unavailable',
      `MockPatientRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}

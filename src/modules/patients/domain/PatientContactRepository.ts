/**
 * Porta dos contatos administrativos vinculados a um paciente.
 *
 * Contato nao e prontuario: e um dado operacional usado pela recepcao para
 * localizar responsavel, familiar ou pessoa autorizada. Ainda assim carrega
 * dados pessoais, portanto clinicId e patientId entram em cada metodo e nunca
 * fazem parte do payload vindo do formulario.
 */
export interface PatientContact {
  id: string
  patientId: string
  name: string
  relationship: string | null
  phone: string | null
  email: string | null
  isLegalGuardian: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PatientContactData {
  name: string
  relationship: string | null
  phone: string | null
  email: string | null
  isLegalGuardian: boolean
}

export interface PatientContactRepository {
  listByPatient(clinicId: string, patientId: string): Promise<PatientContact[]>
  create(
    clinicId: string,
    patientId: string,
    data: PatientContactData,
  ): Promise<PatientContact>
  update(
    clinicId: string,
    patientId: string,
    contactId: string,
    data: PatientContactData,
  ): Promise<PatientContact>
}

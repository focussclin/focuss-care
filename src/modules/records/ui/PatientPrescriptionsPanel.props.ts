import type {
  PrescriptionDto,
  PrescriptionFormValues,
} from '../schemas/prescription.schema'

export interface PatientPrescriptionsPanelProps {
  patientId: string
  prescriptions: readonly PrescriptionDto[]
  onCreate: (
    patientId: string,
    values: PrescriptionFormValues,
  ) => Promise<string | null>
  /** `record.write` — a permissão mais restritiva do produto. */
  canPrescribe: boolean
  /**
   * Tem cadastro em `professionals`?
   *
   * A segunda porta: quem não tem não prescreve, mesmo com o papel. Separada de
   * `canPrescribe` para a tela dizer o que fazer, em vez de um botão
   * desabilitado sem explicação.
   */
  isProfessional: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir lista vazia. */
  loadError?: string | null
}

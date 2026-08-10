import type { LeadDto, LeadFormValues } from '../schemas/lead.schema'

export interface LeadsScreenProps {
  leads: readonly LeadDto[]
  assignees: readonly { id: string; name: string }[]
  onSubmit: (
    values: LeadFormValues,
    leadId: string | null,
  ) => Promise<string | null>
  onMove: (leadId: string, stage: LeadFormValues['stage']) => Promise<string | null>
  /**
   * Converte o lead em PACIENTE, e devolve para onde ir.
   *
   * Assinatura diferente de `onMove` de propósito: esta cria uma ficha clínica,
   * e o sucesso precisa dizer QUAL — sem isso a tela anuncia "convertido" e
   * deixa a recepção procurando o paciente na lista para confirmar.
   */
  onConvert: (
    leadId: string,
  ) => Promise<{ ok: true; patientHref: string } | { ok: false; message: string }>
  isLive: boolean
  schemaPending?: boolean
}

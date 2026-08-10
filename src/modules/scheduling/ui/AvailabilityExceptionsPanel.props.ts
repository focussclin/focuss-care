import type {
  AvailabilityExceptionDto,
  AvailabilityExceptionFormValues,
} from '../schemas/availabilityException.schema'

export interface AvailabilityExceptionsPanelProps {
  exceptions: readonly AvailabilityExceptionDto[]
  /** Profissionais da clínica, para bloquear a agenda de um só. */
  professionals: readonly { id: string; name: string }[]
  onCreate: (values: AvailabilityExceptionFormValues) => Promise<string | null>
  onRemove: (exceptionId: string) => Promise<string | null>
  /** `appointment.write` — quem marca é quem bloqueia. */
  canManage: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir "sem bloqueios". */
  loadError?: string | null
}

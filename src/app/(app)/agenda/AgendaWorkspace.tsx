'use client'

import type { PatientOptionDto } from '@/modules/patients/schemas/patientPicker.schema'
import { PatientPicker } from '@/modules/patients/ui/PatientPicker'
import {
  AgendaScreen,
  type AgendaScreenProps,
} from '@/modules/scheduling/ui/AgendaScreen'

/**
 * Onde a agenda e o seletor de paciente se encontram.
 *
 * # Por que este arquivo existe, e nao um `renderPatientField` na page
 *
 * `AgendaScreen` e `'use client'`, e a `page.tsx` e Server Component. Entre os
 * dois passa apenas o que o React consegue SERIALIZAR — e funcao nao e uma
 * dessas coisas. Montar o slot direto na rota (`renderPatientField={() => …}`)
 * compila, passa no `typecheck` e quebra em runtime na primeira renderizacao
 * com sessao: "Functions cannot be passed directly to Client Components".
 *
 * A composicao continua fora dos dois modulos, que era o ponto da regra 4:
 * `scheduling` nao alcanca o interior de `patients`. So mudou de lado da
 * fronteira — este arquivo esta em `app/`, exatamente como a rota, e e o cliente
 * quem monta a funcao.
 *
 * O resto das props atravessa intacto: sao dados, e dado serializa.
 */
export interface AgendaWorkspaceProps
  extends Omit<AgendaScreenProps, 'renderPatientField'> {
  /** Estado inicial do seletor — o campo vazio mostra estes. */
  patientOptions: readonly PatientOptionDto[]
  /**
   * Ha banco por tras da BUSCA de pacientes.
   *
   * Separado do `isLive` da agenda de proposito: sao duas fontes de dados
   * distintas, e presumir que uma responde pela outra e o tipo de atalho que
   * faz a tela mentir quando uma das duas cai.
   */
  patientSearchIsLive: boolean
}

export function AgendaWorkspace({
  patientOptions,
  patientSearchIsLive,
  ...screen
}: AgendaWorkspaceProps) {
  return (
    <AgendaScreen
      {...screen}
      renderPatientField={(control) => (
        <PatientPicker
          initialOptions={patientOptions}
          value={control.value}
          onChange={control.onChange}
          error={control.error}
          isLive={patientSearchIsLive}
        />
      )}
    />
  )
}

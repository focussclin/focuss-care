import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import { buildCallPanel } from '@/modules/encounters/application/callPanel'
import { getEncounterRepository } from '@/modules/encounters/infrastructure/repository'
import { CallPanelScreen } from '@/modules/encounters/ui/CallPanelScreen'

export const metadata: Metadata = {
  title: 'Painel de chamada',
  description: 'Tela para a sala de espera com a chamada atual.',
  // Painel público por natureza — indexá-lo publicaria a rota interna.
  robots: { index: false, follow: false },
}

/**
 * Painel de chamada para a TV da sala de espera.
 *
 * # O que esta rota é, e o que ela não é
 *
 * Não é uma segunda fila. A fila é `/atendimentos`, e é lá que se dá entrada,
 * chama, inicia e encerra. Esta rota **só lê** a mesma `waiting_queue`, pela
 * mesma porta (`listQueue`), e a projeta para quem está sentado na sala de
 * espera. Nenhum método novo de repositório nasceu aqui: um segundo caminho de
 * escrita para a mesma fila é como duas telas passam a discordar sobre quem foi
 * chamado.
 *
 * # Por que continua exigindo sessão
 *
 * A TV mostra dado de paciente, ainda que abreviado. Quem abre o painel é a
 * recepção, no computador que já está logado — deixar a rota pública para
 * economizar esse passo colocaria a fila da clínica em uma URL adivinhável.
 * `encounter.read` é a mesma permissão de `/atendimentos`: quem pode ver a fila
 * pode projetá-la.
 *
 * O recorte de privacidade — primeiro nome e iniciais, sem motivo e sem
 * identificador — está em `application/callPanel.ts`, com o porquê.
 */
export default async function DisplayPage() {
  /*
   * `connection()` porque a chamada atual é o estado do minuto: prerenderizar
   * congelaria na parede o nome de quem foi chamado no momento do build.
   */
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'encounter.read')) forbidden()

  const today = startOfDay(new Date())
  const source = await getEncounterRepository(today)
  const queue = await source.repository.listQueue(source.clinicId, today)

  const panel = buildCallPanel(queue)

  return (
    <CallPanelScreen
      nowCalling={
        panel.nowCalling
          ? {
              id: panel.nowCalling.id,
              displayName: panel.nowCalling.displayName,
              professionalName: panel.nowCalling.professionalName,
            }
          : null
      }
      previousCalls={panel.previousCalls.map((call) => ({
        id: call.id,
        displayName: call.displayName,
        professionalName: call.professionalName,
      }))}
      waitingCount={panel.waitingCount}
      isLive={source.isLive}
    />
  )
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import { billingRepositoryFor } from '@/modules/billing/infrastructure/repository'

import { outstandingCents } from './visit-stage'

/**
 * O paciente pode entrar na consulta? — etapa 3 de
 * `PAGAMENTO_ANTES_DA_CONSULTA.md`.
 *
 * # Este arquivo AINDA NÃO BLOQUEIA NINGUÉM
 *
 * Ele é o portão em **modo observação**: consulta o saldo, registra quem seria
 * barrado, e deixa passar. A etapa 6 liga a recusa, e o único ponto que muda é
 * quem chama — a regra e o critério já são estes.
 *
 * Medir antes de travar não é cautela decorativa. `/atendimentos` é a tela mais
 * usada da clínica, e uma regra nova que recuse chamada de paciente no primeiro
 * dia, sem ninguém saber quantas chamadas ela pega, é do tipo que se descobre
 * com a recepção ao telefone. O log responde "quantas vezes por dia isso
 * aconteceria" antes de a resposta custar caro.
 *
 * # Por que em `lib/`, e não em `encounters`
 *
 * A pergunta cruza `encounters` (quem está na fila) e `billing` (quanto se
 * deve). Pôr em qualquer um faria um módulo alcançar o interior do outro — a
 * regra 4. É o mesmo caminho de `appointment-progress.ts`, que também mora aqui
 * e também consome a porta do outro módulo em vez de tocar as tabelas dele.
 *
 * # Best-effort, e o porquê importa
 *
 * Falha de leitura **libera**. Um Postgres indisponível não pode virar clínica
 * parada com paciente na sala de espera — é a mesma escolha já feita para a cota
 * do plano, o estado comercial da clínica e o nível de garantia da sessão.
 * Quando a etapa 6 ligar a recusa, esta linha continua valendo: o portão erra
 * para o lado de atender.
 */

type Client = SupabaseClient<Database>

/** Em que transição o portão foi consultado. Só para o registro. */
export type PaymentGateStep = 'call' | 'start'

export interface PaymentGateVerdict {
  /** Quanto o paciente ainda deve deste atendimento, em centavos. */
  outstandingCents: number
  /**
   * A etapa 6 recusaria esta transição?
   *
   * Hoje ninguém age sobre isto — ver o cabeçalho.
   */
  wouldBlock: boolean
  /**
   * Por que o portão não tem opinião, quando não tem.
   *
   * `walk-in` é encaixe: sem agendamento não há cobrança ligada a ele, e isso
   * não é dívida. `unavailable` é leitura que falhou.
   */
  skipped: 'walk-in' | 'unavailable' | null
}

export interface PaymentGateInput {
  /** Cliente com a sessão de quem agiu — a RLS vale nesta leitura também. */
  client: Client
  /** Clínica ativa, resolvida pelo banco. Nunca veio do cliente. */
  clinicId: string
  /**
   * O agendamento que originou a fila, ou `null`.
   *
   * `null` é **encaixe**, e é rotina de clínica. Não há agendamento a que
   * pendurar cobrança, e cobrar de quem chegou sem hora marcada é outro fluxo —
   * não este.
   */
  appointmentId: string | null
  step: PaymentGateStep
}

/**
 * Consulta o portão e registra o que aconteceria.
 *
 * Nunca lança: quem chama está no meio de uma transição que já aconteceu, e um
 * erro aqui não pode desfazê-la. Mesmo desenho de `syncAppointmentProgress` e de
 * `recordAuditEvent`.
 */
export async function observePaymentGate({
  client,
  clinicId,
  appointmentId,
  step,
}: PaymentGateInput): Promise<PaymentGateVerdict> {
  if (!appointmentId) {
    return { outstandingCents: 0, wouldBlock: false, skipped: 'walk-in' }
  }

  try {
    const charges = await billingRepositoryFor(client).listChargesForAppointment(
      clinicId,
      appointmentId,
    )

    const outstanding = outstandingCents(charges)
    const wouldBlock = outstanding > 0

    if (wouldBlock) {
      /*
       * O que entra no log: a transição, o valor e quantas cobranças o
       * compõem. **Nem paciente, nem profissional, nem descrição do item** — o
       * que se cobra pode dizer o que a pessoa tem, e este log é operacional,
       * não clínico. O `appointmentId` basta para reconstituir o caso a partir
       * do banco, por quem já tem acesso a ele.
       */
      console.info('[payment-gate] observado: seria barrado', {
        step,
        appointmentId,
        outstandingCents: outstanding,
        charges: charges.length,
      })
    }

    return { outstandingCents: outstanding, wouldBlock, skipped: null }
  } catch (cause) {
    console.error('[payment-gate] saldo indisponivel — liberando', {
      step,
      appointmentId,
      kind: cause instanceof Error ? cause.name : typeof cause,
    })

    return { outstandingCents: 0, wouldBlock: false, skipped: 'unavailable' }
  }
}

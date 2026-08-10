import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isBillingRepositoryError } from '../domain/BillingRepositoryError'
import { billingMessages } from '../schemas/billing.schema'

/**
 * Falha de escrita do financeiro -> `Result` com mensagem em pt-BR.
 *
 * **O log recebe apenas `reason` e `code`.** A mensagem do Postgres pode ecoar
 * valores enviados — descrição do item, observação do pagamento — e essas
 * carregam nome de paciente com frequência.
 */
export function toBillingFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isBillingRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      /*
       * As três primeiras saem como 'conflict': para o pipeline, todas são "o
       * estado atual não permite esta operação". A mensagem é que muda, e cada
       * uma diz o próximo passo — conferir o valor, pedir estorno, fechar o
       * caixa aberto.
       */
      case 'overpayment':
        return err<F>('conflict', billingMessages.overpayment)
      case 'invoice-paid':
        return err<F>('conflict', billingMessages.invoicePaid)
      case 'payable-paid':
        return err<F>('conflict', billingMessages.payablePaid)
      case 'cash-session-conflict':
        return err<F>('conflict', billingMessages.cashSessionOpen)
      case 'not-found':
        return err<F>('not-found', billingMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', billingMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', billingMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', billingMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', billingMessages.unexpected)
}

'use server'

import { can, rolesWith } from '@/lib/auth/permissions'
import { createBillingNotification } from '@/lib/notifications/operational'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { toInvoiceDto } from '../application/toBillingDto'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  createInvoiceSchema,
  type CreateInvoiceInput,
  type InvoiceDto,
} from '../schemas/billing.schema'

type Field = 'patientId' | 'items' | 'discount'

/**
 * Cria a cobrança — feature **B-01**.
 *
 * **Cobrança, não documento fiscal.** Nasce em `draft` e sem número: emitir
 * exige `next_document_number` e a RPC `issue_invoice`, cujas assinaturas não
 * são verificáveis daqui (bloqueio B1). A tela diz isso onde estaria o botão.
 *
 * Nenhum total vem do formulário: o schema recalcula o subtotal a partir de
 * quantidade e preço unitário, e o adapter refaz a conta antes de gravar. Quem
 * controla o total controla quanto o paciente deve.
 */
const runCreateInvoice = createAction<CreateInvoiceInput, InvoiceDto, Field>({
  name: 'invoice.create',
  schema: createInvoiceSchema,
  roles: rolesWith('invoice.write'),
  messages: {
    forbidden: billingMessages.forbidden,
    validation: billingMessages.invalidFields,
    unavailable: billingMessages.unavailable,
    unexpected: billingMessages.unexpected,
  },
  revalidatePaths: ['/financeiro'],

  afterSuccess: async (output, _input, context) => {
    await createBillingNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'invoice_created',
      patientName: output.patientName,
      amountCents: output.totalCents,
    })
  },

  handler: async (input, context) => {
    const repository = billingRepositoryFor(context.supabase)

    try {
      /*
       * O agendamento precisa ser desta clínica E deste paciente.
       *
       * `invoices.appointment_id` é FK de coluna única: ela prova que a linha
       * existe em algum lugar do banco, não que pertence a este tenant. A RLS
       * protege a linha de `invoices`, não o conteúdo deste campo — sem a
       * checagem, um id de outra clínica gravaria uma cobrança com o
       * `clinic_id` certo pendurada no atendimento errado.
       *
       * A segunda condição não é redundante: dentro da mesma clínica, o
       * agendamento de outro paciente também passaria pela FK, e a cobrança
       * apareceria na fila de quem não a deve.
       */
      /*
       * Desconto é permissão à parte — e a checagem é aqui, não no `roles` da
       * action.
       *
       * `roles` decide quem PODE EXECUTAR a action inteira; abater valor é uma
       * condição sobre a ENTRADA. Pôr `invoice.discount` no `roles` tiraria da
       * recepção o direito de emitir qualquer cobrança, que é justamente o que
       * ela precisa fazer.
       *
       * Conta o desconto do total E o dos itens: descontar R$ 150 num item de
       * R$ 250 abate o mesmo dinheiro que descontar R$ 150 no rodapé, e uma
       * regra que só olhasse o rodapé seria contornada pelo formulário.
       */
      const discountedCents =
        input.discountCents +
        input.items.reduce((total, item) => total + item.discountCents, 0)

      if (discountedCents > 0 && !can(context.role, 'invoice.discount')) {
        return err<Field>('forbidden', billingMessages.discountForbidden)
      }

      if (
        input.appointmentId !== null &&
        !(await repository.appointmentBelongsTo(
          context.clinicId,
          input.appointmentId,
          input.patientId,
        ))
      ) {
        return err<Field>('not-found', billingMessages.appointmentMismatch)
      }

      const invoice = await repository.createInvoice(
        context.clinicId,
        {
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          discountCents: input.discountCents,
          dueDate: input.dueDate,
          notes: input.notes,
          items: input.items,
        },
        context.userId,
      )

      return ok<InvoiceDto>(toInvoiceDto(invoice))
    } catch (cause) {
      return toBillingFailure<Field>('invoice.create', cause)
    }
  },

  /**
   * Valores e contagem entram; **descrições de item, não**.
   *
   * "Consulta de retorno — ortopedia" diz a especialidade que o paciente
   * procurou, e `audit_log` é legível pela operação inteira e append-only. O
   * valor cobrado é dado administrativo; o que foi cobrado pode ser dado de
   * saúde. Os itens continuam em `invoice_items`, alcançáveis por `entity_id`.
   */
  audit: (output) => ({
    action: 'invoice.created',
    entityType: 'invoice',
    entityId: output.id,
    after: {
      total_cents: output.totalCents,
      items: output.items.length,
      status: output.status,
    },
  }),
})

export async function createInvoiceAction(
  rawInput: unknown,
): Promise<ActionResult<InvoiceDto, Field>> {
  return runCreateInvoice(rawInput)
}

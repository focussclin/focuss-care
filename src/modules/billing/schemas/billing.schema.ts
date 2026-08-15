import { z } from 'zod'

import { parseCents } from '@/lib/utils/money'
import type { PaymentMethod } from '@/lib/supabase/database.types'

export const billingMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  patientRequired: 'Selecione o paciente da cobrança.',
  itemsRequired: 'Inclua pelo menos um item na cobrança.',
  descriptionRequired: 'Descreva o que está sendo cobrado.',
  quantityInvalid: 'A quantidade precisa ser um número inteiro de 1 a 999.',
  amountInvalid: 'Informe um valor válido, como 150,00.',
  amountPositive: 'O valor precisa ser maior que zero.',
  discountTooBig: 'O desconto não pode ser maior que o valor dos itens.',
  /**
   * Recusa de pagamento acima do saldo.
   *
   * Quase sempre é erro de digitação. A mensagem diz o que fazer — conferir o
   * valor — em vez de só negar, porque a pessoa está com o paciente na frente.
   */
  overpayment:
    'O valor é maior que o saldo desta cobrança. Confira o quanto ainda falta pagar.',
  invoicePaid:
    'Esta cobrança já recebeu pagamento e não pode ser cancelada. Registre um estorno com o responsável financeiro.',
  cashSessionOpen: 'Já existe um caixa aberto nesta clínica.',
  cashSessionClosed: 'Este caixa não está mais aberto.',
  payablePaid: 'Esta despesa já foi baixada e não pode ser baixada novamente.',
  payableDateRequired: 'Informe uma data de vencimento válida.',
  payableDescriptionRequired: 'Descreva a despesa.',
  payableUnavailable:
    'As contas a pagar ainda não estão disponíveis nesta conexão financeira.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  /**
   * O agendamento informado não é desta clínica, ou é de outro paciente.
   *
   * Não diz qual das duas: quem manda um id que não é seu não deve descobrir
   * daqui se ele existe em outra clínica.
   */
  appointmentMismatch:
    'Este agendamento não pertence a este paciente. Confira o horário selecionado.',
  /**
   * Desconto sem permissão.
   *
   * Diz o que fazer — emitir sem o desconto, ou chamar quem pode — porque a
   * pessoa está com o paciente na frente e precisa resolver agora.
   */
  discountForbidden:
    'Você não pode aplicar desconto. Emita a cobrança pelo valor cheio ou chame um responsável.',
  forbidden: 'Você não tem permissão para movimentar o financeiro.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a operação agora. Tente novamente.',
  /**
   * Emissão fiscal indisponível.
   *
   * Texto exibido no lugar do botão. Diz o que falta e que não é falha de quem
   * está usando — a cobrança funciona, o documento numerado é que não sai.
   */
  issueUnavailable:
    'A emissão de documento fiscal numerado ainda não está disponível: depende de uma função do banco de dados cuja assinatura não pôde ser verificada. As cobranças abaixo são registro interno e continuam valendo para controle e recebimento.',
  /**
   * O mesmo bloqueio, dito dentro do recibo.
   *
   * O aviso da tela de trás não acompanha o comprovante impresso, e uma clínica
   * que trate este papel como nota fiscal deixa de emitir a nota.
   */
  receiptNotFiscal:
    'Este é um comprovante interno de recebimento e NÃO é documento fiscal. A emissão de nota fiscal numerada não está disponível nesta instalação.',
} as const

/** Formas de pagamento que a tela oferece, com o nome que a recepção usa. */
export const paymentMethodOptions = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Outro' },
] as const satisfies readonly { value: PaymentMethod; label: string }[]

const methodValues = paymentMethodOptions.map((option) => option.value)

/**
 * Texto de dinheiro -> centavos, no schema.
 *
 * A conversão acontece no SERVIDOR, e não no formulário: o que chega aqui é
 * texto não confiável, e `parseCents` devolvendo `null` precisa virar erro de
 * validação — não zero. Aceitar ilegível como zero registraria um pagamento de
 * nada como se fosse um pagamento.
 */
function moneyField(options: { min?: number } = {}) {
  return z
    .string()
    .transform((value, ctx) => {
      const cents = parseCents(value)

      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: billingMessages.amountInvalid })
        return z.NEVER
      }

      if (cents < 0) {
        ctx.addIssue({ code: 'custom', message: billingMessages.amountInvalid })
        return z.NEVER
      }

      if (options.min !== undefined && cents < options.min) {
        ctx.addIssue({ code: 'custom', message: billingMessages.amountPositive })
        return z.NEVER
      }

      return cents
    })
}

const invoiceItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, billingMessages.descriptionRequired)
    .max(200, billingMessages.invalidFields),
  quantity: z.coerce
    .number()
    .int(billingMessages.quantityInvalid)
    .min(1, billingMessages.quantityInvalid)
    .max(999, billingMessages.quantityInvalid),
  unitPrice: moneyField({ min: 1 }),
  discount: moneyField(),
})

export const createInvoiceSchema = z
  .object({
    patientId: z.uuid(billingMessages.patientRequired),
    /**
     * O agendamento que originou a cobrança.
     *
     * Opcional, e continua sendo o caso comum não ter: cobrança avulsa, produto
     * de balcão, encaixe. Quem manda o campo é a recepção cobrando um horário
     * marcado — e é esse vínculo que permite perguntar depois se ESTE
     * atendimento está pago.
     *
     * Aceita ausente e vazio: o formulário manda `''` quando o campo existe e
     * ninguém escolheu, e um `''` chegando como uuid inválido viraria erro de
     * validação numa cobrança que está correta.
     */
    appointmentId: z
      .union([z.uuid(billingMessages.unexpected), z.literal('')])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
    items: z.array(invoiceItemSchema).min(1, billingMessages.itemsRequired),
    discount: moneyField(),
    dueDate: z.string().optional(),
    notes: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? '')
      .transform((value) => (value === '' ? null : value)),
  })
  .transform((value, ctx) => {
    /*
     * O subtotal é calculado AQUI, e não recebido.
     *
     * Quem controla o total controla quanto o paciente deve. O formulário mostra
     * uma soma para conferência; o número que vale é este, refeito no servidor a
     * partir de quantidade e preço unitário.
     */
    const subtotalCents = value.items.reduce(
      (total, item) =>
        total + Math.max(item.quantity * item.unitPrice - item.discount, 0),
      0,
    )

    if (value.discount > subtotalCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount'],
        message: billingMessages.discountTooBig,
      })
      return z.NEVER
    }

    const dueDate = parseDateOnly(value.dueDate)

    return {
      patientId: value.patientId,
      appointmentId: value.appointmentId,
      discountCents: value.discount,
      dueDate,
      notes: value.notes,
      items: value.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPrice,
        discountCents: item.discount,
      })),
    }
  })

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export const cancelInvoiceSchema = z.object({
  invoiceId: z.uuid(billingMessages.unexpected),
  reason: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value)),
})

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>

export const registerPaymentSchema = z.object({
  invoiceId: z.uuid(billingMessages.unexpected),
  amount: moneyField({ min: 1 }),
  method: z.enum(methodValues),
  notes: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value)),
})

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>

export const openCashSessionSchema = z.object({
  /** Troco inicial. Zero é legítimo: caixa pode abrir vazio. */
  openingAmount: moneyField(),
})

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>

export const cashEntrySchema = z.object({
  sessionId: z.uuid(billingMessages.unexpected),
  kind: z.enum(['in', 'out']),
  amount: moneyField({ min: 1 }),
  description: z
    .string()
    .trim()
    .min(1, billingMessages.descriptionRequired)
    .max(200, billingMessages.invalidFields),
})

export type CashEntryInput = z.infer<typeof cashEntrySchema>

export const closeCashSessionSchema = z.object({
  sessionId: z.uuid(billingMessages.unexpected),
  /** O que foi contado na gaveta. Zero é legítimo. */
  countedAmount: moneyField(),
})

export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>

const payableDateField = z.string().transform((value, ctx) => {
  const parsed = parseDateOnly(value)

  if (!parsed) {
    ctx.addIssue({ code: 'custom', message: billingMessages.payableDateRequired })
    return z.NEVER
  }

  return parsed
})

export const createPayableSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, billingMessages.payableDescriptionRequired)
    .max(200, billingMessages.invalidFields),
  category: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value.slice(0, 100))),
  supplier: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value.slice(0, 160))),
  amount: moneyField({ min: 1 }),
  dueDate: payableDateField,
  isRecurring: z.boolean().default(false),
  notes: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value.slice(0, 500))),
})

export type CreatePayableInput = z.infer<typeof createPayableSchema>

export const settlePayableSchema = z.object({
  payableId: z.uuid(billingMessages.unexpected),
  method: z.enum(methodValues),
})

export type SettlePayableInput = z.infer<typeof settlePayableSchema>

/** 'YYYY-MM-DD' -> Date local, ou null. Data impossível vira null, não erro. */
function parseDateOnly(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)

  return parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null
}

// ---------------------------------------------------------------------------
// O que atravessa a fronteira da Server Action
// ---------------------------------------------------------------------------

export interface InvoiceItemDto {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
  totalCents: number
}

export interface InvoiceDto {
  id: string
  patientName: string
  /** O agendamento que originou a cobrança. Nulo em cobrança avulsa. */
  appointmentId: string | null
  number: number | null
  status: string
  totalCents: number
  paidCents: number
  /** `total − pago`, já calculado: a tela não recalcula dinheiro. */
  remainingCents: number
  dueDate: string | null
  createdAt: string
  items: readonly InvoiceItemDto[]
  /** Os recebimentos individuais — cada um rende um recibo. */
  payments: readonly InvoicePaymentDto[]
}

export interface InvoicePaymentDto {
  id: string
  amountCents: number
  method: string
  paidAt: string
  notes: string | null
}

/**
 * Como a clínica se identifica no recibo.
 *
 * **Sem `id`.** Nada no comprovante o usa, e o identificador interno do tenant
 * não tem por que atravessar a fronteira só para ser impresso. A leitura é
 * tenant-scoped na rota, por `getClinicSettingsRepository`.
 */
export interface ReceiptClinicDto {
  tradeName: string
  legalName: string | null
  cnpj: string | null
}

export interface CashEntryDto {
  id: string
  kind: 'in' | 'out'
  amountCents: number
  description: string
  createdAt: string
}

export interface CashSessionDto {
  id: string
  openedAt: string
  openedByName: string
  openingAmountCents: number
  expectedCents: number
  entries: readonly CashEntryDto[]
}

export interface FinanceSummaryDto {
  receivedCents: number
  openCents: number
  openInvoices: number
  issuedInvoices: number
}

export interface PayableDto {
  id: string
  description: string
  category: string | null
  supplier: string | null
  amountCents: number
  dueDate: string
  paidAt: string | null
  paidAmountCents: number
  method: PaymentMethod | null
  isRecurring: boolean
  status: 'open' | 'overdue' | 'paid'
  notes: string | null
}

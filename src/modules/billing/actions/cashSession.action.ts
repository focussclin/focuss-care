'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createCashNotification } from '@/lib/notifications/operational'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  cashEntrySchema,
  closeCashSessionSchema,
  openCashSessionSchema,
  type CashEntryInput,
  type CloseCashSessionInput,
  type OpenCashSessionInput,
} from '../schemas/billing.schema'

/**
 * O caixa — feature **B-01**.
 *
 * As três operações do turno moram no mesmo arquivo porque são a mesma
 * conversa: abre com um valor, recebe lançamentos, fecha com a contagem. Separar
 * em três arquivos espalharia um fluxo que só faz sentido inteiro.
 *
 * Todas exigem `cash.manage` — `owner`, `admin` e `finance` pela matriz de I-05.
 * A recepção registra pagamento, mas não abre nem fecha a gaveta: são
 * responsabilidades diferentes, e é essa separação que torna a conferência útil.
 */

const messages = {
  forbidden: billingMessages.forbidden,
  validation: billingMessages.invalidFields,
  unavailable: billingMessages.unavailable,
  unexpected: billingMessages.unexpected,
}

interface SessionResult {
  id: string
  openingAmountCents: number
}

const runOpen = createAction<OpenCashSessionInput, SessionResult, 'openingAmount'>(
  {
    name: 'cash.open',
    schema: openCashSessionSchema,
    roles: rolesWith('cash.manage'),
    messages,
    revalidatePaths: ['/financeiro'],

    afterSuccess: async (output, _input, context) => {
      await createCashNotification({
        client: context.supabase,
        clinicId: context.clinicId,
        userId: context.userId,
        kind: 'opened',
        amountCents: output.openingAmountCents,
      })
    },

    handler: async (input, context) => {
      const repository = billingRepositoryFor(context.supabase)

      try {
        const session = await repository.openCashSession(
          context.clinicId,
          input.openingAmount,
          context.userId,
        )

        return ok<SessionResult>({
          id: session.id,
          openingAmountCents: session.openingAmountCents,
        })
      } catch (cause) {
        return toBillingFailure<'openingAmount'>('cash.open', cause)
      }
    },

    audit: (output) => ({
      action: 'cash_session.opened',
      entityType: 'cash_session',
      entityId: output.id,
      after: { opening_amount_cents: output.openingAmountCents },
    }),
  },
)

export async function openCashSessionAction(
  rawInput: unknown,
): Promise<ActionResult<SessionResult, 'openingAmount'>> {
  return runOpen(rawInput)
}

interface EntryResult {
  id: string
  kind: string
  amountCents: number
}

const runEntry = createAction<CashEntryInput, EntryResult, 'amount' | 'description'>(
  {
    name: 'cash.entry',
    schema: cashEntrySchema,
    roles: rolesWith('cash.manage'),
    messages,
    revalidatePaths: ['/financeiro'],

    afterSuccess: async (output, _input, context) => {
      await createCashNotification({
        client: context.supabase,
        clinicId: context.clinicId,
        userId: context.userId,
        kind: 'entry',
        amountCents: output.amountCents,
        entryKind: output.kind,
      })
    },

    handler: async (input, context) => {
      const repository = billingRepositoryFor(context.supabase)

      try {
        const entry = await repository.addCashEntry(
          context.clinicId,
          input.sessionId,
          {
            kind: input.kind,
            amountCents: input.amount,
            description: input.description,
          },
          context.userId,
        )

        return ok<EntryResult>({
          id: entry.id,
          kind: entry.kind,
          amountCents: entry.amountCents,
        })
      } catch (cause) {
        return toBillingFailure<'amount' | 'description'>('cash.entry', cause)
      }
    },

    /** A descrição fica na tabela, não no log: é texto livre da recepção. */
    audit: (output) => ({
      action: 'cash_entry.created',
      entityType: 'cash_entry',
      entityId: output.id,
      after: { kind: output.kind, amount_cents: output.amountCents },
    }),
  },
)

export async function addCashEntryAction(
  rawInput: unknown,
): Promise<ActionResult<EntryResult, 'amount' | 'description'>> {
  return runEntry(rawInput)
}

interface CloseResult {
  id: string
  expectedCents: number
  countedCents: number
  differenceCents: number
}

const runClose = createAction<CloseCashSessionInput, CloseResult, 'countedAmount'>(
  {
    name: 'cash.close',
    schema: closeCashSessionSchema,
    roles: rolesWith('cash.manage'),
    messages,
    revalidatePaths: ['/financeiro'],

    afterSuccess: async (output, _input, context) => {
      await createCashNotification({
        client: context.supabase,
        clinicId: context.clinicId,
        userId: context.userId,
        kind: 'closed',
        differenceCents: output.differenceCents,
      })
    },

    handler: async (input, context) => {
      const repository = billingRepositoryFor(context.supabase)

      try {
        const session = await repository.closeCashSession(
          context.clinicId,
          input.sessionId,
          input.countedAmount,
          context.userId,
        )

        return ok<CloseResult>({
          id: session.id,
          expectedCents: session.expectedCents ?? 0,
          countedCents: session.countedCents ?? 0,
          differenceCents: session.differenceCents ?? 0,
        })
      } catch (cause) {
        return toBillingFailure<'countedAmount'>('cash.close', cause)
      }
    },

    /**
     * A diferença entra no log **como está**, inclusive negativa.
     *
     * É o número que a conferência procura. Registrar só quando fecha certo
     * transformaria a auditoria de caixa numa lista de dias bons.
     */
    audit: (output) => ({
      action: 'cash_session.closed',
      entityType: 'cash_session',
      entityId: output.id,
      after: {
        expected_cents: output.expectedCents,
        counted_cents: output.countedCents,
        difference_cents: output.differenceCents,
      },
    }),
  },
)

export async function closeCashSessionAction(
  rawInput: unknown,
): Promise<ActionResult<CloseResult, 'countedAmount'>> {
  return runClose(rawInput)
}

'use client'

import { ArrowDownLeft, ArrowUpRight, WalletCards } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { TextField } from '@/components/ui/text-field'
import { formatCents } from '@/lib/utils/money'
import { formatTime } from '@/lib/utils/date'

import type { CashSessionDto } from '../schemas/billing.schema'

export interface CashSessionCardProps {
  session: CashSessionDto | null
  canManage: boolean
  isLive: boolean
  onOpen: (openingAmount: string) => Promise<string | null>
  onEntry: (values: {
    sessionId: string
    kind: 'in' | 'out'
    amount: string
    description: string
  }) => Promise<string | null>
  onClose: (values: {
    sessionId: string
    countedAmount: string
  }) => Promise<string | null>
}

/**
 * O caixa do dia — feature **B-01**.
 *
 * # Por que o esperado aparece antes do fechamento
 *
 * A pessoa que fecha o caixa precisa contar a gaveta **antes** de ver o valor
 * esperado — senão o número na tela vira a resposta, e a conferência deixa de
 * conferir. Mas esconder o esperado o dia inteiro impede a recepção de perceber
 * um lançamento errado enquanto ainda dá para corrigir.
 *
 * A escolha: o esperado fica visível durante o turno, e o campo de contagem
 * aparece vazio, sem sugestão. Quem quiser copiar o número, copia — o registro
 * de quem fechou e de qual diferença foi aceita continua no log.
 */
export function CashSessionCard({
  session,
  canManage,
  isLive,
  onOpen,
  onEntry,
  onClose,
}: CashSessionCardProps) {
  const [isBusy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openingAmount, setOpeningAmount] = useState('0,00')
  const [countedAmount, setCountedAmount] = useState('')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryDescription, setEntryDescription] = useState('')

  async function run(operation: () => Promise<string | null>) {
    setError(null)
    setBusy(true)

    try {
      const failure = await operation()
      if (failure) setError(failure)
      return failure
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(() => onOpen(openingAmount))
  }

  async function handleEntry(kind: 'in' | 'out') {
    if (!session) return

    const failure = await run(() =>
      onEntry({
        sessionId: session.id,
        kind,
        amount: entryAmount,
        description: entryDescription,
      }),
    )

    if (!failure) {
      setEntryAmount('')
      setEntryDescription('')
    }
  }

  async function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return

    await run(() => onClose({ sessionId: session.id, countedAmount }))
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Caixa"
        description={
          session
            ? `Aberto às ${formatTime(new Date(session.openedAt))} por ${session.openedByName}`
            : 'Nenhum turno aberto agora.'
        }
      />

      {error ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {session === null ? (
        <div className="px-5 pb-5">
          {canManage && isLive ? (
            <form onSubmit={handleOpen} className="flex flex-col gap-4">
              <TextField
                label="Troco inicial"
                value={openingAmount}
                inputMode="decimal"
                onChange={(event) => setOpeningAmount(event.target.value)}
                hint="Quanto há na gaveta ao abrir. Zero é uma resposta válida."
              />
              <Button type="submit" isLoading={isBusy}>
                <WalletCards aria-hidden className="size-4" />
                Abrir caixa
              </Button>
            </form>
          ) : (
            <p className="text-aux text-muted">
              O caixa é aberto por quem responde pelo financeiro.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-5 pb-5">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-label text-muted">Abertura</dt>
              <dd className="mt-1 text-aux font-semibold text-foreground">
                {formatCents(session.openingAmountCents)}
              </dd>
            </div>
            <div>
              <dt className="text-label text-muted">Esperado na gaveta</dt>
              <dd className="mt-1 text-card-title font-semibold text-foreground">
                {formatCents(session.expectedCents)}
              </dd>
            </div>
          </dl>

          {session.entries.length > 0 ? (
            <ul className="divide-y divide-border-card border-y border-border-card">
              {session.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {entry.kind === 'in' ? (
                      <ArrowUpRight
                        aria-hidden
                        className="size-4 shrink-0 text-status-positive"
                      />
                    ) : (
                      <ArrowDownLeft
                        aria-hidden
                        className="size-4 shrink-0 text-danger"
                      />
                    )}
                    <span className="truncate text-aux text-foreground">
                      {entry.description}
                    </span>
                  </span>
                  <span
                    className={
                      entry.kind === 'in'
                        ? 'text-aux font-semibold text-status-positive'
                        : 'text-aux font-semibold text-danger'
                    }
                  >
                    {entry.kind === 'in' ? '+' : '−'}{' '}
                    {formatCents(entry.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {canManage && isLive ? (
            <>
              <div className="flex flex-col gap-3">
                <TextField
                  label="Lançamento avulso"
                  value={entryDescription}
                  onChange={(event) => setEntryDescription(event.target.value)}
                  placeholder="Troco, sangria, compra de material…"
                  maxLength={200}
                />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full sm:w-40">
                    <TextField
                      label="Valor"
                      value={entryAmount}
                      inputMode="decimal"
                      placeholder="0,00"
                      onChange={(event) => setEntryAmount(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleEntry('in')}
                  >
                    Entrada
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleEntry('out')}
                  >
                    Saída
                  </Button>
                </div>
              </div>

              <form
                onSubmit={handleClose}
                className="flex flex-col gap-3 border-t border-border-card pt-5"
              >
                {/*
                  Campo VAZIO, sem sugestão: contar a gaveta e depois digitar é o
                  que faz a conferência conferir. Pré-preencher com o esperado
                  transformaria o fechamento em um clique.
                */}
                <TextField
                  label="Valor contado na gaveta"
                  value={countedAmount}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(event) => setCountedAmount(event.target.value)}
                  hint="Conte primeiro, digite depois. A diferença é registrada como for."
                />
                <Button type="submit" isLoading={isBusy}>
                  Fechar caixa
                </Button>
              </form>
            </>
          ) : null}
        </div>
      )}
    </Card>
  )
}

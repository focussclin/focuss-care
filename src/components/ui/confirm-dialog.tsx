'use client'

import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TextareaField } from '@/components/ui/textarea-field'

/**
 * Confirmação de ação irreversível — e a única dona da regra que a torna útil.
 *
 * # A regra
 *
 * **O diálogo não fecha até o servidor confirmar.**
 *
 * Parece óbvio escrito assim, e não é o que acontece quando cada tela
 * implementa a própria confirmação. O modo de errar é sempre o mesmo: chamar a
 * action, que devolve promessa, e fechar na linha seguinte sem esperar. O
 * componente desmonta, a resposta chega para ninguém, e uma recusa do servidor
 * vira sucesso aos olhos de quem clicou.
 *
 * Foi exatamente o que aconteceu no cancelamento da agenda (10/08/2026): a
 * prop de erro existia, o comentário do arquivo explicava por que ela era
 * necessária, e ela nunca chegou a renderizar uma única vez.
 *
 * Por isso a regra mora aqui, e não em cada chamador. `onConfirm` devolve
 * **a mensagem de erro, ou `null` para sucesso** — e só o `null` fecha.
 *
 * # Por que `onConfirm` devolve string em vez de lançar
 *
 * Porque a recusa esperada não é exceção: "esta cobrança já recebeu pagamento"
 * é uma resposta do domínio, e o `ActionResult` do produto já a entrega como
 * dado. Obrigar o chamador a lançar transformaria um `if (!result.ok)` em
 * `throw`, só para ser pego de volta aqui.
 */
export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Uma linha sob o título. A explicação longa vai em `children`. */
  description?: string
  /**
   * O que a pessoa precisa saber antes de decidir — inclusive o que a ação
   * **não** faz. `RevokeAccessDialog` é o modelo: dizer que o histórico não é
   * apagado evita tanto o susto quanto a expectativa errada.
   */
  children?: ReactNode
  confirmLabel: string
  /** Rótulo enquanto a action está em voo. Sem ele, vira `${confirmLabel}…`. */
  pendingLabel?: string
  cancelLabel?: string
  /**
   * Captura de motivo. Quando `required`, o botão só libera com texto.
   *
   * Existe porque motivo opcional que a tela nunca pede é motivo que nunca
   * existe: `cancelInvoiceAction` recebia `reason: ''` fixo do `onClick`,
   * enquanto o `audit` da action prometia registrar por que a cobrança caiu.
   */
  reason?: {
    label: string
    placeholder?: string
    required?: boolean
    hint?: string
    /** Mensagem quando `required` e o campo está vazio. */
    missingMessage?: string
  }
  /** Devolve a mensagem de erro, ou `null` quando deu certo. */
  onConfirm: (reason: string | null) => Promise<string | null> | string | null
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Voltar',
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [isPending, setPending] = useState(false)

  /*
   * Reabrir precisa vir limpo. Sem isto, o erro da tentativa anterior aparece
   * sobre um alvo novo — e "esta cobrança já recebeu pagamento" acusaria a
   * cobrança errada.
   *
   * O reset acontece DURANTE O RENDER, comparando com o valor anterior, e não
   * num `useEffect`. É o ajuste que a documentação do React recomenda para
   * "estado derivado de prop que mudou": o efeito renderizaria uma vez com o
   * estado velho antes de limpar, e o lint do projeto recusa `setState` dentro
   * de efeito justamente por isso.
   */
  const [wasOpen, setWasOpen] = useState(open)

  if (wasOpen !== open) {
    setWasOpen(open)

    if (!open) {
      setError(null)
      setReasonText('')
      setPending(false)
    }
  }

  const missingReason = Boolean(reason?.required) && reasonText.trim() === ''

  async function handleConfirm() {
    if (missingReason) {
      setError(reason?.missingMessage ?? 'Escreva o motivo para continuar.')
      return
    }

    setError(null)
    setPending(true)

    try {
      const failure = await onConfirm(reasonText.trim() || null)

      // A ÚNICA saída que fecha. Ver o cabeçalho.
      if (failure === null) onOpenChange(false)
      else setError(failure)
    } catch (cause) {
      /*
       * Falha inesperada (rede caiu, action explodiu) também mantém aberto. O
       * pior desfecho aqui não é a mensagem feia: é fechar limpo sobre uma
       * ação que não aconteceu.
       */
      console.error('[confirm-dialog] confirmação falhou', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })
      setError('Não foi possível concluir agora. Tente de novo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      // Fechar no meio devolveria o silêncio que este componente existe para
      // eliminar.
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next)
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button variant="danger" isLoading={isPending} onClick={handleConfirm}>
            {isPending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}

        {reason ? (
          <TextareaField
            label={reason.label}
            placeholder={reason.placeholder}
            hint={reason.hint}
            value={reasonText}
            disabled={isPending}
            onChange={(event) => setReasonText(event.target.value)}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

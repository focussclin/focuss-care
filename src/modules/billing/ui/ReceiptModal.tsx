'use client'

import { Info, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCents } from '@/lib/utils/money'

import { invoiceReferenceOf, receiptIssuerName } from '../domain/Receipt'
import {
  billingMessages,
  type InvoiceDto,
  type InvoicePaymentDto,
  type ReceiptClinicDto,
} from '../schemas/billing.schema'

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  debit_card: 'Cartão de débito',
  credit_card: 'Cartão de crédito',
  pix: 'PIX',
  bank_transfer: 'Transferência',
  insurance: 'Convênio',
  check: 'Cheque',
  other: 'Outro',
}

export interface ReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clinic: ReceiptClinicDto | null
  invoice: InvoiceDto | null
  payment: InvoicePaymentDto | null
}

/**
 * Recibo de pagamento — comprovante interno.
 *
 * # Não é documento fiscal, e a tela repete isso
 *
 * A emissão fiscal numerada continua bloqueada (**P-RPC**). O aviso que já
 * existia em `/financeiro` aparece também aqui, dentro do comprovante, e não no
 * lugar dele: uma clínica que trate este papel como nota fiscal deixa de emitir
 * a nota, e o aviso na tela de trás não acompanha o recibo impresso.
 *
 * # Sem numeração própria
 *
 * Numerar comprovante exige sequência sem pulo nem repetição — o que
 * `document_sequences` garante e esta camada não tem como garantir sozinha. O
 * recibo referencia a cobrança de origem em vez de inventar um número.
 *
 * # Imprime pelo navegador, com folha preparada
 *
 * `window.print()` sozinho sairia com o painel do financeiro atrás e o
 * comprovante cortado no meio da página — o dialogo é posicionado com `fixed` e
 * `transform`. A folha em `globals.css` resolve as duas coisas: esconde a
 * página e neutraliza o posicionamento do diálogo, marcados por
 * `data-receipt-sheet`.
 *
 * **Não há geração de PDF nem arquivo.** O que existe é a impressão do
 * navegador, que também salva em PDF se quem imprime escolher — mas quem gera o
 * arquivo é o navegador, não este código.
 */
export function ReceiptModal({
  open,
  onOpenChange,
  clinic,
  invoice,
  payment,
}: ReceiptModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Recibo de pagamento"
      description="Comprovante interno de recebimento. Não substitui documento fiscal."
      footer={
        /*
          `print:hidden`: botão no papel é tinta gasta com um controle que
          ninguém pode clicar.
        */
        <div className="flex items-center gap-3 print:hidden">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={() => window.print()} disabled={!payment}>
            <Printer aria-hidden className="size-4" />
            Imprimir
          </Button>
        </div>
      }
    >
      {payment && invoice ? (
        /*
          `data-receipt-sheet` é o que a folha de impressão em `globals.css`
          procura: só esta subárvore reaparece no papel.
        */
        <div className="flex flex-col gap-4" data-receipt-sheet>
          <section className="rounded-card border border-border-card bg-row-hover p-4">
            {/*
              Identidade da clínica lida na ROTA, tenant-scoped. O `id` não vem:
              nada no comprovante o usa.
            */}
            {clinic ? (
              <>
                <p className="text-aux font-semibold text-foreground">
                  {receiptIssuerName(clinic)}
                </p>
                {clinic.legalName && clinic.legalName.trim() !== clinic.tradeName ? (
                  <p className="text-label text-muted">{clinic.tradeName}</p>
                ) : null}
                {clinic.cnpj ? (
                  <p className="text-label text-muted">CNPJ {clinic.cnpj}</p>
                ) : (
                  /*
                    O CNPJ é opcional no cadastro. Sem ele o recibo não inventa
                    identificador — diz que falta, para quem entrega saber.
                  */
                  <p className="text-label text-muted">
                    CNPJ não cadastrado nas configurações da clínica.
                  </p>
                )}
              </>
            ) : (
              <p className="text-label text-muted">
                Não foi possível carregar os dados da clínica para este recibo.
              </p>
            )}
          </section>

          <dl className="flex flex-col gap-2">
            <Row label="Recebido de" value={invoice.patientName} />
            <Row label="Valor" value={formatCents(payment.amountCents)} />
            <Row
              label="Forma de pagamento"
              value={methodLabels[payment.method] ?? payment.method}
            />
            <Row label="Data" value={formatMoment(payment.paidAt)} />
            <Row
              label="Referente a"
              value={invoiceReferenceOf(invoice.id, invoice.number)}
            />
            {payment.notes ? <Row label="Observações" value={payment.notes} /> : null}
          </dl>

          {/*
            O mesmo aviso da tela de trás, repetido dentro do comprovante.
          */}
          <p className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-label text-status-pending">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {billingMessages.receiptNotFiscal}
          </p>
        </div>
      ) : null}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-card pb-2">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="text-aux font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

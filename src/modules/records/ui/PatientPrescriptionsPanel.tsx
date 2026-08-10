'use client'

import { Info, Pill, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import { isExpired, MAX_ITEMS, sortByIssuedAt } from '../domain/Prescription'
import {
  prescriptionMessages,
  type PrescriptionItemDto,
  type PrescriptionItemFormValues,
} from '../schemas/prescription.schema'
import type { PatientPrescriptionsPanelProps } from './PatientPrescriptionsPanel.props'

function emptyItem(): PrescriptionItemFormValues {
  return {
    drugName: '',
    dosage: '',
    route: '',
    frequency: '',
    duration: '',
    quantity: '',
    instructions: '',
  }
}

/**
 * Prescrições na ficha — o registro do que foi prescrito.
 *
 * # O que esta tela NÃO faz
 *
 * Não assina, não emite receita oficial, não imprime e não gera PDF. Não há
 * botão para nenhuma dessas coisas, porque não há integração com emissor de
 * receita nesta instalação — e um botão que parecesse assinar seria a mentira
 * mais cara que este produto poderia contar.
 *
 * Também não interpreta dose, não avisa sobre interação e não sugere conduta.
 * Os campos são texto livre porque é assim que o banco os guarda, e porque
 * conferir prescrição é papel de quem tem conselho.
 *
 * # Não existe editar nem excluir
 *
 * As duas tabelas são append-only. Prescrição corrigida é prescrição nova: a
 * anterior é o que o paciente levou na mão.
 */
export function PatientPrescriptionsPanel({
  patientId,
  prescriptions,
  onCreate,
  canPrescribe,
  isProfessional,
  isLive,
  loadError = null,
}: PatientPrescriptionsPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [validUntil, setValidUntil] = useState('')
  const [items, setItems] = useState<PrescriptionItemFormValues[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const editable = canPrescribe && isProfessional && isLive && !loadError
  const ordered = sortByIssuedAt(prescriptions)
  const now = new Date()

  function open() {
    setValidUntil('')
    setItems([emptyItem()])
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setItems([emptyItem()])
    setValidUntil('')
    setError(null)
  }

  function patchItem(index: number, patch: Partial<PrescriptionItemFormValues>) {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    /*
     * Linhas em branco são descartadas antes de enviar.
     *
     * O formulário abre com uma linha vazia e ganha outra a cada "adicionar";
     * exigir que a pessoa apague a última seria atrito sem motivo. O que não
     * pode é a prescrição inteira ficar vazia.
     */
    const filled = items.filter((item) => item.drugName.trim().length > 0)

    if (filled.length === 0) {
      setError(prescriptionMessages.itemsRequired)
      return
    }

    setSaving(true)
    try {
      const failure = await onCreate(patientId, { validUntil, items: filled })
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(prescriptionMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Prescrições"
        description={
          isLive
            ? 'Cada prescrição é um registro novo — não há edição, e a anterior permanece.'
            : 'Modo demonstração: nenhuma prescrição fictícia é exibida.'
        }
        action={
          <Button onClick={open} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Nova prescrição
          </Button>
        }
        className="border-b border-border-card"
      />

      {loadError ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !modalOpen ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      {/*
        Papel permitido mas sem cadastro profissional: a mensagem diz o que
        fazer, em vez de um botão desabilitado sem explicação.
      */}
      {canPrescribe && !isProfessional && isLive ? (
        <div
          role="status"
          className="m-4 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending"
        >
          {prescriptionMessages.notAProfessional}
        </div>
      ) : null}

      {ordered.length === 0 && !loadError ? (
        <div className="flex items-start gap-2.5 px-5 py-5 text-aux text-muted">
          <Pill aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>Nenhuma prescrição registrada até agora.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-card">
          {ordered.map((prescription) => (
            <li key={prescription.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-label font-semibold text-foreground">
                  {formatMoment(prescription.issuedAt)}
                </p>
                {prescription.authorName ? (
                  <p className="text-label text-muted">{prescription.authorName}</p>
                ) : null}
                {/*
                  Vencimento é COMPARAÇÃO DE DATA, não julgamento clínico: uma
                  receita vencida pode estar sendo seguida com razão.
                */}
                {isExpired(
                  prescription.validUntil ? new Date(prescription.validUntil) : null,
                  now,
                ) ? (
                  <StatusBadge tone="neutral">Validade vencida</StatusBadge>
                ) : null}
              </div>

              {prescription.items.length === 0 ? (
                <p className="mt-1 text-aux text-status-negative">
                  Esta prescrição está sem itens. Registre uma nova.
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {prescription.items.map((item) => (
                    <li key={item.id} className="text-aux text-foreground">
                      {describeItem(item)}
                      {item.instructions ? (
                        <span className="block text-label text-muted">{item.instructions}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {prescription.validUntil ? (
                <p className="mt-1 text-label text-muted">
                  Válida até {formatDay(prescription.validUntil)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {prescriptionMessages.noSignature}
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title="Nova prescrição"
        description="O registro fica na ficha. Não há assinatura digital nem emissão oficial."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="prescription-form" isLoading={saving}>
              Salvar prescrição
            </Button>
          </>
        }
      >
        <form
          id="prescription-form"
          className="flex flex-col gap-4"
          onSubmit={submit}
          noValidate
        >
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          {items.map((item, index) => (
            <fieldset
              key={index}
              className="flex flex-col gap-3 rounded-card border border-border-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <legend className="text-label font-semibold text-foreground">
                  Item {index + 1}
                </legend>
                {items.length > 1 ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setItems((current) => current.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                    Remover
                  </Button>
                ) : null}
              </div>

              <TextField
                label={`Medicamento (item ${index + 1})`}
                value={item.drugName}
                onChange={(event) => patchItem(index, { drugName: event.target.value })}
                placeholder="Ex.: Amoxicilina 500 mg"
                required
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={`Dose (item ${index + 1})`}
                  value={item.dosage}
                  onChange={(event) => patchItem(index, { dosage: event.target.value })}
                  placeholder="1 comprimido"
                />
                <TextField
                  label={`Via (item ${index + 1})`}
                  value={item.route}
                  onChange={(event) => patchItem(index, { route: event.target.value })}
                  placeholder="Via oral"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  label={`Frequência (item ${index + 1})`}
                  value={item.frequency}
                  onChange={(event) => patchItem(index, { frequency: event.target.value })}
                  placeholder="8 em 8 horas"
                />
                <TextField
                  label={`Duração (item ${index + 1})`}
                  value={item.duration}
                  onChange={(event) => patchItem(index, { duration: event.target.value })}
                  placeholder="7 dias"
                />
                <TextField
                  label={`Quantidade (item ${index + 1})`}
                  value={item.quantity}
                  onChange={(event) => patchItem(index, { quantity: event.target.value })}
                  placeholder="1 caixa"
                />
              </div>

              <TextareaField
                label={`Orientações (item ${index + 1})`}
                value={item.instructions}
                onChange={(event) => patchItem(index, { instructions: event.target.value })}
                placeholder="Tomar após as refeições."
              />
            </fieldset>
          ))}

          {items.length < MAX_ITEMS ? (
            <Button
              variant="secondary"
              onClick={() => setItems((current) => [...current, emptyItem()])}
            >
              <Plus aria-hidden className="size-4" />
              Adicionar item
            </Button>
          ) : null}

          <TextField
            label="Válida até (opcional)"
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            hint="Em branco, a prescrição fica sem prazo declarado."
          />

          <p className="text-label text-muted">
            Os campos são texto livre e vão para a ficha como foram escritos: a
            aplicação não confere dose, via nem interação.
          </p>
        </form>
      </Modal>
    </Card>
  )
}

/**
 * A linha do item: só o que foi escrito, na ordem em que se lê uma receita.
 *
 * Campo em branco não vira travessão nem valor inventado — ele some.
 */
function describeItem(item: PrescriptionItemDto): string {
  return [item.drugName, item.dosage, item.route, item.frequency, item.duration, item.quantity]
    .filter((part) => part !== null && part !== '')
    .join(' · ')
}

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

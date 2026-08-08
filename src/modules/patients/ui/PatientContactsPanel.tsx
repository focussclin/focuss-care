'use client'

import { Mail, Pencil, Phone, Plus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'

import { createPatientContactAction } from '../actions/createPatientContact.action'
import { updatePatientContactAction } from '../actions/updatePatientContact.action'
import type { PatientContactDto } from '../application/toPatientContactDto'
import { patientContactMessages } from '../schemas/patientContact.schema'
import {
  PatientContactModal,
  type PatientContactFormValues,
  type PatientContactSubmitFailure,
} from './PatientContactModal'

export interface PatientContactsPanelProps {
  patientId: string
  contacts: readonly PatientContactDto[]
  isLive: boolean
  canManage: boolean
}

export function PatientContactsPanel({
  patientId,
  contacts,
  isLive,
  canManage,
}: PatientContactsPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PatientContactDto | null>(null)

  const enabled = isLive && canManage
  const disabledReason = !isLive
    ? 'Indisponível no modo demonstração: não há banco configurado.'
    : !canManage
      ? 'Seu papel não permite alterar contatos deste paciente.'
      : undefined

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(contact: PatientContactDto) {
    setEditing(contact)
    setModalOpen(true)
  }

  async function handleSubmit(
    values: PatientContactFormValues,
  ): Promise<PatientContactSubmitFailure | null> {
    try {
      const result = editing
        ? await updatePatientContactAction({
            patientId,
            contactId: editing.id,
            ...values,
          })
        : await createPatientContactAction({ patientId, ...values })

      if (!result.ok) {
        return {
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        }
      }

      router.refresh()
      return null
    } catch {
      return { message: patientContactMessages.unavailable }
    }
  }

  return (
    <Card>
      <CardHeader
        title="Contatos vinculados"
        description="Pessoas autorizadas para comunicação administrativa e apoio ao paciente."
        action={
          <Button
            variant="secondary"
            disabled={!enabled}
            title={disabledReason}
            onClick={openCreate}
          >
            <Plus aria-hidden className="size-4" />
            Adicionar contato
          </Button>
        }
      />

      <div className="px-5 pb-5">
        {!isLive ? (
          <p
            role="status"
            className="mb-4 rounded-field border border-border-default bg-background px-4 py-3 text-label text-muted"
          >
            Modo demonstração: os contatos reais aparecem aqui quando o banco da
            clínica estiver conectado. Nenhum dado pessoal fictício é exibido.
          </p>
        ) : null}

        {contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum contato vinculado."
            description={
              isLive
                ? 'Adicione um familiar, responsável ou outro contato autorizado.'
                : 'O cadastro está pronto para receber contatos reais.'
            }
            action={
              isLive ? (
                <Button disabled={!enabled} title={disabledReason} onClick={openCreate}>
                  <Plus aria-hidden className="size-4" />
                  Adicionar primeiro contato
                </Button>
              ) : undefined
            }
            className="px-0 py-8"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-card">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-aux font-semibold text-foreground">{contact.name}</p>
                    {contact.isLegalGuardian ? (
                      <StatusBadge tone="positive">Responsável legal</StatusBadge>
                    ) : null}
                  </div>

                  {contact.relationship ? (
                    <p className="mt-1 text-label text-muted">{contact.relationship}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label text-muted">
                    {contact.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone aria-hidden className="size-3.5" />
                        {contact.phone}
                      </span>
                    ) : null}
                    {contact.email ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                        <Mail aria-hidden className="size-3.5 shrink-0" />
                        {contact.email}
                      </span>
                    ) : null}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  disabled={!enabled}
                  title={disabledReason}
                  onClick={() => openEdit(contact)}
                >
                  <Pencil aria-hidden className="size-4" />
                  Editar
                </Button>
              </li>
            ))}
          </ul>
        )}

        {contacts.length > 0 ? (
          <p className="mt-4 border-t border-border-card pt-4 text-label text-muted">
            Contatos não são excluídos nesta tela para preservar o histórico. Edite
            os dados quando houver mudança.
          </p>
        ) : null}
      </div>

      {isLive ? (
        <PatientContactModal
          key={`${editing?.id ?? 'new'}-${modalOpen ? 'open' : 'closed'}`}
          open={modalOpen}
          contact={editing}
          onOpenChange={setModalOpen}
          onSubmit={handleSubmit}
        />
      ) : null}
    </Card>
  )
}

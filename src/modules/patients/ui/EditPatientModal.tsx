'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, ArchiveRestore, ArchiveX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TextField } from '@/components/ui/text-field'
import { TextareaField } from '@/components/ui/textarea-field'

import { editPatientFormSchema } from '../schemas/patient.schema'

/** Estado atual do cadastro, na forma que o formulario consome. */
export interface EditablePatient {
  id: string
  name: string
  /** Telefone como a listagem exibe; o servidor normaliza de novo ao salvar. */
  phone: string
  email: string
  /** 'YYYY-MM-DD' — o formato que `<input type="date">` entende. */
  birthDate: string | null
  adminNotes: string
  isActive: boolean
}

type EditPatientFormValues = {
  name: string
  phone: string
  email?: string
  birthDate?: string
  notes?: string
}

export interface EditPatientSubmitFailure {
  message: string
  fieldErrors?: Partial<Record<keyof EditPatientFormValues, string>>
}

export interface EditPatientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: EditablePatient
  /** Devolve `null` no sucesso; a falha mantem o modal aberto e preenchido. */
  onSubmit: (
    values: EditPatientFormValues,
  ) => Promise<EditPatientSubmitFailure | null>
  /** Arquiva ou reativa. Devolve mensagem de erro, ou `null` no sucesso. */
  onToggleArchived: (archived: boolean) => Promise<string | null>
}

export function EditPatientModal({
  open,
  onOpenChange,
  patient,
  onSubmit,
  onToggleArchived,
}: EditPatientModalProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [isTogglingArchive, setTogglingArchive] = useState(false)

  const defaults: EditPatientFormValues = {
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    birthDate: patient.birthDate ?? '',
    notes: patient.adminNotes,
  }

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditPatientFormValues>({
    resolver: zodResolver(editPatientFormSchema),
    mode: 'onSubmit',
    defaultValues: defaults,
  })

  // O paciente pode mudar embaixo do modal — arquivar devolve a linha atualizada,
  // e o `router.refresh()` do container traz dados novos do servidor.
  useEffect(() => {
    if (open) reset(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient.id, patient.isActive])

  const busy = isSubmitting || isTogglingArchive

  async function handleValidSubmit(values: EditPatientFormValues) {
    setFormError(null)

    const failure = await onSubmit(values)

    if (failure) {
      setFormError(failure.message)

      for (const [field, message] of Object.entries(failure.fieldErrors ?? {})) {
        if (message) {
          setError(field as keyof EditPatientFormValues, {
            type: 'server',
            message,
          })
        }
      }

      return
    }

    onOpenChange(false)
  }

  async function handleToggleArchived() {
    setFormError(null)
    setTogglingArchive(true)

    try {
      const error = await onToggleArchived(patient.isActive)
      if (error) setFormError(error)
    } finally {
      setTogglingArchive(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) setFormError(null)
        onOpenChange(next)
      }}
      title="Editar paciente"
      description="As alterações substituem os dados atuais do cadastro."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setFormError(null)
              onOpenChange(false)
            }}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-patient-form"
            isLoading={isSubmitting}
            disabled={isTogglingArchive}
          >
            {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <form
        id="edit-patient-form"
        noValidate
        onSubmit={handleSubmit(handleValidSubmit)}
        className="flex flex-col gap-4"
      >
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {isSubmitting ? 'Salvando alterações...' : ''}
          {isTogglingArchive ? 'Alterando o status do cadastro...' : ''}
        </p>

        <TextField
          label="Nome completo"
          autoComplete="name"
          disabled={busy}
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            disabled={busy}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            disabled={busy}
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <TextField
          label="Data de nascimento"
          type="date"
          autoComplete="bday"
          disabled={busy}
          error={errors.birthDate?.message}
          {...register('birthDate')}
        />

        <TextareaField
          label="Observação administrativa (opcional)"
          rows={3}
          disabled={busy}
          maxLength={2000}
          hint="Nota interna da recepção. Não é prontuário."
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>

      {/*
        Arquivar mora aqui, e nao no cabecalho do perfil, por dois motivos: e uma
        acao de manutencao do cadastro (o mesmo contexto da edicao), e assim o
        perfil nao ganha um botao destrutivo permanentemente visivel.
      */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-card pt-5">
        <div className="min-w-0">
          <p className="text-aux font-semibold text-foreground">
            {patient.isActive ? 'Cadastro ativo' : 'Cadastro arquivado'}
          </p>
          <p className="mt-0.5 text-label text-muted">
            {patient.isActive
              ? 'Arquivar tira o paciente da lista de ativos. Nada é apagado, e dá para reativar depois.'
              : 'O paciente está fora da lista de ativos. Reativar devolve o cadastro ao uso normal.'}
          </p>
        </div>

        <Button
          variant={patient.isActive ? 'danger' : 'secondary'}
          isLoading={isTogglingArchive}
          disabled={isSubmitting}
          onClick={handleToggleArchived}
        >
          {patient.isActive ? (
            <>
              <ArchiveX aria-hidden className="size-4" />
              Arquivar paciente
            </>
          ) : (
            <>
              <ArchiveRestore aria-hidden className="size-4" />
              Reativar paciente
            </>
          )}
        </Button>
      </div>
    </Modal>
  )
}

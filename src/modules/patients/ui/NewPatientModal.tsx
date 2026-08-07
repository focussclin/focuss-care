'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import {
  contactPreferenceOptions,
  newPatientSchema,
  type NewPatientInput,
} from '../schemas/patient.schema'

export interface NewPatientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: NewPatientInput) => void
}

/**
 * Cadastro de paciente em grupos curtos (PATIENTS_DESIGN.md, secao
 * "Modal de novo paciente"). Erros ficam abaixo dos campos e nao dependem so de cor.
 */
export function NewPatientModal({
  open,
  onOpenChange,
  onSubmit,
}: NewPatientModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewPatientInput>({
    resolver: zodResolver(newPatientSchema),
    mode: 'onSubmit',
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      birthDate: '',
      contactPreference: 'WhatsApp',
      notes: '',
    },
  })

  function handleValidSubmit(values: NewPatientInput) {
    onSubmit(values)
    reset()
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Novo paciente"
      description="Comece com o essencial. O restante pode ser completado depois."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-patient-form">
            Cadastrar paciente
          </Button>
        </>
      }
    >
      <form
        id="new-patient-form"
        noValidate
        onSubmit={handleSubmit(handleValidSubmit)}
        className="flex flex-col gap-4"
      >
        <TextField
          label="Nome completo"
          autoComplete="name"
          placeholder="Nome do paciente"
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            placeholder="(11) 90000-0000"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="paciente@email.com"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Data de nascimento"
            type="date"
            autoComplete="bday"
            error={errors.birthDate?.message}
            {...register('birthDate')}
          />
          <SelectField
            label="Preferência de contato"
            options={contactPreferenceOptions}
            error={errors.contactPreference?.message}
            {...register('contactPreference')}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="patient-notes"
            className="text-label font-semibold text-label"
          >
            Observação inicial (opcional)
          </label>
          <textarea
            id="patient-notes"
            rows={3}
            placeholder="Algo relevante para o primeiro atendimento?"
            className="w-full rounded-field border border-border-default bg-surface px-4 py-3 text-control text-foreground placeholder:text-muted transition-colors hover:border-border-hover focus:border-focus focus:shadow-[0_0_0_3px_rgba(60,140,112,0.24)] focus:outline-none"
            {...register('notes')}
          />
        </div>
      </form>
    </Modal>
  )
}

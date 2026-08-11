'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { TextareaField } from '@/components/ui/textarea-field'

import {
  contactPreferenceOptions,
  newPatientSchema,
  type NewPatientInput,
} from '../schemas/patient.schema'

/** Falha devolvida pelo chamador. Mantem o modal aberto e o formulario preenchido. */
export interface NewPatientSubmitFailure {
  /** Mensagem em pt-BR, pronta para exibicao. */
  message: string
  /** Mensagem por campo, quando o servidor sabe qual campo recusou. */
  fieldErrors?: Partial<Record<keyof NewPatientInput, string>>
}

export interface NewPatientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Executa o cadastro. Devolve `null` no sucesso — o modal fecha e limpa — ou a
   * falha, e ai ele continua aberto com o que o usuario digitou.
   *
   * O modal nao sabe (nem precisa saber) se por tras ha Server Action ou estado
   * local: quem decide isso e a PatientsScreen.
   */
  onSubmit: (values: NewPatientInput) => Promise<NewPatientSubmitFailure | null>
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
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
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

  function clear() {
    reset()
    setFormError(null)
  }

  /**
   * `isSubmitting` do react-hook-form fica verdadeiro enquanto esta promessa nao
   * resolve — por isso o `await` importa: sem ele o modal fecharia antes de saber
   * se o cadastro deu certo, que e exatamente "simular sucesso".
   */
  async function handleValidSubmit(values: NewPatientInput) {
    setFormError(null)

    const failure = await onSubmit(values)

    if (failure) {
      setFormError(failure.message)

      // Erro que so o servidor conhece precisa aparecer NO CAMPO: um aviso solto
      // no topo nunca e associado ao input por leitor de tela.
      for (const [field, message] of Object.entries(failure.fieldErrors ?? {})) {
        if (message) {
          setError(field as keyof NewPatientInput, { type: 'server', message })
        }
      }

      return
    }

    clear()
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // Fechar no meio do envio deixaria a escrita acontecendo sem ninguem para
        // mostrar o desfecho.
        if (isSubmitting) return
        if (!next) clear()
        onOpenChange(next)
      }}
      title="Novo paciente"
      description="Comece com o essencial. O restante pode ser completado depois."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => {
              clear()
              onOpenChange(false)
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" form="new-patient-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Cadastrando...' : 'Cadastrar paciente'}
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
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        {/* Progresso anunciado a leitor de tela; o botao ja mostra o spinner. */}
        <p role="status" aria-live="polite" className="sr-only">
          {isSubmitting ? 'Cadastrando paciente...' : ''}
        </p>

        <TextField
          label="Nome completo"
          autoComplete="name"
          placeholder="Nome do paciente"
          disabled={isSubmitting}
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            placeholder="(11) 90000-0000"
            disabled={isSubmitting}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="paciente@email.com"
            disabled={isSubmitting}
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Data de nascimento"
            type="date"
            autoComplete="bday"
            disabled={isSubmitting}
            error={errors.birthDate?.message}
            {...register('birthDate')}
          />
          <SelectField
            label="Preferência de contato"
            options={contactPreferenceOptions}
            disabled={isSubmitting}
            error={errors.contactPreference?.message}
            {...register('contactPreference')}
          />
        </div>

        {/*
          Nome social no CADASTRO, e nao so na edicao: e na primeira vez que a
          recepcao fala com a pessoa que ela diz como quer ser chamada, e deixar
          para depois garante que a proxima chamada na sala de espera use o nome
          errado.

          O resto da identificacao — sexo biologico, identidade de genero,
          contato de emergencia — fica na edicao de proposito: o cadastro de
          balcao e nome e telefone, e um formulario de dez campos entre o
          paciente e a consulta e como nascem cadastros preenchidos no chute.
        */}
        <TextField
          label="Nome social (opcional)"
          disabled={isSubmitting}
          hint="Como a pessoa quer ser chamada."
          error={errors.socialName?.message}
          {...register('socialName')}
        />

        {/*
          CPF entra no CADASTRO — e é o único do grupo documental que entra.

          Não é exceção à regra do parágrafo acima; é o que a faz valer. O CPF é
          o que impede a mesma pessoa de virar dois cadastros, e uma checagem de
          duplicidade que só roda na edição descobre a duplicata depois de ela
          existir. CNS e endereço continuam na edição: nenhum dos dois evita
          nada no balcão, e os dois são digitação longa.
        */}
        <TextField
          label="CPF (opcional)"
          inputMode="numeric"
          disabled={isSubmitting}
          hint="Se a pessoa tiver em mãos. É o que evita cadastro duplicado."
          error={errors.cpf?.message}
          {...register('cpf')}
        />

        <TextareaField
          label="Observação inicial (opcional)"
          rows={3}
          disabled={isSubmitting}
          maxLength={2000}
          placeholder="Algo relevante para o primeiro atendimento?"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Modal>
  )
}

'use client'

import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
} from 'react-hook-form'

import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import { BRAZILIAN_STATES } from '../domain/PatientDocuments'

/**
 * O grupo documental do formulário de EDIÇÃO — CPF, CNS e endereço.
 *
 * # Por que só a edição tem o bloco inteiro
 *
 * O cadastro de balcão é nome e telefone: um formulário de quinze campos entre o
 * paciente e a consulta é como nascem cadastros preenchidos no chute. Lá entra
 * apenas o **CPF**, e não como exceção — é ele que impede a mesma pessoa de
 * virar dois cadastros, e uma checagem de duplicidade que só roda na edição
 * descobre a duplicata depois de ela existir.
 *
 * CNS e endereço não evitam nada no balcão e são digitação longa. Ficam aqui,
 * onde alguém senta para completar a ficha.
 *
 * Vive em arquivo próprio para o modal de edição não crescer noventa linhas de
 * markup, e o componente é genérico sobre o tipo do formulário porque cadastro e
 * edição têm contratos diferentes.
 */
export interface PatientDocumentFormValues {
  cpf?: string
  cns?: string
  addressZip?: string
  addressStreet?: string
  addressNumber?: string
  addressComplement?: string
  addressDistrict?: string
  addressCity?: string
  addressState?: string
}

export interface PatientDocumentFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  disabled?: boolean
  /**
   * A coluna `address` tem conteúdo que a aplicação não entende.
   *
   * Salvar vai substituí-lo, e o formulário diz isso ANTES — mostrar os campos
   * vazios sobre um endereço que existe esconderia a perda.
   */
  addressUnreadable?: boolean
}

const stateOptions = [
  { value: '', label: 'UF' },
  ...BRAZILIAN_STATES.map((state) => ({ value: state, label: state })),
]

export function PatientDocumentFields<
  T extends PatientDocumentFormValues & FieldValues,
>({
  register,
  errors,
  disabled = false,
  addressUnreadable = false,
}: PatientDocumentFieldsProps<T>) {
  /*
   * As duas travessias de tipo ficam AQUI, em uma função cada.
   *
   * `T` estende a forma documental, mas o TypeScript não deriva disso que
   * `'cpf'` é um `Path<T>`. Concentrar o cast em um lugar é o que impede que ele
   * se espalhe por nove chamadas — e mantém os nomes de campo conferidos contra
   * `PatientDocumentFormValues`, que é o que importa.
   */
  const field = (name: keyof PatientDocumentFormValues) =>
    register(name as Path<T>)

  const errorOf = (name: keyof PatientDocumentFormValues): string | undefined =>
    (errors as Record<string, { message?: string } | undefined>)[name]?.message

  return (
    <>
      <fieldset className="flex flex-col gap-4 rounded-field border border-border-card p-4">
        <legend className="px-1 text-label font-semibold text-label">
          Documentos
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="CPF (opcional)"
            inputMode="numeric"
            disabled={disabled}
            hint="Necessário para nota fiscal e para a guia do convênio."
            error={errorOf('cpf')}
            {...field('cpf')}
          />
          <TextField
            label="CNS (opcional)"
            inputMode="numeric"
            disabled={disabled}
            hint="Cartão Nacional de Saúde, 15 dígitos."
            error={errorOf('cns')}
            {...field('cns')}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-field border border-border-card p-4">
        <legend className="px-1 text-label font-semibold text-label">
          Endereço
        </legend>

        {addressUnreadable ? (
          <p
            role="status"
            className="rounded-field border border-danger/30 bg-danger-surface px-3 py-2 text-label text-danger"
          >
            Há um endereço gravado num formato que o sistema não reconhece.
            Salvar este formulário vai substituí-lo.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <TextField
            label="CEP (opcional)"
            inputMode="numeric"
            disabled={disabled}
            error={errorOf('addressZip')}
            {...field('addressZip')}
          />
          <TextField
            label="Logradouro"
            autoComplete="street-address"
            disabled={disabled}
            error={errorOf('addressStreet')}
            {...field('addressStreet')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Número"
            disabled={disabled}
            hint="Use s/n quando não houver."
            error={errorOf('addressNumber')}
            {...field('addressNumber')}
          />
          <TextField
            label="Complemento (opcional)"
            disabled={disabled}
            error={errorOf('addressComplement')}
            {...field('addressComplement')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
          <TextField
            label="Bairro"
            disabled={disabled}
            error={errorOf('addressDistrict')}
            {...field('addressDistrict')}
          />
          <TextField
            label="Cidade"
            disabled={disabled}
            error={errorOf('addressCity')}
            {...field('addressCity')}
          />
          <SelectField
            label="UF"
            disabled={disabled}
            options={stateOptions}
            error={errorOf('addressState')}
            {...field('addressState')}
          />
        </div>

        <p className="text-label text-muted">
          O endereço é opcional. Se preencher, informe pelo menos logradouro,
          cidade e UF — sem os três não há como enviar nada nem localizar
          ninguém. O CEP não é consultado em base externa: os campos são digitados.
        </p>
      </fieldset>
    </>
  )
}

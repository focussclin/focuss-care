'use client'

import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { archivePatientAction } from '../actions/archivePatient.action'
import { updatePatientAction } from '../actions/updatePatient.action'
import { createPatientMessages } from '../schemas/patient.schema'
import {
  EditPatientModal,
  type EditablePatient,
  type EditPatientSubmitFailure,
} from './EditPatientModal'

export interface PatientProfileActionsProps {
  patient: EditablePatient
  /**
   * Ha banco por tras. Falso significa demonstracao local — nada e persistido, e
   * o botao fica desabilitado com `title` explicando (padrao R11 do roadmap:
   * botao sem back-end nunca fica clicavel e mudo).
   */
  isLive: boolean
  /** Abre o modal ja na montagem — o menu da listagem linka `?editar=1`. */
  openOnMount?: boolean
}

/**
 * Wiring da edicao no perfil do paciente — dono: Claude (codigo).
 *
 * Existe porque a pagina de perfil e Server Component: alguem precisa segurar o
 * estado do modal e chamar as actions. Nao contem decisao visual propria — o
 * botao e o mesmo `Button` que a pagina ja usava.
 */
export function PatientProfileActions({
  patient,
  isLive,
  openOnMount = false,
}: PatientProfileActionsProps) {
  const router = useRouter()
  const [isEditing, setEditing] = useState(openOnMount && isLive)

  async function handleSubmit(values: {
    name: string
    phone: string
    email?: string
    birthDate?: string
    notes?: string
  }): Promise<EditPatientSubmitFailure | null> {
    try {
      const result = await updatePatientAction({
        ...values,
        patientId: patient.id,
      })

      if (!result.ok) {
        return {
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        }
      }

      // O perfil inteiro e renderizado no servidor: refresh e o que traz os dados
      // novos. Nao ha estado local a atualizar — e nao havendo, nao ha como a tela
      // mostrar algo que o banco nao confirmou.
      router.refresh()
      return null
    } catch {
      return { message: createPatientMessages.unavailable }
    }
  }

  async function handleToggleArchived(archived: boolean): Promise<string | null> {
    try {
      const result = await archivePatientAction({
        patientId: patient.id,
        archived,
      })

      if (!result.ok) return result.error.message

      router.refresh()
      return null
    } catch {
      return createPatientMessages.unavailable
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={!isLive}
        title={
          isLive
            ? undefined
            : 'Edição indisponível no modo demonstração: não há banco configurado.'
        }
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden className="size-4" />
        Editar paciente
      </Button>

      {isLive ? (
        <EditPatientModal
          open={isEditing}
          onOpenChange={setEditing}
          patient={patient}
          onSubmit={handleSubmit}
          onToggleArchived={handleToggleArchived}
        />
      ) : null}
    </>
  )
}

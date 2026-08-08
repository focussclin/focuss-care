'use client'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

import type { TeamMemberDto } from '../schemas/team.schema'

export interface RevokeAccessDialogProps {
  member: TeamMemberDto | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (member: TeamMemberDto) => void
}

/**
 * Confirmação de revogação de acesso (S-01).
 *
 * Passo separado porque a ação tira de uma pessoa o acesso a dado de saúde, e
 * o nome dela precisa aparecer na confirmação — "revogar acesso?" genérico é
 * exatamente como se revoga a pessoa errada numa lista de nomes parecidos.
 *
 * O texto também diz o que a revogação **não** faz: não apaga o histórico. Quem
 * espera que revogar limpe rastro precisa saber que não é isso — e quem teme
 * perder o histórico precisa saber que não vai perder.
 */
export function RevokeAccessDialog({
  member,
  isPending,
  onOpenChange,
  onConfirm,
}: RevokeAccessDialogProps) {
  return (
    <Modal
      open={member !== null}
      onOpenChange={onOpenChange}
      title="Revogar acesso"
      description="A pessoa deixa de acessar os dados desta clínica."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            isLoading={isPending}
            onClick={() => {
              if (member) onConfirm(member)
            }}
          >
            {isPending ? 'Revogando...' : 'Revogar acesso'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-aux leading-6 text-foreground">
          <strong className="font-semibold">{member?.name}</strong> ({member?.email})
          deixará de acessar pacientes, agenda e prontuário desta clínica.
        </p>

        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label leading-5 text-muted">
          O histórico não é apagado: os registros feitos por esta pessoa
          continuam no prontuário e na agenda, com a autoria preservada. Fica
          registrado quem revogou o acesso e quando.
        </p>
      </div>
    </Modal>
  )
}

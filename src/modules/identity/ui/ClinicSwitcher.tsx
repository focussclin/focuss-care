'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { cn } from '@/lib/utils/cn'

import { switchClinicAction } from '../actions/switchClinic.action'

export interface ClinicOption {
  id: string
  name: string
  /** Papel do usuário NESTA clínica — pode diferir a cada vínculo. */
  roleLabel: string
}

export interface ClinicSwitcherProps {
  clinics: readonly ClinicOption[]
  activeClinicId: string | null
}

/**
 * Troca de clínica na casca (I-03).
 *
 * # Quando este componente aparece
 *
 * **Só com dois ou mais vínculos.** Um seletor de um item é um menu que não
 * decide nada, e a maioria das contas terá exatamente uma clínica: cada
 * assinatura tem uma clínica, e cada conta cria uma só. Vários vínculos existem
 * pelo outro caminho — o convite (I-04), que leva o profissional para a clínica
 * de outra pessoa sem tirá-lo da dele.
 *
 * Com um vínculo só, a casca continua mostrando o nome da clínica como texto.
 */
export function ClinicSwitcher({
  clinics,
  activeClinicId,
}: ClinicSwitcherProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const active = clinics.find((clinic) => clinic.id === activeClinicId)

  function handleSelect(clinicId: string) {
    if (clinicId === activeClinicId) return

    setError(null)

    startTransition(async () => {
      const result = await switchClinicAction(clinicId)

      if (!result.ok) {
        setError(result.error ?? null)
        return
      }

      /*
       * `revalidatePath` na action limpa o cache do servidor; o `refresh`
       * obriga ESTA aba a rebuscar. Sem ele o usuário continuaria vendo os
       * dados da clínica anterior até navegar — que é exatamente a aparência
       * de "a troca não funcionou".
       */
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={isPending}
          className={cn(
            // 44px: alvo minimo de toque exigido nos handoffs
            'inline-flex h-11 min-w-0 max-w-[220px] items-center gap-2',
            'rounded-field border border-border-card px-3',
            'text-aux font-semibold text-foreground',
            'transition-colors hover:bg-row-hover',
            'focus:border-focus focus:shadow-focus focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isPending ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
          ) : (
            <Building2 aria-hidden className="size-4 shrink-0" />
          )}
          <span className="truncate">{active?.name ?? 'Selecione a clínica'}</span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[240px] rounded-card border border-border-card bg-surface p-1.5 shadow-lg"
          >
            <DropdownMenu.Label className="px-2.5 py-1.5 text-label font-semibold text-muted">
              Suas clínicas
            </DropdownMenu.Label>

            {clinics.map((clinic) => {
              const isActive = clinic.id === activeClinicId

              return (
                <DropdownMenu.Item
                  key={clinic.id}
                  onSelect={() => handleSelect(clinic.id)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2',
                    'text-aux text-foreground outline-none',
                    'data-[highlighted]:bg-row-hover',
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0 text-link',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{clinic.name}</span>
                    <span className="truncate text-label text-muted">
                      {clinic.roleLabel}
                    </span>
                  </span>
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {error ? (
        <p role="alert" className="px-3 text-label text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

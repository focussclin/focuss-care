'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { SearchField } from '@/components/ui/search-field'
import { SelectField } from '@/components/ui/select-field'
import { cn } from '@/lib/utils/cn'
import type { Professional } from '@/modules/_shared/domain/types'

export type AgendaView = 'day' | 'week' | 'list'

const viewOptions: readonly { value: AgendaView; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'list', label: 'Lista' },
] as const

export interface AgendaControlBarProps {
  /** Data ou intervalo atual, ja formatado. */
  rangeLabel: string
  view: AgendaView
  onViewChange: (view: AgendaView) => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  professionals: readonly Professional[]
  professionalId: string
  onProfessionalChange: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Barra de controle da agenda (AGENDA_DESIGN.md, secao "Barra de controle").
 * No mobile os controles quebram em duas linhas, o botao "Hoje" permanece visivel
 * e a data nunca e truncada.
 */
export function AgendaControlBar({
  rangeLabel,
  view,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  professionals,
  professionalId,
  onProfessionalChange,
  search,
  onSearchChange,
}: AgendaControlBarProps) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton
            label="Período anterior"
            variant="outline"
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </IconButton>
          <IconButton
            label="Próximo período"
            variant="outline"
            onClick={onNext}
          >
            <ChevronRight aria-hidden className="size-4" />
          </IconButton>
        </div>

        <Button variant="secondary" onClick={onToday}>
          Hoje
        </Button>

        {/* A data nunca e truncada: quebra em vez de cortar */}
        <p className="text-control font-semibold text-foreground">
          {rangeLabel}
        </p>

        <div
          role="group"
          aria-label="Modo de visualização"
          className="ml-auto flex rounded-field border border-border-default bg-surface p-1 max-md:w-full"
        >
          {viewOptions.map((option) => {
            const isActive = view === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                aria-pressed={isActive}
                className={cn(
                  'h-9 flex-1 rounded-[8px] px-4 text-aux font-medium transition-colors md:flex-none',
                  isActive
                    ? 'bg-brand text-brand-foreground'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <SelectField
          label="Profissional"
          hideLabel
          value={professionalId}
          onChange={(event) => onProfessionalChange(event.target.value)}
          options={[
            { value: 'all', label: 'Todos os profissionais' },
            ...professionals.map((professional) => ({
              value: professional.id,
              label: professional.name,
            })),
          ]}
        />

        <SearchField
          label="Buscar paciente na agenda"
          placeholder="Buscar por paciente"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onClear={() => onSearchChange('')}
        />
      </div>
    </Card>
  )
}

'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { SelectField } from '@/components/ui/select-field'

import {
  lastVisitFilterOptions,
  statusFilterOptions,
  type LastVisitFilter,
  type StatusFilter,
} from '../schemas/patient.schema'

export interface PatientFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  status: StatusFilter
  onStatusChange: (value: StatusFilter) => void
  lastVisit: LastVisitFilter
  onLastVisitChange: (value: LastVisitFilter) => void
  onClear: () => void
}

interface Chip {
  key: string
  label: string
  onRemove: () => void
}

/**
 * Busca e filtros da listagem.
 * No mobile os selects vao para um drawer, acessivel pelo botao "Filtros";
 * a busca continua sempre visivel, com destaque, conforme o handoff.
 */
export function PatientFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  lastVisit,
  onLastVisitChange,
  onClear,
}: PatientFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const chips: Chip[] = []

  if (status !== 'all') {
    chips.push({
      key: 'status',
      label:
        statusFilterOptions.find((option) => option.value === status)?.label ??
        '',
      onRemove: () => onStatusChange('all'),
    })
  }

  if (lastVisit !== 'any') {
    chips.push({
      key: 'lastVisit',
      label:
        lastVisitFilterOptions.find((option) => option.value === lastVisit)
          ?.label ?? '',
      onRemove: () => onLastVisitChange('any'),
    })
  }

  if (search.trim().length > 0) {
    chips.push({
      key: 'search',
      label: `Busca: ${search.trim()}`,
      onRemove: () => onSearchChange(''),
    })
  }

  const filterControls = (
    <>
      <SelectField
        label="Status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
        options={statusFilterOptions}
      />
      <SelectField
        label="Última visita"
        value={lastVisit}
        onChange={(event) =>
          onLastVisitChange(event.target.value as LastVisitFilter)
        }
        options={lastVisitFilterOptions}
      />
    </>
  )

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <SearchField
            label="Buscar paciente"
            placeholder="Buscar por nome, e-mail ou telefone"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => onSearchChange('')}
          />
        </div>

        <Button
          variant="secondary"
          className="shrink-0 md:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Filtros
        </Button>
      </div>

      {/* Desktop: filtros inline */}
      <div className="hidden gap-3 md:grid md:grid-cols-2 md:max-w-lg">
        {filterControls}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle py-1 pr-1 pl-3 text-label font-medium text-link"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro ${chip.label}`}
                className="inline-flex size-5 items-center justify-center rounded-full transition-colors hover:bg-brand-soft"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onClear}
            className="ml-1 text-label font-semibold text-link hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}

      {/* Mobile: filtros em drawer */}
      <Modal
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Filtros"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onClear()
                setDrawerOpen(false)
              }}
            >
              Limpar
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>Aplicar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">{filterControls}</div>
      </Modal>
    </Card>
  )
}

'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { SelectField } from '@/components/ui/select-field'

import {
  lastVisitFilterOptions,
  statusFilterOptions,
  type StatusFilter,
} from '../schemas/patient.schema'
import { patientListHref } from '../schemas/patientQuery.schema'

export interface PatientFiltersProps {
  /** Termo em vigor — o ja SANITIZADO, que e o que o servidor de fato buscou. */
  search: string | null
  status: StatusFilter
}

/**
 * Busca e filtros da listagem — agora um formulario GET, nao estado local.
 *
 * O `next/form` com `action="/pacientes"` faz tres coisas que `useState` nao
 * faz: coloca o recorte na URL (recarregar mantem, o link reproduz, voltar
 * funciona), navega client-side com prefetch, e continua funcionando sem JS.
 *
 * **O cursor nao e campo do formulario, de proposito.** Ele some a cada submit,
 * e e isso que reseta a paginacao ao trocar de filtro: um cursor e uma posicao
 * dentro de UM resultado, e aplicado a outro conjunto saltaria linhas em
 * silencio.
 */
export function PatientFilters({ search, status }: PatientFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Buffer do input, nao fonte da verdade: a verdade e a URL. O ajuste durante o
  // render ressincroniza quando a navegacao troca o termo (inclusive pelo botao
  // voltar), sem remontar o campo.
  const [term, setTerm] = useState(search ?? '')
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>(status)
  const [synced, setSynced] = useState({ search, status })

  if (search !== synced.search || status !== synced.status) {
    setSynced({ search, status })
    setTerm(search ?? '')
    setSelectedStatus(status)
  }

  const statusLabel =
    statusFilterOptions.find((option) => option.value === status)?.label ?? ''

  const hasFilters = (search !== null && search.length > 0) || status !== 'all'

  function submitNow() {
    formRef.current?.requestSubmit()
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Form
        ref={formRef}
        action="/pacientes"
        scroll={false}
        className="flex flex-col gap-4"
      >
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <SearchField
              label="Buscar paciente"
              name="q"
              placeholder="Buscar por nome, e-mail ou telefone"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onClear={() => {
                setTerm('')
                // Limpar e uma decisao, nao uma digitacao: navega na hora.
                requestAnimationFrame(submitNow)
              }}
            />
          </div>

          <Button type="submit" className="shrink-0">
            Buscar
          </Button>

          <Button
            variant="secondary"
            className="shrink-0 md:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Filtros
          </Button>
        </div>

        {/*
         * Desktop: filtros inline. Abaixo de md o bloco some da tela mas
         * CONTINUA no formulario — `display:none` esconde, nao desabilita, e e
         * este select que preserva o status quando a busca e enviada no mobile.
         *
         * O drawer nao usa este campo: o Radix o renderiza num portal, fora
         * deste formulario, entao la os filtros sao links proprios.
         */}
        <div className="hidden gap-3 md:grid md:max-w-lg md:grid-cols-2">
          <SelectField
            label="Status"
            name="status"
            value={selectedStatus}
            onChange={(event) => {
              // O estado local existe para o select nao "voltar" ao valor antigo
              // entre o clique e a chegada da nova pagina.
              setSelectedStatus(event.target.value as StatusFilter)
              submitNow()
            }}
            options={statusFilterOptions}
          />

          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Última visita"
              defaultValue="any"
              disabled
              options={lastVisitFilterOptions}
            />
            <p className="text-label text-muted">
              Disponível quando a data de última visita for indexada (P-02b).
            </p>
          </div>
        </div>

      </Form>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {status !== 'all' ? (
            <FilterChip
              label={statusLabel}
              href={patientListHref({ search, status: 'all' })}
            />
          ) : null}

          {search ? (
            <FilterChip
              label={`Busca: ${search}`}
              href={patientListHref({ search: null, status })}
            />
          ) : null}

          <Link
            href="/pacientes"
            className="ml-1 text-label font-semibold text-link hover:underline"
          >
            Limpar filtros
          </Link>
        </div>
      ) : null}

      {/* Mobile: filtros em drawer, por links — navegam sem JS e sem formulario */}
      <Modal open={drawerOpen} onOpenChange={setDrawerOpen} title="Filtros">
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label font-semibold text-label">
              Status
            </legend>

            {statusFilterOptions.map((option) => (
              <Link
                key={option.value}
                href={patientListHref({ search, status: option.value })}
                onClick={() => setDrawerOpen(false)}
                aria-current={option.value === status ? 'true' : undefined}
                className={
                  option.value === status
                    ? 'flex h-11 items-center rounded-field border border-focus bg-brand-subtle px-3.5 text-aux font-semibold text-link'
                    : 'flex h-11 items-center rounded-field border border-border-default px-3.5 text-aux text-foreground hover:bg-row-hover'
                }
              >
                {option.label}
              </Link>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Última visita"
              defaultValue="any"
              disabled
              options={lastVisitFilterOptions}
            />
            <p className="text-label text-muted">
              Disponível quando a data de última visita for indexada (P-02b).
            </p>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle py-1 pr-1 pl-3 text-label font-medium text-link">
      {label}
      <Link
        href={href}
        aria-label={`Remover filtro ${label}`}
        className="inline-flex size-5 items-center justify-center rounded-full transition-colors hover:bg-brand-soft"
      >
        <X aria-hidden className="size-3" />
      </Link>
    </span>
  )
}

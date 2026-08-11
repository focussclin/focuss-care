'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Avatar } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate } from '@/lib/utils/date'
import {
  patientStatusMeta,
  type Patient,
} from '@/modules/_shared/domain/types'

import { preferredName } from '../domain/PatientIdentity'

export interface PatientsTableProps {
  patients: readonly Patient[]
}

/**
 * Tabela leve do desktop (PATIENTS_DESIGN.md, secao "Lista de pacientes").
 * Sem linhas verticais, altura minima de 72px por linha e hover #F7FAF8.
 * O nome e um link real: a linha inteira responde ao mouse, mas a navegacao por
 * teclado passa pelo link, com foco visivel.
 */
export function PatientsTable({ patients }: PatientsTableProps) {
  const router = useRouter()

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border-card">
            <th scope="col" className="px-5 py-3 text-label font-semibold text-muted">
              Paciente
            </th>
            <th scope="col" className="px-5 py-3 text-label font-semibold text-muted">
              Telefone
            </th>
            <th scope="col" className="px-5 py-3 text-label font-semibold text-muted">
              Último atendimento
            </th>
            <th scope="col" className="px-5 py-3 text-label font-semibold text-muted">
              Próximo atendimento
            </th>
            <th scope="col" className="px-5 py-3 text-label font-semibold text-muted">
              Status
            </th>
            <th scope="col" className="px-5 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {patients.map((patient) => {
            const status = patientStatusMeta[patient.status]

            return (
              <tr
                key={patient.id}
                onClick={() => router.push(`/pacientes/${patient.id}`)}
                className="min-h-[72px] cursor-pointer border-b border-border-card transition-colors last:border-b-0 hover:bg-row-hover"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={preferredName(patient)} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/pacientes/${patient.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block truncate text-aux font-semibold text-foreground hover:underline"
                      >
                        {preferredName(patient)}
                      </Link>
                      <p className="mt-0.5 truncate text-label text-muted">
                        {patient.email}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-5 py-4 text-aux text-muted whitespace-nowrap">
                  {patient.phone}
                </td>

                <td className="px-5 py-4 text-aux text-muted whitespace-nowrap">
                  {patient.lastVisitAt
                    ? formatShortDate(patient.lastVisitAt)
                    : '—'}
                </td>

                <td className="px-5 py-4 text-aux text-muted whitespace-nowrap">
                  {patient.nextVisitAt
                    ? formatShortDate(patient.nextVisitAt)
                    : '—'}
                </td>

                <td className="px-5 py-4">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </td>

                <td className="px-5 py-4 text-right">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Ações para ${preferredName(patient)}`}
                      className="inline-flex size-11 items-center justify-center rounded-field text-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      <MoreVertical aria-hidden className="size-4" />
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-50 min-w-[12rem] rounded-field border border-border-card bg-surface p-1 shadow-raised"
                      >
                        <DropdownMenu.Item asChild>
                          <Link
                            href={`/pacientes/${patient.id}`}
                            className="block cursor-pointer rounded-[8px] px-3 py-2 text-aux text-foreground outline-none data-[highlighted]:bg-row-hover"
                          >
                            Ver perfil
                          </Link>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item asChild>
                          <Link
                            href={`/pacientes/${patient.id}?editar=1`}
                            className="block cursor-pointer rounded-[8px] px-3 py-2 text-aux text-foreground outline-none data-[highlighted]:bg-row-hover"
                          >
                            Editar dados
                          </Link>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item asChild>
                          <Link
                            href="/agenda?novo=1"
                            className="block cursor-pointer rounded-[8px] px-3 py-2 text-aux text-foreground outline-none data-[highlighted]:bg-row-hover"
                          >
                            Agendar atendimento
                          </Link>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { Avatar } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate } from '@/lib/utils/date'
import {
  patientStatusMeta,
  type Patient,
} from '@/modules/_shared/domain/types'

import { preferredName } from '../domain/PatientIdentity'

export interface PatientCardListProps {
  patients: readonly Patient[]
}

/**
 * Versao mobile da listagem: cada linha vira um card vertical compacto com nome,
 * proximo atendimento, status e acao. Os demais dados ficam no perfil, conforme
 * PATIENTS_DESIGN.md.
 */
export function PatientCardList({ patients }: PatientCardListProps) {
  return (
    <ul className="flex flex-col divide-y divide-border-card">
      {patients.map((patient) => {
        const status = patientStatusMeta[patient.status]

        return (
          <li key={patient.id}>
            <Link
              href={`/pacientes/${patient.id}`}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-row-hover"
            >
              <Avatar name={preferredName(patient)} size="md" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-aux font-semibold text-foreground">
                  {preferredName(patient)}
                </p>
                <p className="mt-0.5 truncate text-label text-muted">
                  {patient.nextVisitAt
                    ? `Próximo: ${formatShortDate(patient.nextVisitAt)}`
                    : 'Sem atendimento agendado'}
                </p>
                <div className="mt-2">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
              </div>

              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'

import {
  moveLeadFromScreen,
  submitLeadFromScreen,
} from '@/modules/leads/actions/leadScreen.actions'
import { isLeadRepositoryError } from '@/modules/leads/domain/LeadRepositoryError'
import { toLeadDto } from '@/modules/leads/application/toLeadDto'
import { getLeadRepository } from '@/modules/leads/infrastructure/repository'
import { getTeamRepository } from '@/modules/team/infrastructure/repository'

import { LeadsScreen } from '@/modules/leads/ui/LeadsScreen'

export const metadata: Metadata = {
  title: 'CRM e Leads',
  description: 'Pipeline de relacionamento e oportunidades da clínica.',
}

export default async function CrmPage() {
  await connection()

  const [leadSource, teamSource, role] = await Promise.all([
    getLeadRepository(),
    getTeamRepository(),
    getActiveClinicRole(),
  ])

  if (leadSource.isLive && (!can(role, 'patient.read') || !can(role, 'team.read'))) {
    forbidden()
  }

  let leads = [] as Awaited<ReturnType<typeof leadSource.repository.list>>
  let schemaPending = false

  try {
    leads = await leadSource.repository.list(leadSource.clinicId)
  } catch (cause) {
    if (isLeadRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  const members = await teamSource.repository.listMembers(teamSource.clinicId)

  return (
    <LeadsScreen
      leads={leads.map(toLeadDto)}
      assignees={members
        .filter((member) => member.status === 'active')
        .map((member) => ({ id: member.userId, name: member.name }))}
      onSubmit={submitLeadFromScreen}
      onMove={moveLeadFromScreen}
      isLive={leadSource.isLive}
      schemaPending={schemaPending}
    />
  )
}

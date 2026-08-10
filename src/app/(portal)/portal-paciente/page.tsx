import type { Metadata } from 'next'
import { AlertTriangle, LogIn, Stethoscope } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { getSessionState } from '@/lib/auth/session'
import { addDays, startOfDay } from '@/lib/utils/date'
import { splitAppointments } from '@/modules/patient-portal/domain/PatientPortal'
import { isPatientPortalRepositoryError } from '@/modules/patient-portal/domain/PatientPortalRepositoryError'
import {
  toPortalAppointmentDto,
  toPortalInvoiceDto,
  toPortalProfileDto,
} from '@/modules/patient-portal/application/toPatientPortalDto'
import { getPatientPortalRepository } from '@/modules/patient-portal/infrastructure/repository'
import { patientPortalMessages } from '@/modules/patient-portal/schemas/patientPortal.schema'
import { PortalPacienteScreen } from '@/modules/patient-portal/ui/PortalPacienteScreen'

export const metadata: Metadata = {
  title: 'Portal do paciente',
  description: 'Suas consultas e cobranças na clínica.',
  // Portal pessoal não entra em buscador, nem a listagem de suas rotas.
  robots: { index: false, follow: false },
}

/** Janela do histórico: um ano para trás, um para frente. */
const HISTORY_DAYS = 365

/**
 * O portal do paciente.
 *
 * # Quem chega aqui, e o que cada um vê
 *
 * Três públicos, três respostas — e confundi-los é o que faria a tela mentir:
 *
 *  1. **Paciente vinculado** → o portal.
 *  2. **Anônimo** → convite para entrar. Não há cadastro público: o acesso nasce
 *     de um convite da clínica, e dizer "crie sua conta" prometeria uma porta
 *     que não existe.
 *  3. **Membro da equipe** (ou qualquer conta sem vínculo de portal) → a
 *     explicação de que esta área é do paciente, com o caminho para gerar um
 *     convite. Este caso é comum de propósito: o item está no menu da clínica,
 *     e quem administra precisa poder ver o que o paciente vê.
 *
 * # Sem `forbidden()`
 *
 * As outras rotas privadas negam por PAPEL. Aqui não há papel: o recorte é
 * `portal_patient_ids()`, derivado de `auth.uid()` no banco. Quem não tem
 * vínculo não recebe 403 — recebe uma explicação, porque não estar vinculado
 * não é tentativa de acesso indevido.
 */
export default async function PortalPacientePage() {
  await connection()

  const now = new Date()
  const today = startOfDay(now)

  const [session, repository] = await Promise.all([
    getSessionState(),
    getPatientPortalRepository(),
  ])

  if (!repository || session.status === 'not-configured') {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Portal indisponível neste ambiente."
          description="Não há banco configurado. Este portal não mostra dados de exemplo — consulta e cobrança inventadas seriam indistinguíveis das reais para quem as lê."
        />
      </Card>
    )
  }

  if (session.status === 'anonymous') {
    return (
      <Card>
        <EmptyState
          icon={LogIn}
          title="Entre para ver suas consultas."
          description="O acesso ao portal é criado pela clínica. Se você recebeu um link de convite, abra-o para liberar seu acesso."
          action={
            <Button asChild>
              <Link href="/login?next=/portal-paciente">Entrar</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  /*
   * A partir daqui há sessão. Se ela não tem vínculo de portal, `myProfiles()`
   * devolve lista VAZIA — não erro. É o caso do membro da equipe que clicou no
   * item do menu, e é a resposta certa: ele não é paciente desta clínica.
   */
  let profiles: Awaited<ReturnType<typeof repository.myProfiles>> = []
  let schemaPending = false

  try {
    profiles = await repository.myProfiles()
  } catch (cause) {
    if (
      isPatientPortalRepositoryError(cause) &&
      cause.reason === 'schema-not-ready'
    ) {
      schemaPending = true
    } else {
      throw cause
    }
  }

  if (schemaPending) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Portal ainda não disponível."
          description={patientPortalMessages.schemaPending}
        />
      </Card>
    )
  }

  const profile = profiles[0]

  if (!profile) {
    return (
      <Card>
        <EmptyState
          icon={Stethoscope}
          title="Esta área é do paciente."
          description="Sua conta não está vinculada a nenhum paciente. Quem trabalha na clínica acessa os dados pelo sistema; para dar acesso a um paciente, gere um convite na ficha dele."
          action={
            <Button asChild variant="secondary">
              <Link href="/pacientes">Abrir Pacientes</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  const [appointments, invoices] = await Promise.all([
    repository.myAppointments(
      addDays(today, -HISTORY_DAYS),
      addDays(today, HISTORY_DAYS),
    ),
    repository.myInvoices(),
  ])

  const { upcoming, past } = splitAppointments(appointments, now)

  return (
    <PortalPacienteScreen
      profile={toPortalProfileDto(profile)}
      upcoming={upcoming.map(toPortalAppointmentDto)}
      past={past.map(toPortalAppointmentDto)}
      invoices={invoices.map(toPortalInvoiceDto)}
    />
  )
}

import type { Metadata } from 'next'
import { forbidden, notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ArrowLeft, CalendarPlus, CalendarX2, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import { normalizePatientAdminNote } from '@/modules/patients/application/patientAdminNotes'
import { buildPatientConsentRows } from '@/modules/patients/application/patientConsentRows'
import { toPatientConsentDto } from '@/modules/patients/application/toPatientConsentDto'
import { toPatientContactDto } from '@/modules/patients/application/toPatientContactDto'
import { toPatientTagDto } from '@/modules/patients/application/toPatientTagDto'
import { toIsoDate } from '@/modules/patients/application/toPatientDto'
import { isPatientTagRepositoryError } from '@/modules/patients/domain/PatientTagRepositoryError'
import { getMockPatientNotes } from '@/modules/patients/infrastructure/MockPatientRepository'
import {
  getPatientConsentSource,
  getPatientContactSource,
  getPatientRepository,
  getPatientTagSource,
} from '@/modules/patients/infrastructure/repository'
import { PatientConsentsPanel } from '@/modules/patients/ui/PatientConsentsPanel'
import { PatientContactsPanel } from '@/modules/patients/ui/PatientContactsPanel'
import { PatientProfileActions } from '@/modules/patients/ui/PatientProfileActions'
import { PatientTagsPanel } from '@/modules/patients/ui/PatientTagsPanel'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import {
  formatDayHeading,
  formatShortDate,
  formatTime,
  startOfDay,
} from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  patientStatusMeta,
} from '@/modules/_shared/domain/types'

export const metadata: Metadata = {
  title: 'Perfil do paciente',
}

/** Limite de cinco atendimentos no historico recente, conforme o handoff. */
const MAX_HISTORY = 5

export default async function PatientProfilePage({
  params,
  searchParams,
}: PageProps<'/pacientes/[patientId]'>) {
  await connection()
  const today = startOfDay(new Date())

  const { patientId } = await params
  if (!z.uuid().safeParse(patientId).success) notFound()
  // O menu da listagem e o botao deste cabecalho linkam `?editar=1`.
  const { editar } = await searchParams

  const [patientSource, appointmentSource, session] = await Promise.all([
    getPatientRepository(today),
    getAppointmentRepository(today),
    getSessionState(),
  ])

  /*
   * `patient.read` antes de buscar, e nao depois: a ficha e o dado, nao a
   * moldura. Mesmo motivo do portao em `/pacientes` — ver o comentario de la.
   */
  const isMember = session.status === 'active'
  if (patientSource.isLive && !(isMember && can(session.role, 'patient.read'))) {
    forbidden()
  }

  const patient = await patientSource.repository.findById(
    patientSource.clinicId,
    patientId,
  )

  if (!patient) notFound()

  const status = patientStatusMeta[patient.status]

  /*
   * A ficha ABRE para quem tem `patient.read`; a agenda dentro dela, nao.
   *
   * `finance` tem `patient.read` de proposito — a matriz explica que sem nome e
   * documento nao se emite fatura — e nao tem `appointment.read`, pela mesma
   * matriz: "o que ele nao alcanca e agenda, atendimento e prontuario".
   *
   * Por isso aqui a decisao NAO e `forbidden()`, como em
   * `/pacientes/[patientId]/historico`: bloquear a ficha inteira tiraria do
   * financeiro o cadastro que ele legitimamente usa. As duas secoes de agenda —
   * "Historico recente" e "Proximo atendimento" — e que somem, junto com o link
   * para o historico completo, que responderia 403.
   *
   * A consulta tambem nao acontece: nao adianta esconder na tela o que ja veio
   * pelo fio, porque o payload do RSC continua legivel para quem abrir a aba de
   * rede.
   */
  const canReadAgenda =
    !appointmentSource.isLive ||
    (isMember && can(session.role, 'appointment.read'))

  const appointments = canReadAgenda
    ? await appointmentSource.repository.listByPatient(
        appointmentSource.clinicId,
        patient.id,
      )
    : []

  const nextAppointment = appointments
    .filter((appointment) => appointment.startsAt >= today)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]

  const history = appointments
    .filter((appointment) => appointment.startsAt < today)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, MAX_HISTORY)

  const notes = patientSource.isLive ? [] : getMockPatientNotes(today)
  const adminNote = normalizePatientAdminNote(patient.adminNotes)

  /*
   * Consentimentos LGPD (P-03).
   *
   * A leitura acontece DEPOIS do `notFound()` acima: sem paciente confirmado na
   * clinica ativa, nao ha o que consultar — e consultar mesmo assim seria usar o
   * id da URL como chave de busca em uma tabela generica (`consents` guarda
   * `subject_type` + `subject_id`, sem FK para `patients`).
   *
   * O painel monta as cinco finalidades no servidor, com data e versao ja
   * formatadas. Em modo demonstracao nao ha repositorio: `rows` sai da lista
   * vazia, e as cinco linhas aparecem como "Não registrado" com os botoes
   * desabilitados — o painel se anuncia como demonstracao em vez de simular
   * registro (R11 do roadmap).
   */
  const [consentSource, contactSource] = await Promise.all([
    getPatientConsentSource(),
    getPatientContactSource(),
  ])

  const tagSource = await getPatientTagSource()

  const consents = consentSource.isLive
    ? await consentSource.repository.listByPatient(
        consentSource.clinicId,
        patient.id,
      )
    : []

  const contacts = contactSource.isLive
    ? await contactSource.repository.listByPatient(
        contactSource.clinicId,
        patient.id,
      )
    : []

  let tags = [] as Awaited<ReturnType<typeof tagSource.repository.listByPatient>>
  let tagsSchemaPending = false
  if (tagSource.isLive) {
    try {
      tags = await tagSource.repository.listByPatient(tagSource.clinicId, patient.id)
    } catch (cause) {
      if (isPatientTagRepositoryError(cause) && cause.reason === 'schema-not-ready') {
        tagsSchemaPending = true
      } else {
        throw cause
      }
    }
  }

  const consentRows = buildPatientConsentRows(consents.map(toPatientConsentDto))
  const canManageConsents = isMember && can(session.role, 'patient.write')

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/pacientes"
        className="inline-flex w-fit items-center gap-1.5 text-aux font-medium text-link hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Pacientes
      </Link>

      {/* Cabecalho do perfil */}
      <Card className="flex flex-col gap-5 p-5 nav:flex-row nav:items-center nav:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={patient.name} size="xl" />

          <div className="min-w-0">
            <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground">
              {patient.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span className="text-label text-muted">
                Paciente desde {formatShortDate(patient.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PatientProfileActions
            patient={{
              id: patient.id,
              name: patient.name,
              phone: patient.phone,
              email: patient.email,
              birthDate: toIsoDate(patient.birthDate),
              adminNotes: patient.adminNotes ?? '',
              isActive: patient.status !== 'inactive',
            }}
            isLive={patientSource.isLive}
            openOnMount={editar === '1'}
          />
          <Button asChild>
            <Link href="/agenda?novo=1">
              <CalendarPlus aria-hidden className="size-4" />
              Agendar atendimento
            </Link>
          </Button>
        </div>
      </Card>

      {/* Duas colunas a partir de 1100px */}
      <div className="grid gap-6 nav:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Informações pessoais" />
            <dl className="grid gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-2">
              <ProfileField label="E-mail" value={patient.email || '—'} />
              <ProfileField label="Telefone" value={patient.phone} />
              <ProfileField
                label="Data de nascimento"
                value={
                  patient.birthDate
                    ? formatShortDate(patient.birthDate)
                    : '—'
                }
              />
              <ProfileField label="Documento" value={patient.document ?? '—'} />
              <ProfileField
                label="Preferência de contato"
                value={patient.contactPreference ?? '—'}
              />
            </dl>
          </Card>

          <PatientTagsPanel
            patientId={patient.id}
            tags={tags.map(toPatientTagDto)}
            isLive={tagSource.isLive}
            canManage={canManageConsents}
            schemaPending={tagsSchemaPending}
          />

          <PatientContactsPanel
            patientId={patient.id}
            contacts={contacts.map(toPatientContactDto)}
            isLive={contactSource.isLive}
            canManage={canManageConsents}
          />

          <PatientConsentsPanel
            patientId={patient.id}
            rows={consentRows}
            isLive={consentSource.isLive}
            canManage={canManageConsents}
          />

          {canReadAgenda ? (
          <Card>
            <CardHeader
              title="Histórico recente"
              action={
                <Link
                  href={`/pacientes/${patient.id}/historico`}
                  className="text-label font-semibold text-link hover:underline"
                >
                  Ver histórico completo
                </Link>
              }
            />

            {history.length === 0 ? (
              <EmptyState
                icon={CalendarX2}
                title="Ainda não há atendimentos registrados."
              />
            ) : (
              <ul className="flex flex-col px-5 pb-5">
                {history.map((appointment) => {
                  const appointmentStatus =
                    appointmentStatusMeta[appointment.status]

                  return (
                    <li
                      key={appointment.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-card py-3 first:border-t-0"
                    >
                      <span className="w-24 shrink-0 text-aux text-muted tabular-nums">
                        {formatShortDate(appointment.startsAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-aux font-medium text-foreground">
                          {appointment.type}
                        </span>
                        <span className="block truncate text-label text-muted">
                          {appointment.professionalName}
                        </span>
                      </span>
                      <StatusBadge tone={appointmentStatus.tone}>
                        {appointmentStatus.label}
                      </StatusBadge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {canReadAgenda ? (
          <Card>
            <CardHeader title="Próximo atendimento" />

            <div className="px-5 pb-5">
              {nextAppointment ? (
                <div className="rounded-field bg-brand-subtle p-4">
                  <p className="text-aux font-semibold text-brand first-letter:uppercase">
                    {formatDayHeading(nextAppointment.startsAt)}
                  </p>
                  <p className="mt-1 text-metric font-semibold text-brand tabular-nums">
                    {formatTime(nextAppointment.startsAt)}
                  </p>
                  <p className="mt-2 text-aux text-link">
                    {nextAppointment.type}
                  </p>
                  <p className="text-label text-link/80">
                    {nextAppointment.professionalName}
                  </p>
                </div>
              ) : (
                <EmptyState
                  icon={CalendarX2}
                  title="Nenhum atendimento agendado."
                  action={
                    <Button asChild>
                      <Link href="/agenda?novo=1">
                        <CalendarPlus aria-hidden className="size-4" />
                        Agendar atendimento
                      </Link>
                    </Button>
                  }
                />
              )}
            </div>
          </Card>
          ) : null}

          {/* Observacoes internas: visualmente discretas e separadas do cadastro */}
          <Card>
            <CardHeader
              title="Observações"
              description="Notas administrativas da equipe, separadas do prontuário clínico."
            />
            {patientSource.isLive ? (
              adminNote ? (
                <div className="mx-5 mb-5 rounded-field bg-background p-4">
                  <p className="text-aux text-foreground">{adminNote}</p>
                  <p className="mt-2 text-label text-muted">
                    Observação atual do cadastro
                  </p>
                </div>
              ) : (
                <EmptyState
                  icon={StickyNote}
                  title="Nenhuma observação registrada."
                />
              )
            ) : notes.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title="Nenhuma observação registrada."
              />
            ) : (
              <ul className="flex flex-col gap-3 px-5 pb-5">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-field bg-background p-4"
                  >
                    <p className="text-aux text-foreground">{note.content}</p>
                    <p className="mt-2 text-label text-muted">
                      {note.authorName} · {formatShortDate(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-0.5 text-aux text-foreground">{value}</dd>
    </div>
  )
}

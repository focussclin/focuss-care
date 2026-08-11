import type { Metadata } from 'next'
import { forbidden, notFound } from 'next/navigation'
import { connection } from 'next/server'
import {
  ArrowLeft,
  CalendarPlus,
  CalendarX2,
  LockKeyhole,
  StickyNote,
} from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { isPrefetchRender } from '@/lib/audit/access-context'
import {
  describeClinicalScopes,
  recordClinicalAccess,
  type ClinicalScope,
} from '@/lib/audit/clinical-access'
import { getCurrentProfessionalId } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import { formatPhone } from '@/lib/utils/phone'
import {
  formatAddress,
  formatCns,
  formatCpf,
} from '@/modules/patients/domain/PatientDocuments'
import {
  biologicalSexLabel,
  preferredName,
  showsLegalName,
} from '@/modules/patients/domain/PatientIdentity'
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
  getAllergySource,
  getPatientTagSource,
} from '@/modules/patients/infrastructure/repository'
import { PatientConsentsPanel } from '@/modules/patients/ui/PatientConsentsPanel'
import { PatientContactsPanel } from '@/modules/patients/ui/PatientContactsPanel'
import { PatientProfileActions } from '@/modules/patients/ui/PatientProfileActions'
import {
  setAllergyActiveFromPanel,
  submitAllergyFromPanel,
} from '@/modules/patients/actions/allergyPanel.actions'
import { toAllergyDto } from '@/modules/patients/application/toAllergyDto'
import { isAllergyRepositoryError } from '@/modules/patients/domain/AllergyRepository'
import { allergyMessages } from '@/modules/patients/schemas/allergy.schema'
import { createPrescriptionFromPanel } from '@/modules/records/actions/createPrescription.action'
import { toPrescriptionDto } from '@/modules/records/application/toPrescriptionDto'
import { toMedicalRecordDto } from '@/modules/records/application/toRecordDto'
import type { MedicalRecord } from '@/modules/records/domain/MedicalRecord'
import { isMedicalRecordRepositoryError } from '@/modules/records/domain/MedicalRecordRepositoryError'
import type { Prescription } from '@/modules/records/domain/Prescription'
import { isPrescriptionRepositoryError } from '@/modules/records/domain/PrescriptionRepository'
import { getPrescriptionSource } from '@/modules/records/infrastructure/prescription-repository'
import { getMedicalRecordRepository } from '@/modules/records/infrastructure/repository'
import { prescriptionMessages } from '@/modules/records/schemas/prescription.schema'
import {
  PATIENT_RECORD_LIMIT,
  recordMessages,
} from '@/modules/records/schemas/record.schema'
import { PatientPrescriptionsPanel } from '@/modules/records/ui/PatientPrescriptionsPanel'
import { PatientRecordsPanel } from '@/modules/records/ui/PatientRecordsPanel'
import { recordVitalsFromPanel } from '@/modules/encounters/actions/recordVitals.action'
import { toVitalsDto } from '@/modules/encounters/application/toVitalsDto'
import type { VitalsEntry } from '@/modules/encounters/domain/Vitals'
import { isVitalsRepositoryError } from '@/modules/encounters/domain/VitalsRepository'
import { getVitalsSource } from '@/modules/encounters/infrastructure/vitals-repository'
import { vitalsMessages } from '@/modules/encounters/schemas/vitals.schema'
import { PatientVitalsPanel } from '@/modules/encounters/ui/PatientVitalsPanel'
import { PatientAllergiesPanel } from '@/modules/patients/ui/PatientAllergiesPanel'
import { PatientTagsPanel } from '@/modules/patients/ui/PatientTagsPanel'
import { createInviteFromScreen } from '@/modules/patient-portal/actions/portalInviteScreen.actions'
import { toPortalInviteSummaryDto } from '@/modules/patient-portal/application/toPatientPortalDto'
import { isPatientPortalRepositoryError } from '@/modules/patient-portal/domain/PatientPortalRepositoryError'
import { getPatientPortalRepository } from '@/modules/patient-portal/infrastructure/repository'
import { PatientPortalPanel } from '@/modules/patient-portal/ui/PatientPortalPanel'
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

  const [tagSource, portalRepository] = await Promise.all([
    getPatientTagSource(),
    getPatientPortalRepository(),
  ])

  /*
   * Alergias — dado clínico, e por isso atrás de `record.read`.
   *
   * A ficha é visível a quem tem `patient.read`, o que inclui `finance` e
   * `admin`. A matriz de permissões é explícita: o que esses dois não alcançam
   * é "agenda, atendimento e prontuário". Alergia é informação de saúde, então
   * entra na mesma trava — mostrar aqui abriria uma porta lateral para o dado
   * clínico que `/prontuarios` protege.
   *
   * (Que a recepção precise saber de alergia a látex antes de preparar a sala é
   * um argumento real, mas mudaria a matriz de permissões do produto. Isso é
   * decisão de produto, não efeito colateral de um painel novo.)
   */
  const canReadAllergies = isMember && can(session.role, 'record.read')
  const canWriteAllergies = isMember && can(session.role, 'record.write')
  const allergySource = canReadAllergies ? await getAllergySource() : null

  let allergies: Awaited<
    ReturnType<NonNullable<typeof allergySource>['repository']['listByPatient']>
  > = []
  let allergiesError: string | null = null

  if (allergySource) {
    try {
      allergies = await allergySource.repository.listByPatient(
        allergySource.clinicId,
        patient.id,
      )
    } catch (cause) {
      if (!isAllergyRepositoryError(cause)) throw cause
      allergiesError =
        cause.reason === 'forbidden' ? allergyMessages.forbidden : allergyMessages.unavailable
    }
  }

  /*
   * Sinais vitais — `encounter.read` para ver, `encounter.write` para registrar.
   *
   * A permissão NÃO foi escolhida por analogia: a matriz de
   * `src/lib/auth/permissions.ts` nomeia "sinais vitais" ao lado de check-in e
   * fila, no comentário que abre `encounter.read`. Seguir a declaração
   * explícita do produto é diferente do caso das alergias logo acima, onde não
   * havia nada escrito e a escolha por `record.*` ficou registrada como
   * julgamento.
   */
  const canReadVitals = isMember && can(session.role, 'encounter.read')
  const canWriteVitals = isMember && can(session.role, 'encounter.write')
  const vitalsSource = canReadVitals ? await getVitalsSource() : null

  let vitals: VitalsEntry[] = []
  let vitalsError: string | null = null

  if (vitalsSource) {
    try {
      vitals = await vitalsSource.repository.listByPatient(
        vitalsSource.clinicId,
        patient.id,
      )
    } catch (cause) {
      if (!isVitalsRepositoryError(cause)) throw cause
      vitalsError =
        cause.reason === 'forbidden' ? vitalsMessages.forbidden : vitalsMessages.unavailable
    }
  }

  /*
   * Prescrições — `record.read` para ver, `record.write` para prescrever.
   *
   * A permissão mais restritiva do produto, a mesma do prontuário: `admin` e
   * `finance` não alcançam. A ficha inteira é visível a quem tem
   * `patient.read`, mas receita é dado clínico.
   *
   * `isProfessional` é a SEGUNDA porta, e vem separada: quem tem o papel mas
   * não tem cadastro em `professionals` vê a lista e recebe uma mensagem
   * dizendo o que fazer — em vez de um botão desabilitado sem explicação.
   */
  const canReadPrescriptions = isMember && can(session.role, 'record.read')
  const canWritePrescriptions = isMember && can(session.role, 'record.write')
  const prescriptionSource = canReadPrescriptions ? await getPrescriptionSource() : null
  const professionalId = canWritePrescriptions ? await getCurrentProfessionalId() : null

  let prescriptions: Prescription[] = []
  let prescriptionsError: string | null = null

  if (prescriptionSource) {
    try {
      prescriptions = await prescriptionSource.repository.listByPatient(
        prescriptionSource.clinicId,
        patient.id,
      )
    } catch (cause) {
      if (!isPrescriptionRepositoryError(cause)) throw cause
      prescriptionsError =
        cause.reason === 'forbidden'
          ? prescriptionMessages.forbidden
          : prescriptionMessages.unavailable
    }
  }

  /*
   * Prontuário — o registro clínico do paciente, na ficha dele.
   *
   * A permissão é a mesma das prescrições (`record.read` / `record.write`), e
   * está declarada de novo em vez de reaproveitar as constantes acima: são duas
   * decisões independentes que hoje coincidem, e amarrá-las faria a próxima
   * mudança na matriz de I-05 mexer nas duas sem querer. `professionalId` é
   * reusado de propósito — `getCurrentProfessionalId()` é a mesma consulta, e o
   * portão que o resolve é `record.write` nos dois casos.
   *
   * `admin` e `finance` alcançam a ficha por `patient.read` e param aqui: a
   * matriz diz, com todas as letras, que o que eles não alcançam é "agenda,
   * atendimento e prontuário".
   */
  const canReadRecords = isMember && can(session.role, 'record.read')
  const canWriteRecords = isMember && can(session.role, 'record.write')
  const recordSource = canReadRecords
    ? await getMedicalRecordRepository(today)
    : null

  let records: MedicalRecord[] = []
  let recordsError: string | null = null

  /*
   * Em demonstração a ficha NÃO lista prontuário, e isso é decisão desta rota.
   *
   * `MockMedicalRecordRepository` deriva as evoluções de exemplo das notas de
   * paciente de `clinic-data` — escolha correta para `/prontuarios`, que é uma
   * vitrine da tela inteira. Aqui os mesmos três textos apareceriam duas vezes
   * na mesma página: como prontuário, e como "Observações", logo abaixo, sob um
   * cabeçalho que afirma serem "notas administrativas da equipe, separadas do
   * prontuário clínico".
   *
   * Uma tela não pode dizer as duas coisas sobre o mesmo texto. É também o que
   * o painel de prescrições já faz na ficha: em demonstração não exibe receita
   * fictícia nenhuma.
   */
  if (recordSource?.isLive) {
    try {
      records = await recordSource.repository.listCurrentByPatient(
        recordSource.clinicId,
        patient.id,
        PATIENT_RECORD_LIMIT,
      )
    } catch (cause) {
      /*
       * O painel diz o que houve; a ficha continua de pé.
       *
       * Deixar propagar levaria junto cadastro, contatos, consentimentos e
       * agenda — dez painéis apagados porque uma consulta clínica foi recusada.
       */
      if (!isMedicalRecordRepositoryError(cause)) throw cause
      recordsError =
        cause.reason === 'forbidden'
          ? recordMessages.forbidden
          : recordMessages.unavailable
    }
  }

  /*
   * Auditoria de ACESSO CLÍNICO — um evento por abertura de ficha.
   *
   * # Por que aqui, e não dentro de cada painel
   *
   * Quatro chamadas, uma por recorte, dariam quatro linhas por abertura: a mesma
   * poluição que a pré-busca causava, e com o mesmo efeito — o acesso que
   * importa some no meio das repetições. Abrir a ficha é UM ato, e o evento diz
   * quais recortes clínicos foram entregues nele.
   *
   * # Por que depois das leituras, e não antes
   *
   * O evento nomeia o que ATRAVESSOU a fronteira, e isso só se sabe depois de
   * cada consulta responder. Continua valendo o "auditar antes de entregar" de
   * `/prontuarios`: nada saiu para o navegador ainda — a resposta desta rota é
   * montada abaixo.
   *
   * Escopo entra apenas quando o dado é REAL e foi lido: papel sem permissão,
   * consulta recusada pela RLS e modo demonstração ficam de fora. Um evento
   * afirmando leitura de alergias sobre uma consulta que falhou seria uma
   * acusação falsa contra quem abriu a ficha.
   *
   * # O que isto conserta
   *
   * `receptionist` e `admin` têm `encounter.read` e não têm `record.read`: os
   * dois abriam a ficha, recebiam os sinais vitais da pessoa e não passavam por
   * nenhum caminho auditado. A trilha respondia "quem leu o prontuário" e nunca
   * "quem leu dado clínico".
   *
   * Pré-busca continua não sendo acesso — ver `lib/audit/access-context.ts`.
   */
  const clinicalScopes: ClinicalScope[] = []
  if (recordSource?.isLive && !recordsError) clinicalScopes.push('medical_records')
  if (prescriptionSource?.isLive && !prescriptionsError) {
    clinicalScopes.push('prescriptions')
  }
  if (vitalsSource?.isLive && !vitalsError) clinicalScopes.push('vitals')
  if (allergySource?.isLive && !allergiesError) clinicalScopes.push('allergies')

  if (clinicalScopes.length > 0 && !(await isPrefetchRender())) {
    await recordClinicalAccess({ patientId: patient.id, scopes: clinicalScopes })
  }

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

  /*
   * Convites do portal — histórico, nunca o token.
   *
   * `listInvites` seleciona colunas nomeadas e `token_hash` fica de fora. O
   * token em claro só existe no retorno da action que o cria, e só naquele
   * instante: depois desta tela recarregar, ele não existe em lugar nenhum.
   */
  let portalInvites: Awaited<
    ReturnType<NonNullable<typeof portalRepository>['listInvites']>
  > = []
  let portalSchemaPending = false

  if (portalRepository && patientSource.isLive) {
    try {
      portalInvites = await portalRepository.listInvites(
        patientSource.clinicId,
        patient.id,
      )
    } catch (cause) {
      if (
        isPatientPortalRepositoryError(cause) &&
        cause.reason === 'schema-not-ready'
      ) {
        portalSchemaPending = true
      } else {
        throw cause
      }
    }
  }

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
              {preferredName(patient)}
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
              socialName: patient.socialName ?? '',
              biologicalSex: patient.biologicalSex ?? 'not_informed',
              genderIdentity: patient.genderIdentity ?? '',
              phoneAlt: patient.phoneAlt ?? '',
              emergencyContactName: patient.emergencyContact?.name ?? '',
              emergencyContactPhone: patient.emergencyContact?.phone ?? '',
              emergencyContactRelationship:
                patient.emergencyContact?.relationship ?? '',
              emergencyContactUnreadable: Boolean(
                patient.emergencyContactUnreadable,
              ),
              /*
               * CPF e CNS vão em DÍGITOS para o formulário, e não formatados: o
               * campo é texto livre e o servidor normaliza de novo ao salvar.
               * Mandar `123.456.789-09` faria a comparação de "mudou?" acusar
               * alteração em todo save.
               */
              cpf: patient.cpf ?? '',
              cns: patient.cns ?? '',
              addressZip: patient.address?.zip ?? '',
              addressStreet: patient.address?.street ?? '',
              addressNumber: patient.address?.number ?? '',
              addressComplement: patient.address?.complement ?? '',
              addressDistrict: patient.address?.district ?? '',
              addressCity: patient.address?.city ?? '',
              addressState: patient.address?.state ?? '',
              addressUnreadable: Boolean(patient.addressUnreadable),
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
                label="Telefone alternativo"
                value={patient.phoneAlt || '—'}
              />
              <ProfileField
                label="Sexo biológico"
                value={biologicalSexLabel(patient.biologicalSex ?? 'not_informed')}
              />
              <ProfileField
                label="Identidade de gênero"
                value={patient.genderIdentity || '—'}
              />
              <ProfileField
                label="Data de nascimento"
                value={
                  patient.birthDate
                    ? formatShortDate(patient.birthDate)
                    : '—'
                }
              />
              <ProfileField
                label="CPF"
                value={patient.cpf ? formatCpf(patient.cpf) : '—'}
              />
              <ProfileField
                label="CNS"
                value={patient.cns ? formatCns(patient.cns) : '—'}
              />
              <ProfileField
                label="Preferência de contato"
                value={patient.contactPreference ?? '—'}
              />
              {/*
                O nome de REGISTRO aparece quando difere do social: quem confere
                documento, guia de convenio ou receita precisa dos dois. Mostrar
                os dois e diferente de chamar pelo errado — o titulo da pagina ja
                usa o social.
              */}
              {showsLegalName(patient) ? (
                <ProfileField label="Nome de registro" value={patient.name} />
              ) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Endereço"
              description="Usado em correspondência, guia de convênio e nota fiscal."
            />
            {patient.addressUnreadable ? (
              <p
                role="status"
                className="mx-5 mb-5 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
              >
                Há um endereço gravado num formato que o sistema não reconhece.
                Abra a edição e cadastre-o de novo para poder usá-lo.
              </p>
            ) : patient.address ? (
              <p className="px-5 pb-5 text-aux text-foreground">
                {formatAddress(patient.address)}
              </p>
            ) : (
              <p className="px-5 pb-5 text-aux text-muted">
                Nenhum endereço cadastrado.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Contato de emergência"
              description="A quem avisar se algo acontecer durante o atendimento."
            />
            {patient.emergencyContactUnreadable ? (
              <p
                role="status"
                className="mx-5 mb-5 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
              >
                Há um contato gravado num formato que o sistema não reconhece.
                Abra a edição e cadastre-o de novo para poder usá-lo.
              </p>
            ) : patient.emergencyContact ? (
              <dl className="grid gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-2">
                <ProfileField label="Nome" value={patient.emergencyContact.name} />
                <ProfileField
                  label="Telefone"
                  value={
                    patient.emergencyContact.phone
                      ? formatPhone(patient.emergencyContact.phone)
                      : '—'
                  }
                />
                <ProfileField
                  label="Parentesco"
                  value={patient.emergencyContact.relationship || '—'}
                />
              </dl>
            ) : (
              <p className="px-5 pb-5 text-aux text-muted">
                Nenhum contato de emergência cadastrado.
              </p>
            )}
          </Card>

          {/*
            O aviso de acesso registrado vive AQUI, e não dentro de cada painel.

            É a rota que sabe quais recortes foram entregues a quem está lendo —
            a recepção recebe sinais vitais e não recebe prontuário, e um aviso
            por painel repetiria a mesma frase quatro vezes dizendo menos.

            Ele só aparece quando houve acesso clínico de verdade: quem abre a
            ficha e recebe apenas cadastro não é avisado de um registro que não
            existe.
          */}
          {clinicalScopes.length > 0 ? (
            <p className="flex items-start gap-2.5 rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
              <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
              Acesso registrado: a leitura de{' '}
              {describeClinicalScopes(clinicalScopes)} nesta ficha fica na trilha
              de auditoria, com quem abriu e quando.
            </p>
          ) : null}

          {/*
            O prontuário abre os painéis clínicos, e a ordem é a da leitura:
            a evolução explica a prescrição e a alergia que vêm depois dela.
          */}
          {recordSource ? (
            <PatientRecordsPanel
              patientId={patient.id}
              patientName={preferredName(patient)}
              records={records.map(toMedicalRecordDto)}
              canWrite={canWriteRecords}
              isProfessional={professionalId !== null}
              isLive={recordSource.isLive}
              limit={PATIENT_RECORD_LIMIT}
              loadError={recordsError}
            />
          ) : null}

          {prescriptionSource ? (
            <PatientPrescriptionsPanel
              patientId={patient.id}
              prescriptions={prescriptions.map(toPrescriptionDto)}
              onCreate={createPrescriptionFromPanel}
              canPrescribe={canWritePrescriptions}
              isProfessional={professionalId !== null}
              isLive={prescriptionSource.isLive}
              loadError={prescriptionsError}
            />
          ) : null}

          {vitalsSource ? (
            <PatientVitalsPanel
              patientId={patient.id}
              entries={vitals.map(toVitalsDto)}
              onRecord={recordVitalsFromPanel}
              canRecord={canWriteVitals}
              isLive={vitalsSource.isLive}
              loadError={vitalsError}
            />
          ) : null}

          {allergySource ? (
            <PatientAllergiesPanel
              patientId={patient.id}
              allergies={allergies.map(toAllergyDto)}
              onSubmit={submitAllergyFromPanel}
              onSetActive={setAllergyActiveFromPanel}
              canManage={canWriteAllergies}
              isLive={allergySource.isLive}
              loadError={allergiesError}
            />
          ) : null}

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

          {/*
            `canManageConsents` é `patient.write` — a mesma permissão que a
            action e a função do banco exigem para emitir o convite. As três
            checagens existem e protegem coisas diferentes: esta esconde o que
            não funcionaria, a action recusa cedo com mensagem boa, e a do banco
            vale também para quem chamar o PostgREST direto.
          */}
          <PatientPortalPanel
            patientId={patient.id}
            defaultEmail={patient.email ?? null}
            invites={portalInvites.map(toPortalInviteSummaryDto)}
            canManage={canManageConsents}
            isLive={patientSource.isLive}
            schemaPending={portalSchemaPending}
            onCreate={createInviteFromScreen}
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

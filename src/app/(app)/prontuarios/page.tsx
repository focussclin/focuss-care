import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import {
  getCurrentProfessionalId,
  getActiveClinicRole,
} from '@/lib/auth/active-clinic'
import { isPrefetchRender } from '@/lib/audit/access-context'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'
import { toMedicalRecordDto } from '@/modules/records/application/toRecordDto'
import { getMedicalRecordRepository } from '@/modules/records/infrastructure/repository'
import { ProntuariosScreen } from '@/modules/records/ui/ProntuariosScreen'

export const metadata: Metadata = {
  title: 'Prontuários',
  description: 'Acesse evoluções e documentos com rastreabilidade e segurança.',
  // Prontuário nunca é indexável, mesmo atrás de sessão.
  robots: { index: false, follow: false },
}

/** Quantos registros vigentes a tela carrega por vez. */
const RECENT_LIMIT = 30

export default async function ProntuariosPage() {
  await connection()
  const today = startOfDay(new Date())

  /*
   * Autorização ANTES de qualquer leitura.
   *
   * `forbidden()` interrompe o render e mostra `app/forbidden.tsx` (I-05).
   * Diferente do resto do produto, aqui não basta a RLS recusar depois: uma
   * tela que carrega e vem vazia não diz a quem administra a clínica que ele
   * não deveria estar ali — diz que não há prontuário.
   */
  const role = await getActiveClinicRole()
  if (!can(role, 'record.read')) forbidden()

  const [recordSource, patientSource, professionalId] = await Promise.all([
    getMedicalRecordRepository(today),
    getPatientRepository(today),
    getCurrentProfessionalId(),
  ])

  /*
   * Auditoria de LEITURA antes de entregar o conteúdo.
   *
   * É o que separa prontuário de qualquer outra listagem: nos demais módulos
   * audita-se a escrita; aqui, abrir também é um ato, e é o que permite
   * responder "quem leu o prontuário desta paciente?".
   *
   * Best-effort de propósito — falhar aqui não pode impedir um profissional de
   * ver o prontuário do paciente que está na frente dele.
   */
  /*
   * `null` porque esta tela e a LISTAGEM, nao um paciente.
   *
   * Aqui passava a string 'all', e `audit_log.entity_id` e `uuid`: o Postgres
   * recusava a linha inteira com 22P02 e o evento sumia — a auditoria e
   * best-effort, entao nada quebrava na tela. A leitura de prontuario
   * simplesmente nao era registrada.
   *
   * PRE-BUSCA nao e acesso. O corpo desta rota tambem roda quando o Next
   * pre-busca a pagina — passar o mouse no menu bastava para gravar uma leitura
   * de prontuario. Medido em 09/08/2026: 731 dos 742 eventos de `audit_log`
   * eram exatamente isso. Ver `lib/audit/access-context.ts`.
   */
  if (!(await isPrefetchRender())) {
    await recordSource.repository.logAccess(recordSource.clinicId, null)
  }

  const [records, patientPage] = await Promise.all([
    recordSource.repository.listRecent(recordSource.clinicId, RECENT_LIMIT),
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: PATIENT_PAGE_MAX_SIZE,
      cursor: null,
    }),
  ])

  const patientNames = Object.fromEntries(
    patientPage.items.map((patient) => [patient.id, patient.name]),
  )

  return (
    <ProntuariosScreen
      records={records.map(toMedicalRecordDto)}
      patients={patientPage.items.map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))}
      patientNames={patientNames}
      // Duas portas: o papel permite escrever E existe cadastro profissional.
      canWrite={can(role, 'record.write') && professionalId !== null}
      isLive={recordSource.isLive}
    />
  )
}

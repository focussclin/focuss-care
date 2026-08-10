'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toVitalsFailure } from '../application/vitalsFailure'
import { toVitalsDto } from '../application/toVitalsDto'
import { vitalsRepositoryFor } from '../infrastructure/vitals-repository'
import {
  recordVitalsSchema,
  vitalsMessages,
  type RecordVitalsInput,
  type VitalsEntryDto,
  type VitalsFormValues,
} from '../schemas/vitals.schema'

type Fields =
  | 'patientId'
  | 'measuredAt'
  | 'weightKg'
  | 'heightCm'
  | 'systolicBp'
  | 'diastolicBp'
  | 'heartRate'
  | 'respiratoryRate'
  | 'temperatureC'
  | 'spo2'
  | 'glucoseMgdl'
  | 'notes'

/**
 * Registra uma aferição. **Não existe edição nem exclusão.**
 *
 * `encounter.write` — e a permissão não foi escolhida por analogia: a matriz de
 * `src/lib/auth/permissions.ts` nomeia "sinais vitais" ao lado de check-in e
 * fila, no comentário que abre `encounter.read`/`encounter.write`. Seguir a
 * declaração explícita do produto é diferente de decidir sozinho, que foi o
 * caso das alergias — lá não havia nada escrito, e a escolha por `record.*`
 * ficou registrada como julgamento.
 *
 * A aferição é de um instante: corrigir é registrar de novo, e a tabela não tem
 * `updated_at` nem `deleted_at` justamente por isso.
 */
const runRecordVitals = createAction<RecordVitalsInput, VitalsEntryDto, Fields>({
  name: 'vitals.record',
  schema: recordVitalsSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    validation: vitalsMessages.invalidFields,
    unavailable: vitalsMessages.unavailable,
    unexpected: vitalsMessages.unexpected,
  },
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    const measuredAt = new Date(input.measuredAt)

    /*
     * Aferição no futuro é erro de digitação — quase sempre o ano.
     *
     * A checagem fica AQUI, e não no schema: `new Date()` num schema o tornaria
     * dependente do relógio no momento da importação, e o teste do schema
     * passaria a variar com a hora em que roda.
     */
    if (measuredAt.getTime() > Date.now()) {
      return toVitalsFailure<Fields>('vitals.record', new Error('medida no futuro'))
    }

    try {
      const repository = vitalsRepositoryFor(context.supabase)

      /*
       * `patientId` e `encounterId` VÊM DO CLIENTE, e as FKs não os prendem ao
       * tenant.
       *
       * `vitals.patient_id` referencia `patients.id` — coluna única. Ela prova
       * que o paciente existe em algum lugar do banco, não que existe NESTA
       * clínica. Sem a checagem abaixo, um id de outra clínica seria aceito e
       * gravaria uma aferição com o `clinic_id` certo apontando para o paciente
       * errado: invisível na ficha de quem deveria vê-la, e presente onde não
       * deveria.
       *
       * (As migrations locais resolvem isso com FK composta `(id, clinic_id)`.
       * `vitals` é do schema original e não tem uma — ver §7 de
       * `docs/03-banco-de-dados.md`.)
       */
      if (!(await repository.patientBelongsTo(context.clinicId, input.patientId))) {
        return err<Fields>('not-found', vitalsMessages.notFound)
      }

      /*
       * O atendimento precisa ser desta clínica E deste paciente.
       *
       * A segunda condição não é redundante: dentro da mesma clínica, um
       * `encounterId` de outro paciente também passaria pela FK, e a aferição
       * ficaria pendurada no atendimento de outra pessoa.
       */
      if (
        input.encounterId !== null &&
        !(await repository.encounterBelongsTo(
          context.clinicId,
          input.encounterId,
          input.patientId,
        ))
      ) {
        return err<Fields>('not-found', vitalsMessages.encounterMismatch)
      }

      const entry = await repository.record(
        context.clinicId,
        context.userId,
        {
          patientId: input.patientId,
          encounterId: input.encounterId,
          measuredAt,
          weightKg: input.weightKg,
          heightCm: input.heightCm,
          systolicBp: input.systolicBp,
          diastolicBp: input.diastolicBp,
          heartRate: input.heartRate,
          respiratoryRate: input.respiratoryRate,
          temperatureC: input.temperatureC,
          spo2: input.spo2,
          glucoseMgdl: input.glucoseMgdl,
          notes: input.notes,
        },
      )
      return ok(toVitalsDto(entry))
    } catch (cause) {
      return toVitalsFailure<Fields>('vitals.record', cause)
    }
  },
  /*
   * A auditoria guarda O QUE foi medido, não os valores.
   *
   * A trilha existe para reconstruir quem registrou o quê e quando; repetir os
   * números nela criaria uma segunda cópia de dado clínico numa tabela com
   * outra permissão de leitura (`audit.read`, que `admin` tem e `record.read`
   * não). O registro em si está em `vitals`, sob a permissão certa.
   */
  audit: (output) => ({
    action: 'vitals.recorded',
    entityType: 'vitals',
    entityId: output.id,
    after: {
      patient_id: output.patientId,
      encounter_id: output.encounterId,
      measured_at: output.measuredAt,
    },
  }),
})

export async function recordVitalsAction(
  rawInput: unknown,
): Promise<ActionResult<VitalsEntryDto, Fields>> {
  return runRecordVitals(rawInput)
}

export async function recordVitalsFromPanel(
  patientId: string,
  values: VitalsFormValues,
): Promise<string | null> {
  const result = await runRecordVitals({ patientId, encounterId: null, ...values })
  return result.ok ? null : result.error.message
}

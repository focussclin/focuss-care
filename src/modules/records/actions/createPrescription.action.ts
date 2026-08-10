'use server'

import { getCurrentProfessionalId } from '@/lib/auth/active-clinic'
import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPrescriptionFailure } from '../application/prescriptionFailure'
import { toPrescriptionDto } from '../application/toPrescriptionDto'
import { prescriptionRepositoryFor } from '../infrastructure/prescription-repository'
import {
  createPrescriptionSchema,
  prescriptionMessages,
  type CreatePrescriptionInput,
  type PrescriptionDto,
  type PrescriptionFormValues,
} from '../schemas/prescription.schema'

type Fields = 'patientId' | 'encounterId' | 'validUntil' | 'items'

/**
 * Registra uma prescrição. **Não assina, não emite, não imprime.**
 *
 * # Três portas, e as três fecham
 *
 *  1. **Papel** — `record.write`: só `owner` e `professional`. É a permissão
 *     mais restritiva do produto, e a mesma que o prontuário exige.
 *  2. **Cadastro profissional** — `current_professional_id()`: quem não tem
 *     linha em `professionals` não prescreve, mesmo com o papel. `author_id`
 *     aponta para quem tem conselho e responsabilidade clínica, não para um
 *     login. É a mesma segunda porta de `record.create`.
 *  3. **Alvo** — o paciente precisa ser desta clínica, e o atendimento (quando
 *     informado) desta clínica E deste paciente. As FKs de `prescriptions` são
 *     de coluna única: provam existência, não tenancy.
 *
 * `authorId` **nunca vem do cliente**. Aceitá-lo do formulário deixaria alguém
 * prescrever em nome de outro profissional — o que, numa receita, é falsidade
 * ideológica com consequência clínica.
 */
const runCreatePrescription = createAction<
  CreatePrescriptionInput,
  PrescriptionDto,
  Fields
>({
  name: 'prescription.create',
  schema: createPrescriptionSchema,
  roles: rolesWith('record.write'),
  messages: {
    forbidden: prescriptionMessages.forbidden,
    validation: prescriptionMessages.invalidFields,
    unavailable: prescriptionMessages.unavailable,
    unexpected: prescriptionMessages.unexpected,
  },
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    const authorId = await getCurrentProfessionalId()

    if (!authorId) {
      return err<Fields>('forbidden', prescriptionMessages.notAProfessional)
    }

    const validUntil = input.validUntil ? new Date(input.validUntil) : null

    /*
     * Validade anterior à emissão é erro de digitação — quase sempre o ano.
     *
     * A comparação fica aqui, e não no schema: `new Date()` num schema o
     * tornaria dependente do relógio no momento da importação.
     *
     * Isto NÃO é julgamento clínico sobre o prazo: a aplicação não opina se
     * trinta dias são muitos ou poucos, só recusa uma data que já nasceu
     * vencida.
     */
    if (validUntil && validUntil.getTime() < Date.now()) {
      return err<Fields>('validation', prescriptionMessages.validUntilPast)
    }

    try {
      const repository = prescriptionRepositoryFor(context.supabase)

      if (!(await repository.patientBelongsTo(context.clinicId, input.patientId))) {
        return err<Fields>('not-found', prescriptionMessages.notFound)
      }

      if (
        input.encounterId !== null &&
        !(await repository.encounterBelongsTo(
          context.clinicId,
          input.encounterId,
          input.patientId,
        ))
      ) {
        return err<Fields>('not-found', prescriptionMessages.encounterMismatch)
      }

      const prescription = await repository.create(context.clinicId, authorId, {
        patientId: input.patientId,
        encounterId: input.encounterId,
        validUntil,
        items: input.items,
      })

      return ok(toPrescriptionDto(prescription))
    } catch (cause) {
      return toPrescriptionFailure<Fields>('prescription.create', cause)
    }
  },
  /*
   * A trilha NÃO copia conteúdo clínico.
   *
   * Nada de nome de medicamento, dose ou orientação: `audit_log` tem outra
   * permissão de leitura (`audit.read`, que `admin` tem e `record.read` não), e
   * copiar a receita para lá criaria uma segunda via do dado clínico fora da
   * trava que o protege. O que a auditoria precisa é reconstruir QUEM
   * prescreveu para quem e quando — e a quantidade de itens, que responde "a
   * receita estava vazia?" sem dizer o que havia nela.
   */
  audit: (output) => ({
    action: 'prescription.created',
    entityType: 'prescription',
    entityId: output.id,
    after: {
      patient_id: output.patientId,
      encounter_id: output.encounterId,
      item_count: output.items.length,
    },
  }),
})

export async function createPrescriptionAction(
  rawInput: unknown,
): Promise<ActionResult<PrescriptionDto, Fields>> {
  return runCreatePrescription(rawInput)
}

export async function createPrescriptionFromPanel(
  patientId: string,
  values: PrescriptionFormValues,
): Promise<string | null> {
  const result = await runCreatePrescription({
    patientId,
    encounterId: null,
    validUntil: values.validUntil,
    items: values.items,
  })
  return result.ok ? null : result.error.message
}

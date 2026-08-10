import type { Prescription } from '../domain/Prescription'
import type { PrescriptionDto } from '../schemas/prescription.schema'

/**
 * `authorId` não cruza a fronteira — só o nome.
 *
 * A tela mostra quem prescreveu; o id de `professionals` não é usado por nada
 * na interface, e mandá-lo exporia um identificador interno sem ganho.
 */
export function toPrescriptionDto(prescription: Prescription): PrescriptionDto {
  return {
    id: prescription.id,
    patientId: prescription.patientId,
    encounterId: prescription.encounterId,
    authorName: prescription.authorName,
    issuedAt: prescription.issuedAt.toISOString(),
    validUntil: prescription.validUntil?.toISOString() ?? null,
    signedAt: prescription.signedAt?.toISOString() ?? null,
    externalUrl: prescription.externalUrl,
    items: prescription.items.map((item) => ({
      id: item.id,
      drugName: item.drugName,
      dosage: item.dosage,
      route: item.route,
      frequency: item.frequency,
      duration: item.duration,
      quantity: item.quantity,
      instructions: item.instructions,
      sortOrder: item.sortOrder,
    })),
  }
}

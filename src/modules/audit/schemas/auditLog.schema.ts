import { z } from 'zod'

const optionalFilter = z
  .string()
  .trim()
  .max(80, 'O filtro pode ter no máximo 80 caracteres.')
  .transform((value) => (value === '' ? null : value))
  .optional()
  .transform((value) => value ?? null)

export const auditLogQuerySchema = z.object({
  action: optionalFilter,
  entityType: optionalFilter,
  page: z.coerce.number().int().min(1).max(1000).catch(1),
})

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>

export const auditLogMessages = {
  readUnavailable: 'Não foi possível carregar a auditoria agora.',
} as const

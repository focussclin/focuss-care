import { z } from 'zod'

import {
  INTEGRATION_CREDENTIAL_DEFINITIONS,
  type IntegrationCredentialProvider,
  type IntegrationCredentialValues,
} from '../domain/IntegrationCredential'

export const integrationCredentialMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  providerInvalid: 'Escolha uma integração válida.',
  fieldRequired: 'Preencha este campo.',
  brevoKeyRequired: 'Informe a API key ou a chave SMTP da Brevo.',
  emailInvalid: 'Informe um e-mail remetente válido.',
  urlInvalid: 'Informe uma URL válida, começando com http:// ou https://.',
  valueTooLong: 'Este valor excede o limite permitido.',
  forbidden: 'Você não tem permissão para gerenciar integrações.',
  schemaPending:
    'O cofre de integrações ainda não foi criado no banco. Aplique a migration indicada e tente novamente.',
  vaultNotConfigured:
    'O cofre ainda não está pronto no servidor. Configure INTEGRATION_ENCRYPTION_KEY no ambiente de execução.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar a integração agora. Tente novamente.',
} as const

const providerValues = [
  'brevo',
  'evolution',
  'deepseek',
  'google_calendar',
  'outlook_calendar',
] as const

const valuesSchema = z.record(
  z.string().trim().min(1).max(80),
  z.string().trim().max(4096, integrationCredentialMessages.valueTooLong),
)

export const saveIntegrationCredentialSchema = z
  .object({
    provider: z.enum(providerValues, integrationCredentialMessages.providerInvalid),
    values: valuesSchema,
  })
  .superRefine((input, context) => {
    const definition = INTEGRATION_CREDENTIAL_DEFINITIONS.find(
      (item) => item.provider === input.provider,
    )

    if (!definition) return

    const allowedFields = new Set<string>(
      definition.fields.map((field) => field.name),
    )
    for (const fieldName of Object.keys(input.values)) {
      if (!allowedFields.has(fieldName)) {
        context.addIssue({
          code: 'custom',
          path: ['values', fieldName],
          message: integrationCredentialMessages.invalidFields,
        })
      }
    }

    for (const field of definition.fields) {
      const value = input.values[field.name]?.trim() ?? ''
      if (field.required && value.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['values', field.name],
          message: integrationCredentialMessages.fieldRequired,
        })
      }

      if (field.type === 'email' && value && !z.email().safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          path: ['values', field.name],
          message: integrationCredentialMessages.emailInvalid,
        })
      }

      if (field.type === 'url' && value && !z.url().safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          path: ['values', field.name],
          message: integrationCredentialMessages.urlInvalid,
        })
      }
    }

    if (
      input.provider === 'brevo' &&
      !input.values.apiKey?.trim() &&
      !input.values.smtpKey?.trim()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['values', 'apiKey'],
        message: integrationCredentialMessages.brevoKeyRequired,
      })
    }
  })

export type SaveIntegrationCredentialInput = z.infer<
  typeof saveIntegrationCredentialSchema
>

export function normalizeIntegrationCredentialValues(
  provider: IntegrationCredentialProvider,
  values: IntegrationCredentialValues,
): IntegrationCredentialValues {
  const definition = INTEGRATION_CREDENTIAL_DEFINITIONS.find(
    (item) => item.provider === provider,
  )

  if (!definition) return {}

  return Object.fromEntries(
    definition.fields
      .map((field) => [field.name, values[field.name]?.trim() ?? ''] as const)
      .filter(([, value]) => value.length > 0),
  )
}

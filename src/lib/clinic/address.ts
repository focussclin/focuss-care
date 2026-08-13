import { z } from 'zod'

/**
 * Endereço da clínica — forma FECHADA, lida e escrita pelo mesmo contrato.
 *
 * `clinics.address` é `jsonb`, e jsonb sem forma declarada é onde dois pedaços
 * do produto passam a gravar chaves diferentes para a mesma coisa. O schema
 * abaixo é a única porta: `.strict()` recusa chave desconhecida em vez de
 * guardá-la em silêncio para alguém encontrar depois sem saber o que é.
 *
 * Mesmo desenho de `patients.emergency_contact`.
 */

/** Campo de texto curto, opcional, que vira `null` quando vazio. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .catch(null)
}

export const clinicAddressSchema = z
  .object({
    street: optionalText(160),
    /*
     * Número é TEXTO, não inteiro: 's/n', '120-A' e '1.500' são endereços
     * reais, e o dia em que um deles chegasse a uma coluna numérica viraria
     * erro na hora de salvar o cadastro da clínica.
     */
    number: optionalText(20),
    complement: optionalText(80),
    district: optionalText(80),
    city: optionalText(80),
    /** Sigla da UF. Guardada como veio; a tela oferece a lista. */
    state: optionalText(2),
    zipCode: optionalText(9),
  })
  .strict()

export type ClinicAddress = z.infer<typeof clinicAddressSchema>

export const EMPTY_CLINIC_ADDRESS: ClinicAddress = {
  street: null,
  number: null,
  complement: null,
  district: null,
  city: null,
  state: null,
  zipCode: null,
}

/**
 * Lê a coluna `jsonb` com o mesmo contrato com que ela foi escrita.
 *
 * Conteúdo irreconhecível vira endereço VAZIO, não erro: um cadastro de clínica
 * não pode deixar de abrir porque alguém gravou algo estranho na coluna por
 * outro caminho. O que não casa simplesmente não é exibido.
 */
export function parseStoredClinicAddress(value: unknown): ClinicAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_CLINIC_ADDRESS
  }

  const parsed = clinicAddressSchema.safeParse(value)

  return parsed.success ? parsed.data : EMPTY_CLINIC_ADDRESS
}

/** Há algum campo preenchido? */
export function hasClinicAddress(address: ClinicAddress): boolean {
  return Object.values(address).some((field) => field !== null)
}

/**
 * O endereço em uma linha, como alguém escreveria num WhatsApp.
 *
 * 'Rua das Flores, 120, sala 3 — Centro, São Paulo/SP, 01000-000'
 *
 * Devolve `null` quando não há nada: é o que faz o assistente de IA dizer que
 * vai confirmar com a equipe, em vez de mandar uma linha de pontuação solta.
 */
export function formatClinicAddress(address: ClinicAddress): string | null {
  if (!hasClinicAddress(address)) return null

  const rua = [address.street, address.number].filter(Boolean).join(', ')
  const comRua = [rua || null, address.complement].filter(Boolean).join(', ')

  const cidade = [address.city, address.state].filter(Boolean).join('/')
  const local = [address.district, cidade || null, address.zipCode]
    .filter(Boolean)
    .join(', ')

  return [comRua || null, local || null].filter(Boolean).join(' — ') || null
}

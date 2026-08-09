import { describe, expect, it } from 'vitest'

import {
  formatCnpj,
  isValidCnpj,
  updateBusinessHoursSchema,
  updateClinicProfileSchema,
  updateNotificationPreferencesSchema,
} from './settings.schema'

const openWeek = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  closed: false,
  opensAt: '08:00',
  closesAt: '18:00',
}))

describe('CNPJ', () => {
  it('aceita um CNPJ com dígitos verificadores corretos', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
  })

  it('recusa um dígito verificador errado', () => {
    // O erro mais comum é digitar um número trocado, e contar 14 caracteres
    // deixaria passar — o destino deste número é a nota fiscal (B-01), onde a
    // recusa chega tarde e cara.
    expect(isValidCnpj('11222333000182')).toBe(false)
  })

  it('recusa sequência repetida, que passa no cálculo mas não é CNPJ', () => {
    expect(isValidCnpj('00000000000000')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
  })

  it('normaliza a pontuação antes de guardar', () => {
    const parsed = updateClinicProfileSchema.parse({
      tradeName: 'Clínica Vida',
      legalName: '',
      cnpj: '11.222.333/0001-81',
    })

    // Guardar os dois formatos transformaria a checagem de duplicidade numa
    // coincidência de digitação.
    expect(parsed.cnpj).toBe('11222333000181')
    expect(parsed.legalName).toBeNull()
  })

  it('campo vazio é "não informado", não erro', () => {
    const parsed = updateClinicProfileSchema.parse({
      tradeName: 'Clínica Vida',
      legalName: '   ',
      cnpj: '',
    })

    expect(parsed.cnpj).toBeNull()
    expect(parsed.legalName).toBeNull()
  })

  it('formata para exibição e devolve entrada fora do formato como veio', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatCnpj(null)).toBe('')
    expect(formatCnpj('123')).toBe('123')
  })
})

describe('horário de funcionamento', () => {
  it('aceita a semana completa', () => {
    expect(updateBusinessHoursSchema.safeParse({ days: openWeek }).success).toBe(
      true,
    )
  })

  it('recusa fechar antes de abrir, e NOMEIA o dia', () => {
    const days = openWeek.map((day) =>
      day.weekday === 6 ? { ...day, opensAt: '18:00', closesAt: '08:00' } : day,
    )

    const result = updateBusinessHoursSchema.safeParse({ days })

    expect(result.success).toBe(false)
    // `createAction` só associa o erro ao primeiro segmento do caminho (`days`),
    // então sem o nome no texto a tela diria "revise os campos" sobre um
    // formulário de sete linhas.
    expect(result.error?.issues[0]?.message).toContain('Sábado')
  })

  it('ignora o horário de um dia fechado', () => {
    const days = openWeek.map((day) =>
      day.weekday === 7
        ? { ...day, closed: true, opensAt: '18:00', closesAt: '08:00' }
        : day,
    )

    expect(updateBusinessHoursSchema.safeParse({ days }).success).toBe(true)
  })

  it('recusa semana incompleta ou com dia repetido', () => {
    expect(
      updateBusinessHoursSchema.safeParse({ days: openWeek.slice(0, 6) }).success,
    ).toBe(false)

    const duplicated = [...openWeek.slice(0, 6), { ...openWeek[0] }]
    expect(updateBusinessHoursSchema.safeParse({ days: duplicated }).success).toBe(
      false,
    )
  })
})

describe('preferências de notificações', () => {
  it('aceita o estado operacional booleano', () => {
    expect(updateNotificationPreferencesSchema.parse({ operational: false })).toEqual({
      operational: false,
    })
  })

  it('recusa valores que não podem controlar o produtor de avisos', () => {
    expect(
      updateNotificationPreferencesSchema.safeParse({ operational: 'false' })
        .success,
    ).toBe(false)
  })
})

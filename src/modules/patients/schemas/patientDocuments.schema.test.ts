import { describe, expect, it } from 'vitest'

import { createPatientMessages, createPatientSchema } from './patient.schema'

/**
 * O grupo documental no contrato de escrita.
 *
 * Duas coisas se provam aqui: o que chega ao banco é a forma CANÔNICA (dígitos,
 * UF em maiúsculas), e endereço pela metade não entra.
 */

const base = {
  name: 'Maria Souza',
  phone: '(11) 98812-4471',
}

function parse(overrides: Record<string, unknown> = {}) {
  return createPatientSchema.safeParse({ ...base, ...overrides })
}

describe('CPF e CNS chegam em dígitos', () => {
  it('a máscara é descartada na normalização', () => {
    // Guardar `529.982.247-25` faria a mesma pessoa existir duas vezes na base,
    // e a checagem de duplicidade não encontraria nenhuma das duas.
    const parsed = parse({ cpf: '529.982.247-25', cns: '123 4567 8901 0000' })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.cpf).toBe('52998224725')
      expect(parsed.data.cns).toBe('123456789010000')
    }
  })

  it('campo vazio vira null, não string vazia', () => {
    const parsed = parse({ cpf: '', cns: '   ' })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.cpf).toBeNull()
      expect(parsed.data.cns).toBeNull()
    }
  })

  it('CPF que não fecha é recusado no servidor, não só na tela', () => {
    const parsed = parse({ cpf: '529.982.247-26' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        createPatientMessages.cpfInvalid,
      )
      expect(parsed.error.issues[0].path).toEqual(['cpf'])
    }
  })

  it('CNS inválido é recusado', () => {
    const parsed = parse({ cns: '123456789010001' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        createPatientMessages.cnsInvalid,
      )
    }
  })
})

describe('endereço: ou tem o mínimo, ou não existe', () => {
  const fullAddress = {
    addressZip: '01310-930',
    addressStreet: 'Avenida Paulista',
    addressNumber: '1578',
    addressDistrict: 'Bela Vista',
    addressCity: 'São Paulo',
    addressState: 'sp',
  }

  it('endereço completo passa, com CEP em dígitos e UF em maiúsculas', () => {
    const parsed = parse(fullAddress)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.addressZip).toBe('01310930')
      // `sp` é o que se digita; `SP` é o que a etiqueta e a guia esperam.
      expect(parsed.data.addressState).toBe('SP')
    }
  })

  it('sem endereço nenhum, tudo vira null', () => {
    const parsed = parse()

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.addressStreet).toBeNull()
      expect(parsed.data.addressCity).toBeNull()
      expect(parsed.data.addressState).toBeNull()
    }
  })

  it('endereço com só o complemento é recusado nos três campos que faltam', () => {
    /*
     * Uma ficha com "apto 42" no lugar do endereço AFIRMA que a pessoa tem
     * endereço cadastrado, e o balcão para de perguntar.
     */
    const parsed = parse({ addressComplement: 'Apto 42' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path[0])
      expect(paths).toContain('addressStreet')
      expect(paths).toContain('addressCity')
      expect(paths).toContain('addressState')
      expect(parsed.error.issues[0].message).toBe(
        createPatientMessages.addressIncomplete,
      )
    }
  })

  it('endereço sem número passa — "s/n" é endereço real', () => {
    const parsed = parse({ ...fullAddress, addressNumber: '' })

    expect(parsed.success).toBe(true)
  })

  it('CEP com menos de oito dígitos é recusado', () => {
    const parsed = parse({ ...fullAddress, addressZip: '0131093' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        createPatientMessages.zipInvalid,
      )
    }
  })

  it('UF inventada é recusada', () => {
    const parsed = parse({ ...fullAddress, addressState: 'XX' })

    expect(parsed.success).toBe(false)
  })
})

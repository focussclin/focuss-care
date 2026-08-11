import { describe, expect, it } from 'vitest'

import {
  buildPatientKeysetFilter,
  buildPatientSearchFilter,
} from './patientListFilters'

describe('buildPatientSearchFilter', () => {
  it('nao filtra nada quando nao ha termo', () => {
    expect(buildPatientSearchFilter(null)).toBeNull()
    expect(buildPatientSearchFilter('   ')).toBeNull()
    expect(buildPatientSearchFilter('%_')).toBeNull()
  })

  it('busca nome e e-mail por infixo', () => {
    expect(buildPatientSearchFilter('ana')).toBe(
      'full_name.ilike."%ana%",email.ilike."%ana%"',
    )
  })

  it('acrescenta telefone por prefixo quando ha digitos suficientes', () => {
    expect(buildPatientSearchFilter('11988')).toBe(
      'full_name.ilike."%11988%",email.ilike."%11988%",phone.like."11988%"',
    )
  })

  it('ignora o telefone com poucos digitos, para nao afogar a busca por nome', () => {
    expect(buildPatientSearchFilter('ana 1')).not.toContain('phone')
  })

  it('usa apenas os digitos do termo no filtro de telefone', () => {
    expect(buildPatientSearchFilter('(11) 98812-4471')).toContain(
      'phone.like."11988124471%"',
    )
  })

  it('busca CPF somente por igualdade exata dos onze digitos', () => {
    const filter = buildPatientSearchFilter('12345678901')

    expect(filter).toContain('cpf.eq."12345678901"')
    expect(filter).not.toContain('cpf.like')
    expect(filter).not.toContain('cns')
  })

  it('aceita CPF formatado sem transformar documento parcial em filtro', () => {
    const filter = buildPatientSearchFilter('123.456.789-01')

    expect(filter).toContain('cpf.eq."12345678901"')
  })

  describe('injecao na gramatica do PostgREST', () => {
    const payloads = [
      'a,b)',
      'x",is_active.eq.false,name.ilike."',
      'a),or(cpf.not.is.null',
      '100%',
      '_',
      '"',
      '\\',
      'a'.repeat(500),
      'ana 🙂',
      `ctrl${String.fromCharCode(0)}${String.fromCharCode(10)}`,
    ]

    it.each(payloads)('%j nao acrescenta condicao ao filtro', (payload) => {
      const filter = buildPatientSearchFilter(payload)

      if (filter === null) return

      // O filtro so pode ter as clausulas previstas: nome, e-mail, telefone e
      // igualdade exata de CPF.
      // Qualquer virgula a mais e uma condicao a mais dentro do `or`.
      const clauses = filter.split(',')

      expect(clauses.length).toBeLessThanOrEqual(4)
      for (const clause of clauses) {
        expect(clause).toMatch(
          /^(full_name\.ilike\."%.*%"|email\.ilike\."%.*%"|phone\.like\."[0-9]+%"|cpf\.eq\."[0-9]{11}")$/,
        )
      }

      // Aspas e barra invertida sao os dois caracteres que quebrariam o valor
      // citado: nao podem sobrar dentro dele.
      expect(filter).not.toMatch(/[^.]"[^%,]/)
      expect(filter).not.toContain('\\')
    })
  })
})

describe('buildPatientKeysetFilter', () => {
  const anchor = {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    fullName: 'Maria Silva',
  }

  it('desempata por id — sem isso, homonimos repetem ou somem entre paginas', () => {
    expect(buildPatientKeysetFilter(anchor)).toBe(
      'full_name.gt."Maria Silva",and(full_name.eq."Maria Silva",id.gt.9019956f-bdd8-4d61-868d-09b02332dad0)',
    )
  })

  it('escapa aspas e barra invertida vindas do proprio banco', () => {
    // O nome da ancora vem da linha, nao do cliente — mas `Joao "Jota"` existe,
    // e sem escape ele fecharia o valor citado no meio do filtro.
    const filter = buildPatientKeysetFilter({
      id: anchor.id,
      fullName: 'Joao "Jota" C\\D',
    })

    expect(filter).toContain('full_name.gt."Joao \\"Jota\\" C\\\\D"')
  })
})

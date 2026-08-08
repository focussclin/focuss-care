import { describe, expect, it } from 'vitest'

import { updateProfileSchema } from './profile.schema'

/**
 * Contrato do perfil pessoal.
 *
 * Duas coisas a proteger: que o telefone vire a forma canônica antes de chegar
 * ao banco — a mesma pessoa gravada em três formatos vira três contatos para
 * qualquer busca —, e que o schema não aceite campo nenhum além de nome e
 * telefone.
 */

/**
 * Nome com um caractere de controle, escrito por CÓDIGO e não colado.
 *
 * Um NUL literal no arquivo é invisível na revisão: o teste passa, e ninguém
 * consegue ver por quê. Montá-lo aqui deixa explícito o que está sendo recusado.
 */
const NAME_WITH_CONTROL_CHAR = `Ana${String.fromCharCode(0)}Ribeiro`

describe('updateProfileSchema', () => {
  it('normaliza o telefone para dígitos, qualquer que seja a máscara', () => {
    for (const input of [
      '(11) 98812-4471',
      '11988124471',
      '+55 11 98812 4471',
      ' 11 98812-4471 ',
    ]) {
      const parsed = updateProfileSchema.parse({
        fullName: 'Ana Ribeiro',
        phone: input,
      })

      expect(parsed.phone).toBe('11988124471')
    }
  })

  it('telefone vazio é ausência, não erro', () => {
    // Nem todo mundo quer deixar telefone, e exigir um faria a pessoa inventar.
    const parsed = updateProfileSchema.parse({
      fullName: 'Ana Ribeiro',
      phone: '   ',
    })

    expect(parsed.phone).toBeNull()
  })

  it('telefone preenchido e incompleto é ERRO, e não vira null', () => {
    /*
     * Guardar '9999' faria a clínica achar que tem um contato quando não tem —
     * e descobrir isso na hora de avisar um paciente sobre remarcação.
     */
    const result = updateProfileSchema.safeParse({
      fullName: 'Ana Ribeiro',
      phone: '9999',
    })

    expect(result.success).toBe(false)
  })

  it('recusa nome vazio, curto demais ou sem letra', () => {
    for (const fullName of ['', ' ', 'A', '---']) {
      expect(
        updateProfileSchema.safeParse({ fullName, phone: '' }).success,
      ).toBe(false)
    }
  })

  it('recusa caractere de controle no nome', () => {
    expect(
      updateProfileSchema.safeParse({
        fullName: NAME_WITH_CONTROL_CHAR,
        phone: '',
      }).success,
    ).toBe(false)

    // E o mesmo nome sem o caractere passa — senão o teste acima provaria
    // apenas que o schema recusa tudo.
    expect(
      updateProfileSchema.safeParse({ fullName: 'Ana Ribeiro', phone: '' })
        .success,
    ).toBe(true)
  })

  it('NÃO aceita id, e-mail nem clínica ativa', () => {
    const result = updateProfileSchema.parse({
      fullName: 'Ana Ribeiro',
      phone: '',
      id: '00000000-0000-4000-8000-000000000000',
      email: 'outra@pessoa.com',
      active_clinic_id: '11111111-1111-4111-8111-111111111111',
    })

    /*
     * O usuário sai do `ActionContext`; o e-mail é do Supabase Auth; a clínica
     * ativa troca por `switch_clinic`. Nenhum dos três tem campo por onde
     * chegar — um `id` aqui deixaria alguém renomear outra pessoa.
     */
    expect(result).toEqual({ fullName: 'Ana Ribeiro', phone: null })
  })

  it('remove espaço nas pontas do nome', () => {
    const parsed = updateProfileSchema.parse({
      fullName: '  Ana Ribeiro  ',
      phone: '',
    })

    expect(parsed.fullName).toBe('Ana Ribeiro')
  })
})

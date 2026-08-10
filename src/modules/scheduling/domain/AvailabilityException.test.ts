import { describe, expect, it } from 'vitest'

import {
  appliesTo,
  describeBlock,
  findBlocking,
  findCovering,
  isValidWindow,
  overlaps,
  sortByStart,
  type AvailabilityException,
} from './AvailabilityException'

const PRO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function exception(patch: Partial<AvailabilityException> = {}): AvailabilityException {
  return {
    id: 'e1',
    professionalId: null,
    professionalName: null,
    kind: 'block',
    startsAt: new Date('2026-08-10T12:00:00.000Z'),
    endsAt: new Date('2026-08-10T18:00:00.000Z'),
    reason: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    ...patch,
  }
}

const window = (start: string, end: string) => ({
  startsAt: new Date(start),
  endsAt: new Date(end),
})

describe('janela', () => {
  it('invertida ou vazia não vale', () => {
    // Bloqueio que não bloqueia nada é pior que bloqueio nenhum: parece ativo.
    const at = new Date('2026-08-10T12:00:00.000Z')

    expect(isValidWindow(at, at)).toBe(false)
    expect(isValidWindow(new Date('2026-08-10T18:00:00.000Z'), at)).toBe(false)
    expect(isValidWindow(at, new Date('2026-08-10T18:00:00.000Z'))).toBe(true)
  })

  it('as bordas são abertas, como na constraint de `appointments`', () => {
    /*
     * Um bloqueio que termina 12:00 não pode alcançar o atendimento que começa
     * 12:00 — senão a clínica que fecha para o almoço perde o primeiro horário
     * da tarde.
     */
    const bloqueio = window('2026-08-10T08:00:00.000Z', '2026-08-10T12:00:00.000Z')

    expect(overlaps(bloqueio, window('2026-08-10T12:00:00.000Z', '2026-08-10T13:00:00.000Z'))).toBe(false)
    expect(overlaps(bloqueio, window('2026-08-10T11:59:00.000Z', '2026-08-10T13:00:00.000Z'))).toBe(true)
  })

  it('encaixe totalmente dentro conta como sobreposição', () => {
    const bloqueio = window('2026-08-10T08:00:00.000Z', '2026-08-10T18:00:00.000Z')

    expect(overlaps(bloqueio, window('2026-08-10T10:00:00.000Z', '2026-08-10T11:00:00.000Z'))).toBe(true)
  })
})

describe('quem a exceção alcança', () => {
  it('sem profissional é a clínica inteira', () => {
    // Feriado não é ausência de ninguém: é a clínica fechada.
    const feriado = exception({ professionalId: null })

    expect(appliesTo(feriado, PRO_A)).toBe(true)
    expect(appliesTo(feriado, null)).toBe(true)
  })

  it('com profissional alcança só ele', () => {
    const ferias = exception({ professionalId: PRO_A })

    expect(appliesTo(ferias, PRO_A)).toBe(true)
    expect(appliesTo(ferias, PRO_B)).toBe(false)
  })

  it('atendimento sem profissional só é alcançado pelas da clínica', () => {
    expect(appliesTo(exception({ professionalId: PRO_A }), null)).toBe(false)
  })
})

describe('bloqueio que impede o horário', () => {
  const alvo = window('2026-08-10T14:00:00.000Z', '2026-08-10T15:00:00.000Z')

  it('acha o bloqueio da clínica', () => {
    expect(findBlocking([exception()], alvo, PRO_A)).toBeTruthy()
  })

  it('ignora bloqueio de outro profissional', () => {
    expect(findBlocking([exception({ professionalId: PRO_B })], alvo, PRO_A)).toBeNull()
  })

  it('ignora janela que não encosta', () => {
    const outroDia = exception({
      startsAt: new Date('2026-08-11T12:00:00.000Z'),
      endsAt: new Date('2026-08-11T18:00:00.000Z'),
    })

    expect(findBlocking([outroDia], alvo, PRO_A)).toBeNull()
  })

  it('`extra` nunca bloqueia — é o oposto', () => {
    expect(findBlocking([exception({ kind: 'extra' })], alvo, PRO_A)).toBeNull()
  })
})

describe('horário extra que libera', () => {
  const alvo = window('2026-08-15T19:00:00.000Z', '2026-08-15T20:00:00.000Z')

  const mutirao = exception({
    kind: 'extra',
    startsAt: new Date('2026-08-15T18:00:00.000Z'),
    endsAt: new Date('2026-08-15T22:00:00.000Z'),
  })

  it('cobertura total libera', () => {
    expect(findCovering([mutirao], alvo, PRO_A)).toBeTruthy()
  })

  it('cobertura PARCIAL não libera', () => {
    /*
     * Um mutirão das 19h às 21h não autoriza atendimento das 20h às 22h: a
     * última hora continua fora do expediente e sem ninguém previsto para ela.
     */
    const curto = exception({
      kind: 'extra',
      startsAt: new Date('2026-08-15T19:00:00.000Z'),
      endsAt: new Date('2026-08-15T21:00:00.000Z'),
    })

    expect(findCovering([curto], window('2026-08-15T20:00:00.000Z', '2026-08-15T22:00:00.000Z'), PRO_A)).toBeNull()
  })

  it('borda exata conta como cobertura', () => {
    const exato = exception({
      kind: 'extra',
      startsAt: new Date('2026-08-15T19:00:00.000Z'),
      endsAt: new Date('2026-08-15T20:00:00.000Z'),
    })

    expect(findCovering([exato], alvo, PRO_A)).toBeTruthy()
  })

  it('`block` nunca libera', () => {
    expect(findCovering([{ ...mutirao, kind: 'block' }], alvo, PRO_A)).toBeNull()
  })

  it('extra de outro profissional não libera', () => {
    expect(findCovering([{ ...mutirao, professionalId: PRO_B }], alvo, PRO_A)).toBeNull()
  })
})

describe('mensagem do bloqueio', () => {
  it('diz de quem é a agenda e o motivo', () => {
    // É a próxima pergunta de quem está com o telefone na mão.
    const texto = describeBlock(
      exception({ professionalId: PRO_A, professionalName: 'Ana Costa', reason: 'Férias' }),
    )

    expect(texto).toContain('Ana Costa')
    expect(texto).toContain('Férias')
  })

  it('sem profissional fala da clínica', () => {
    expect(describeBlock(exception())).toContain('clínica')
  })

  it('sem motivo não inventa parênteses vazios', () => {
    expect(describeBlock(exception())).not.toContain('()')
  })
})

describe('ordem da lista', () => {
  it('mais recentes primeiro, com data em ISO ou Date', () => {
    const ordered = sortByStart([
      { id: 'velho', startsAt: '2026-01-01T10:00:00.000Z' },
      { id: 'novo', startsAt: '2026-08-10T10:00:00.000Z' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['novo', 'velho'])
  })
})

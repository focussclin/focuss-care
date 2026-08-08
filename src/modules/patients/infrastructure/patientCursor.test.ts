import { describe, expect, it } from 'vitest'

import {
  decodePatientCursor,
  encodePatientCursor,
  patientQueryFingerprint,
} from './patientCursor'

const ANCHOR = '9019956f-bdd8-4d61-868d-09b02332dad0'
const OTHER_ANCHOR = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'

function payloadOf(cursor: string): unknown {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
}

describe('patientQueryFingerprint', () => {
  it('e estavel para o mesmo recorte', () => {
    const query = { search: 'ana', status: 'active' } as const

    expect(patientQueryFingerprint(query)).toBe(patientQueryFingerprint(query))
    expect(patientQueryFingerprint(query)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('muda quando o termo ou o status mudam', () => {
    const ana = patientQueryFingerprint({ search: 'ana', status: 'all' })
    const bruno = patientQueryFingerprint({ search: 'bruno', status: 'all' })
    const anaAtivos = patientQueryFingerprint({
      search: 'ana',
      status: 'active',
    })

    // Sem isso, o cursor da busca "ana" aplicado a busca "bruno" produziria uma
    // pagina silenciosamente errada — comecando no meio, e plausivel.
    expect(ana).not.toBe(bruno)
    expect(ana).not.toBe(anaAtivos)
  })

  it('nao confunde recortes que so diferem na fronteira dos campos', () => {
    expect(
      patientQueryFingerprint({ search: 'a', status: 'all' }),
    ).not.toBe(patientQueryFingerprint({ search: null, status: 'all' }))
  })
})

describe('cursor de paciente — ida e volta', () => {
  it('devolve a mesma ancora e o mesmo fingerprint', () => {
    const cursor = encodePatientCursor(ANCHOR, 'abcd1234')

    expect(decodePatientCursor(cursor)).toEqual({
      v: 1,
      a: ANCHOR,
      f: 'abcd1234',
    })
  })

  it('e opaco na URL: base64url puro, sem caractere que precise de escape', () => {
    const cursor = encodePatientCursor(ANCHOR, 'abcd1234')

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(cursor)).toBe(cursor)
  })
})

describe('cursor de paciente — nao carrega PII', () => {
  /*
   * A regra que este teste protege: o cursor vive na URL, e URL vai para o
   * historico do navegador, o header Referer e o log de qualquer proxy. Nome de
   * paciente de uma clinica e dado pessoal em contexto de saude.
   */
  it('o payload tem exatamente v, a e f', () => {
    const payload = payloadOf(encodePatientCursor(ANCHOR, 'abcd1234'))

    expect(Object.keys(payload as object).sort()).toEqual(['a', 'f', 'v'])
  })

  it('nao ha nome nem clinic_id em lugar nenhum do cursor', () => {
    const cursor = encodePatientCursor(ANCHOR, 'abcd1234')
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')

    expect(decoded).not.toMatch(/full_name|name|clinic/i)
  })

  it('recusa um cursor com campo a mais — inclusive o nome', () => {
    const forged = Buffer.from(
      JSON.stringify({ v: 1, a: ANCHOR, f: 'abcd1234', full_name: 'Ana' }),
      'utf8',
    ).toString('base64url')

    expect(decodePatientCursor(forged)).toBeNull()
  })
})

describe('cursor de paciente — entrada hostil nunca lanca', () => {
  const invalid: Array<[string, string | null | undefined]> = [
    ['null', null],
    ['undefined', undefined],
    ['string vazia', ''],
    ['base64 quebrado', 'nao!!eh@base64'],
    ['base64 valido com lixo dentro', Buffer.from('xyz').toString('base64url')],
    [
      'json que nao e objeto',
      Buffer.from('[1,2,3]', 'utf8').toString('base64url'),
    ],
    [
      'versao desconhecida',
      Buffer.from(
        JSON.stringify({ v: 2, a: ANCHOR, f: 'abcd1234' }),
        'utf8',
      ).toString('base64url'),
    ],
    [
      'ancora que nao e uuid',
      Buffer.from(
        JSON.stringify({ v: 1, a: 'pat-1', f: 'abcd1234' }),
        'utf8',
      ).toString('base64url'),
    ],
    [
      'fingerprint fora do formato',
      Buffer.from(
        JSON.stringify({ v: 1, a: ANCHOR, f: 'NAO-HEX!' }),
        'utf8',
      ).toString('base64url'),
    ],
    [
      'campo faltando',
      Buffer.from(JSON.stringify({ v: 1, a: ANCHOR }), 'utf8').toString(
        'base64url',
      ),
    ],
    ['cursor absurdamente longo', 'A'.repeat(5000)],
  ]

  it.each(invalid)('%s devolve null sem lancar', (_label, value) => {
    expect(() => decodePatientCursor(value)).not.toThrow()
    expect(decodePatientCursor(value)).toBeNull()
  })

  it('__proto__ no payload nao passa e nao polui o prototipo', () => {
    const forged = Buffer.from(
      '{"v":1,"a":"' + ANCHOR + '","f":"abcd1234","__proto__":{"x":1}}',
      'utf8',
    ).toString('base64url')

    expect(decodePatientCursor(forged)).toBeNull()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('um cursor bem formado de OUTRA ancora ainda decodifica — quem barra e o banco', () => {
    // O decoder nao conhece tenant: ele valida FORMA. A autoridade vem da
    // consulta da ancora, filtrada por clinic_id e deleted_at (ver o teste de
    // tenancy do adapter).
    expect(decodePatientCursor(encodePatientCursor(OTHER_ANCHOR, 'abcd1234'))).toEqual(
      { v: 1, a: OTHER_ANCHOR, f: 'abcd1234' },
    )
  })
})

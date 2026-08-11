import { describe, expect, it } from 'vitest'

import type { ClinicStatus } from '@/lib/supabase/database.types'

import {
  canRead,
  canWrite,
  clinicStatusLabels,
  clinicStatusNotice,
  needsAttention,
  writeBlockedMessage,
} from './clinic-status'

/**
 * O estado da clínica governando o acesso — feature **C-ST**.
 *
 * `clinics.status` existia com cinco valores e **nenhuma linha do produto o
 * lia**: uma clínica `suspended` no banco funcionava inteira, e cancelar
 * assinatura não tinha efeito nenhum sobre o acesso.
 */

const ALL: readonly ClinicStatus[] = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'canceled',
]

describe('quem pode gravar', () => {
  it.each(['trial', 'active'] as const)('%s grava', (status) => {
    expect(canWrite(status)).toBe(true)
  })

  it('`past_due` CONTINUA gravando', () => {
    /*
     * A decisão mais importante deste arquivo. Boleto atrasado não pode impedir
     * a recepção de registrar quem acabou de chegar, nem o profissional de
     * fechar o prontuário de quem está na sala. Cortar aqui transformaria uma
     * pendência financeira em risco assistencial.
     */
    expect(canWrite('past_due')).toBe(true)
  })

  it.each(['suspended', 'canceled'] as const)('%s NÃO grava', (status) => {
    expect(canWrite(status)).toBe(false)
  })

  it('o período de teste não é degradado', () => {
    // `trial` era o valor inalcançável que revelou a coluna inteira sem uso.
    expect(canWrite('trial')).toBe(canWrite('active'))
  })
})

/**
 * Nenhum estado tranca a leitura, e não é descuido.
 */
describe('quem pode ler', () => {
  it.each(ALL)('%s lê', (status) => {
    /*
     * Prontuário tem prazo legal de guarda. Reter o histórico de pacientes como
     * garantia de pagamento seria usar dado de terceiro como alavanca de
     * cobrança.
     */
    expect(canRead(status)).toBe(true)
  })
})

describe('o aviso na casca', () => {
  it.each(['trial', 'active'] as const)('%s não avisa nada', (status) => {
    // Banner permanente vira ruído e deixa de ser lido quando passa a importar.
    expect(clinicStatusNotice(status)).toBeNull()
    expect(needsAttention(status)).toBe(false)
  })

  it.each(['past_due', 'suspended', 'canceled'] as const)('%s avisa', (status) => {
    expect(clinicStatusNotice(status)).not.toBeNull()
    expect(needsAttention(status)).toBe(true)
  })

  it('o aviso de atraso diz que tudo continua funcionando', () => {
    const notice = clinicStatusNotice('past_due') ?? ''

    expect(notice).toMatch(/continua funcionando/i)
    expect(notice).toMatch(/assinaturas/i)
  })

  it('o aviso de suspensão diz que os dados continuam visíveis', () => {
    // Quem lê precisa saber se ainda consegue trabalhar, não o nome do estado.
    const notice = clinicStatusNotice('suspended') ?? ''

    expect(notice).toMatch(/continuam visíveis/i)
    expect(notice).toMatch(/nada novo/i)
  })

  it('todo estado tem rótulo em pt-BR', () => {
    const semRotulo = ALL.filter((status) => !clinicStatusLabels[status])

    expect(semRotulo).toEqual([])
  })
})

describe('a recusa da escrita', () => {
  it('distingue suspensa de encerrada', () => {
    expect(writeBlockedMessage('suspended')).toMatch(/suspensa/i)
    expect(writeBlockedMessage('canceled')).toMatch(/encerrada/i)
  })

  it('sempre diz o caminho de saída', () => {
    /*
     * Quem opera o sistema quase nunca é quem paga a assinatura. "Sem permissão"
     * mandaria a recepção procurar o erro no próprio acesso.
     */
    for (const status of ['suspended', 'canceled'] as const) {
      expect(writeBlockedMessage(status)).toMatch(/responsável/i)
      expect(writeBlockedMessage(status)).toMatch(/assinaturas/i)
    }
  })
})

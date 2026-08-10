import { describe, expect, it } from 'vitest'

import {
  createTaskSchema,
  setTaskStatusSchema,
  taskMessages,
  updateTaskSchema,
} from './task.schema'

/**
 * O contrato das tarefas.
 *
 * A decisão que mais importa aqui é a do PRAZO: a data escolhida vira o fim do
 * dia, e não a meia-noite. Uma tarefa criada hoje com prazo para hoje não pode
 * nascer vencida.
 */

function parse(overrides: Record<string, unknown> = {}) {
  return createTaskSchema.safeParse({
    title: 'Ligar para a paciente que faltou',
    notes: '',
    assigneeId: null,
    dueAt: null,
    priority: 3,
    patientId: null,
    ...overrides,
  })
}

describe('prazo', () => {
  it('a data vira o FIM do dia escolhido', () => {
    const result = parse({ dueAt: '2026-08-09' })

    expect(result.success).toBe(true)
    if (result.success) {
      const due = result.data.dueAt
      expect(due?.getHours()).toBe(23)
      expect(due?.getMinutes()).toBe(59)
      expect(due?.getDate()).toBe(9)
    }
  })

  it('tarefa com prazo para hoje não nasce vencida', () => {
    const hoje = new Date()
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

    const result = parse({ dueAt: iso })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dueAt!.getTime()).toBeGreaterThan(Date.now())
    }
  })

  it.each([['vazio', ''], ['nulo', null]])('%s vira sem prazo', (_l, value) => {
    const result = parse({ dueAt: value })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.dueAt).toBeNull()
  })

  it('data inválida é recusada', () => {
    expect(parse({ dueAt: '09/08/2026' }).success).toBe(false)
  })
})

describe('o que precisa ser feito', () => {
  it.each([['vazio', ''], ['curto demais', 'ok']])(
    'recusa título %s',
    (_label, title) => {
      const result = parse({ title })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(taskMessages.titleRequired)
      }
    },
  )

  it('recusa título longo demais', () => {
    const result = parse({ title: 'a'.repeat(200) })

    expect(result.success).toBe(false)
  })

  it('tira espaço das pontas', () => {
    const result = parse({ title: '  Conferir a guia devolvida  ' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Conferir a guia devolvida')
    }
  })
})

describe('responsável e alvo', () => {
  it.each([['vazio', ''], ['nulo', null]])(
    'responsável %s vira ausência, não erro',
    (_label, value) => {
      const result = parse({ assigneeId: value })

      expect(result.success).toBe(true)
      if (result.success) expect(result.data.assigneeId).toBeNull()
    },
  )

  it('recusa identificador que não é uuid', () => {
    expect(parse({ assigneeId: 'a-pessoa-da-recepcao' }).success).toBe(false)
    expect(parse({ patientId: '123' }).success).toBe(false)
  })
})

describe('prioridade', () => {
  it.each([[1], [3], [5]])('aceita %i', (priority) => {
    expect(parse({ priority }).success).toBe(true)
  })

  it.each([[0], [2], [9], [-1]])('recusa %i', (priority) => {
    expect(parse({ priority }).success).toBe(false)
  })
})

describe('o que não atravessa a fronteira', () => {
  it('descarta clinicId mandado pelo cliente', () => {
    const result = parse({ clinicId: 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(JSON.stringify(result.data)).not.toContain('b4b7c0f2')
    }
  })

  it('descarta status na criação — toda tarefa nasce pendente', () => {
    const result = parse({ status: 'done' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect('status' in result.data).toBe(false)
    }
  })
})

describe('edição e transição de estado', () => {
  it('editar exige o id da tarefa', () => {
    expect(
      updateTaskSchema.safeParse({
        title: 'Conferir a guia devolvida',
        notes: '',
        assigneeId: null,
        dueAt: null,
        priority: 3,
        patientId: null,
      }).success,
    ).toBe(false)
  })

  it.each([['pending'], ['in_progress'], ['done'], ['canceled']])(
    'aceita a transição para %s',
    (status) => {
      const result = setTaskStatusSchema.safeParse({
        taskId: '9019956f-bdd8-4d61-868d-09b02332dad0',
        status,
      })

      expect(result.success).toBe(true)
    },
  )

  it('recusa estado inventado', () => {
    expect(
      setTaskStatusSchema.safeParse({
        taskId: '9019956f-bdd8-4d61-868d-09b02332dad0',
        status: 'arquivada',
      }).success,
    ).toBe(false)
  })
})

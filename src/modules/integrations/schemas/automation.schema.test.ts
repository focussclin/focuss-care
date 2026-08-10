import { describe, expect, it } from 'vitest'

import { WORKFLOW_TRIGGERS, hasEffect, triggerConfigKindFor, triggerMatchesConfig } from '../domain/Automation'
import {
  actionSchema,
  conditionSchema,
  createAutomationRuleSchema,
  triggerConfigSchema,
} from './automation.schema'

/**
 * O vocabulário fechado, que é a razão de esta fatia existir.
 *
 * `trigger_config`, `conditions` e `actions` são `jsonb`: o banco aceita
 * qualquer coisa. Se o schema deixasse passar chave desconhecida, o formulário
 * viraria um canal para gravar estrutura arbitrária no tenant — e o worker
 * futuro leria isso como instrução. Os testes deste arquivo cobrem justamente
 * o que **não** entra.
 */

const validRule = {
  name: 'Lembrar recepção',
  description: '',
  triggerType: 'appointment_reminder' as const,
  triggerConfig: { kind: 'reminder' as const, hoursBefore: 24 },
  conditions: [],
  actions: [
    { type: 'notify_team' as const, roles: ['receptionist' as const], message: 'Confirmar consulta' },
  ],
  isActive: false,
}

describe('nada de JSON arbitrário', () => {
  it('chave desconhecida na configuração do gatilho é descartada', () => {
    const parsed = triggerConfigSchema.parse({
      kind: 'reminder',
      hoursBefore: 24,
      webhookUrl: 'https://exemplo.invalido/hook',
    })

    expect(parsed).toEqual({ kind: 'reminder', hoursBefore: 24 })
    expect(parsed).not.toHaveProperty('webhookUrl')
  })

  it('tipo de ação inventado é recusado', () => {
    /*
     * `send_whatsapp`, `http_request`, `run_prompt` — nenhum existe, porque
     * nenhum tem adapter. Gravar um deles seria deixar uma instrução pronta
     * para um executor que não a revisou.
     */
    for (const type of ['send_whatsapp', 'http_request', 'run_prompt', 'send_email']) {
      expect(actionSchema.safeParse({ type, target: 'x' }).success, type).toBe(false)
    }
  })

  it('campo extra na ação não sobrevive', () => {
    const parsed = actionSchema.parse({
      type: 'notify_team',
      roles: ['admin'],
      message: 'Olhar a agenda',
      url: 'https://exemplo.invalido',
    })

    expect(Object.keys(parsed).sort()).toEqual(['message', 'roles', 'type'])
  })

  it('condição fora do vocabulário é recusada', () => {
    expect(conditionSchema.safeParse({ field: 'patient_cpf', equals: '000' }).success).toBe(false)
  })

  it('papel inexistente não entra na notificação', () => {
    expect(
      actionSchema.safeParse({ type: 'notify_team', roles: ['root'], message: 'oi' }).success,
    ).toBe(false)
  })
})

describe('configuração do gatilho', () => {
  it('só lembrete e horário fixo têm o que configurar', () => {
    expect(triggerConfigKindFor('appointment_reminder')).toBe('reminder')
    expect(triggerConfigKindFor('schedule')).toBe('schedule')
    for (const trigger of WORKFLOW_TRIGGERS) {
      if (trigger === 'appointment_reminder' || trigger === 'schedule') continue
      expect(triggerConfigKindFor(trigger), trigger).toBe('event')
    }
  })

  it('gatilho e configuração precisam combinar', () => {
    /*
     * Sem isso, `appointment_created` com config de `schedule` viraria uma
     * linha que nem a tela nem o worker futuro sabem interpretar.
     */
    const result = createAutomationRuleSchema.safeParse({
      ...validRule,
      triggerType: 'appointment_created',
      triggerConfig: { kind: 'schedule', time: '08:00', weekdays: [1] },
    })

    expect(result.success).toBe(false)
    expect(triggerMatchesConfig('appointment_created', { kind: 'schedule', time: '08:00', weekdays: [1] })).toBe(false)
  })

  it('antecedência fora da faixa é recusada', () => {
    expect(triggerConfigSchema.safeParse({ kind: 'reminder', hoursBefore: 0 }).success).toBe(false)
    expect(triggerConfigSchema.safeParse({ kind: 'reminder', hoursBefore: 169 }).success).toBe(false)
    expect(triggerConfigSchema.safeParse({ kind: 'reminder', hoursBefore: 2.5 }).success).toBe(false)
  })

  it('horário fora do formato é recusado', () => {
    for (const time of ['8:00', '25:00', '08:60', 'manhã']) {
      expect(
        triggerConfigSchema.safeParse({ kind: 'schedule', time, weekdays: [1] }).success,
        time,
      ).toBe(false)
    }
  })

  it('dias repetidos são normalizados, e a lista vazia é recusada', () => {
    const parsed = triggerConfigSchema.parse({ kind: 'schedule', time: '08:00', weekdays: [3, 1, 3] })

    expect(parsed).toMatchObject({ weekdays: [1, 3] })
    expect(
      triggerConfigSchema.safeParse({ kind: 'schedule', time: '08:00', weekdays: [] }).success,
    ).toBe(false)
  })
})

describe('condições', () => {
  it('faixa de hora invertida é recusada', () => {
    /*
     * `from >= to` nunca casa. A regra apareceria cadastrada e ativa, e jamais
     * dispararia — o tipo de defeito que só se descobre quando alguém percebe
     * que o lembrete nunca chegou.
     */
    expect(
      conditionSchema.safeParse({ field: 'hour_range', from: '18:00', to: '08:00' }).success,
    ).toBe(false)
    expect(
      conditionSchema.safeParse({ field: 'hour_range', from: '08:00', to: '18:00' }).success,
    ).toBe(true)
  })

  it('mais de cinco condições é recusado', () => {
    const many = Array.from({ length: 6 }, () => ({ field: 'weekday' as const, in: [1] }))

    expect(createAutomationRuleSchema.safeParse({ ...validRule, conditions: many }).success).toBe(false)
  })
})

describe('ações', () => {
  it('regra sem ação é recusada', () => {
    // Uma regra sem ação não faz nada nem quando o worker existir; salvá-la
    // criaria uma linha que a tela mostra como ativa e que jamais produz efeito.
    expect(createAutomationRuleSchema.safeParse({ ...validRule, actions: [] }).success).toBe(false)
    expect(hasEffect([])).toBe(false)
  })

  it('mais de cinco ações é recusado', () => {
    const many = Array.from({ length: 6 }, () => validRule.actions[0])

    expect(createAutomationRuleSchema.safeParse({ ...validRule, actions: many }).success).toBe(false)
  })

  it('prazo de tarefa fora da faixa é recusado', () => {
    expect(actionSchema.safeParse({ type: 'create_task', title: 'Ligar', dueInDays: -1 }).success).toBe(false)
    expect(actionSchema.safeParse({ type: 'create_task', title: 'Ligar', dueInDays: 91 }).success).toBe(false)
    expect(actionSchema.safeParse({ type: 'create_task', title: 'Ligar', dueInDays: 0 }).success).toBe(true)
  })

  it('papel repetido não duplica a notificação', () => {
    const parsed = actionSchema.parse({
      type: 'notify_team',
      roles: ['admin', 'admin', 'finance'],
      message: 'Conferir',
    })

    expect(parsed).toMatchObject({ roles: ['admin', 'finance'] })
  })
})

describe('a regra inteira', () => {
  it('aceita o caso comum', () => {
    expect(createAutomationRuleSchema.safeParse(validRule).success).toBe(true)
  })

  it('descrição vazia vira null, e não string vazia', () => {
    const parsed = createAutomationRuleSchema.parse(validRule)

    expect(parsed.description).toBeNull()
  })

  it('não carrega lastRunAt — quem escreve essa coluna é o executor', () => {
    /*
     * Deixar a tela gravar "última execução" seria fabricar a prova de que a
     * regra rodou. Nada roda.
     */
    const parsed = createAutomationRuleSchema.parse({
      ...validRule,
      lastRunAt: '2026-08-10T10:00:00.000Z',
    })

    expect(parsed).not.toHaveProperty('lastRunAt')
  })

  it('gatilho fora do enum do banco é recusado', () => {
    expect(
      createAutomationRuleSchema.safeParse({ ...validRule, triggerType: 'patient_churned' }).success,
    ).toBe(false)
  })
})

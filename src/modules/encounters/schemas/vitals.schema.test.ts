import { describe, expect, it } from 'vitest'

import { recordVitalsSchema, vitalsMessages } from './vitals.schema'

const PATIENT = '22222222-2222-4222-8222-222222222222'

const base = {
  patientId: PATIENT,
  encounterId: '',
  measuredAt: '2026-08-10T10:00',
  weightKg: '',
  heightCm: '',
  systolicBp: '',
  diastolicBp: '',
  heartRate: '',
  respiratoryRate: '',
  temperatureC: '',
  spo2: '',
  glucoseMgdl: '',
  notes: '',
}

/**
 * As faixas aqui NÃO são referência clínica — são limites de plausibilidade.
 *
 * Existem para pegar erro de digitação: 700 kg, 400 °C, saturação de 5%.
 * Nenhuma diz o que é normal, e os extremos são generosos de propósito, porque
 * recusar uma medida real seria pior que aceitar um dígito trocado.
 */
describe('limites de plausibilidade, não de referência', () => {
  it('aceita valores extremos porém possíveis', () => {
    // Febre de 41 °C, taquicardia de 180, saturação de 82: todos reais, todos
    // aceitos. O schema não é o lugar de julgar gravidade.
    const parsed = recordVitalsSchema.safeParse({
      ...base,
      temperatureC: '41',
      heartRate: '180',
      spo2: '82',
    })

    expect(parsed.success).toBe(true)
  })

  it('recusa o que nenhum paciente apresenta', () => {
    expect(recordVitalsSchema.safeParse({ ...base, weightKg: '700' }).success).toBe(false)
    expect(recordVitalsSchema.safeParse({ ...base, temperatureC: '400' }).success).toBe(false)
    expect(recordVitalsSchema.safeParse({ ...base, spo2: '5' }).success).toBe(false)
    expect(recordVitalsSchema.safeParse({ ...base, spo2: '120' }).success).toBe(false)
  })

  it('peso e temperatura aceitam decimal; frequências, não', () => {
    // 36,5 °C e 70,4 kg são leituras comuns; 70,5 batimentos não existem.
    expect(recordVitalsSchema.safeParse({ ...base, temperatureC: '36.5' }).success).toBe(true)
    expect(recordVitalsSchema.safeParse({ ...base, weightKg: '70.4' }).success).toBe(true)
    expect(recordVitalsSchema.safeParse({ ...base, heartRate: '70.5' }).success).toBe(false)
  })
})

describe('ao menos uma medida', () => {
  it('formulário sem nenhuma medida é recusado', () => {
    const result = recordVitalsSchema.safeParse(base)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(vitalsMessages.nothingMeasured)
    }
  })

  it('só observação não basta', () => {
    expect(
      recordVitalsSchema.safeParse({ ...base, notes: 'paciente agitado' }).success,
    ).toBe(false)
  })

  it('uma medida basta', () => {
    expect(recordVitalsSchema.safeParse({ ...base, spo2: '97' }).success).toBe(true)
  })
})

describe('pressão arterial', () => {
  it('metade da pressão é recusada', () => {
    const result = recordVitalsSchema.safeParse({ ...base, systolicBp: '120' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === vitalsMessages.bloodPressureIncomplete)).toBe(true)
    }
  })

  it('invertida é recusada', () => {
    const result = recordVitalsSchema.safeParse({
      ...base,
      systolicBp: '80',
      diastolicBp: '120',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === vitalsMessages.bloodPressureInverted)).toBe(true)
    }
  })

  it('as duas juntas passam', () => {
    expect(
      recordVitalsSchema.safeParse({ ...base, systolicBp: '120', diastolicBp: '80' }).success,
    ).toBe(true)
  })
})

describe('campos em branco viram null, e não zero', () => {
  it('o que não foi medido não é gravado como zero', () => {
    /*
     * Zero é uma medida. Gravar zero onde ninguém aferiu inventaria uma
     * glicemia de 0 mg/dL na ficha.
     */
    const parsed = recordVitalsSchema.parse({ ...base, spo2: '97' })

    expect(parsed.glucoseMgdl).toBeNull()
    expect(parsed.weightKg).toBeNull()
    expect(parsed.notes).toBeNull()
    expect(parsed.encounterId).toBeNull()
  })
})

describe('o schema não julga o horário', () => {
  it('data no futuro passa aqui — a checagem é da action', () => {
    /*
     * `new Date()` dentro do schema o tornaria dependente do relógio no momento
     * da importação, e este arquivo passaria a falhar conforme a hora em que
     * roda. A comparação com "agora" mora na action.
     */
    expect(
      recordVitalsSchema.safeParse({ ...base, measuredAt: '2099-01-01T10:00', spo2: '97' })
        .success,
    ).toBe(true)
  })

  it('data ilegível é recusada', () => {
    expect(
      recordVitalsSchema.safeParse({ ...base, measuredAt: 'ontem', spo2: '97' }).success,
    ).toBe(false)
  })
})

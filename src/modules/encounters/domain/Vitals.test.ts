import { describe, expect, it } from 'vitest'

import {
  bloodPressureIsComplete,
  bloodPressureIsOrdered,
  bmiFrom,
  hasAnyMeasurement,
  latestOf,
  sortByMeasuredAt,
  type NewVitalsData,
} from './Vitals'

function measurements(patch: Partial<NewVitalsData> = {}): NewVitalsData {
  return {
    patientId: 'p1',
    encounterId: null,
    measuredAt: new Date('2026-08-10T10:00:00.000Z'),
    weightKg: null,
    heightCm: null,
    systolicBp: null,
    diastolicBp: null,
    heartRate: null,
    respiratoryRate: null,
    temperatureC: null,
    spo2: null,
    glucoseMgdl: null,
    notes: null,
    ...patch,
  }
}

describe('registro precisa de ao menos uma medida', () => {
  it('tudo nulo não é aferição', () => {
    /*
     * Uma linha vazia com carimbo de hora apareceria no histórico como
     * "aferição realizada" sem nada aferido — e alguém concluiria que mediram
     * e deu normal.
     */
    expect(hasAnyMeasurement(measurements())).toBe(false)
  })

  it('uma medida basta', () => {
    expect(hasAnyMeasurement(measurements({ spo2: 97 }))).toBe(true)
    expect(hasAnyMeasurement(measurements({ weightKg: 70.5 }))).toBe(true)
  })

  it('observação sozinha NÃO conta como medida', () => {
    // Observação descreve a medida; sem medida ela não descreve nada.
    expect(hasAnyMeasurement(measurements({ notes: 'paciente agitado' }))).toBe(false)
  })

  it('zero é uma medida, e não ausência', () => {
    // Glicemia 0 é implausível e o schema recusa, mas o domínio não pode
    // confundir "valor zero" com "campo em branco".
    expect(hasAnyMeasurement(measurements({ glucoseMgdl: 0 }))).toBe(true)
  })
})

describe('pressão arterial', () => {
  it('exige as duas, ou nenhuma', () => {
    /*
     * "120 por nada" não é pressão: sozinha, a sistólica não permite calcular
     * média nem diferencial, e a listagem a mostraria como se fosse completa.
     */
    expect(bloodPressureIsComplete(120, 80)).toBe(true)
    expect(bloodPressureIsComplete(null, null)).toBe(true)
    expect(bloodPressureIsComplete(120, null)).toBe(false)
    expect(bloodPressureIsComplete(null, 80)).toBe(false)
  })

  it('a diastólica precisa ser menor', () => {
    // Invertidas é erro de digitação que passa despercebido: os dois números
    // são plausíveis isolados.
    expect(bloodPressureIsOrdered(120, 80)).toBe(true)
    expect(bloodPressureIsOrdered(80, 120)).toBe(false)
    expect(bloodPressureIsOrdered(120, 120)).toBe(false)
  })

  it('ausência não é ordem inválida', () => {
    expect(bloodPressureIsOrdered(null, null)).toBe(true)
    expect(bloodPressureIsOrdered(120, null)).toBe(true)
  })
})

describe('IMC', () => {
  it('sai de peso e altura da MESMA aferição', () => {
    // 70 kg e 1,75 m → 22,9
    expect(bmiFrom(70, 175)).toBe(22.9)
  })

  it('sem os dois, não há IMC', () => {
    /*
     * Combinar o peso de hoje com a altura de seis meses atrás trataria duas
     * aferições como uma só.
     */
    expect(bmiFrom(70, null)).toBeNull()
    expect(bmiFrom(null, 175)).toBeNull()
    expect(bmiFrom(null, null)).toBeNull()
  })

  it('altura zero não divide por zero', () => {
    expect(bmiFrom(70, 0)).toBeNull()
  })

  it('arredonda a uma casa, como se lê na prática', () => {
    expect(bmiFrom(62.4, 168)).toBe(22.1)
  })
})

describe('ordem do histórico', () => {
  it('mais recentes primeiro', () => {
    const ordered = sortByMeasuredAt([
      { id: 'velha', measuredAt: '2026-01-01T10:00:00.000Z' },
      { id: 'nova', measuredAt: '2026-08-10T10:00:00.000Z' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['nova', 'velha'])
  })

  it('a última aferição é a que interessa', () => {
    const latest = latestOf([
      { id: 'velha', measuredAt: new Date('2026-01-01T10:00:00.000Z') },
      { id: 'nova', measuredAt: new Date('2026-08-10T10:00:00.000Z') },
    ])

    expect(latest?.id).toBe('nova')
  })

  it('histórico vazio não tem última', () => {
    expect(latestOf([])).toBeNull()
  })

  it('não muda a lista recebida', () => {
    const original = [
      { id: 'a', measuredAt: '2026-01-01T10:00:00.000Z' },
      { id: 'b', measuredAt: '2026-08-10T10:00:00.000Z' },
    ]

    sortByMeasuredAt(original)

    expect(original.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

import { z } from 'zod'

import {
  bloodPressureIsComplete,
  bloodPressureIsOrdered,
  hasAnyMeasurement,
} from '../domain/Vitals'

export const vitalsMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nothingMeasured:
    'Informe ao menos uma medida. Um registro sem nenhum valor apareceria no histórico como aferição feita, sem nada aferido.',
  dateInvalid: 'Informe a data e a hora da aferição.',
  futureMeasurement: 'A aferição não pode estar no futuro.',
  weightInvalid: 'O peso deve estar entre 0,5 e 400 kg.',
  heightInvalid: 'A altura deve estar entre 20 e 260 cm.',
  systolicInvalid: 'A sistólica deve estar entre 40 e 300 mmHg.',
  diastolicInvalid: 'A diastólica deve estar entre 20 e 200 mmHg.',
  bloodPressureIncomplete: 'Informe sistólica e diastólica, ou nenhuma das duas.',
  bloodPressureInverted: 'A diastólica precisa ser menor que a sistólica.',
  heartRateInvalid: 'A frequência cardíaca deve estar entre 20 e 300 bpm.',
  respiratoryRateInvalid: 'A frequência respiratória deve estar entre 4 e 80 irpm.',
  temperatureInvalid: 'A temperatura deve estar entre 25 e 45 °C.',
  spo2Invalid: 'A saturação deve estar entre 50 e 100%.',
  glucoseInvalid: 'A glicemia deve estar entre 10 e 900 mg/dL.',
  notesTooLong: 'Use no máximo 500 caracteres nas observações.',
  forbidden: 'Você não tem permissão para registrar sinais vitais nesta clínica.',
  notFound: 'Este paciente não está mais disponível nesta clínica.',
  encounterMismatch:
    'Este atendimento não pertence a este paciente. Recarregue a ficha e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

/**
 * As faixas abaixo NÃO são referência clínica — são limites de plausibilidade.
 *
 * Elas existem para pegar erro de digitação: 700 kg, 400 °C, saturação de 5%.
 * Nenhuma delas diz o que é normal, e nenhuma recusa um valor que um paciente
 * de verdade possa apresentar — os extremos são generosos de propósito, porque
 * recusar uma medida real seria pior que aceitar um dígito trocado.
 *
 * Faixa de referência de verdade depende de idade, condição e diretriz, e não
 * mora em código: a leitura é de quem atende.
 */
const optionalNumber = (min: number, max: number, message: string, integer = true) =>
  z
    .union([
      z.literal(''),
      z.null(),
      (integer
        ? z.coerce.number().int(message)
        : z.coerce.number()
      )
        .min(min, message)
        .max(max, message),
    ])
    .transform((value) => (value === '' ? null : value))

export const recordVitalsSchema = z
  .object({
    patientId: z.uuid(vitalsMessages.notFound),
    encounterId: z
      .union([z.literal(''), z.null(), z.uuid(vitalsMessages.invalidFields)])
      .transform((value) => value || null),
    measuredAt: z
      .string()
      .trim()
      .min(1, vitalsMessages.dateInvalid)
      .refine(
        (value) => !Number.isNaN(new Date(value).getTime()),
        vitalsMessages.dateInvalid,
      ),
    weightKg: optionalNumber(0.5, 400, vitalsMessages.weightInvalid, false),
    heightCm: optionalNumber(20, 260, vitalsMessages.heightInvalid, false),
    systolicBp: optionalNumber(40, 300, vitalsMessages.systolicInvalid),
    diastolicBp: optionalNumber(20, 200, vitalsMessages.diastolicInvalid),
    heartRate: optionalNumber(20, 300, vitalsMessages.heartRateInvalid),
    respiratoryRate: optionalNumber(4, 80, vitalsMessages.respiratoryRateInvalid),
    temperatureC: optionalNumber(25, 45, vitalsMessages.temperatureInvalid, false),
    spo2: optionalNumber(50, 100, vitalsMessages.spo2Invalid),
    glucoseMgdl: optionalNumber(10, 900, vitalsMessages.glucoseInvalid),
    notes: z
      .union([z.literal(''), z.string().trim().max(500, vitalsMessages.notesTooLong)])
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (!hasAnyMeasurement(value)) {
      context.addIssue({
        code: 'custom',
        path: ['weightKg'],
        message: vitalsMessages.nothingMeasured,
      })
    }

    if (!bloodPressureIsComplete(value.systolicBp, value.diastolicBp)) {
      context.addIssue({
        code: 'custom',
        path: ['diastolicBp'],
        message: vitalsMessages.bloodPressureIncomplete,
      })
    } else if (!bloodPressureIsOrdered(value.systolicBp, value.diastolicBp)) {
      context.addIssue({
        code: 'custom',
        path: ['diastolicBp'],
        message: vitalsMessages.bloodPressureInverted,
      })
    }
  })
export type RecordVitalsInput = z.infer<typeof recordVitalsSchema>

export interface VitalsEntryDto {
  id: string
  patientId: string
  encounterId: string | null
  measuredAt: string
  weightKg: number | null
  heightCm: number | null
  systolicBp: number | null
  diastolicBp: number | null
  heartRate: number | null
  respiratoryRate: number | null
  temperatureC: number | null
  spo2: number | null
  glucoseMgdl: number | null
  notes: string | null
}

export interface VitalsFormValues {
  measuredAt: string
  weightKg: string
  heightCm: string
  systolicBp: string
  diastolicBp: string
  heartRate: string
  respiratoryRate: string
  temperatureC: string
  spo2: string
  glucoseMgdl: string
  notes: string
}

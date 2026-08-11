'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextareaField } from '@/components/ui/textarea-field'

import { amendRecordAction } from '../actions/amendRecord.action'
import { createRecordAction } from '../actions/createRecord.action'
import { listPatientEncountersAction } from '../actions/listPatientEncounters.action'
import {
  recordMessages,
  recordTypeOptions,
  type MedicalRecordDto,
  type RecordEncounterDto,
} from '../schemas/record.schema'
import type { RecordPatientOption } from './ProntuariosScreen'
import { describeEncounterOption } from './recordEncounterLabel'

export interface RecordEditorModalProps {
  mode: 'create' | 'amend'
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Os pacientes que o seletor oferece.
   *
   * Opcional porque nem toda superfície escolhe: aberto da FICHA, o paciente já
   * está decidido pela rota, e a lista da clínica inteira não teria uso — ver
   * `patient`.
   */
  patients?: readonly RecordPatientOption[]
  /**
   * O paciente FIXO desta abertura, quando a superfície já sabe de quem é.
   *
   * Substitui o seletor por uma linha de confirmação. Não é conveniência de
   * tela: enquanto houver `<select>`, existe um caminho para escolher a pessoa
   * errada, e o registro que sai daqui é prontuário. Na ficha o id vem da rota
   * já validada, e oferecer os outros pacientes seria criar o erro que a fatia
   * anterior gastou uma conferência de servidor para impedir.
   */
  patient?: RecordPatientOption | null
  /** Registro sendo corrigido. Obrigatório no modo `amend`. */
  record?: MedicalRecordDto | null
  /**
   * Há banco por trás desta tela.
   *
   * Falso é demonstração local: a Server Action que lista os atendimentos
   * recusaria por falta de sessão, e um erro vermelho ao escolher o paciente
   * diria que o produto está quebrado quando ele só está sem banco.
   */
  isLive?: boolean
  onDone: () => void
}

/**
 * Editor de registro do prontuário (R-01).
 *
 * O mesmo componente serve para criar e para corrigir, mas **a correção parte
 * do texto atual**, não de um campo vazio. Corrigir uma evolução quase nunca é
 * reescrevê-la do zero: é ajustar uma frase. Começar em branco convidaria a
 * perder o que já estava certo.
 *
 * No modo `amend`, paciente e tipo não são editáveis — eles são herdados da
 * versão anterior pelo servidor. Mudar o paciente de um registro existente não
 * é correção, é outro registro. **O atendimento vinculado também não aparece na
 * correção**: ele é herdado da versão anterior, e trocá-lo mudaria de qual
 * consulta o registro saiu — o que não é corrigir um texto.
 *
 * O mesmo componente atende as duas superfícies que escrevem prontuário:
 * `/prontuarios`, onde o paciente é escolhido, e a ficha, onde ele vem fixo por
 * `patient`. Duplicá-lo para a segunda duplicaria junto o seletor de vínculo —
 * a corrida de resposta atrasada, o padrão do atendimento aberto e o bloco da
 * queixa —, e a cópia que envelhecesse primeiro passaria a vincular diferente da
 * outra.
 */
export function RecordEditorModal({
  mode,
  open,
  onOpenChange,
  patients = [],
  patient = null,
  record = null,
  isLive = false,
  onDone,
}: RecordEditorModalProps) {
  const [chosenPatientId, setPatientId] = useState('')
  const [recordType, setRecordType] = useState<string>('evolution')
  const [content, setContent] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * O paciente do registro — o fixo vence a escolha, quando existe.
   *
   * Derivado, e não copiado para o estado por um efeito: um estado espelho
   * ficaria vazio no primeiro render, e o efeito que busca os atendimentos
   * rodaria uma vez sem paciente antes de rodar com ele.
   */
  const patientId = patient ? patient.id : chosenPatientId

  /**
   * Os atendimentos JÁ CARREGADOS, com o paciente que os produziu.
   *
   * Guardar o paciente junto é o que permite derivar "está carregando" e
   * descartar a resposta de uma escolha anterior sem um segundo estado — mesmo
   * desenho de `lastSearch` no `PatientPicker`.
   */
  const [loaded, setLoaded] = useState<{
    patientId: string
    options: readonly RecordEncounterDto[]
    error: string | null
  } | null>(null)

  /**
   * A escolha EXPLÍCITA do vínculo, quando houve uma.
   *
   * Enquanto ninguém tocou no campo, vale o padrão derivado (o atendimento
   * aberto). Guardar só o valor não bastaria: `''` é uma escolha legítima —
   * "não vincular" — e seria indistinguível de "ainda não escolheu", o que faria
   * o padrão voltar sozinho depois de a pessoa tê-lo recusado.
   */
  const [encounterChoice, setEncounterChoice] = useState<string | null>(null)

  // Ajuste durante o render: quando o modal abre para corrigir OUTRO registro,
  // o texto precisa acompanhar. Sem efeito e sem remontar o campo.
  const [syncedId, setSyncedId] = useState<string | null>(null)
  const currentId = record?.id ?? null

  if (mode === 'amend' && currentId !== syncedId) {
    setSyncedId(currentId)
    setContent(record?.content ?? '')
    setError(null)
  }

  /**
   * Busca os atendimentos do paciente escolhido.
   *
   * `requestId` descarta resposta atrasada: trocar de paciente duas vezes seguidas
   * poderia fazer a lista do primeiro chegar depois e ficar na tela — e a pessoa
   * vincularia a evolução a um atendimento de outra pessoa.
   */
  const requestId = useRef(0)

  useEffect(() => {
    if (mode !== 'create' || !open || !isLive) return
    if (!patientId) return
    // Já é a lista deste paciente: nada a buscar.
    if (loaded?.patientId === patientId) return

    const current = ++requestId.current

    void (async () => {
      try {
        const result = await listPatientEncountersAction({ patientId })
        if (current !== requestId.current) return

        setLoaded(
          result.ok
            ? { patientId, options: result.data, error: null }
            : { patientId, options: [], error: result.error.message },
        )
      } catch {
        if (current !== requestId.current) return

        setLoaded({
          patientId,
          options: [],
          error: recordMessages.encountersUnavailable,
        })
      }
    })()
  }, [mode, open, isLive, patientId, loaded?.patientId])

  function reset() {
    setPatientId('')
    setRecordType('evolution')
    setContent('')
    setError(null)
    setSyncedId(null)
    setLoaded(null)
    setEncounterChoice(null)
  }

  async function handleSubmit() {
    if (mode === 'create' && !patientId) {
      setError(recordMessages.patientRequired)
      return
    }

    if (content.trim().length === 0) {
      setError(recordMessages.contentRequired)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result =
        mode === 'create'
          ? await createRecordAction({
              patientId,
              encounterId,
              recordType,
              content,
            })
          : await amendRecordAction({ recordId: record?.id, content })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      reset()
      onOpenChange(false)
      onDone()
    } catch {
      setError(recordMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  const isAmend = mode === 'amend'

  /** Atendimentos deste paciente — os de outro nunca são oferecidos. */
  const encounters = loaded?.patientId === patientId ? loaded.options : []
  const encountersError =
    loaded?.patientId === patientId ? loaded.error : null
  const isLoadingEncounters =
    isLive && patientId !== '' && loaded?.patientId !== patientId

  /*
   * O atendimento ABERTO é o padrão.
   *
   * É o caso quase sempre certo: quem registra a evolução com a consulta em
   * curso está registrando aquela consulta. Os encerrados continuam na lista
   * porque escrever depois de encerrar é rotina — mas escolher um deles é uma
   * decisão, não o caminho de menor esforço.
   */
  const defaultEncounterId =
    encounters.find((encounter) => encounter.status === 'open')?.id ?? ''
  const encounterId = encounterChoice ?? defaultEncounterId
  const selectedEncounter = encounters.find(
    (encounter) => encounter.id === encounterId,
  )

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={isAmend ? 'Corrigir registro' : 'Nova evolução'}
      description={
        isAmend
          ? 'A versão anterior continua registrada e legível. Esta correção entra como uma versão nova.'
          : 'O registro é assinado por você e não pode ser apagado depois.'
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar registro'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        {isAmend ? (
          <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
            Corrigindo a versão {record?.version ?? 1}. O texto anterior
            permanece no histórico.
          </p>
        ) : (
          <>
            {patient ? (
              // Confirmação, não campo: a ficha já decidiu de quem é o registro,
              // e o que falta é a pessoa que assina ver o nome antes de escrever.
              <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
                Registro de{' '}
                <span className="font-semibold text-foreground">
                  {patient.name}
                </span>
                .
              </p>
            ) : (
              <SelectField
                label="Paciente"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value)
                  // Trocar de paciente invalida a escolha do atendimento: sem
                  // isto, o vínculo do paciente anterior continuaria no
                  // formulário e seria enviado com o registro de outra pessoa.
                  setEncounterChoice(null)
                }}
                options={[
                  { value: '', label: 'Selecione o paciente' },
                  ...patients.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ]}
              />
            )}

            {isLive && patientId ? (
              <div className="flex flex-col gap-2">
                <SelectField
                  label="Atendimento"
                  value={encounterId}
                  disabled={isLoadingEncounters}
                  onChange={(event) => setEncounterChoice(event.target.value)}
                  error={encountersError ?? undefined}
                  hint={
                    isLoadingEncounters
                      ? 'Carregando os atendimentos deste paciente...'
                      : encounters.length === 0
                        ? 'Este paciente ainda não tem atendimento registrado. O registro fica sem vínculo.'
                        : 'Vincular diz de qual consulta este registro saiu.'
                  }
                  options={[
                    // A primeira opção é "sem vínculo", e não um placeholder:
                    // registro sem atendimento é caso legítimo — nota de
                    // telefonema, resultado de exame que chegou depois.
                    { value: '', label: 'Sem vínculo com atendimento' },
                    ...encounters.map((encounter) => ({
                      value: encounter.id,
                      label: describeEncounterOption(encounter),
                    })),
                  ]}
                />

                {selectedEncounter ? (
                  <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
                    {selectedEncounter.chiefComplaint ? (
                      <>
                        <span className="font-semibold text-label">
                          Queixa principal:
                        </span>{' '}
                        {selectedEncounter.chiefComplaint}
                      </>
                    ) : (
                      // Ausência de queixa é informação, não campo vazio: quem
                      // escreve a evolução precisa saber que ninguém registrou
                      // o motivo clínico daquela consulta.
                      'Nenhuma queixa principal foi registrada neste atendimento.'
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            <SelectField
              label="Tipo de registro"
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
              options={[...recordTypeOptions]}
            />
          </>
        )}

        <TextareaField
          label="Registro"
          rows={10}
          placeholder="Descreva a evolução, a conduta e as orientações."
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
    </Modal>
  )
}

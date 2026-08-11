'use client'

import { FileText, History, PenLine, Plus, Stethoscope } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import { recordMessages, type MedicalRecordDto } from '../schemas/record.schema'
import { RecordEditorModal } from './RecordEditorModal'
import {
  encounterStatusLabel,
  formatEncounterMoment,
} from './recordEncounterLabel'
import { recordTypeLabel } from './recordTypeLabel'
import { RecordVersionsModal } from './RecordVersionsModal'

export interface PatientRecordsPanelProps {
  patientId: string
  /**
   * O nome como a FICHA o exibe — social quando existe.
   *
   * Viaja para que o formulário confirme de quem é o registro que está sendo
   * escrito. Aqui não há seletor de paciente: o registro nasce da ficha aberta,
   * e a única confirmação possível é o nome escrito por extenso.
   */
  patientName: string
  records: readonly MedicalRecordDto[]
  /** `record.write` — a permissão mais restritiva do produto. */
  canWrite: boolean
  /**
   * Tem cadastro em `professionals`?
   *
   * A segunda porta, separada de `canWrite` para a tela dizer o que fazer em vez
   * de mostrar um botão desabilitado sem explicação. Mesmo desenho do painel de
   * prescrições.
   */
  isProfessional: boolean
  isLive: boolean
  /** Teto que a rota pediu. A tela declara quando a lista bateu nele. */
  limit: number
  /** Falha de leitura: o painel diz o que houve em vez de fingir lista vazia. */
  loadError?: string | null
}

/**
 * O prontuário do paciente, dentro da ficha.
 *
 * # Por que este painel existe
 *
 * `/prontuarios` lista os registros recentes da CLÍNICA — é a fila de quem
 * escreve, não a história de quem é atendido. Para ler a evolução de uma pessoa
 * era preciso caçar as linhas dela no meio das dos outros, e a ficha, que reunia
 * alergias, sinais vitais e prescrições, parava justamente no registro que
 * explica os três.
 *
 * O painel fecha a integração que a fatia anterior deixou em aberto: o vínculo
 * `medical_records.encounter_id` passou a ser gravado, e é aqui que ele vira
 * leitura — a queixa principal registrada em `/atendimentos` aparece ao lado da
 * conduta que ela originou, na tela de quem cuida do paciente.
 *
 * # O que ele NÃO faz
 *
 * Não assina, não imprime, não gera PDF e não apaga. `medical_records` é
 * append-only: corrigir cria a versão seguinte, e a anterior continua legível.
 * Um botão "excluir" aqui removeria história clínica — e história clínica que
 * some não vale como prova de nada.
 */
export function PatientRecordsPanel({
  patientId,
  patientName,
  records,
  canWrite,
  isProfessional,
  isLive,
  limit,
  loadError = null,
}: PatientRecordsPanelProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [amending, setAmending] = useState<MedicalRecordDto | null>(null)
  const [viewingVersions, setViewingVersions] =
    useState<MedicalRecordDto | null>(null)

  /*
   * Escrever exige as duas portas E banco. Falha de leitura também fecha o
   * botão: registrar sobre uma lista que não carregou faria a pessoa escrever
   * de novo o que talvez já esteja lá.
   */
  const editable = canWrite && isProfessional && isLive && !loadError

  /*
   * A lista bateu no teto? Então há registro mais antigo que não está aqui.
   *
   * `>=` e não `===` porque quem muda o limite não deve precisar lembrar deste
   * arquivo: qualquer lista igual ou maior que o pedido significa corte.
   */
  const truncated = records.length >= limit

  return (
    <Card>
      <CardHeader
        title="Prontuário"
        description={
          isLive
            ? 'Evoluções deste paciente. Corrigir cria uma versão nova — nada é reescrito no lugar.'
            : 'Modo demonstração: nenhum registro fictício é exibido.'
        }
        action={
          canWrite ? (
            <Button onClick={() => setCreating(true)} disabled={!editable}>
              <Plus aria-hidden className="size-4" />
              Nova evolução
            </Button>
          ) : null
        }
        className="border-b border-border-card"
      />

      {/*
        O aviso de acesso registrado NÃO fica aqui.

        Este painel é um de quatro recortes clínicos da ficha, e quem sabe quais
        deles foram entregues a quem está lendo é a rota — ela declara o registro
        uma vez, acima do bloco clínico. Repetir a frase em cada painel diria
        menos, quatro vezes.
      */}
      {isLive ? null : (
        <p
          role="status"
          className="border-b border-border-card px-5 py-3 text-label text-muted"
        >
          Modo demonstração: nada é gravado e nenhum acesso é auditado.
        </p>
      )}

      {loadError ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {/*
        Papel permitido e sem cadastro profissional: a mensagem diz o que fazer.
        `author_id` é `professionals.id` — quem não tem linha lá não assina
        prontuário, mesmo sendo dono da clínica.
      */}
      {canWrite && !isProfessional && isLive ? (
        <div
          role="status"
          className="m-4 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending"
        >
          {recordMessages.notAProfessional}
        </div>
      ) : null}

      {records.length === 0 && !loadError ? (
        <div className="flex items-start gap-2.5 px-5 py-5 text-aux text-muted">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0" />
          {/*
            Em demonstração a rota não lê prontuário nenhum, e afirmar que o
            paciente não tem registro seria falar por uma base que nem foi
            consultada.
          */}
          <p>
            {isLive
              ? 'Nenhum registro no prontuário deste paciente até agora.'
              : 'A demonstração não fabrica prontuário: nenhum registro é exibido aqui.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-card">
          {records.map((record) => (
            <li key={record.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-aux font-semibold text-foreground">
                    {recordTypeLabel(record.recordType)}
                  </p>
                  <p className="mt-0.5 text-label text-muted">
                    {record.authorName} ·{' '}
                    {formatShortDate(new Date(record.createdAt))} às{' '}
                    {formatTime(new Date(record.createdAt))}
                  </p>
                </div>

                {/*
                  A versão fica visível sempre, e não só quando é maior que 1: é
                  o que comunica que o prontuário é versionado, antes de alguém
                  precisar corrigir alguma coisa.
                */}
                <div className="flex items-center gap-2">
                  <StatusBadge tone={record.version > 1 ? 'pending' : 'neutral'}>
                    {`Versão ${record.version}`}
                  </StatusBadge>

                  {/*
                    O gatilho do histórico substituiu um ícone que só anunciava
                    "corrigido N vezes" e não levava a lugar nenhum. Ele aparece
                    apenas onde há o que ver: com uma versão só, a cadeia é a
                    própria linha, e um botão que abrisse um item repetido seria
                    trabalho oferecido em troca de nada.
                  */}
                  {record.version > 1 && isLive ? (
                    <Button
                      variant="ghost"
                      onClick={() => setViewingVersions(record)}
                    >
                      <History aria-hidden className="size-4" />
                      Ver histórico
                    </Button>
                  ) : null}
                </div>
              </div>

              {/*
                De qual consulta este registro saiu.

                Fica ACIMA do texto porque é o contexto que o explica: a queixa
                diz por que a pessoa veio, e a evolução diz o que foi feito. Ler
                a conduta antes do motivo inverte a ordem em que quem atende
                pensa.
              */}
              {record.encounter ? (
                <div className="flex flex-col gap-1 rounded-field border border-border-card bg-background px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-label text-muted">
                    <Stethoscope aria-hidden className="size-3.5 shrink-0" />
                    Atendimento de {formatEncounterMoment(record.encounter)} ·{' '}
                    {encounterStatusLabel(record.encounter.status)}
                    {record.encounter.professionalName
                      ? ` · ${record.encounter.professionalName}`
                      : ''}
                  </p>

                  {record.encounter.chiefComplaint ? (
                    <p className="text-label text-foreground">
                      <span className="font-semibold">Queixa principal:</span>{' '}
                      {record.encounter.chiefComplaint}
                    </p>
                  ) : null}
                </div>
              ) : record.encounterId ? (
                /*
                  Há vínculo e o atendimento não pôde ser lido. Dizer "sem
                  vínculo" seria afirmar o contrário do que a linha diz.
                */
                <p className="text-label text-muted">
                  Vinculado a um atendimento que não pôde ser carregado.
                </p>
              ) : null}

              <p className="text-aux leading-6 whitespace-pre-wrap text-foreground">
                {record.content}
              </p>

              {editable ? (
                <div>
                  <Button variant="secondary" onClick={() => setAmending(record)}>
                    <PenLine aria-hidden className="size-4" />
                    Corrigir
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {truncated ? (
        <p className="border-t border-border-card px-5 py-3 text-label text-muted">
          Mostrando os {limit} registros mais recentes. Há registro mais antigo
          neste prontuário.
        </p>
      ) : null}

      <RecordEditorModal
        mode="create"
        open={creating}
        onOpenChange={setCreating}
        patient={{ id: patientId, name: patientName }}
        isLive={isLive}
        onDone={() => router.refresh()}
      />

      <RecordVersionsModal
        open={viewingVersions !== null}
        onOpenChange={(open) => {
          if (!open) setViewingVersions(null)
        }}
        record={viewingVersions}
        isLive={isLive}
      />

      <RecordEditorModal
        mode="amend"
        open={amending !== null}
        onOpenChange={(open) => {
          if (!open) setAmending(null)
        }}
        patient={{ id: patientId, name: patientName }}
        record={amending}
        isLive={isLive}
        onDone={() => {
          setAmending(null)
          router.refresh()
        }}
      />
    </Card>
  )
}

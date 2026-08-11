'use client'

import {
  FileText,
  History,
  LockKeyhole,
  PenLine,
  Plus,
  Stethoscope,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import {
  recordTypeOptions,
  type MedicalRecordDto,
} from '../schemas/record.schema'
import { RecordEditorModal } from './RecordEditorModal'
import {
  encounterStatusLabel,
  formatEncounterMoment,
} from './recordEncounterLabel'

export interface RecordPatientOption {
  id: string
  name: string
}

export interface ProntuariosScreenProps {
  records: readonly MedicalRecordDto[]
  patients: readonly RecordPatientOption[]
  /** Nome do paciente por id, para a lista não depender de join na view. */
  patientNames: Readonly<Record<string, string>>
  /**
   * A sessão pode assinar prontuário?
   *
   * Resolvido no servidor por `current_professional_id()`. Falso esconde os
   * botões de escrita — um botão que sempre falha é pior que botão ausente.
   */
  canWrite: boolean
  isLive?: boolean
}

/**
 * Rótulo do tipo de registro.
 *
 * `Map<string, string>` de propósito: o DTO traz `recordType` como string
 * porque o enum do banco tem mais valores do que o formulário oferece
 * (`exam_request`, `referral`, `certificate`). Um registro importado ou criado
 * por outra via precisa aparecer na lista, não quebrar a tela — por isso o
 * fallback exibe o valor cru em vez de sumir com a linha.
 */
const recordTypeLabels = new Map<string, string>(
  recordTypeOptions.map((option) => [option.value, option.label]),
)

/**
 * Prontuários — feature **R-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx` com três
 * evoluções literais no arquivo e um botão `disabled`.
 *
 * A tela mostra a **versão vigente** de cada registro. Corrigir cria a versão
 * seguinte; nada é reescrito no lugar, e o histórico de versões é alcançável
 * pelo próprio item.
 */
export function ProntuariosScreen({
  records,
  patients,
  patientNames,
  canWrite,
  isLive = false,
}: ProntuariosScreenProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [amending, setAmending] = useState<MedicalRecordDto | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cuidado contínuo"
        title="Prontuários"
        description="Acesse evoluções com rastreabilidade e histórico de versões."
        actions={
          canWrite ? (
            <Button
              className="max-md:w-full"
              onClick={() => setCreating(true)}
              disabled={!isLive}
              title={
                isLive
                  ? undefined
                  : 'Modo demonstração: registrar exige banco configurado.'
              }
            >
              <Plus aria-hidden className="size-4" strokeWidth={2.25} />
              Nova evolução
            </Button>
          ) : null
        }
      />

      {/*
        Aviso de auditoria de leitura. Não é decoração: quem abre esta tela
        precisa saber que o acesso fica registrado — é o que torna o registro
        legítimo em vez de vigilância silenciosa.
      */}
      <p className="flex items-start gap-2.5 rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
        Informações protegidas por sigilo profissional. Cada acesso a esta área é
        registrado.
      </p>

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: os registros abaixo são de exemplo e nada é salvo.
        </p>
      )}

      {!canWrite ? (
        <p className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          Seu perfil permite consultar o prontuário, mas não registrar. Apenas
          profissionais de saúde cadastrados nesta clínica assinam evoluções.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {records.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum registro no prontuário ainda."
            description="As evoluções registradas pelos profissionais aparecem aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-card">
            {records.map((record) => (
              <li key={record.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/pacientes/${record.patientId}`}
                      className="text-aux font-semibold text-foreground hover:underline"
                    >
                      {patientNames[record.patientId] ?? 'Paciente'}
                    </Link>
                    <p className="mt-0.5 text-label text-muted">
                      {recordTypeLabels.get(record.recordType) ??
                        record.recordType}{' '}
                      · {record.authorName} ·{' '}
                      {formatShortDate(new Date(record.createdAt))} às{' '}
                      {formatTime(new Date(record.createdAt))}
                    </p>
                  </div>

                  {/*
                    A versão fica visível sempre, e não só quando é maior que 1:
                    é o que comunica que o prontuário é versionado, antes mesmo
                    de alguém precisar corrigir alguma coisa.
                  */}
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={record.version > 1 ? 'pending' : 'neutral'}>
                      {`Versão ${record.version}`}
                    </StatusBadge>
                    {record.version > 1 ? (
                      <History
                        aria-label={`Este registro foi corrigido ${record.version - 1} vez(es)`}
                        className="size-4 text-muted"
                      />
                    ) : null}
                  </div>
                </div>

                {/*
                  De qual consulta este registro saiu.

                  Fica ACIMA do texto porque é o contexto que o explica: a
                  queixa diz por que a pessoa veio, e a evolução diz o que foi
                  feito. Ler a conduta antes do motivo inverte a ordem em que
                  quem atende pensa.
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
                    vínculo" aqui seria afirmar o contrário do que a linha diz —
                    e é justamente o registro que menos pode mentir.
                  */
                  <p className="text-label text-muted">
                    Vinculado a um atendimento que não pôde ser carregado.
                  </p>
                ) : null}

                <p className="text-aux leading-6 whitespace-pre-wrap text-foreground">
                  {record.content}
                </p>

                {canWrite && isLive ? (
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => setAmending(record)}
                    >
                      <PenLine aria-hidden className="size-4" />
                      Corrigir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RecordEditorModal
        mode="create"
        open={creating}
        onOpenChange={setCreating}
        patients={patients}
        isLive={isLive}
        onDone={() => router.refresh()}
      />

      <RecordEditorModal
        mode="amend"
        open={amending !== null}
        onOpenChange={(open) => {
          if (!open) setAmending(null)
        }}
        patients={patients}
        record={amending}
        onDone={() => {
          setAmending(null)
          router.refresh()
        }}
      />
    </div>
  )
}

'use client'

import { Download, FileArchive, FileText, FolderOpen, Plus, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SearchField } from '@/components/ui/search-field'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'

import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  documentMessages,
  type DocumentDto,
} from '../schemas/document.schema'
import type { DocumentKind } from '../domain/Document'
import type { DocumentsScreenProps } from './DocumentsScreen.props'

const kindOptions = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'rg', label: 'RG' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cns', label: 'CNS' },
  { value: 'passport', label: 'Passaporte' },
  { value: 'insurance_card', label: 'Carteirinha do convênio' },
  { value: 'consent_form', label: 'Termo de consentimento' },
  { value: 'other', label: 'Outro' },
] as const

const kindLabels: Record<DocumentKind, string> = {
  rg: 'RG',
  cpf: 'CPF',
  cns: 'CNS',
  passport: 'Passaporte',
  insurance_card: 'Carteirinha do convênio',
  consent_form: 'Termo de consentimento',
  other: 'Outro',
}

export function DocumentsScreen({
  documents,
  patients,
  onUpload,
  onDownload,
  isLive,
  schemaPending = false,
  storageReady = false,
  referenceDate,
}: DocumentsScreenProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [patientId, setPatientId] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canUpload = isLive && !schemaPending && storageReady && patients.length > 0
  const patientFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos os pacientes' },
      ...patients.map((patient) => ({ value: patient.id, label: patient.name })),
    ],
    [patients],
  )

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
    return documents.filter((document) => {
      const matchesKind = kind === 'all' || document.kind === kind
      const matchesPatient = patientId === 'all' || document.patientId === patientId
      const matchesSearch =
        normalizedSearch.length === 0 ||
        document.fileName.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        document.patientName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
      return matchesKind && matchesPatient && matchesSearch
    })
  }, [documents, kind, patientId, search])

  const pdfCount = documents.filter((document) => document.mimeType === 'application/pdf').length
  const referenceTime = new Date(referenceDate).getTime()
  const recentCount = documents.filter((document) => {
    const age = referenceTime - new Date(document.createdAt).getTime()
    return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000
  }).length

  function openUpload() {
    setError(null)
    setModalOpen(true)
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const failure = await onUpload(new FormData(event.currentTarget))
      if (failure) {
        setError(failure)
        return
      }
      setModalOpen(false)
      event.currentTarget.reset()
      router.refresh()
    } catch {
      setError(documentMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownload(document: DocumentDto) {
    if (busyId) return
    setError(null)
    setBusyId(document.id)
    try {
      const result = await onDownload(document.id)
      if (result.error || !result.url) {
        setError(result.error ?? documentMessages.unavailable)
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError(documentMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão clínica"
        title="Documentos"
        description="Centralize arquivos de pacientes com acesso privado e rastreável."
        actions={
          <Button onClick={openUpload} disabled={!canUpload}>
            <Plus aria-hidden className="size-4" />
            Enviar documento
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
        <FolderOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          {schemaPending
            ? documentMessages.schemaPending
            : !isLive
              ? 'Modo demonstração: documentos pessoais não são simulados e o envio está desabilitado.'
              : !storageReady
                ? documentMessages.storagePending
                : 'Arquivos ficam em bucket privado. O download gera um link temporário e cada envio é auditado.'}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Arquivos cadastrados" value={documents.length} icon={FileArchive} />
        <MetricCard label="PDFs" value={pdfCount} icon={FileText} />
        <MetricCard label="Enviados nos últimos 30 dias" value={recentCount} icon={UploadCloud} />
      </div>

      <Card>
        <CardHeader
          title="Central de arquivos"
          description={`${filteredDocuments.length} ${filteredDocuments.length === 1 ? 'resultado' : 'resultados'}`}
        />
        <div className="grid gap-3 border-y border-border-card px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_220px_260px]">
          <SearchField
            label="Buscar documentos"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder="Nome do arquivo ou paciente"
          />
          <SelectField
            label="Tipo"
            hideLabel
            options={kindOptions}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          />
          <SelectField
            label="Paciente"
            hideLabel
            options={patientFilterOptions}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
          />
        </div>

        {filteredDocuments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={documents.length === 0 ? 'Nenhum documento enviado' : 'Nenhum resultado encontrado'}
            description={
              documents.length === 0
                ? 'Quando o Storage estiver configurado, envie RG, termos e outros arquivos diretamente pela ficha do paciente.'
                : 'Ajuste a busca ou remova os filtros para encontrar outros documentos.'
            }
            action={
              documents.length === 0 ? (
                <Button onClick={openUpload} disabled={!canUpload}>
                  <UploadCloud aria-hidden className="size-4" />
                  Enviar primeiro documento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border-card">
            {filteredDocuments.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                isBusy={busyId === document.id}
                onDownload={() => void handleDownload(document)}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Enviar documento"
        description="Associe um arquivo ao cadastro correto do paciente."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="document-upload" isLoading={isSubmitting} disabled={!canUpload}>
              Enviar arquivo
            </Button>
          </>
        }
      >
        <form id="document-upload" className="flex flex-col gap-4" onSubmit={handleUpload}>
          <SelectField
            label="Paciente"
            name="patientId"
            required
            options={[
              { value: '', label: 'Selecione um paciente' },
              ...patients.map((patient) => ({ value: patient.id, label: patient.name })),
            ]}
            defaultValue=""
          />
          <SelectField
            label="Tipo de documento"
            name="kind"
            required
            options={kindOptions.filter((option) => option.value !== 'all')}
            defaultValue="other"
          />
          <label htmlFor="document-file" className="flex flex-col gap-1.5 text-label font-semibold text-foreground">
            Arquivo
            <input
              id="document-file"
              name="file"
              type="file"
              required
              accept={DOCUMENT_ALLOWED_MIME_TYPES.join(',')}
              className="min-h-12 w-full cursor-pointer rounded-field border border-border-default bg-surface px-3 py-3 text-aux text-foreground file:mr-3 file:rounded-field file:border-0 file:bg-brand-subtle file:px-3 file:py-2 file:font-semibold file:text-link"
            />
            <span className="font-normal text-muted">PDF, imagem, documento ou planilha · máximo de 10 MB.</span>
          </label>
        </form>
      </Modal>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof FileArchive
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-field bg-brand-subtle text-link">
          <Icon aria-hidden className="size-5" />
        </span>
        <div>
          <p className="text-label text-muted">{label}</p>
          <p className="mt-0.5 text-display-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function DocumentRow({
  document,
  isBusy,
  onDownload,
}: {
  document: DocumentDto
  isBusy: boolean
  onDownload: () => void
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-field bg-brand-subtle text-link">
          <FileText aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-control font-semibold text-foreground">{document.fileName}</p>
          <p className="mt-1 truncate text-aux text-muted">{document.patientName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{kindLabels[document.kind]}</StatusBadge>
            <span className="text-label text-muted">{formatBytes(document.sizeBytes)}</span>
            <span className="text-label text-muted">{formatDate(document.createdAt)}</span>
          </div>
        </div>
      </div>
      <Button variant="secondary" onClick={onDownload} isLoading={isBusy}>
        <Download aria-hidden className="size-4" />
        Baixar
      </Button>
    </div>
  )
}

function formatBytes(value: number | null): string {
  if (!value) return 'Tamanho não informado'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

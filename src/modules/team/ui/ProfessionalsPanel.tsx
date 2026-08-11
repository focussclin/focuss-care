'use client'

import { Info, Plus, Stethoscope } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'

import {
  createProfessionalAction,
  setProfessionalActiveAction,
  updateProfessionalAction,
} from '../actions/professional.action'
import { COUNCIL_LABELS, COUNCIL_TYPES } from '../domain/Professional'
import {
  professionalMessages,
  type LinkableMemberDto,
  type ProfessionalDto,
  type ProfessionalFormValues,
} from '../schemas/professional.schema'

export interface ProfessionalsPanelProps {
  professionals: readonly ProfessionalDto[]
  /** Membros ativos da clínica — os únicos que podem ser vinculados. */
  members: readonly LinkableMemberDto[]
  canManage: boolean
  isLive: boolean
  /** Preenchido quando a leitura falhou: a tela não finge lista vazia. */
  loadError?: string | null
}

const EMPTY_FORM: ProfessionalFormValues = {
  displayName: '',
  councilType: '',
  councilNumber: '',
  councilState: '',
  specialties: '',
  defaultSlotMinutes: '30',
  userId: '',
}

function toFormValues(professional: ProfessionalDto): ProfessionalFormValues {
  return {
    displayName: professional.displayName,
    councilType: professional.councilType ?? '',
    councilNumber: professional.councilNumber ?? '',
    councilState: professional.councilState ?? '',
    specialties: professional.specialties.join(', '),
    defaultSlotMinutes: String(professional.defaultSlotMinutes),
    userId: professional.linkedUserId ?? '',
  }
}

/**
 * Profissionais — quem atende e quem assina.
 *
 * # O painel que faltava
 *
 * `professionals` era lida por quatro módulos e escrita por nenhum: agenda,
 * prontuário, prescrição e assinatura dependiam de uma linha que só existia se
 * alguém a inserisse direto no banco.
 *
 * # A tela diz quem NÃO assina
 *
 * Um profissional sem usuário vinculado é um cadastro legítimo — dá para pôr
 * alguém na agenda antes de a pessoa ter conta. Mas ele não assina prontuário
 * nem prescrição, porque `current_professional_id()` resolve pelo usuário da
 * sessão. Descobrir isso na hora de fechar um atendimento é caro; a lista avisa
 * antes.
 */
export function ProfessionalsPanel({
  professionals,
  members,
  canManage,
  isLive,
  loadError = null,
}: ProfessionalsPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /** `null` fechado, `'new'` criando, ou o id em edição. */
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<ProfessionalFormValues>(EMPTY_FORM)

  const editable = canManage && isLive && !loadError

  function set<K extends keyof ProfessionalFormValues>(
    field: K,
    value: ProfessionalFormValues[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openNew() {
    setError(null)
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  function openEdit(professional: ProfessionalDto) {
    setError(null)
    setForm(toFormValues(professional))
    setEditing(professional.id)
  }

  function run(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await operation()
        if (!result.ok) {
          setError(result.message ?? professionalMessages.unexpected)
          return
        }
        router.refresh()
      } catch {
        setError(professionalMessages.unavailable)
      }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return

    const payload = {
      displayName: form.displayName,
      councilType: form.councilType,
      councilNumber: form.councilNumber,
      councilState: form.councilState,
      specialties: form.specialties,
      defaultSlotMinutes: form.defaultSlotMinutes,
      userId: form.userId,
    }

    run(async () => {
      const result =
        editing === 'new'
          ? await createProfessionalAction(payload)
          : await updateProfessionalAction({ professionalId: editing, ...payload })

      if (result.ok) {
        setEditing(null)
        setForm(EMPTY_FORM)
      }

      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  function handleToggle(professional: ProfessionalDto) {
    run(async () => {
      const result = await setProfessionalActiveAction({
        professionalId: professional.id,
        isActive: !professional.isActive,
      })
      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  /*
   * Quem já está vinculado a OUTRO cadastro sai da lista de opções: o banco
   * recusaria o segundo vínculo, e oferecer um nome que vai falhar é pior que
   * não oferecê-lo.
   */
  const takenUserIds = new Set(
    professionals
      .filter((professional) => professional.id !== editing)
      .map((professional) => professional.linkedUserId)
      .filter((userId): userId is string => userId !== null),
  )

  const memberOptions = [
    { value: '', label: 'Sem usuário vinculado' },
    ...members
      .filter((member) => !takenUserIds.has(member.userId))
      .map((member) => ({ value: member.userId, label: member.name })),
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Profissionais"
        description="Quem atende nesta clínica, com conselho e especialidade."
        action={
          canManage ? (
            <Button
              variant="secondary"
              disabled={!editable || isPending}
              onClick={() => (editing === 'new' ? setEditing(null) : openNew())}
            >
              <Stethoscope aria-hidden className="size-4" />
              {editing === 'new' ? 'Fechar' : 'Novo profissional'}
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <p
          role="alert"
          className="border-y border-danger/30 bg-danger-surface px-5 py-3 text-aux text-danger"
        >
          {loadError}
        </p>
      ) : null}

      {!isLive && !loadError ? (
        <p role="status" className="border-y border-border-card px-5 py-3 text-aux text-muted">
          Modo demonstração: nenhum profissional é carregado nem salvo.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-y border-danger/30 bg-danger-surface px-5 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {editing ? (
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 border-y border-border-card px-5 py-4 sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <TextField
              label="Nome na agenda"
              value={form.displayName}
              onChange={(event) => set('displayName', event.target.value)}
              maxLength={120}
              hint="Como o nome aparece para quem marca e para o paciente."
            />
          </div>

          <SelectField
            label="Conselho"
            value={form.councilType}
            onChange={(event) => set('councilType', event.target.value)}
            options={[
              { value: '', label: 'Sem conselho' },
              ...COUNCIL_TYPES.map((council) => ({
                value: council,
                label: COUNCIL_LABELS[council],
              })),
            ]}
          />

          <TextField
            label="Número"
            value={form.councilNumber}
            onChange={(event) => set('councilNumber', event.target.value)}
            maxLength={30}
          />

          <TextField
            label="UF do conselho"
            value={form.councilState}
            onChange={(event) => set('councilState', event.target.value)}
            maxLength={2}
            hint="Duas letras."
          />

          <div className="sm:col-span-2">
            <TextField
              label="Especialidades"
              value={form.specialties}
              onChange={(event) => set('specialties', event.target.value)}
              hint="Separe por vírgula. Opcional."
            />
          </div>

          <TextField
            label="Duração padrão (min)"
            type="number"
            min={5}
            max={240}
            value={form.defaultSlotMinutes}
            onChange={(event) => set('defaultSlotMinutes', event.target.value)}
            hint="Fica no cadastro; a agenda ainda não a aplica sozinha."
          />

          <div className="sm:col-span-2">
            <SelectField
              label="Usuário vinculado"
              value={form.userId}
              onChange={(event) => set('userId', event.target.value)}
              options={memberOptions}
              hint="Só quem tem acesso ativo a esta clínica. É o vínculo que permite assinar."
            />
          </div>

          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              <Plus aria-hidden className="size-4" />
              {isPending ? 'Salvando…' : 'Salvar profissional'}
            </Button>
          </div>
        </form>
      ) : null}

      {professionals.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Nenhum profissional cadastrado."
          description="Sem profissional não há a quem marcar na agenda, e ninguém assina prontuário."
        />
      ) : (
        <ul className="divide-y divide-border-card border-t border-border-card">
          {professionals.map((professional) => (
            <li
              key={professional.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-aux font-semibold text-foreground">
                  {professional.displayName}
                </p>
                <p className="truncate text-label text-muted">
                  {[
                    professional.council,
                    professional.specialties.join(', ') || null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem conselho e sem especialidade informados'}
                </p>
                {professional.canSign ? null : (
                  <p className="text-label text-muted">
                    {professional.isActive
                      ? professionalMessages.signatureNeedsUser
                      : 'Inativo: fora da agenda e sem assinatura.'}
                  </p>
                )}
              </div>

              <StatusBadge tone={professional.isActive ? 'positive' : 'negative'}>
                {professional.isActive ? 'Ativo' : 'Inativo'}
              </StatusBadge>

              {editable ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => openEdit(professional)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleToggle(professional)}
                  >
                    {professional.isActive ? 'Desativar' : 'Reativar'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {professionalMessages.colorUnavailable}
      </p>
    </Card>
  )
}

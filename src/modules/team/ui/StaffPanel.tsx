'use client'

import { CalendarOff, Info, Plus, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { formatShortDate } from '@/lib/utils/date'

import {
  answerTimeOffAction,
  createEmployeeAction,
  createTimeOffAction,
} from '../actions/staff.action'
import {
  contractTypeOptions,
  employeeMessages,
  teamMessages,
  timeOffKindOptions,
  timeOffStatusLabels,
  type EmployeeDto,
  type TimeOffDto,
} from '../schemas/team.schema'

export interface StaffPanelProps {
  employees: readonly EmployeeDto[]
  timeOff: readonly TimeOffDto[]
  canManage: boolean
  isLive: boolean
}

const statusTone: Record<string, StatusTone> = {
  requested: 'pending',
  approved: 'positive',
  denied: 'negative',
  canceled: 'negative',
}

const contractLabels = new Map<string, string>(
  contractTypeOptions.map((option) => [option.value, option.label]),
)

const kindLabels = new Map<string, string>(
  timeOffKindOptions.map((option) => [option.value, option.label]),
)

/**
 * Funcionários e ausências — feature **S-02**.
 *
 * S-01 disse que escalas e ausências dependiam de `employees`, "entidade que o
 * produto não modela". Modela agora — o mínimo para registrar quem trabalha e
 * quem está fora, sem salário e sem CPF.
 *
 * # A escala continua ausente, e a tela diz por quê
 *
 * `work_schedules.weekday` é um número cuja convenção não pôde ser verificada.
 * Errar entre "domingo é zero" e "domingo é sete" desloca a semana em um dia e
 * põe alguém para trabalhar na data errada — pior que não ter a funcionalidade.
 */
export function StaffPanel({
  employees,
  timeOff,
  canManage,
  isLive,
}: StaffPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addingEmployee, setAddingEmployee] = useState(false)
  const [addingTimeOff, setAddingTimeOff] = useState(false)

  const [fullName, setFullName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [contractType, setContractType] = useState<string>('clt')

  const [employeeId, setEmployeeId] = useState('')
  const [kind, setKind] = useState<string>('ferias')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')

  const editable = canManage && isLive

  function run(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await operation()
        if (!result.ok) {
          setError(result.message ?? teamMessages.unexpected)
          return
        }
        router.refresh()
      } catch {
        setError(teamMessages.unavailable)
      }
    })
  }

  function handleEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    run(async () => {
      const result = await createEmployeeAction({
        fullName,
        roleTitle,
        contractType,
        professionalId: '',
      })

      if (result.ok) {
        setFullName('')
        setRoleTitle('')
        setAddingEmployee(false)
      }

      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  function handleTimeOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    run(async () => {
      const result = await createTimeOffAction({
        employeeId,
        kind,
        startsOn,
        endsOn,
        reason: '',
      })

      if (result.ok) {
        setStartsOn('')
        setEndsOn('')
        setAddingTimeOff(false)
      }

      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Funcionários"
          description="Quem tem vínculo de trabalho com a clínica."
          action={
            editable ? (
              <Button
                variant="secondary"
                onClick={() => setAddingEmployee((value) => !value)}
              >
                <UserPlus aria-hidden className="size-4" />
                {addingEmployee ? 'Fechar' : 'Novo funcionário'}
              </Button>
            ) : undefined
          }
        />

        {addingEmployee ? (
          <form
            onSubmit={handleEmployee}
            className="grid gap-4 border-y border-border-card px-5 py-4 sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <TextField
                label="Nome completo"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
              />
            </div>
            <TextField
              label="Cargo"
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              hint="Opcional."
              maxLength={80}
            />
            <SelectField
              label="Contrato"
              value={contractType}
              onChange={(event) => setContractType(event.target.value)}
              options={contractTypeOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit" disabled={isPending}>
                <Plus aria-hidden className="size-4" />
                {isPending ? 'Salvando…' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        ) : null}

        {employees.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Nenhum funcionário cadastrado."
            description="O vínculo de trabalho é o que permite registrar férias e afastamentos."
          />
        ) : (
          <ul className="divide-y divide-border-card border-t border-border-card">
            {employees.map((employee) => (
              <li
                key={employee.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {employee.fullName}
                  </p>
                  <p className="truncate text-label text-muted">
                    {employee.roleTitle ?? 'Sem cargo definido'} ·{' '}
                    {contractLabels.get(employee.contractType) ??
                      employee.contractType}
                  </p>
                </div>
                <StatusBadge tone={employee.isActive ? 'positive' : 'negative'}>
                  {employee.isActive ? 'Ativo' : 'Desligado'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Ausências"
          description="Férias, atestados e folgas registrados."
          action={
            editable && employees.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => setAddingTimeOff((value) => !value)}
              >
                <CalendarOff aria-hidden className="size-4" />
                {addingTimeOff ? 'Fechar' : 'Registrar ausência'}
              </Button>
            ) : undefined
          }
        />

        {addingTimeOff ? (
          <form
            onSubmit={handleTimeOff}
            className="grid gap-4 border-y border-border-card px-5 py-4 sm:grid-cols-4"
          >
            <SelectField
              label="Funcionário"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              options={[
                { value: '', label: 'Selecione' },
                ...employees
                  .filter((employee) => employee.isActive)
                  .map((employee) => ({
                    value: employee.id,
                    label: employee.fullName,
                  })),
              ]}
            />
            <SelectField
              label="Tipo"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              options={timeOffKindOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <TextField
              label="De"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
            <TextField
              label="Até"
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando…' : 'Registrar'}
              </Button>
            </div>
          </form>
        ) : null}

        {timeOff.length === 0 ? (
          <EmptyState icon={CalendarOff} title="Nenhuma ausência registrada." />
        ) : (
          <ul className="divide-y divide-border-card border-t border-border-card">
            {timeOff.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {entry.employeeName}
                  </p>
                  {/*
                    O motivo NÃO aparece: em atestado e licença ele costuma
                    dizer a condição de saúde da pessoa, e esta tela é de
                    administração, não de cuidado.
                  */}
                  <p className="truncate text-label text-muted">
                    {kindLabels.get(entry.kind) ?? entry.kind} ·{' '}
                    {formatShortDate(new Date(entry.startsOn))} a{' '}
                    {formatShortDate(new Date(entry.endsOn))}
                  </p>
                </div>

                <StatusBadge tone={statusTone[entry.status] ?? 'pending'}>
                  {timeOffStatusLabels[entry.status] ?? entry.status}
                </StatusBadge>

                {editable && entry.status === 'requested' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={isPending}
                      onClick={() =>
                        run(async () => {
                          const result = await answerTimeOffAction({
                            timeOffId: entry.id,
                            approved: true,
                          })
                          return {
                            ok: result.ok,
                            message: result.ok
                              ? undefined
                              : result.error.message,
                          }
                        })
                      }
                    >
                      Aprovar
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        run(async () => {
                          const result = await answerTimeOffAction({
                            timeOffId: entry.id,
                            approved: false,
                          })
                          return {
                            ok: result.ok,
                            message: result.ok
                              ? undefined
                              : result.error.message,
                          }
                        })
                      }
                    >
                      Negar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {employeeMessages.schedulesUnavailable}
      </p>
    </div>
  )
}

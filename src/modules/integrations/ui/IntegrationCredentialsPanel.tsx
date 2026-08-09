'use client'

import { CheckCircle2, KeyRound, LockKeyhole, Save, Server } from 'lucide-react'
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TextField } from '@/components/ui/text-field'

import { saveIntegrationCredentialAction } from '../actions/saveIntegrationCredential.action'
import {
  INTEGRATION_CREDENTIAL_DEFINITIONS,
  type IntegrationCredentialOverview,
  type IntegrationCredentialProvider,
  type IntegrationCredentialStatus,
} from '../domain/IntegrationCredential'
import { integrationCredentialMessages } from '../schemas/integrationCredential.schema'

export interface IntegrationCredentialsPanelProps {
  overview: IntegrationCredentialOverview
  canManage: boolean
  isLive: boolean
}

type ValuesByProvider = Partial<
  Record<IntegrationCredentialProvider, Record<string, string>>
>

function emptyValues(): ValuesByProvider {
  return Object.fromEntries(
    INTEGRATION_CREDENTIAL_DEFINITIONS.map(({ provider }) => [provider, {}]),
  ) as ValuesByProvider
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return 'Ainda não configurado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusFor(
  statuses: readonly IntegrationCredentialStatus[],
  provider: IntegrationCredentialProvider,
): IntegrationCredentialStatus {
  return (
    statuses.find((status) => status.provider === provider) ?? {
      provider,
      label: provider,
      configured: false,
      updatedAt: null,
    }
  )
}

/**
 * Painel de cadastro do cofre.
 *
 * O estado local contém apenas o que a pessoa está digitando. Depois do save,
 * os campos são apagados e a resposta da action contém somente status. Assim,
 * uma navegação posterior nunca recebe a chave salva como prop ou HTML.
 */
export function IntegrationCredentialsPanel({
  overview,
  canManage,
  isLive,
}: IntegrationCredentialsPanelProps) {
  const [values, setValues] = useState<ValuesByProvider>(emptyValues)
  const [statuses, setStatuses] = useState(overview.statuses)
  const [savingProvider, setSavingProvider] = useState<IntegrationCredentialProvider | null>(null)
  const [feedback, setFeedback] = useState<
    Partial<Record<IntegrationCredentialProvider, { kind: 'error' | 'success'; message: string }>>
  >({})
  const [isPending, startTransition] = useTransition()

  const editable = canManage && isLive && overview.storeState === 'ready'
  const providerStates = useMemo(
    () =>
      Object.fromEntries(
        INTEGRATION_CREDENTIAL_DEFINITIONS.map(({ provider }) => [
          provider,
          statusFor(statuses, provider),
        ]),
      ) as Record<IntegrationCredentialProvider, IntegrationCredentialStatus>,
    [statuses],
  )

  function setField(
    provider: IntegrationCredentialProvider,
    name: string,
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      [provider]: { ...current[provider], [name]: value },
    }))
    setFeedback((current) => ({ ...current, [provider]: undefined }))
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    provider: IntegrationCredentialProvider,
  ) {
    event.preventDefault()
    setFeedback((current) => ({ ...current, [provider]: undefined }))
    setSavingProvider(provider)

    startTransition(async () => {
      try {
        const result = await saveIntegrationCredentialAction({
          provider,
          values: values[provider] ?? {},
        })

        if (!result.ok) {
          setFeedback((current) => ({
            ...current,
            [provider]: { kind: 'error', message: result.error.message },
          }))
          return
        }

        setStatuses((current) =>
          current.map((status) =>
            status.provider === provider ? result.data : status,
          ),
        )
        setValues((current) => ({ ...current, [provider]: {} }))
        setFeedback((current) => ({
          ...current,
          [provider]: {
            kind: 'success',
            message: 'Credencial cifrada e salva com segurança.',
          },
        }))
      } catch {
        setFeedback((current) => ({
          ...current,
          [provider]: {
            kind: 'error',
            message: integrationCredentialMessages.unavailable,
          },
        }))
      } finally {
        setSavingProvider(null)
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border-card px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-link">
            <LockKeyhole aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-card-title font-semibold text-foreground">
              Cofre de integrações
            </h2>
            <p className="mt-1 max-w-3xl text-aux leading-6 text-muted">
              Cadastre as credenciais operacionais da clínica. Elas são cifradas
              no servidor antes de serem persistidas e nunca voltam para o
              navegador.
            </p>
          </div>
        </div>
      </div>

      {!isLive ? (
        <Notice>
          Modo demonstração: o cofre só grava quando o Supabase e a chave de
          cifragem estiverem configurados.
        </Notice>
      ) : overview.storeState === 'schema-not-ready' ? (
        <Notice tone="warning">
          A tabela do cofre ainda não existe no Supabase. Aplique
          <code className="mx-1 rounded bg-background px-1.5 py-0.5 text-label">
            20260809_integration_credentials.sql
          </code>
          antes de salvar.
        </Notice>
      ) : overview.storeState === 'unavailable' ? (
        <Notice tone="warning">
          O status das integrações não pôde ser carregado agora. Tente atualizar
          a página antes de salvar.
        </Notice>
      ) : null}

      {!canManage ? (
        <Notice>
          Apenas proprietários e administradores podem cadastrar ou substituir
          credenciais.
        </Notice>
      ) : null}

      <div className="space-y-4 p-5">
        {INTEGRATION_CREDENTIAL_DEFINITIONS.map((definition) => {
          const status = providerStates[definition.provider]
          const message = feedback[definition.provider]
          const saving = isPending && savingProvider === definition.provider

          return (
            <form
              key={definition.provider}
              onSubmit={(event) => handleSubmit(event, definition.provider)}
              className="rounded-card border border-border-card bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound aria-hidden className="size-4 text-brand" />
                    <h3 className="text-control font-semibold text-foreground">
                      {definition.label}
                    </h3>
                  </div>
                  <p className="mt-1 text-label text-muted">
                    {definition.description}
                  </p>
                </div>

                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 text-label font-semibold text-foreground">
                    {status.configured ? (
                      <CheckCircle2
                        aria-hidden
                        className="size-3.5 text-status-positive"
                      />
                    ) : null}
                    {status.configured ? 'Configurado' : 'Não configurado'}
                  </p>
                  <p className="mt-1 text-label text-muted">
                    {formatUpdatedAt(status.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {definition.fields.map((field) => (
                  <TextField
                    key={field.name}
                    label={field.label}
                    type={field.type}
                    value={values[definition.provider]?.[field.name] ?? ''}
                    onChange={(event) =>
                      setField(definition.provider, field.name, event.target.value)
                    }
                    disabled={!editable || saving}
                    autoComplete="new-password"
                    spellCheck={false}
                    required={field.required}
                    hint={
                      field.required
                        ? 'Obrigatório para habilitar este provedor.'
                        : 'Opcional; não será exibido depois de salvo.'
                    }
                  />
                ))}
              </div>

              {message ? (
                <p
                  role={message.kind === 'error' ? 'alert' : 'status'}
                  className={
                    message.kind === 'error'
                      ? 'mt-4 rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger'
                      : 'mt-4 rounded-card border border-status-positive/30 bg-status-positive-surface px-4 py-3 text-aux text-status-positive'
                  }
                >
                  {message.message}
                </p>
              ) : null}

              {editable ? (
                <div className="mt-4 flex justify-end border-t border-border-card pt-4">
                  <Button type="submit" isLoading={saving} disabled={saving}>
                    <Save aria-hidden className="size-4" />
                    {saving ? 'Cifrando…' : 'Salvar credencial'}
                  </Button>
                </div>
              ) : null}
            </form>
          )
        })}
      </div>

      <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-card border border-border-card bg-background px-4 py-3 text-label text-muted">
        <Server aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Tokens de GitHub, Cloudflare, Coolify/VPS e Hostinger não devem ser
          colocados aqui. Eles controlam a infraestrutura do aplicativo e devem
          ficar nos secrets do provedor de deploy, fora do banco da clínica.
        </p>
      </div>
    </Card>
  )
}

function Notice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'warning'
}) {
  return (
    <p
      role="status"
      className={
        tone === 'warning'
          ? 'border-b border-status-pending/30 bg-status-pending-surface px-5 py-3 text-aux text-status-pending'
          : 'border-b border-border-card bg-background px-5 py-3 text-aux text-muted'
      }
    >
      {children}
    </p>
  )
}

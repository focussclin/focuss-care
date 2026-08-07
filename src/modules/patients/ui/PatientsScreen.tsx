'use client'

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  SearchX,
  UserPlus,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { createPatientAction } from '../actions/createPatient.action'
import type { PatientListItem } from '../application/toPatientDto'
import {
  createPatientMessages,
  type NewPatientInput,
  type StatusFilter,
} from '../schemas/patient.schema'
import { patientListHref } from '../schemas/patientQuery.schema'
import {
  NewPatientModal,
  type NewPatientSubmitFailure,
} from './NewPatientModal'
import { PatientCardList } from './PatientCardList'
import { PatientFilters } from './PatientFilters'
import { PatientsTable } from './PatientsTable'

export interface PatientsScreenProps {
  /** Itens DESTA pagina, ja filtrados e ordenados pelo servidor. */
  patients: readonly PatientListItem[]
  /**
   * Contagens da clinica inteira, vindas de consultas proprias.
   *
   * Nao derivam de `patients`: com paginacao, o tamanho da pagina nao e o total.
   */
  metrics: {
    total: number
    newThisMonth: number
    pendingAppointments: number
  }
  /** Recorte em vigor, para reconstruir os links sem reler a URL. */
  filters: {
    search: string | null
    status: StatusFilter
  }
  hasMore: boolean
  /** Ponteiro opaco da proxima pagina, ou null quando esta e a ultima. */
  nextCursor: string | null
  /** Havia cursor na URL e ele nao valia mais: a tela avisa em vez de fingir. */
  cursorReset?: boolean
  /** Esta pagina foi alcancada por um cursor — habilita o "Anterior". */
  isPaginated?: boolean
  openNewOnMount?: boolean
  /**
   * Ha banco por tras desta tela.
   *
   * Falso significa demonstracao local (Supabase ausente do ambiente): o cadastro
   * NAO persiste e a Server Action nao e chamada. Verdadeiro significa clinica
   * real com sessao real — todo cadastro persiste.
   */
  isLive?: boolean
}

/**
 * Listagem de pacientes.
 *
 * Depois de P-02a esta tela **nao filtra e nao pagina**: ela renderiza o que o
 * servidor mandou. Busca, status e cursor vivem na URL, e o `useMemo` que
 * filtrava o array inteiro em memoria — junto com o `slice` que fingia
 * paginacao — deixou de existir. O que sobra de estado local e o que e
 * genuinamente local: o modal aberto e o aviso do ultimo cadastro.
 */
export function PatientsScreen({
  patients,
  metrics,
  filters,
  hasMore,
  nextCursor,
  cursorReset = false,
  isPaginated = false,
  openNewOnMount = false,
  isLive = false,
}: PatientsScreenProps) {
  const router = useRouter()
  const [isCreating, setCreating] = useState(openNewOnMount)
  const [justCreated, setJustCreated] = useState<{
    id: string | null
    name: string
  } | null>(null)

  const hasFilters =
    (filters.search !== null && filters.search.length > 0) ||
    filters.status !== 'all'

  /**
   * Cadastro concluido.
   *
   * **Nao insere o paciente na lista.** Ate P-02a a tela o colocava no indice 0;
   * numa lista alfabetica paginada isso e um item fantasma — aparece fora de
   * ordem, some no proximo carregamento, e some tambem se a pagina atual nao for
   * a dele. O banner com "Ver perfil" leva a ele; o `refresh` atualiza as
   * metricas e a pagina servida pelo servidor.
   */
  function announceCreated(created: { id: string | null; name: string }) {
    setJustCreated(created)
    router.refresh()
  }

  /**
   * Cadastro.
   *
   * Dois caminhos, e a diferenca entre eles e a regra D8/R7 do roadmap:
   *
   *  - **Sem banco (`isLive` falso)** — demonstracao local. A Server Action nao e
   *    chamada, nada persiste, e o aviso de sucesso diz isso. Como nada foi
   *    gravado, o paciente tambem nao aparece na lista: seria a vitrine
   *    parecendo produto (R11).
   *  - **Com banco** — `createPatientAction`. O modal so fecha depois que o
   *    servidor confirma. Falha nao vira sucesso otimista: o modal continua
   *    aberto.
   */
  async function handleCreate(
    values: NewPatientInput,
  ): Promise<NewPatientSubmitFailure | null> {
    if (!isLive) {
      announceCreated({ id: null, name: values.name })
      return null
    }

    try {
      const result = await createPatientAction(values)

      if (!result.ok) {
        if (result.error.code === 'unauthenticated') {
          router.replace('/login?next=%2Fpacientes')
          return null
        }

        if (result.error.code === 'no-active-clinic') {
          router.replace('/onboarding')
          return null
        }

        return {
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        }
      }

      announceCreated({ id: result.data.id, name: result.data.name })

      return null
    } catch {
      // Falha de transporte: a Server Action nem chegou a responder.
      return { message: createPatientMessages.unavailable }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Pacientes"
        description="Acompanhe os pacientes e seus próximos cuidados."
        actions={
          <Button
            className="max-md:w-full"
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2.25} />
            Novo paciente
          </Button>
        }
      />

      {/* Confirmacao breve apos o cadastro, com as duas acoes do handoff */}
      {justCreated ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-card border border-status-positive-surface bg-status-positive-surface px-4 py-3"
        >
          <CheckCircle2
            aria-hidden
            className="size-4 shrink-0 text-status-positive"
          />
          <p className="flex-1 text-aux text-status-positive">
            <span className="font-semibold">{justCreated.name}</span> foi
            cadastrado com sucesso.
            {isLive
              ? ' Ele pode estar em outra página da lista.'
              : ' Modo demonstração: nada foi salvo no banco.'}
          </p>
          <div className="flex items-center gap-2">
            {/* Sem banco nao ha perfil para abrir — o id local nao resolve rota. */}
            {justCreated.id ? (
              <Button asChild variant="secondary">
                <Link href={`/pacientes/${justCreated.id}`}>Ver perfil</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/agenda?novo=1">Agendar atendimento</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section aria-label="Resumo de pacientes">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-3">
          <StatCard
            label="Total de pacientes"
            value={metrics.total.toLocaleString('pt-BR')}
            icon={Users}
          />
          <StatCard
            label="Novos este mês"
            value={String(metrics.newThisMonth)}
            icon={UserPlus}
          />
          <StatCard
            label="Atendimentos pendentes"
            value={String(metrics.pendingAppointments)}
            icon={CheckCircle2}
            tone="attention"
          />
        </div>
      </section>

      <PatientFilters search={filters.search} status={filters.status} />

      {/*
       * Cursor invalido nao e erro de tela: o servidor serviu a primeira pagina.
       * Dizer isso e o que separa "voltamos ao inicio" de "a paginacao pulou".
       */}
      {cursorReset ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          <Info aria-hidden className="size-4 shrink-0" />
          O link de página usado não é mais válido. Mostrando do início.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {patients.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Não encontramos pacientes com esses dados."
              action={
                <Button asChild variant="secondary">
                  <Link href="/pacientes">Limpar busca</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Ainda não há pacientes cadastrados."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden className="size-4" />
                  Cadastrar primeiro paciente
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Tabela a partir de 1024px, cards verticais abaixo disso */}
            <div className="hidden lg:block">
              <PatientsTable patients={patients} />
            </div>
            <div className="lg:hidden">
              <PatientCardList patients={patients} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-card px-5 py-3.5">
              {/*
               * "Mostrando N de M" morreu com o cursor: nao ha total sem um
               * `count` caro por pagina, e inventar M seria pior que omiti-lo.
               */}
              <p role="status" className="text-label text-muted">
                Mostrando{' '}
                <span className="font-semibold text-foreground">
                  {patients.length}
                </span>{' '}
                {patients.length === 1 ? 'paciente' : 'pacientes'}
              </p>

              <div className="flex items-center gap-2">
                {/*
                 * "Anterior" volta pelo historico: com keyset o servidor conhece
                 * a proxima ancora, nunca a anterior. O historico do navegador ja
                 * guarda os cursores por onde se passou — e a unica fonte
                 * correta, e nao exige empilhar ancoras na URL.
                 */}
                <Button
                  variant="secondary"
                  onClick={() => router.back()}
                  disabled={!isPaginated}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                  Anterior
                </Button>

                {hasMore && nextCursor ? (
                  <Button asChild variant="secondary">
                    <Link
                      href={patientListHref(filters, nextCursor)}
                      scroll={false}
                    >
                      Próxima
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="secondary" disabled>
                    Próxima
                    <ChevronRight aria-hidden className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      <NewPatientModal
        open={isCreating}
        onOpenChange={setCreating}
        onSubmit={handleCreate}
      />
    </div>
  )
}

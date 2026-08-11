'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CornerDownLeft, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'

import { cn } from '@/lib/utils/cn'
import type { MembershipRole } from '@/lib/supabase/database.types'
import { can } from '@/lib/auth/permissions'
import { searchInvoicesAction } from '@/modules/billing/actions/searchInvoices.action'
import { searchAuthorizationsAction } from '@/modules/insurance/actions/searchAuthorizations.action'
import { searchPatientsAction } from '@/modules/patients/actions/searchPatients.action'
import { searchAppointmentsAction } from '@/modules/scheduling/actions/searchAppointments.action'

import {
  commandsFor,
  MIN_SEARCH_LENGTH,
  moveHighlight,
  type Command,
} from './commands'
import { usePaletteSearch } from './usePaletteSearch'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Papel na clínica ativa. `undefined` no modo de demonstração. */
  role?: MembershipRole | null
}

/**
 * Paleta de comandos — substitui o campo de busca inerte do cabeçalho.
 *
 * # O que ela faz, e o que ela declara não fazer
 *
 * Navega entre telas, abre os dois formulários que abrem por URL e busca
 * pacientes (nome, telefone ou CPF exato), agendamentos, cobranças e guias de convênio reais a partir de dois
 * caracteres.
 *
 * As buscas usam Server Actions com debounce e RLS no caminho, cada uma atrás da
 * permissão da tela que ela alcança. O resultado de paciente abre a ficha; o de
 * agendamento leva à agenda; o de guia, a `/convenios`. Se a action não estiver
 * disponível, o comando de fallback ainda leva a `/pacientes?q=…`, onde o
 * servidor consulta a mesma base.
 *
 * A guia é a única fonte com chave própria: além do nome do paciente, ela é
 * encontrada pelo **número da operadora**, que é o que a pessoa tem na mão
 * quando vai procurá-la.
 *
 * **O prontuário não é pesquisado por termo.** Uma busca nele seria consulta a
 * conteúdo clínico, e ela pede contrato próprio — quem pode ler, o que a
 * resposta pode mostrar e como o acesso é registrado. O estado vazio deixa o
 * limite explícito.
 *
 * # Acessibilidade
 *
 * O Radix Dialog já entrega foco preso, `Esc` e devolução do foco ao gatilho —
 * é por isso que ele é usado aqui em vez de um `div` com `onKeyDown`. Por cima
 * dele, a lista implementa o padrão combobox: `aria-activedescendant` move o
 * destaque **sem tirar o foco do campo**, que é o que permite continuar
 * digitando enquanto se navega com as setas.
 *
 * Movimento: só uma transição de opacidade, e o `prefers-reduced-motion` global
 * de `globals.css` já a neutraliza. Nada aqui desliza nem escala.
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: CommandPaletteProps) {
  const router = useRouter()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  /**
   * O papel alcança esta permissão?
   *
   * `undefined` é o modo de demonstração — sem sessão, nenhuma busca sai. Ele é
   * tratado junto com `null` de propósito: os dois significam "não há papel", e
   * ausência de papel nunca é papel neutro.
   */
  const allows = (permission: Parameters<typeof can>[1]) =>
    role !== undefined && role !== null && can(role, permission)

  const patients = usePaletteSearch({
    open,
    query,
    enabled: allows('patient.read'),
    action: searchPatientsAction,
    failureMessage: 'Não foi possível buscar pacientes agora.',
  })

  const appointments = usePaletteSearch({
    open,
    query,
    enabled: allows('appointment.read'),
    action: searchAppointmentsAction,
    failureMessage: 'Não foi possível buscar atendimentos agora.',
  })

  const invoices = usePaletteSearch({
    open,
    query,
    enabled: allows('invoice.read'),
    action: searchInvoicesAction,
    failureMessage: 'Não foi possível buscar cobranças agora.',
  })

  /*
   * Guias — `insurance.manage`, a mesma porta que `/convenios` exige.
   *
   * A paleta é atalho para uma tela que existe; atalho que alcança o que a tela
   * recusa é porta lateral. `receptionist` e `professional` continuam sem
   * convênio, como a matriz de I-05 decidiu.
   */
  const authorizations = usePaletteSearch({
    open,
    query,
    enabled: allows('insurance.manage'),
    action: searchAuthorizationsAction,
    failureMessage: 'Não foi possível buscar guias agora.',
  })

  const searchPending =
    patients.pending ||
    appointments.pending ||
    invoices.pending ||
    authorizations.pending

  /*
   * A primeira falha, na ordem em que as fontes aparecem na lista.
   *
   * Mostrar as quatro empilharia mensagens sobre a mesma causa — quando o
   * servidor não responde, nenhuma responde.
   */
  const searchError =
    patients.error ?? appointments.error ?? invoices.error ?? authorizations.error

  /*
   * A lista inteira depende de papel E consulta: o comando de buscar paciente
   * so existe a partir de dois caracteres, e some quando o campo esvazia — o
   * que tambem cuida do reset ao fechar, ja que fechar limpa a consulta.
   */
  const results = useMemo(
    () => {
      const commands = commandsFor(role, query)
      const searchCommand = commands.find(
        (command) => command.id === 'buscar-pacientes',
      )
      const patientCommands = patients.results.map((patient) => ({
        id: `patient-${patient.id}`,
        label: patient.name,
        href: `/pacientes/${patient.id}`,
        keywords: ['paciente', 'ficha'],
        group: 'Buscar' as const,
      }))
      const appointmentCommands = appointments.results.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        label: `${appointment.patientName} · ${formatAppointmentDate(appointment.startsAt)}`,
        href: '/agenda',
        keywords: ['agendamento', 'atendimento', appointment.type, appointment.professionalName],
        group: 'Buscar' as const,
      }))
      const invoiceCommands = invoices.results.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        label: `${invoice.patientName} · ${formatCents(invoice.totalCents)}`,
        href: '/financeiro',
        keywords: ['cobrança', 'financeiro', invoice.status],
        group: 'Buscar' as const,
      }))
      /*
       * A guia é reconhecida pelo NÚMERO, e por isso ele vem primeiro no rótulo.
       *
       * Quem abre a paleta para achar uma guia tem o papel na mão ou a operadora
       * no telefone. Guia ainda não respondida não tem número — aí o rótulo diz
       * isso, em vez de mostrar um traço que pareceria número faltando.
       */
      const authorizationCommands = authorizations.results.map(
        (authorization) => ({
          id: `authorization-${authorization.id}`,
          label: `${
            authorization.authorizationNumber ?? 'Guia sem número'
          } · ${authorization.patientName} · ${authorization.providerName}`,
          href: '/convenios',
          keywords: ['guia', 'convênio', 'autorização', authorization.status],
          group: 'Buscar' as const,
        }),
      )

      return [
        ...commands.filter((command) => command.id !== 'buscar-pacientes'),
        ...patientCommands,
        ...appointmentCommands,
        ...invoiceCommands,
        ...authorizationCommands,
        ...(searchCommand ? [searchCommand] : []),
      ]
    },
    [
      appointments.results,
      authorizations.results,
      invoices.results,
      patients.results,
      query,
      role,
    ],
  )

  /*
   * O cabeçalho de grupo é decidido ANTES do render, e não com uma variável
   * mutada dentro do `map`.
   *
   * A regra `react-hooks/immutability` recusa a segunda forma, e com razão: sob
   * renderização concorrente o `map` pode ser interrompido e retomado, e a
   * variável carregaria o valor de uma passagem anterior — os títulos "Criar" e
   * "Ir para" apareceriam no lugar errado, ou nenhum apareceria.
   */
  const rows = useMemo(
    () =>
      results.map((command, index) => ({
        command,
        showGroup: index === 0 || results[index - 1].group !== command.group,
      })),
    [results],
  )

  /*
   * O destaque volta ao topo quando a lista muda.
   *
   * Sem isto, quem digitasse com o terceiro item destacado continuaria com o
   * índice 3 numa lista que passou a ter um resultado — e o Enter navegaria
   * para lugar nenhum.
   */
  const safeIndex = highlighted < results.length ? highlighted : 0
  const active = results[safeIndex]

  function run(command: Command) {
    onOpenChange(false)
    setQuery('')
    setHighlighted(0)
    router.push(command.href)
  }

  /*
   * Trocar o termo não limpa resultado nem apaga indicador: os dois são
   * derivados do termo respondido, dentro de `usePaletteSearch`. Era daqui que
   * saíam nove chamadas de `set*` cuja única obrigação era não esquecer nenhuma
   * fonte.
   */
  function updateQuery(value: string) {
    setQuery(value)
    setHighlighted(0)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted(
        moveHighlight(safeIndex, event.key === 'ArrowDown' ? 1 : -1, results.length),
      )
      return
    }

    if (event.key === 'Enter' && active) {
      event.preventDefault()
      run(active)
    }

    // `Esc` não é tratado aqui: o Radix Dialog já fecha, e duplicar o
    // tratamento faria a tecla fechar duas coisas quando houvesse aninhamento.
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Esvaziar a consulta zera as buscas: sem termo não há resultado
        // corrente, e o indicador de carregamento desliga junto.
        if (!next) {
          setQuery('')
          setHighlighted(0)
        }
        onOpenChange(next)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#071f3b]/35 backdrop-blur-[2px] transition-opacity" />
        <DialogPrimitive.Content className="fixed top-[12vh] left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-card border border-border-card bg-surface shadow-raised outline-none">
          <DialogPrimitive.Title className="sr-only">
            Buscar telas e ações
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Digite para filtrar. Use as setas para navegar e Enter para abrir.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border-card px-4">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar paciente, cobrança ou ir para uma tela…"
              aria-label="Buscar telas e ações"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-muted"
            />
          </div>

          {results.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-aux text-foreground">
                {searchPending
                  ? 'Buscando registros…'
                  : 'Nenhuma tela ou ação com esse nome.'}
              </p>
              {searchError ? (
                <p role="alert" className="mt-2 text-label text-danger">
                  {searchError}
                </p>
              ) : null}
              {/*
                O estado vazio precisa dizer o que É pesquisável e o que não é.

                Paciente, agendamento e cobrança são achados pelo nome de quem
                é atendido; paciente também pode ser localizado pelo CPF exato;
                a guia, pelo número que a operadora devolveu.
                O prontuário continua fora: uma busca por termo nele seria
                consulta a conteúdo clínico, e ela pede contrato próprio — quem
                pode ler, o que a resposta pode mostrar e como o acesso é
                registrado.
              */}
              <p className="mt-1 text-label text-muted">
                {query.trim().length < MIN_SEARCH_LENGTH
                  ? 'Digite pelo menos dois caracteres para buscar um paciente pelo nome ou CPF.'
                  : 'Pacientes, agendamentos, cobranças e guias (pelo número ou pelo paciente) são pesquisados por aqui. O prontuário não é pesquisado por termo.'}
              </p>
            </div>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Resultados"
              className="max-h-[52vh] overflow-y-auto p-1.5"
            >
              {rows.map(({ command, showGroup }, index) => {
                const isActive = index === safeIndex

                return (
                  <li key={command.id}>
                    {showGroup ? (
                      <p
                        aria-hidden
                        className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase"
                      >
                        {command.group}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      id={`${listId}-${command.id}`}
                      role="option"
                      aria-selected={isActive}
                      /*
                        `onMouseMove`, e nao `onMouseEnter`: com o mouse parado
                        sobre a lista, navegar pelas setas moveria o destaque e o
                        `enter` do cursor o puxaria de volta no primeiro repinte.
                      */
                      onMouseMove={() => setHighlighted(index)}
                      onClick={() => run(command)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left text-aux transition-colors',
                        isActive
                          ? 'bg-brand-subtle text-link'
                          : 'text-foreground hover:bg-row-hover',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {command.label}
                      </span>

                      {isActive ? (
                        <CornerDownLeft
                          aria-hidden
                          className="size-3.5 shrink-0 opacity-70"
                        />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {searchPending && results.length > 0 ? (
            <p role="status" className="border-t border-border-card px-4 py-2 text-label text-muted">
              Buscando registros…
            </p>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Liga `Ctrl+K` / `Cmd+K` à paleta.
 *
 * Fica separado do componente porque o atalho precisa existir mesmo com a
 * paleta fechada — ou seja, o ouvinte pertence a quem a monta, não a ela.
 *
 * `metaKey` cobre o Mac e `ctrlKey` o resto; o navegador usa `Ctrl+K` para a
 * barra de endereços em alguns casos, e o `preventDefault` só acontece quando a
 * combinação é nossa.
 */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return

      event.preventDefault()
      onOpen()
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onOpen])
}

function formatAppointmentDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function formatCents(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100)
}

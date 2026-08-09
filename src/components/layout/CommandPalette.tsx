'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CornerDownLeft, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'

import { cn } from '@/lib/utils/cn'
import type { MembershipRole } from '@/lib/supabase/database.types'
import { can } from '@/lib/auth/permissions'
import { searchPatientsAction } from '@/modules/patients/actions/searchPatients.action'

import {
  commandsFor,
  MIN_SEARCH_LENGTH,
  moveHighlight,
  type Command,
} from './commands'

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
 * pacientes reais pelo nome a partir de dois caracteres.
 *
 * A busca usa a Server Action de pacientes com debounce e RLS no caminho. Os
 * resultados exibem apenas id e nome; ao selecionar, a ficha é aberta por URL.
 * Se a action não estiver disponível, o comando de fallback ainda leva a
 * `/pacientes?q=…`, onde o servidor consulta a mesma base.
 *
 * **Atendimento, prontuário, cobrança e guia não são pesquisados** — a listagem
 * deles não aceita termo por URL, e um comando que fingisse buscar levaria a uma
 * tela sem filtro. O estado vazio diz qual é qual, porque silêncio ali faria
 * alguém concluir que o registro não existe quando ninguém chegou a procurar.
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
  const [patientResults, setPatientResults] = useState<
    readonly { id: string; name: string }[]
  >([])
  const [patientSearchPending, setPatientSearchPending] = useState(false)
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null)

  useEffect(() => {
    const term = query.trim()
    const canSearchPatients = role !== undefined && role !== null && can(role, 'patient.read')

    if (!open || term.length < MIN_SEARCH_LENGTH || !canSearchPatients) return

    let active = true

    const timeout = window.setTimeout(() => {
      void searchPatientsAction({ query: term })
        .then((result) => {
          if (!active) return
          if (result.ok) {
            setPatientResults(result.data)
            return
          }
          setPatientResults([])
          setPatientSearchError(result.error.message)
        })
        .catch(() => {
          if (!active) return
          setPatientResults([])
          setPatientSearchError('Não foi possível buscar pacientes agora.')
        })
        .finally(() => {
          if (active) setPatientSearchPending(false)
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [open, query, role])

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
      const patientCommands = patientResults.map((patient) => ({
        id: `patient-${patient.id}`,
        label: patient.name,
        href: `/pacientes/${patient.id}`,
        keywords: ['paciente', 'ficha'],
        group: 'Buscar' as const,
      }))

      return [
        ...commands.filter((command) => command.id !== 'buscar-pacientes'),
        ...patientCommands,
        ...(searchCommand ? [searchCommand] : []),
      ]
    },
    [patientResults, query, role],
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

  function updateQuery(value: string) {
    const term = value.trim()
    const canSearchPatients =
      role !== undefined && role !== null && can(role, 'patient.read')

    setQuery(value)
    setHighlighted(0)
    setPatientResults([])
    setPatientSearchError(null)
    setPatientSearchPending(
      open && term.length >= MIN_SEARCH_LENGTH && canSearchPatients,
    )
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
        if (!next) {
          setQuery('')
          setHighlighted(0)
          setPatientResults([])
          setPatientSearchPending(false)
          setPatientSearchError(null)
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
              placeholder="Buscar paciente, ir para uma tela ou criar…"
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
                {patientSearchPending
                  ? 'Buscando pacientes…'
                  : 'Nenhuma tela ou ação com esse nome.'}
              </p>
              {patientSearchError ? (
                <p role="alert" className="mt-2 text-label text-danger">
                  {patientSearchError}
                </p>
              ) : null}
              {/*
                O estado vazio precisa dizer o que É pesquisável e o que não é.

                Paciente já se procura por aqui — a partir de dois caracteres, o
                comando de busca aparece acima desta mensagem. Agenda,
                prontuário, financeiro e convênios não têm busca por termo, e
                omitir isso faria alguém concluir que não existe atendimento com
                aquele nome quando ninguém chegou a procurar.
              */}
              <p className="mt-1 text-label text-muted">
                {query.trim().length < MIN_SEARCH_LENGTH
                  ? 'Digite pelo menos dois caracteres para buscar um paciente pelo nome.'
                  : 'Pacientes você busca por aqui. Atendimentos, prontuários, cobranças e guias ainda não são pesquisados pelo nome — abra a tela correspondente.'}
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

          {patientSearchPending && results.length > 0 ? (
            <p role="status" className="border-t border-border-card px-4 py-2 text-label text-muted">
              Buscando pacientes…
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

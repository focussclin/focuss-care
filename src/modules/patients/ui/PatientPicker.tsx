'use client'

import { Loader2, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils/cn'

import { searchPatientsAction } from '../actions/searchPatients.action'
import {
  patientPickerMessages,
  PICKER_MIN_QUERY_LENGTH,
  PICKER_RESULT_LIMIT,
  type PatientOptionDto,
} from '../schemas/patientPicker.schema'

export interface PatientPickerProps {
  /**
   * Os pacientes que a rota já carregou.
   *
   * Servem ao estado INICIAL: com o campo vazio, o seletor mostra estes em vez
   * de uma lista em branco. É o caso comum na recepção — o paciente da próxima
   * consulta costuma estar entre os primeiros.
   */
  initialOptions: readonly PatientOptionDto[]
  value: string
  onChange: (patientId: string) => void
  error?: string
  disabled?: boolean
  /**
   * Há banco por trás desta tela.
   *
   * Falso significa demonstração local (Supabase ausente do ambiente). A Server
   * Action recusaria por falta de sessão, e um erro vermelho a cada tecla diria
   * que o produto está quebrado quando ele só está sem banco. Nesse modo o
   * seletor filtra o conjunto de exemplo aqui mesmo — e **diz na tela** que é
   * isso que está fazendo.
   */
  isLive?: boolean
}

/** Tempo de silêncio antes de consultar o servidor. */
const DEBOUNCE_MS = 250

/** Sem acento e sem caixa — 'Antônio' é encontrado por 'antonio'. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Seletor de paciente com busca no SERVIDOR.
 *
 * # O que estava errado
 *
 * A rota mandava as primeiras 50 pessoas da clínica e o `datalist` filtrava no
 * navegador. Numa base de mil pacientes, procurar alguém que não estivesse entre
 * as 50 primeiras em ordem alfabética não devolvia nada — e a tela não dizia que
 * estava procurando num pedaço. Quem tentasse marcar consulta para "Zuleica"
 * concluiria que ela não tem cadastro.
 *
 * Agora cada busca vai ao servidor, com a clínica resolvida lá e a RLS no
 * caminho. O limite é curto (oito) porque isto é um seletor: quem não achou
 * refina o termo, não rola uma lista.
 *
 * # Por que o primeiro conjunto continua vindo pela rota
 *
 * Sem ele, abrir o modal mostraria um campo vazio e nada mais até a primeira
 * tecla. Mantê-lo custa a consulta que a rota já fazia — agora com o limite do
 * seletor, não com os 50 de antes — e dá ao campo um estado inicial útil.
 */
export function PatientPicker({
  initialOptions,
  value,
  onChange,
  error,
  disabled = false,
  isLive = false,
}: PatientPickerProps) {
  const listId = useId()
  const inputId = useId()

  const [query, setQuery] = useState('')

  /**
   * A última busca CONCLUÍDA, com o termo que a produziu.
   *
   * Guardar o termo junto é o que permite derivar "está buscando" em vez de
   * mantê-lo em outro estado: se o termo digitado não é o da última resposta, a
   * busca do termo atual ainda não voltou. Um `setState` a menos, e nenhum deles
   * no corpo do efeito — o que a regra `react-hooks/set-state-in-effect` cobra,
   * com razão: sincronizar estado no corpo do efeito é renderizar duas vezes
   * para chegar onde uma derivação chegava direto.
   */
  const [lastSearch, setLastSearch] = useState<{
    term: string
    options: readonly PatientOptionDto[]
    error: string | null
  } | null>(null)

  const term = query.trim()
  const isSearchable = term.length >= PICKER_MIN_QUERY_LENGTH

  /*
   * Cada busca carrega um número de sequência.
   *
   * Sem isso, uma resposta lenta de "ma" chegando depois da resposta de "maria"
   * sobrescreveria a lista com o resultado do termo antigo — e a pessoa veria
   * nomes que não casam com o que está escrito no campo.
   */
  const requestId = useRef(0)

  useEffect(() => {
    // Demonstração local não tem servidor para perguntar; ver `isLive`.
    if (!isLive) return
    // Termo curto não busca: o estado inicial já responde por ele.
    if (!isSearchable) return

    const current = ++requestId.current

    const timer = setTimeout(async () => {
      try {
        const result = await searchPatientsAction({ query: term })

        // Resposta de uma busca que já não é a atual: descarta.
        if (current !== requestId.current) return

        setLastSearch(
          result.ok
            ? { term, options: result.data, error: null }
            : { term, options: [], error: result.error.message },
        )
      } catch {
        if (current !== requestId.current) return

        setLastSearch({
          term,
          options: [],
          error: patientPickerMessages.unavailable,
        })
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term, isSearchable, isLive])

  /** Buscando enquanto a resposta do termo atual não chegou. */
  const isSearching = isLive && isSearchable && lastSearch?.term !== term

  /** Erro só do termo atual — o de uma busca anterior não fala desta. */
  const searchError =
    isLive && isSearchable && lastSearch?.term === term
      ? lastSearch.error
      : null

  const options = useMemo<readonly PatientOptionDto[]>(() => {
    if (!isSearchable) return initialOptions

    if (!isLive) {
      const needle = normalize(term)
      return initialOptions
        .filter((option) => normalize(option.name).includes(needle))
        .slice(0, PICKER_RESULT_LIMIT)
    }

    /*
     * Enquanto a busca nova não volta, ficam os resultados da anterior — em vez
     * de piscar de volta para o conjunto inicial a cada tecla. O spinner é quem
     * diz que a lista ainda vai mudar.
     */
    return lastSearch?.options ?? initialOptions
  }, [initialOptions, isLive, isSearchable, lastSearch, term])

  const selected = options.find((option) => option.id === value)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-label font-semibold text-label">
        Paciente
      </label>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        />

        <input
          id={inputId}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            // Digitar de novo invalida a escolha anterior: sem isto, apagar o
            // nome deixaria o id do paciente antigo no formulário.
            if (value) onChange('')
          }}
          placeholder={selected ? selected.name : 'Digite o nome do paciente'}
          aria-describedby={`${inputId}-status`}
          className={cn(
            'h-[52px] w-full rounded-field border bg-surface pr-10 pl-10 text-control text-foreground',
            'placeholder:text-muted focus:outline-none',
            error
              ? 'border-danger focus:border-danger focus:shadow-focus-danger'
              : 'border-border-default hover:border-border-hover focus:border-focus focus:shadow-focus',
          )}
        />

        {isSearching ? (
          <Loader2
            aria-hidden
            className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted"
          />
        ) : null}
      </div>

      {/*
        A região de status é anunciada por leitor de tela sem roubar o foco do
        campo — quem digita precisa saber que a lista mudou.
      */}
      <p id={`${inputId}-status`} role="status" className="sr-only">
        {isSearching
          ? 'Buscando pacientes'
          : `${options.length} paciente(s) encontrado(s)`}
      </p>

      {!isLive ? (
        <p className="text-label text-muted">
          Demonstração local: a busca percorre apenas os pacientes de exemplo
          carregados nesta tela.
        </p>
      ) : null}

      {searchError ? (
        <p role="alert" className="text-label text-danger">
          {searchError}
        </p>
      ) : null}

      {error && !searchError ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        aria-label="Pacientes encontrados"
        className="max-h-48 overflow-y-auto rounded-field border border-border-card"
      >
        {options.length === 0 ? (
          <li className="px-3.5 py-3 text-aux text-muted">
            {isSearchable
              ? 'Nenhum paciente com esse nome nesta clínica.'
              : 'Nenhum paciente cadastrado ainda.'}
          </li>
        ) : (
          options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                disabled={disabled}
                onClick={() => {
                  onChange(option.id)
                  setQuery(option.name)
                }}
                className={cn(
                  'w-full px-3.5 py-2.5 text-left text-aux transition-colors',
                  option.id === value
                    ? 'bg-brand-subtle text-link'
                    : 'text-foreground hover:bg-row-hover',
                )}
              >
                {option.name}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

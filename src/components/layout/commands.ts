import { can, type Permission } from '@/lib/auth/permissions'
import { patientSearchHref } from '@/lib/routes/patientRoutes'
import type { MembershipRole } from '@/lib/supabase/database.types'

import { navItems } from './navigation'

/**
 * Os comandos da paleta — feature local, sem dependência nova.
 *
 * # O que entra aqui, e o que não entra
 *
 * Quatro coisas, e nada além delas: **navegação para rota que existe**,
 * **criação que abre um formulário de verdade**, busca real de pacientes (nome,
 * telefone ou CPF exato), agendamentos e cobranças por paciente.
 *
 * A busca por nome, telefone ou CPF exato tem dois caminhos seguros: a paleta consulta a Server Action
 * para mostrar resultados inline, e o comando `patientSearchCommand` leva a
 * `/pacientes?q=…` quando a pessoa prefere abrir a lista completa. Em ambos os
 * casos a consulta passa pelo servidor e pela RLS.
 *
 * A agenda e o financeiro são consultados por actions tenant-scoped que primeiro
 * encontram pacientes ativos e depois carregam seus registros. O restante —
 * prontuário e convênios — ainda não tem contrato de busca por termo, e o estado
 * vazio da paleta diz isso em vez de simular resultado.
 */
export interface Command {
  id: string
  label: string
  /** Rota real. Todo `href` daqui é conferido contra `src/app` no teste. */
  href: string
  /** Termos alternativos — como a pessoa chamaria a tela. */
  keywords?: readonly string[]
  /** Mesma matriz de I-05 do menu: não oferecer o que o papel não alcança. */
  permission?: Permission
  group: 'Buscar' | 'Ir para' | 'Criar'
}

/**
 * Criação — apenas o que abre formulário por URL.
 *
 * `/agenda?novo=1` e `/pacientes?novo=1` são lidos pelas rotas
 * (`openNewOnMount`) e abrem o modal de verdade. Cobrança, guia e prontuário
 * também têm formulário, e **não estão aqui**: eles abrem por estado local da
 * tela, sem parâmetro de URL. Um comando "Nova cobrança" levaria a pessoa para
 * `/financeiro` com o formulário fechado — que é a definição de promessa não
 * cumprida.
 */
const CREATE_COMMANDS: readonly Command[] = [
  {
    id: 'criar-atendimento',
    label: 'Novo atendimento',
    href: '/agenda?novo=1',
    keywords: ['agendar', 'consulta', 'marcar', 'horario'],
    permission: 'appointment.write',
    group: 'Criar',
  },
  {
    id: 'criar-paciente',
    label: 'Novo paciente',
    href: '/pacientes?novo=1',
    keywords: ['cadastrar', 'cadastro'],
    permission: 'patient.write',
    group: 'Criar',
  },
]

/** Termos alternativos por rota — como a equipe chama a tela na prática. */
const KEYWORDS: Record<string, readonly string[]> = {
  '/dashboard': ['inicio', 'painel', 'visao geral', 'home'],
  '/agenda': ['consultas', 'horarios', 'calendario'],
  '/pacientes': ['cadastro', 'prontuario do paciente', 'ficha'],
  '/atendimentos': ['fila', 'recepcao', 'check-in', 'espera'],
  '/prontuarios': ['evolucao', 'clinico', 'registro'],
  '/financeiro': ['cobranca', 'pagamento', 'caixa', 'dinheiro', 'fatura'],
  '/convenios': ['operadora', 'plano', 'guia', 'autorizacao'],
  '/equipe': ['permissoes', 'funcionarios', 'ausencias', 'ferias'],
  '/relatorios': ['indicadores', 'numeros'],
  '/configuracoes': ['perfil', 'ajustes', 'horario de funcionamento'],
  '/whatsapp': ['canal', 'mensagem'],
  '/chat-ia': ['assistente', 'inteligencia artificial'],
  '/automacoes': ['regras', 'lembretes'],
}

/**
 * Navegação, derivada do MENU — e não de uma segunda lista.
 *
 * Se a paleta tivesse a própria lista de rotas, ela e o menu divergiriam na
 * primeira mudança, e a paleta é justamente o caminho de quem não usa o menu.
 * Itens desabilitados ficam de fora: eles não têm rota.
 */
const NAVIGATE_COMMANDS: readonly Command[] = navItems
  .filter((item) => !item.disabled)
  .map((item) => ({
    id: `ir-${item.href}`,
    label: item.label,
    href: item.href,
    keywords: KEYWORDS[item.href],
    permission: item.permission,
    group: 'Ir para' as const,
  }))

/** Criar antes de ir: quem abre a paleta com intenção costuma querer agir. */
export const ALL_COMMANDS: readonly Command[] = [
  ...CREATE_COMMANDS,
  ...NAVIGATE_COMMANDS,
]

/**
 * Os comandos que ESTE papel pode executar.
 *
 * `undefined` devolve tudo — é o modo de demonstração, onde não há vínculo nem
 * papel a consultar. Igual a `visibleNavItems`, e pelo mesmo motivo.
 *
 * Não substitui a autorização: as rotas continuam chamando `forbidden()` e as
 * actions continuam exigindo o papel. Isto evita oferecer o caminho.
 */
export function visibleCommands(
  role: MembershipRole | null | undefined,
): readonly Command[] {
  if (role === undefined) return ALL_COMMANDS

  return ALL_COMMANDS.filter(
    (command) => !command.permission || can(role, command.permission),
  )
}

/**
 * A partir de quantos caracteres a busca de pacientes é oferecida.
 *
 * Uma letra casaria com quase toda a base, e o resultado seria a lista inteira
 * com um filtro no meio — pior que não filtrar, porque parece filtrado.
 */
export const MIN_SEARCH_LENGTH = 2

/**
 * O comando de buscar paciente — o fallback da busca inline.
 *
 * # Por que ele existe, e por que só ele
 *
 * `/pacientes` já faz busca no SERVIDOR, por parâmetro de URL (P-02a). Então
 * este comando não consulta nada: ele leva a pessoa para uma tela que consulta,
 * com o termo já no endereço. Nenhuma linha é lida no navegador, nenhum
 * resultado é inventado, e o que aparece é o que a RLS deixou passar.
 *
 * Agenda e financeiro já possuem buscas inline por Server Action, e os
 * resultados levam às telas correspondentes. Prontuário e convênios ainda não
 * têm contrato de termo; o estado vazio diz isso em vez de simular resultado.
 */
export function patientSearchCommand(
  role: MembershipRole | null | undefined,
  query: string,
): Command | null {
  const term = query.trim()
  if (term.length < MIN_SEARCH_LENGTH) return null

  // Mesma matriz do resto: quem não lê paciente não recebe o caminho.
  if (role !== undefined && !can(role, 'patient.read')) return null

  return {
    id: 'buscar-pacientes',
    label: `Buscar pacientes por "${term}"`,
    href: patientSearchHref(term),
    permission: 'patient.read',
    group: 'Buscar',
  }
}

/**
 * O que a paleta mostra para este papel e esta consulta.
 *
 * # A busca vem por ÚLTIMO, e isso foi corrigido depois
 *
 * A primeira versão a punha em primeiro lugar, com o argumento de que quem
 * digita um nome quer o nome. O teste de componente mostrou o custo: digitar
 * "financeiro" e apertar `Enter` levava a `/pacientes?q=financeiro` — uma busca
 * por paciente chamado "financeiro" — em vez de abrir a tela Financeiro.
 *
 * A regra certa é mais simples: **tela primeiro, busca depois**. Quando o termo
 * casa com alguma tela, é quase sempre a tela que se quer; quando não casa com
 * nenhuma — que é o caso de todo nome de pessoa — a busca fica sozinha na lista
 * e continua sendo o primeiro item, sem precisar de regra especial.
 */
export function commandsFor(
  role: MembershipRole | null | undefined,
  query: string,
): readonly Command[] {
  const matches = filterCommands(visibleCommands(role), query)
  const search = patientSearchCommand(role, query)

  return search ? [...matches, search] : matches
}

/** Sem acento e sem caixa — 'Prontuários' é encontrado por 'prontuarios'. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filtra por texto, preservando a ordem original.
 *
 * Busca no rótulo E nas palavras alternativas: quem procura "caixa" quer
 * `/financeiro`, e quem procura "fila" quer `/atendimentos` — nenhum dos dois
 * está no nome da tela.
 *
 * Consulta vazia devolve tudo: a paleta aberta sem digitação é um menu.
 */
export function filterCommands(
  commands: readonly Command[],
  query: string,
): readonly Command[] {
  const term = normalize(query)
  if (term === '') return commands

  return commands.filter((command) => {
    const haystack = [command.label, ...(command.keywords ?? [])]
      .map(normalize)
      .join(' ')

    return haystack.includes(term)
  })
}

/**
 * A aritmética das setas, isolada para poder ser testada.
 *
 * O ambiente de teste do projeto é `node`, sem DOM — testar a tecla exigiria
 * `@testing-library/react`, e a config do Vitest registra que instalar isso
 * agora seria dependência sem chamador. O que dá para provar sem DOM é a
 * decisão: para onde o destaque vai. É o que esta função isola.
 *
 * Dá a volta nas duas pontas: quem está no último item e aperta para baixo
 * volta ao primeiro. Numa lista curta, obrigar a subir dez vezes é pior que a
 * volta.
 */
export function moveHighlight(
  current: number,
  delta: number,
  count: number,
): number {
  if (count <= 0) return 0

  // `% count` sozinho devolve negativo para índice antes do zero em JS.
  return (((current + delta) % count) + count) % count
}

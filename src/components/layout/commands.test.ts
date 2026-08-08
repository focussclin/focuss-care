import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { can, MEMBERSHIP_ROLES } from '@/lib/auth/permissions'

import {
  ALL_COMMANDS,
  commandsFor,
  filterCommands,
  moveHighlight,
  patientSearchCommand,
  visibleCommands,
} from './commands'
import { visibleNavItems } from './navigation'

/**
 * A paleta de comandos.
 *
 * # O que este arquivo NÃO cobre, e por quê
 *
 * Renderização e tecla pressionada. O ambiente de teste do projeto é `node`, sem
 * DOM, e a config do Vitest registra a decisão: `@testing-library/react` "entra
 * junto com o primeiro teste que precise dele. Instalar agora seria dependência
 * sem chamador" — e a fatia foi pedida sem dependência nova.
 *
 * O que dá para provar sem DOM é tudo o que decide o comportamento: o que a
 * lista contém, o que o filtro devolve, para onde a seta move o destaque e o que
 * cada papel enxerga. A tecla em si é uma linha do componente que chama
 * `moveHighlight`; a aritmética dela está testada abaixo.
 *
 * O que restou verificado à mão, no servidor de desenvolvimento: abrir por
 * `Ctrl/Cmd+K`, abrir pelo campo, fechar com `Esc`, navegar com as setas e
 * abrir com `Enter`.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')

function collectPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) collectPages(full, out)
    else if (entry === 'page.tsx') out.push(full)
  }

  return out
}

const routes = new Set(
  collectPages(APP_DIR).map((file) => {
    const relative = file
      .slice(APP_DIR.length)
      .replace(/\\/g, '/')
      .replace(/\/page\.tsx$/, '')
      .replace(/\/\([^)]+\)/g, '')

    return relative === '' ? '/' : relative
  }),
)

describe('a lista de comandos', () => {
  it('não está vazia', () => {
    // Guarda contra o pior modo de falha: a derivacao do menu quebrar e todos os
    // testes abaixo passarem sobre lista vazia.
    expect(ALL_COMMANDS.length).toBeGreaterThanOrEqual(10)
  })

  it('TODO comando aponta para uma rota que existe', () => {
    const broken = ALL_COMMANDS.filter((command) => {
      // `?novo=1` e parametro; a rota e o que vem antes.
      const path = command.href.split('?')[0]
      return !routes.has(path)
    })

    /*
     * Uma paleta que leva a 404 e pior que um campo inerte: o inerte nao faz
     * nada, e este faria a pessoa acreditar que a tela sumiu.
     */
    expect(broken.map((command) => command.href)).toEqual([])
  })

  it('não oferece criação que não abre formulário', () => {
    /*
     * `/agenda?novo=1` e `/pacientes?novo=1` sao lidos pelas rotas
     * (`openNewOnMount`). Cobranca, guia e prontuario abrem por estado local da
     * tela — um comando para eles levaria a pessoa a uma tela com o formulario
     * FECHADO, que e promessa nao cumprida.
     */
    const creations = ALL_COMMANDS.filter((command) => command.group === 'Criar')

    expect(creations.map((command) => command.href).sort()).toEqual([
      '/agenda?novo=1',
      '/pacientes?novo=1',
    ])
  })

  it('não inclui item de menu desabilitado', () => {
    // Item desabilitado nao tem rota — `/teleatendimento`, `/crm` e os outros.
    const hrefs = ALL_COMMANDS.map((command) => command.href)

    expect(hrefs).not.toContain('/teleatendimento')
    expect(hrefs).not.toContain('/crm')
    expect(hrefs).not.toContain('/estoque')
  })

  it('cobre as telas reais do produto', () => {
    const hrefs = ALL_COMMANDS.map((command) => command.href)

    for (const expected of [
      '/dashboard',
      '/agenda',
      '/pacientes',
      '/atendimentos',
      '/prontuarios',
      '/financeiro',
      '/convenios',
      '/equipe',
      '/relatorios',
      '/configuracoes',
      '/whatsapp',
      '/chat-ia',
      '/automacoes',
    ]) {
      expect(hrefs).toContain(expected)
    }
  })

  it('põe criação antes de navegação', () => {
    // Quem abre a paleta com intencao costuma querer agir, nao passear.
    const firstNavigate = ALL_COMMANDS.findIndex(
      (command) => command.group === 'Ir para',
    )
    const lastCreate = ALL_COMMANDS.map((command) => command.group).lastIndexOf(
      'Criar',
    )

    expect(lastCreate).toBeLessThan(firstNavigate)
  })
})

describe('visibleCommands', () => {
  it('esconde de `finance` o que ele não pode abrir', () => {
    const hrefs = visibleCommands('finance').map((command) => command.href)

    expect(hrefs).not.toContain('/agenda')
    expect(hrefs).not.toContain('/prontuarios')
    expect(hrefs).not.toContain('/atendimentos')
    // E nao oferece criar atendimento, que ele nao pode.
    expect(hrefs).not.toContain('/agenda?novo=1')

    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/convenios')
  })

  it('`receptionist` cria atendimento e paciente, mas não abre prontuário', () => {
    const hrefs = visibleCommands('receptionist').map((command) => command.href)

    expect(hrefs).toContain('/agenda?novo=1')
    expect(hrefs).toContain('/pacientes?novo=1')
    expect(hrefs).not.toContain('/prontuarios')
    expect(hrefs).not.toContain('/financeiro')
  })

  it('papel ausente devolve tudo — é a demonstração', () => {
    expect(visibleCommands(undefined)).toEqual(ALL_COMMANDS)
  })

  it('sessão sem papel na clínica não recebe rota protegida', () => {
    const hrefs = visibleCommands(null).map((command) => command.href)

    expect(hrefs).not.toContain('/prontuarios')
    expect(hrefs).toContain('/dashboard')
  })

  it('todo papel enxerga pelo menos o painel', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const hrefs = visibleCommands(role).map((command) => command.href)
      expect(hrefs).toContain('/dashboard')
    }
  })

  it('a paleta de navegação nunca oferece mais que o MENU', () => {
    /*
     * As duas listas saem da mesma matriz de I-05, e este teste compara uma com
     * a OUTRA — a primeira versao comparava `visibleCommands` consigo mesmo e
     * passava sempre, provando nada.
     *
     * Se divergirem, a paleta vira o atalho para justamente o que o menu
     * esconde de cada papel.
     */
    for (const role of MEMBERSHIP_ROLES) {
      const menu = new Set(
        visibleNavItems(role)
          .filter((item) => !item.disabled)
          .map((item) => item.href),
      )

      const extra = visibleCommands(role)
        .filter((command) => command.group === 'Ir para')
        .map((command) => command.href)
        .filter((href) => !menu.has(href))

      expect({ role, extra }).toEqual({ role, extra: [] })
    }
  })
})

describe('filterCommands', () => {
  const commands = ALL_COMMANDS

  it('consulta vazia devolve tudo — a paleta aberta é um menu', () => {
    expect(filterCommands(commands, '')).toEqual(commands)
    expect(filterCommands(commands, '   ')).toEqual(commands)
  })

  it('encontra pelo nome da tela, ignorando acento e caixa', () => {
    const hrefs = filterCommands(commands, 'PRONTUARIOS').map(
      (command) => command.href,
    )

    expect(hrefs).toContain('/prontuarios')
  })

  it('encontra por como a equipe chama a tela', () => {
    /*
     * Quem procura "caixa" quer o financeiro e quem procura "fila" quer os
     * atendimentos — nenhuma das duas palavras esta no nome da tela.
     */
    expect(
      filterCommands(commands, 'caixa').map((command) => command.href),
    ).toContain('/financeiro')

    expect(
      filterCommands(commands, 'fila').map((command) => command.href),
    ).toContain('/atendimentos')

    expect(
      filterCommands(commands, 'ferias').map((command) => command.href),
    ).toContain('/equipe')
  })

  it('preserva a ordem original', () => {
    const filtered = filterCommands(commands, 'a')
    const positions = filtered.map((command) =>
      commands.findIndex((item) => item.id === command.id),
    )

    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('devolve vazio quando nada casa', () => {
    // O componente troca isso pelo aviso de que a busca nao procura registros.
    expect(filterCommands(commands, 'zzzzzzzz')).toEqual([])
  })
})

describe('busca de pacientes', () => {
  it('só aparece a partir de dois caracteres', () => {
    /*
     * Uma letra casaria com quase toda a base: o resultado seria a lista
     * inteira com um filtro no meio, que e pior que nao filtrar porque parece
     * filtrado.
     */
    expect(patientSearchCommand('owner', '')).toBeNull()
    expect(patientSearchCommand('owner', 'm')).toBeNull()
    expect(patientSearchCommand('owner', ' m ')).toBeNull()

    expect(patientSearchCommand('owner', 'ma')).not.toBeNull()
  })

  it('monta a URL que a rota realmente lê', () => {
    const command = patientSearchCommand('owner', 'Maria')

    // `?q=`, nao `?search=`: a rota ignora o segundo em silencio.
    expect(command?.href).toBe('/pacientes?q=Maria')
  })

  it('codifica o termo', () => {
    expect(patientSearchCommand('owner', 'maria & joão')?.href).toBe(
      '/pacientes?q=maria+%26+jo%C3%A3o',
    )
  })

  it('mostra no rótulo o termo digitado, sem acento removido', () => {
    // O rotulo e o contrato visivel: se dissesse 'Jose' e buscasse 'José', a
    // pessoa duvidaria do resultado.
    expect(patientSearchCommand('owner', 'José')?.label).toBe(
      'Buscar pacientes por "José"',
    )
  })

  it('usa o termo aparado, não o que tem espaço nas pontas', () => {
    const command = patientSearchCommand('owner', '  Maria  ')

    expect(command?.href).toBe('/pacientes?q=Maria')
    expect(command?.label).toBe('Buscar pacientes por "Maria"')
  })

  it('exige `patient.read`', () => {
    const command = patientSearchCommand('owner', 'maria')

    expect(command?.permission).toBe('patient.read')
  })

  it('não aparece para sessão sem papel na clínica', () => {
    // `null` e diferente de `undefined`: ha sessao, e ela nao tem papel aqui.
    expect(patientSearchCommand(null, 'maria')).toBeNull()
  })

  it('aparece na demonstração, onde não há papel a consultar', () => {
    expect(patientSearchCommand(undefined, 'maria')).not.toBeNull()
  })

  it('todo papel com `patient.read` recebe a busca', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const expected = can(role, 'patient.read')
      const command = patientSearchCommand(role, 'maria')

      expect({ role, has: command !== null }).toEqual({ role, has: expected })
    }
  })
})

describe('commandsFor', () => {
  it('põe a busca em PRIMEIRO lugar', () => {
    // Quem digitou um nome quer o nome, nao a tela cujo rotulo por acaso tem as
    // mesmas letras.
    const results = commandsFor('owner', 'pa')

    expect(results[0]?.id).toBe('buscar-pacientes')
  })

  it('sem busca, devolve só os comandos filtrados', () => {
    const results = commandsFor('owner', 'p')

    expect(results.some((command) => command.id === 'buscar-pacientes')).toBe(
      false,
    )
  })

  it('consulta vazia não traz busca — é o estado ao abrir e ao fechar', () => {
    /*
     * A paleta limpa a consulta ao fechar, entao este caso tambem cobre o
     * reset: reabrir nao pode mostrar a busca do termo anterior.
     */
    const results = commandsFor('owner', '')

    expect(results.some((command) => command.id === 'buscar-pacientes')).toBe(
      false,
    )
    expect(results).toEqual(visibleCommands('owner'))
  })

  it('a busca respeita o papel junto com o resto', () => {
    const results = commandsFor(null, 'maria')

    expect(results.some((command) => command.id === 'buscar-pacientes')).toBe(
      false,
    )
  })

  it('termo sem correspondência devolve só a busca', () => {
    // O caso real: digitar o nome de um paciente. Nenhuma TELA casa, e a unica
    // acao util e procurar por ele.
    const results = commandsFor('owner', 'zzzzzzzz')

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('buscar-pacientes')
  })
})

describe('moveHighlight', () => {
  it('anda para frente e para trás', () => {
    expect(moveHighlight(0, 1, 5)).toBe(1)
    expect(moveHighlight(3, -1, 5)).toBe(2)
  })

  it('dá a volta nas duas pontas', () => {
    // Numa lista curta, obrigar a subir dez vezes e pior que a volta.
    expect(moveHighlight(4, 1, 5)).toBe(0)
    expect(moveHighlight(0, -1, 5)).toBe(4)
  })

  it('lista vazia não gera índice negativo nem NaN', () => {
    // O `%` de JS devolve negativo para indice antes do zero — e um indice
    // negativo viraria `results[-1]`, ou seja, `undefined` no Enter.
    expect(moveHighlight(0, -1, 0)).toBe(0)
    expect(moveHighlight(3, 1, 0)).toBe(0)
  })

  it('lista de um item fica onde está', () => {
    expect(moveHighlight(0, 1, 1)).toBe(0)
    expect(moveHighlight(0, -1, 1)).toBe(0)
  })
})

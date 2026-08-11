import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Varredura das Server Actions: os caminhos que elas revalidam existem?
 *
 * Este arquivo lê o CÓDIGO-FONTE, o que é incomum, e a razão é específica:
 * `revalidatePath` aceita qualquer string e não reclama de rota inexistente. Um
 * `/financiero` com typo não quebra teste nenhum, não aparece em log, e a tela
 * simplesmente não atualiza — o defeito só é notado quando alguém jura que
 * salvou e o número continua velho.
 *
 * # Caminho derivado por helper
 *
 * Rota com segmento dinâmico não pode ser escrita literalmente na action: o id
 * só existe depois da escrita. Ela vem de um helper — `patientPaths(output.id)`
 * — e, até este arquivo aprender a segui-lo, esses caminhos eram **invisíveis
 * para a auditoria**: a varredura passava verde sem nunca olhar para
 * `/pacientes/<id>`.
 *
 * A checagem compara o TEMPLATE do helper com o padrão da rota real, sem
 * executar nada: `/pacientes/${x}` e `/pacientes/[patientId]` viram o mesmo
 * `/pacientes/:seg`. Renomear a pasta da rota, ou errar `historia` por
 * `historico`, quebra o teste.
 */

const ROOT = process.cwd()
const MODULES_DIR = join(ROOT, 'src', 'modules')
const APP_DIR = join(ROOT, 'src', 'app')

/**
 * Helpers que uma action pode espalhar dentro de `revalidatePaths`.
 *
 * **Toda entrada nova precisa ser registrada aqui.** Um helper não mapeado é
 * exatamente o buraco que esta fatia fecha: os caminhos dele não seriam
 * conferidos contra `src/app`, e ninguém notaria.
 */
const ROUTE_HELPERS: Record<string, string> = {
  patientPaths: 'src/lib/routes/patientRoutes.ts',
}

function collectFiles(dir: string, suffix: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, suffix))
    } else if (entry.endsWith(suffix)) {
      found.push(full)
    }
  }

  return found
}

/**
 * Rota real e template de helper reduzidos à mesma forma.
 *
 * `[patientId]` e `${trimmed}` são a mesma coisa aqui: um segmento que só se
 * conhece em tempo de execução. Comparar sem essa redução exigiria executar o
 * helper, e aí o teste passaria a depender de um id de exemplo em vez do
 * formato.
 */
function toPattern(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, ':seg')
    .replace(/\$\{[^}]+\}/g, ':seg')
}

/** Rotas que existem em `src/app`, derivadas dos arquivos `page.tsx`. */
function existingRoutes(): Set<string> {
  const routes = new Set<string>(['/'])

  for (const file of collectFiles(APP_DIR, 'page.tsx')) {
    const relative = file
      .slice(APP_DIR.length)
      .replace(/\\/g, '/')
      .replace(/\/page\.tsx$/, '')
      // Grupos de rota — `(app)`, `(auth)` — não aparecem na URL.
      .replace(/\/\([^)]+\)/g, '')

    routes.add(relative === '' ? '/' : relative)
  }

  return routes
}

interface HelperCall {
  name: string
  /** O argumento, como está escrito no fonte. */
  argument: string
}

interface ActionRevalidation {
  file: string
  /** Strings simples de `revalidatePaths`. */
  paths: string[]
  /** Entradas com `type` explícito. */
  typed: { path: string; type: string }[]
  /** Chamadas espalhadas, como `...patientPaths(output.id)`. */
  helpers: HelperCall[]
}

function readRevalidations(): ActionRevalidation[] {
  return collectFiles(MODULES_DIR, '.action.ts')
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => {
      const source = readFileSync(file, 'utf8')
      const paths: string[] = []
      const typed: { path: string; type: string }[] = []
      const helpers: HelperCall[] = []

      /*
       * Cada bloco `revalidatePaths: [...]`, nas DUAS formas.
       *
       * Desde que caminhos passaram a depender do resultado, `revalidatePaths`
       * também aceita `(scope, output) => [...]`. Sem o trecho opcional da
       * assinatura, esta varredura ficaria cega para as actions mais novas — e
       * são justamente as que montam URL na mão.
       */
      for (const block of source.matchAll(
        /revalidatePaths:\s*(?:\([^)]*\)\s*=>\s*)?\[([\s\S]*?)\]/g,
      )) {
        const body = block[1]

        for (const entry of body.matchAll(
          /\{\s*path:\s*'([^']+)',\s*type:\s*'([^']+)'\s*\}/g,
        )) {
          typed.push({ path: entry[1], type: entry[2] })
        }

        for (const entry of body.matchAll(/\.\.\.(\w+)\(([^)]*)\)/g)) {
          helpers.push({ name: entry[1], argument: entry[2].trim() })
        }

        // Strings soltas — descontadas as que já vieram no formato objeto.
        const withoutObjects = body.replace(
          /\{\s*path:\s*'[^']+',\s*type:\s*'[^']+'\s*\}/g,
          '',
        )

        for (const entry of withoutObjects.matchAll(/'([^']+)'/g)) {
          paths.push(entry[1])
        }
      }

      return { file: file.slice(ROOT.length + 1), paths, typed, helpers }
    })
    .filter(
      (entry) =>
        entry.paths.length > 0 ||
        entry.typed.length > 0 ||
        entry.helpers.length > 0,
    )
}

/**
 * Os templates de caminho que UM helper produz.
 *
 * # Lê só o corpo da função, não o arquivo
 *
 * A primeira versão varria o arquivo inteiro, e quebrou assim que
 * `patientRoutes.ts` ganhou um segundo helper: `patientSearchHref` monta
 * `/pacientes?q=…`, que é URL de navegação e **não** caminho de revalidação. O
 * teste acusou um caminho inexistente que nunca seria revalidado.
 *
 * O recorte por função é o que separa as duas coisas. Um arquivo pode legitimar
 * os dois tipos de helper — só o mapeado em `ROUTE_HELPERS` é auditado.
 *
 * Comentários saem antes da leitura, e não por elegância: o JSDoc de
 * `patientRoutes` explica a decisão citando `/pacientes/` e `/pacientes/<id>`
 * entre crases, como exemplos do que NÃO fazer. Lidos como código, viravam dois
 * caminhos inexistentes e faziam o teste acusar o próprio comentário.
 */
function helperTemplates(relativeFile: string, helperName: string): string[] {
  const source = readFileSync(join(ROOT, relativeFile), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')

  const start = source.indexOf(`export function ${helperName}(`)
  if (start === -1) return []

  // O corpo vai ate a primeira chave que fecha na coluna zero.
  const end = source.indexOf('\n}', start)
  const body = source.slice(start, end === -1 ? undefined : end)

  // Template literal que comeca com barra: e um caminho de rota.
  return [...body.matchAll(/`(\/[^`]*)`/g)].map((match) => match[1])
}

const revalidations = readRevalidations()
const routes = existingRoutes()
const routePatterns = new Set([...routes].map(toPattern))

describe('varredura das Server Actions', () => {
  it('encontra as actions do produto', () => {
    // Guarda contra o pior modo de falha deste arquivo: a leitura parar de
    // achar os arquivos e todos os testes abaixo passarem sobre lista vazia.
    expect(revalidations.length).toBeGreaterThanOrEqual(25)
  })

  it('enxerga também a forma com callback', () => {
    const withCallback = revalidations
      .map((entry) => entry.file.replace(/\\/g, '/'))
      .filter((file) =>
        [
          'patients/actions/updatePatient',
          'patients/actions/archivePatient',
          'scheduling/actions/createAppointment',
        ].some((needle) => file.includes(needle)),
      )

    expect(withCallback).toHaveLength(3)
  })

  it('todo caminho revalidado existe em src/app', () => {
    const broken = revalidations.flatMap((entry) =>
      [...entry.paths, ...entry.typed.map((item) => item.path)]
        .filter((path) => !routes.has(path))
        .map((path) => `${entry.file} -> ${path}`),
    )

    // Caminho inexistente nao lanca: a tela so nao atualiza, e ninguem sabe.
    expect(broken).toEqual([])
  })

  it('a raiz só é revalidada com type: layout', () => {
    const bare = revalidations
      .filter((entry) => entry.paths.includes('/'))
      .map((entry) => entry.file)

    /*
     * `revalidatePath('/')` invalida a PAGINA raiz. Quem escreve isso numa
     * action quase sempre queria a casca — o nome da clinica e o do usuario
     * aparecem no topo de toda rota autenticada, e ficariam velhos ali.
     */
    expect(bare).toEqual([])
  })

  it('as duas actions de identidade revalidam a casca inteira', () => {
    const files = revalidations
      .filter((entry) =>
        entry.typed.some((item) => item.path === '/' && item.type === 'layout'),
      )
      .map((entry) => entry.file.replace(/\\/g, '/'))

    expect(files).toContain(
      'src/modules/identity/actions/updateProfile.action.ts',
    )
    expect(files).toContain(
      'src/modules/settings/actions/updateClinicProfile.action.ts',
    )
  })
})

describe('caminhos derivados por helper', () => {
  const usedHelpers = [
    ...new Set(
      revalidations.flatMap((entry) => entry.helpers.map((call) => call.name)),
    ),
  ]

  it('algum helper de rota está em uso', () => {
    // Se isto zerar, os testes abaixo passam sem verificar nada — e o buraco
    // que esta secao fecha volta em silencio.
    expect(usedHelpers.length).toBeGreaterThan(0)
  })

  it('TODO helper espalhado está mapeado', () => {
    /*
     * O teste regressivo do buraco.
     *
     * Uma action que espalhasse `...invoicePaths(output.id)` sem registrar o
     * helper teria seus caminhos ignorados pela auditoria inteira: nao seriam
     * conferidos contra `src/app`, nao entrariam na checagem de rota alheia, e
     * ninguem notaria ate a tela nao atualizar em producao.
     */
    const unmapped = usedHelpers.filter((name) => !(name in ROUTE_HELPERS))

    expect(unmapped).toEqual([])
  })

  it('todo helper mapeado continua sendo usado', () => {
    // Registro que sobrevive ao seu unico chamador vira documentacao falsa.
    const unused = Object.keys(ROUTE_HELPERS).filter(
      (name) => !usedHelpers.includes(name),
    )

    expect(unused).toEqual([])
  })

  it('os caminhos do helper batem com rotas reais', () => {
    const broken: string[] = []

    for (const [name, file] of Object.entries(ROUTE_HELPERS)) {
      const templates = helperTemplates(file, name)

      // Helper sem template nenhum e leitura quebrada, nao helper vazio.
      expect(templates.length).toBeGreaterThan(0)

      for (const template of templates) {
        if (!routePatterns.has(toPattern(template))) {
          broken.push(`${name}: ${template}`)
        }
      }
    }

    /*
     * `/pacientes/${id}` casa com `/pacientes/[patientId]`; `/pacientes/${id}/
     * historia` nao casa com nada. Renomear a pasta da rota tambem quebra aqui,
     * que e o ponto — hoje o helper e a rota so se encontram em producao.
     */
    expect(broken).toEqual([])
  })

  it('o argumento do helper vem do OUTPUT, nunca do formulário', () => {
    /*
     * `output` e a linha que o repositorio devolveu, depois da RLS. `input` e o
     * que o navegador mandou. Montar a URL a partir do segundo deixaria o
     * cliente escolher qual rota expirar — o mesmo motivo pelo qual `cacheTags`
     * nao recebe `input`.
     */
    const suspicious = revalidations.flatMap((entry) =>
      entry.helpers
        .filter((call) => !call.argument.startsWith('output.'))
        .map((call) => `${entry.file} -> ${call.name}(${call.argument})`),
    )

    expect(suspicious).toEqual([])
  })
})

describe('nenhuma action revalida rota que não alimenta', () => {
  it('cada módulo fica dentro do que suas telas leem', () => {
    /*
     * Mapa deliberadamente escrito à mão, e por módulo: é a afirmação de quais
     * telas leem o dado que cada módulo escreve. Uma action que revalidasse
     * `/prontuarios` ao mexer em convênio não quebraria nada visivelmente — só
     * jogaria fora cache alheio a cada escrita.
     *
     * Os padrões com `:seg` são os caminhos do helper, já reduzidos.
     */
    const allowedByModule: Record<string, readonly string[]> = {
      billing: ['/financeiro'],
      encounters: ['/atendimentos', '/dashboard'],
      identity: ['/'],
      insurance: ['/convenios'],
      patients: [
        '/pacientes',
        '/dashboard',
        '/relatorios',
        '/pacientes/:seg',
        '/pacientes/:seg/historico',
      ],
      records: ['/prontuarios'],
      rooms: ['/salas-e-recursos', '/agenda'],
      /*
       * `/pacientes/:seg` entra porque a CONVERSÃO cria uma ficha de paciente.
       * É a única action do CRM que escreve fora do funil — e sem revalidar a
       * ficha nova, o link "ver ficha" levaria a uma página que o cache ainda
       * não conhece.
       */
      leads: ['/crm', '/pacientes/:seg', '/pacientes/:seg/historico'],
      forms: ['/formularios'],
      /*
       * Só `/inbox`. Status e responsável não alimentam nenhum painel: a Inbox
       * não entra nos KPIs do dashboard nem nos relatórios, e revalidar rota
       * que não lê a conversa seria pagar recomputo por nada.
       */
      inbox: ['/inbox'],
      inventory: ['/estoque'],
      purchases: ['/compras', '/estoque'],
      reconciliation: ['/conciliacao'],
      documents: ['/documentos'],
      // O painel de convite vive na FICHA; a listagem nao mostra convite nenhum.
      'patient-portal': ['/pacientes/:seg', '/pacientes/:seg/historico'],
      scheduling: [
        '/agenda',
        '/dashboard',
        '/relatorios',
        /*
         * `/indicadores` entra com o DESFECHO do atendimento (A-03).
         *
         * A taxa de comparecimento e a série mensal daquela tela são contadas
         * de `appointments.status` — `completed` sobre `completed + no_show`.
         * Registrar uma falta sem revalidar deixaria o indicador mostrando o
         * número anterior à falta que acabou de ser registrada.
         *
         * Só as duas actions de ciclo de vida a usam: criar e remarcar não
         * mudam desfecho, e cancelar não entra na conta.
         */
        '/indicadores',
        '/pacientes/:seg',
        '/pacientes/:seg/historico',
        /*
         * `/configuracoes` entra por causa das EXCECOES de disponibilidade:
         * bloqueio e horario extra sao geridos la, ao lado do horario de
         * funcionamento que eles excetuam. Criar ou remover um muda a lista
         * daquela tela e a agenda ao mesmo tempo.
         */
        '/configuracoes',
      ],
      settings: ['/', '/configuracoes', '/agenda'],
      /*
       * `tasks` invalida SÓ a própria tela.
       *
       * Tentador acrescentar `/pacientes/:seg`, já que a tarefa pode apontar
       * para um paciente — e errado: a ficha não mostra tarefas. Invalidar rota
       * que não lê o dado é custo sem efeito, e some do radar justamente por
       * não quebrar nada.
       */
      /*
       * `integrations` grava duas coisas em telas diferentes: credencial de
       * canal, que so `/configuracoes` mostra, e regra de automacao, que so
       * `/automacoes` mostra. Nenhuma das duas alimenta painel ou relatorio —
       * regra que nao executa nao produz numero para lugar nenhum.
       */
      integrations: ['/configuracoes', '/automacoes'],
      tasks: ['/tarefas'],
      team: ['/equipe'],
    }

    const violations = revalidations.flatMap((entry) => {
      const normalized = entry.file.replace(/\\/g, '/')
      const moduleName = normalized.split('/')[2]
      const allowed = allowedByModule[moduleName] ?? []

      const literal = [...entry.paths, ...entry.typed.map((item) => item.path)]

      const derived = entry.helpers.flatMap((call) => {
        const file = ROUTE_HELPERS[call.name]
        return file ? helperTemplates(file, call.name).map(toPattern) : []
      })

      return [...literal, ...derived]
        .filter((path) => !allowed.includes(path))
        .map((path) => `${normalized} -> ${path}`)
    })

    expect(violations).toEqual([])
  })
})

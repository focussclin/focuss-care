import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Toda rota que ENTREGA dado clínico registra o acesso.
 *
 * # A lacuna que este arquivo fecha
 *
 * A auditoria de leitura é requisito de conformidade e **não quebra nada quando
 * falta**: a tela funciona igual, o dado aparece igual, e o único sinal de que
 * ela sumiu é uma pergunta que a trilha deixa de responder meses depois. Foi
 * exatamente o que aconteceu com sinais vitais, alergias e prescrições na ficha
 * do paciente — três recortes clínicos servidos por quase um mês sem uma linha
 * em `audit_log`.
 *
 * Nenhum teste podia pegar isso, porque não havia o que quebrar. Este pega: a
 * rota que passa a ler uma fonte clínica e não registra o acesso reprova aqui,
 * antes de existir em produção.
 *
 * # A checagem é sobre o TEXTO do arquivo
 *
 * Grosseira de propósito, como `routeGates`. Renderizar cada rota exigiria
 * Supabase, sessão e RLS; o que se quer garantir é mais simples e mais durável —
 * **a rota que importa uma fonte clínica menciona o registro de acesso**. Passar
 * por acidente é possível (dá para chamar dentro de um `if` que nunca é
 * verdadeiro); o caso que importa, o da chamada que não existe, é pego sempre.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')
const MODULES_DIR = join(process.cwd(), 'src', 'modules')

/**
 * Os acessores de dado clínico do produto.
 *
 * **Toda fonte clínica nova precisa entrar aqui.** Uma fonte de fora desta lista
 * é invisível para a varredura — é a mesma dívida que `ROUTE_HELPERS` fecha em
 * `revalidateTargets`, e por isso o teste abaixo confere que cada nome ainda
 * existe em `src/modules`.
 */
const CLINICAL_SOURCES = [
  'getMedicalRecordRepository',
  'getPrescriptionSource',
  'getVitalsSource',
  'getAllergySource',
] as const

/** As formas aceitas de registrar o acesso. */
const AUDIT_CALLS = ['recordClinicalAccess(', '.logAccess('] as const

function collectFiles(dir: string, name: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, name))
    } else if (entry === name) {
      found.push(full)
    }
  }

  return found
}

/** `src/app/(app)/prontuarios/page.tsx` → `/prontuarios`. */
function routeOf(file: string): string {
  const relative = file
    .slice(APP_DIR.length)
    .replace(/\\/g, '/')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\([^)]+\)/g, '')

  return relative === '' ? '/' : relative
}

interface ClinicalRoute {
  route: string
  sources: string[]
  audits: boolean
}

const clinicalRoutes: ClinicalRoute[] = collectFiles(APP_DIR, 'page.tsx')
  .map((file) => {
    const source = readFileSync(file, 'utf8')

    return {
      route: routeOf(file),
      sources: CLINICAL_SOURCES.filter((name) => source.includes(`${name}(`)),
      audits: AUDIT_CALLS.some((call) => source.includes(call)),
    }
  })
  .filter((entry) => entry.sources.length > 0)

describe('auditoria de acesso clínico', () => {
  it('a varredura enxerga as rotas clínicas do produto', () => {
    /*
     * Guarda contra o pior modo de falha deste arquivo: os nomes mudarem, a
     * lista esvaziar e o teste abaixo passar sobre coisa nenhuma.
     */
    expect(clinicalRoutes.length).toBeGreaterThanOrEqual(2)
    expect(clinicalRoutes.map((entry) => entry.route)).toEqual(
      expect.arrayContaining(['/prontuarios', '/pacientes/[patientId]']),
    )
  })

  it('toda fonte clínica listada ainda existe', () => {
    // Registro que sobrevive ao que ele descreve vira documentacao falsa — e,
    // pior, apaga a rota que dependia dele da varredura.
    const modules = collectFiles(MODULES_DIR, 'repository.ts')
      .concat(collectFiles(MODULES_DIR, 'vitals-repository.ts'))
      .concat(collectFiles(MODULES_DIR, 'prescription-repository.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    const missing = CLINICAL_SOURCES.filter(
      (name) => !modules.includes(`export async function ${name}(`),
    )

    expect(missing).toEqual([])
  })

  it('nenhuma rota entrega dado clínico sem registrar o acesso', () => {
    const silent = clinicalRoutes
      .filter((entry) => !entry.audits)
      .map((entry) => `${entry.route} -> ${entry.sources.join(', ')}`)

    /*
     * Falta de auditoria nao quebra tela nenhuma: o dado aparece igual, e a
     * ausencia so e notada quando alguem pergunta quem leu o que.
     */
    expect(silent).toEqual([])
  })
})

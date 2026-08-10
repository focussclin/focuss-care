import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A fronteira do portal do paciente, verificada no SQL e no código.
 *
 * # Por que um teste sobre um arquivo `.sql`
 *
 * Porque é ali que a fronteira está, e ela é feita de **ausências** — e ausência
 * não quebra nada quando desaparece.
 *
 * O portal não mostra prontuário. Isso não é garantido por um `if` na tela: é
 * garantido por não existir RPC que alcance `medical_records` e por não haver
 * policy de SELECT nessas tabelas para o paciente. No dia em que alguém
 * acrescentar `create policy ... on patients` para "resolver" um campo que
 * faltou, nada falha — a tela continua igual, e o paciente passa a poder pedir
 * `select=*` ao PostgREST e ler `admin_notes`.
 *
 * Este arquivo transforma essas ausências em asserções.
 *
 * # O que ele NÃO substitui
 *
 * Isolamento real é pgTAP contra o banco (R1). Aqui se verifica o texto do que
 * será aplicado, não o comportamento do que foi.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260810_patient_portal.sql',
)

const MODULE_DIR = join(process.cwd(), 'src', 'modules', 'patient-portal')

const sqlRaw = readFileSync(MIGRATION, 'utf8')

/**
 * O arquivo sem comentários — é sobre o que EXECUTA que as asserções falam.
 *
 * Sem isto, este teste reprovava a si mesmo: o cabeçalho da migration explica,
 * em prosa, que `medical_records` não é alcançado e que `admin_notes` não entra
 * em select nenhum. Procurar a palavra no arquivo inteiro encontrava a
 * explicação e concluía que a proibição tinha sido violada.
 *
 * A remoção é ingênua (não trata `--` dentro de string literal). Nenhuma string
 * desta migration contém `--` ou `/*`, e o custo de um falso positivo aqui é uma
 * asserção que falha em voz alta — não uma que passa em silêncio.
 */
function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

/** Mesma ideia, para TypeScript. */
function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const sql = stripSqlComments(sqlRaw)

/** As tabelas cujas colunas internas não podem chegar ao paciente. */
const TABELAS_COM_COLUNA_INTERNA = [
  'patients',
  'appointments',
  'invoices',
  'medical_records',
]

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? collect(full) : [full]
  })
}

describe('migration do portal', () => {
  it('não cria policy em tabela com coluna interna', () => {
    /*
     * RLS filtra LINHA, não COLUNA.
     *
     * Uma policy de SELECT em `patients` deixaria o paciente pedir `select=*` e
     * ler `admin_notes` — a anotação que a recepção escreveu sobre ele. Em
     * `appointments` seria `internal_notes`; em `invoices`, `notes` e
     * `cancel_reason`.
     *
     * A leitura sai por função com lista fechada de colunas, e é por isso que
     * este teste é sobre a ausência de `create policy`.
     */
    const comPolicy = TABELAS_COM_COLUNA_INTERNA.filter((tabela) =>
      new RegExp(`create\\s+policy[^;]*\\bon\\s+public\\.${tabela}\\b`, 'i').test(
        sql,
      ),
    )

    expect(comPolicy).toEqual([])
  })

  it('nenhuma função do portal toca medical_records', () => {
    // O prontuário não entra no portal, nem por função. Se um dia entrar, tem
    // que ser removendo esta linha — e não esquecendo de proibir.
    expect(sql).not.toMatch(/medical_records/i)
  })

  it('as colunas internas não aparecem em select nenhum', () => {
    for (const coluna of ['admin_notes', 'internal_notes', 'cancel_reason']) {
      expect(sql, coluna).not.toMatch(new RegExp(`\\b${coluna}\\b`))
    }
  })

  it('grava o hash do token, e nunca o token', () => {
    /*
     * `token_hash` é a coluna; não existe coluna `token`. O valor em claro só
     * aparece no RETORNO da função que o cria — `returns table (token text, …)`
     * — e essa é a única vez em que ele existe fora do hash.
     */
    expect(sql).toMatch(/token_hash\s+text\s+not\s+null\s+unique/)
    expect(sql).toMatch(/encode\(extensions\.digest\(v_token, 'sha256'\), 'hex'\)/)
    expect(sql).not.toMatch(/^\s*token\s+text\s+not\s+null/m)
  })

  it('o aceite compara o e-mail da sessão com o do convite', () => {
    // A checagem que impede o vínculo por coincidência. Sem ela, quem
    // interceptasse o link entraria com a própria conta e viraria o paciente.
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/)
    expect(sql).toMatch(/EMAIL_MISMATCH/)
  })

  it('o aceite recusa expirado, revogado e já usado', () => {
    for (const marcador of ['INVITE_EXPIRED', 'INVITE_REVOKED', 'INVITE_USED']) {
      expect(sql, marcador).toContain(marcador)
    }
  })

  it('o aceite trava a linha antes de decidir', () => {
    /*
     * Sem `for update`, dois cliques no botão — ou duas abas — chegariam juntos
     * e criariam dois vínculos para o mesmo convite. O `status` é conferido
     * DEPOIS do lock.
     */
    expect(sql).toMatch(/for update/i)
  })

  it('só um convite pendente e um vínculo ativo por paciente', () => {
    expect(sql).toMatch(
      /unique index[\s\S]*?patient_portal_invites[\s\S]*?where status = 'pending'/,
    )
    expect(sql).toMatch(
      /unique index[\s\S]*?patient_portal_accounts[\s\S]*?where status = 'active'/,
    )
  })

  it('as tabelas novas têm RLS ligada', () => {
    for (const tabela of ['patient_portal_invites', 'patient_portal_accounts']) {
      expect(sql, tabela).toMatch(
        new RegExp(`alter table public\\.${tabela} enable row level security`),
      )
    }
  })

  it('a pré-visualização é a ÚNICA função aberta a anônimo', () => {
    /*
     * Ela precisa rodar antes de existir sessão — é a tela que o convidado abre
     * primeiro. Por isso o retorno dela é pobre de propósito, e o e-mail sai
     * mascarado.
     */
    const paraAnon = [...sql.matchAll(/grant execute on function ([^;]*?) to ([^;]+);/g)]
      .filter(([, , alvo]) => alvo.includes('anon'))
      .map(([, assinatura]) => assinatura.trim())

    expect(paraAnon).toHaveLength(1)
    expect(paraAnon[0]).toContain('preview_patient_portal_invite')
  })

  it('a pré-visualização mascara o e-mail', () => {
    // Se ele viesse em claro, o token — que viaja por WhatsApp e papel —
    // passaria a revelar o endereço do paciente para quem o interceptasse.
    expect(sql).toMatch(/masked_email/)
    expect(sql).toMatch(/repeat\('\*'/)
  })
})

describe('adapter do portal', () => {
  const arquivos = collect(MODULE_DIR).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  )

  it('nenhum arquivo do módulo lê as tabelas sensíveis por `from`', () => {
    /*
     * Do lado do paciente, nada é lido por tabela: tudo passa por função com
     * lista fechada de colunas. O tipo `PortalClient` nem expõe
     * `from('patients')` — este teste é a segunda barreira, para o caso de
     * alguém alargar o tipo.
     */
    const infratores: string[] = []

    for (const file of arquivos) {
      const source = stripTsComments(readFileSync(file, 'utf8'))

      for (const tabela of TABELAS_COM_COLUNA_INTERNA) {
        if (source.includes(`from('${tabela}')`)) {
          infratores.push(`${file} -> ${tabela}`)
        }
      }
    }

    expect(infratores).toEqual([])
  })

  it('o histórico de convites não seleciona o hash', () => {
    const adapter = stripTsComments(
      readFileSync(
        join(MODULE_DIR, 'infrastructure', 'SupabasePatientPortalRepository.ts'),
        'utf8',
      ),
    )

    // `select('*')` traria `token_hash` junto — inútil para forjar, e ainda
    // assim uma credencial atravessando camadas que não precisam dela.
    expect(adapter).not.toMatch(/\.select\('\*'\)/)
    expect(adapter).not.toMatch(/token_hash/)
  })
})

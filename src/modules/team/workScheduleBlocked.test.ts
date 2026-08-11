import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { employeeMessages } from './schemas/team.schema'

/**
 * A escala de trabalho continua ausente — e este teste é o que impede que ela
 * apareça sem prova.
 *
 * # O bloqueio
 *
 * `work_schedules.weekday` é um `integer` sem convenção conhecida. As duas
 * possibilidades divergem em um dia:
 *
 *   `extract(dow)`    → domingo = 0, sábado = 6
 *   `extract(isodow)` → segunda = 1, domingo = 7
 *
 * Escolher errado não quebra nada visivelmente: a escala salva, a tela mostra,
 * e alguém aparece para trabalhar no dia errado. É o pior formato de defeito —
 * silencioso, plausível e descoberto por uma pessoa, não por um teste.
 *
 * # Por que um teste, e não só um comentário
 *
 * A decisão já estava escrita em quatro lugares (porta do repositório, action,
 * tela e mensagem), e nenhum deles impede nada. Uma fatia futura que precise de
 * escala vai encontrar a tabela pronta no `database.types.ts`, com colunas
 * óbvias, e o caminho de menor resistência é escrever nela. Este teste torna a
 * decisão executável: escrever em `work_schedules` quebra a suíte, e quem
 * quiser fazê-lo precisa **primeiro** apagar este arquivo — que é onde está a
 * consulta que resolve o bloqueio.
 *
 * # Como destravar, de verdade
 *
 * ```sql
 * select conname, pg_get_constraintdef(oid)
 *   from pg_constraint
 *  where conrelid in ('public.availability_rules'::regclass,
 *                     'public.work_schedules'::regclass);
 * ```
 *
 * As DUAS tabelas, e não só `availability_rules`: cada uma tem a própria
 * constraint, e responder por uma não responde pela outra. Se não houver
 * `check` em `work_schedules`, o resultado é "não há convenção declarada" — e
 * aí a resposta vem de `select distinct weekday from public.work_schedules`
 * combinado com o que a clínica sabe da própria operação, ou de declarar a
 * constraint antes de escrever a primeira linha.
 */

const SRC = join(process.cwd(), 'src')

/** `database.types.ts` é gerado e só descreve a tabela — não escreve nela. */
const GENERATED = join('src', 'lib', 'supabase', 'database.types.ts')

function sourceFiles(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    if (/\.tsx?$/.test(entry)) found.push(path)
  }

  return found
}

/*
 * Este arquivo se exclui da varredura: a documentacao acima cita
 * `.from('work_schedules')` para explicar o que procura, e a citacao casaria
 * com o proprio padrao.
 */
const SELF = join('src', 'modules', 'team', 'workScheduleBlocked.test.ts')

const FILES = sourceFiles(SRC).filter(
  (path) => !path.endsWith(GENERATED) && !path.endsWith(SELF),
)

describe('escalas de trabalho continuam bloqueadas', () => {
  it('nenhum código lê ou escreve `work_schedules`', () => {
    /*
     * `.from('work_schedules')` é a única porta de entrada da tabela pelo
     * cliente do Supabase. Enquanto ela não aparecer, não há como uma escala
     * ser gravada com a convenção errada.
     *
     * A leitura entra junto de propósito: exibir a escala já exige nomear o
     * dia, e nomear exige a mesma convenção que gravar.
     */
    const offenders = FILES.filter((path) =>
      /\.from\(\s*['"]work_schedules['"]\s*\)/.test(readFileSync(path, 'utf8')),
    ).map((path) => path.replace(process.cwd(), ''))

    expect(offenders, 'antes de tocar em work_schedules, prove a convenção de weekday').toEqual([])
  }, 30_000)
  /*
   * Limite próprio porque este caso NÃO é um teste de unidade: ele lê os ~600
   * arquivos de `src` um a um. Sozinho leva ~300ms; com a suíte inteira
   * disputando o disco, já passou de 8s e estourou o padrão de 5s — falha
   * intermitente que não diz nada sobre `work_schedules` e ensina a suíte a ser
   * ignorada.
   */

  it('a porta do repositório não expõe operação de escala', () => {
    // Um método na porta é um convite: alguém o implementa sem ler o porquê.
    const port = readFileSync(join(SRC, 'modules', 'team', 'domain', 'TeamRepository.ts'), 'utf8')

    expect(port).not.toMatch(/listSchedules|createSchedule|setSchedule|saveSchedule/)
  })

  it('a tela declara a ausência em vez de esconder', () => {
    /*
     * Uma aba de escalas vazia, ou simplesmente inexistente, faria a clínica
     * concluir que o produto esqueceu. O texto diz que foi decidido, e por quê.
     */
    const panel = readFileSync(join(SRC, 'modules', 'team', 'ui', 'StaffPanel.tsx'), 'utf8')

    expect(panel).toContain('schedulesUnavailable')
    expect(employeeMessages.schedulesUnavailable).toMatch(/convenção|convencao/i)
  })

  it('a mensagem diz o que fazer, e não só o que falta', () => {
    /*
     * Quem lê essa tela é `owner` ou `admin` — quem tem acesso ao painel do
     * Supabase e pode responder a consulta. Descrever o bloqueio sem dizer como
     * sair dele transforma a honestidade em beco sem saída.
     */
    expect(employeeMessages.schedulesUnavailable).toMatch(/pg_constraint|constraint/i)
    expect(employeeMessages.schedulesUnavailable).toMatch(/work_schedules/)
  })
})

/*
 * Salário e CPF NÃO são verificados aqui de propósito.
 *
 * `SupabaseTeamRepository.staff.test.ts` já prova o que importa, e prova melhor:
 * que as colunas não entram no `select` e que o `insert` não as carrega. Uma
 * segunda checagem por texto acusaria justamente os comentários que explicam a
 * ausência — transformar a documentação da decisão em violação da decisão.
 */

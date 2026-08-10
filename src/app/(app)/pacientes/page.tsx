import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import { toPatientListItem } from '@/modules/patients/application/toPatientDto'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { parsePatientListQuery } from '@/modules/patients/schemas/patientQuery.schema'
import { PatientsScreen } from '@/modules/patients/ui/PatientsScreen'

export const metadata: Metadata = {
  title: 'Pacientes',
  description: 'Acompanhe os pacientes e seus próximos cuidados.',
}

/**
 * Listagem paginada por cursor (P-02a).
 *
 * `searchParams` e Request-time API e opta a rota por render dinamico — o que ja
 * era verdade por `connection()` e pela sessao em cookie. A consequencia que
 * importa: **busca, filtro e pagina vivem na URL**, entao recarregar mantem,
 * o link reproduz e o botao voltar funciona. Antes de P-02a tudo isso era
 * `useState`, e nada disso valia.
 *
 * `await connection()` continua correto aqui (existe por causa do `new Date()`).
 *
 * F-02 ligou `cacheComponents`, e **esta leitura continua sem `use cache`** — por
 * tres motivos somados, nao por omissao: le sessao em cookie, le `searchParams` e
 * devolve dado de paciente. `use cache` proibe as duas primeiras e `connection()`
 * e proibido nos dois sabores de cache. O caminho eventual e `use cache: private`
 * (resultado nunca armazenado no servidor) com `cacheTag(cacheTags.patients(clinicId))`
 * — contrato que precisa ser escrito com o dado clinico em mente, nao herdado de
 * uma fatia de infraestrutura. Ver docs/06-acoes-e-auditoria.md §8.
 */
export default async function PacientesPage({
  searchParams,
}: PageProps<'/pacientes'>) {
  await connection()
  const today = startOfDay(new Date())

  const params = await searchParams
  const query = parsePatientListQuery(params)

  const [{ repository, clinicId, isLive }, role] = await Promise.all([
    getPatientRepository(today),
    getActiveClinicRole(),
  ])

  /*
   * Hoje os cinco papeis tem `patient.read`, entao esta linha nao nega nada a
   * ninguem — e e por isso que ela precisa existir agora.
   *
   * O menu ja declara `patient.read` neste item. Enquanto a rota nao exigia o
   * mesmo, a matriz de permissoes era a unica coisa segurando a porta: no dia em
   * que alguem tirasse `patient.read` de um papel — a leitura mais provavel de
   * uma revisao de LGPD — o item sumiria do menu e a URL continuaria servindo a
   * lista de pacientes, sem que teste nenhum notasse.
   *
   * `routeGates.test.ts` passa a exigir esta correspondencia em toda rota do
   * menu; aqui esta o lado da rota.
   */
  if (isLive && !can(role, 'patient.read')) forbidden()

  /*
   * As metricas sao consulta PROPRIA, nao derivacao da pagina.
   *
   * Antes de P-02a saiam de `patients.length` e de `.filter(...)` sobre o array
   * inteiro. Com 20 linhas por pagina, "Total de pacientes: 20" seria a tela
   * mentindo com naturalidade em toda clinica maior que uma pagina.
   */
  const [page, metrics] = await Promise.all([
    repository.listPage(clinicId, query),
    repository.countMetrics(clinicId, today),
  ])

  return (
    <PatientsScreen
      patients={page.items.map(toPatientListItem)}
      metrics={metrics}
      filters={{ search: query.search, status: query.status }}
      hasMore={page.hasMore}
      nextCursor={page.nextCursor}
      // Cursor pedido e nao aplicado (expirado, forjado, de outro recorte): a
      // tela avisa que voltou ao inicio em vez de fingir que era a pagina pedida.
      cursorReset={query.cursor !== null && !page.cursorApplied}
      isPaginated={query.cursor !== null}
      openNewOnMount={params.novo === '1'}
      isLive={isLive}
    />
  )
}

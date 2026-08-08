import type { Metadata } from 'next'
import { connection } from 'next/server'

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
 * `await connection()` continua correto aqui (existe por causa do `new Date()`),
 * mas e proibido dentro de `use cache` — se F-02 ligar `cacheComponents`, este
 * ponto vira `io()` ou o "hoje" sai do escopo cacheado.
 */
export default async function PacientesPage({
  searchParams,
}: PageProps<'/pacientes'>) {
  await connection()
  const today = startOfDay(new Date())

  const params = await searchParams
  const query = parsePatientListQuery(params)

  const { repository, clinicId, isLive } = await getPatientRepository(today)

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

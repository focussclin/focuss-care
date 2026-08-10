import 'server-only'

import { headers } from 'next/headers'

/**
 * Esta renderização é um ACESSO de verdade, ou o navegador só se adiantou?
 *
 * # O defeito que isto conserta
 *
 * Medido no banco em 09/08/2026: `audit_log` tinha **742 linhas, 731 delas
 * `record.read`** — e nenhuma apontava para um paciente. Todas eram leitura da
 * LISTA de prontuários, em rajadas de exatamente 8 no mesmo segundo, em 76
 * segundos distintos. Isso não é gente lendo prontuário.
 *
 * `/prontuarios` registra o acesso no corpo da rota, e o corpo da rota roda
 * também quando o Next PRÉ-BUSCA a página: passar o mouse sobre "Prontuários"
 * no menu, ou a rota entrar no viewport, dispara uma renderização no servidor.
 * O resultado é uma trilha que afirma que alguém leu prontuário quando ninguém
 * abriu tela nenhuma.
 *
 * Numa trilha de dado de saúde isso é pior que ruído. Ela existe para responder
 * "quem leu o prontuário desta paciente, e quando" — e uma trilha em que 98% dos
 * eventos são fabricados não responde nada: some o acesso que importa no meio
 * dos que não aconteceram.
 *
 * # Por que o header, e não uma heurística
 *
 * `next-router-prefetch` é enviado pelo próprio roteador do Next quando a
 * requisição é pré-busca (`NEXT_ROUTER_PREFETCH_HEADER` no runtime; documentado
 * em `02-guides/cdn-caching.md`). É a resposta do framework à pergunta, e não um
 * palpite sobre frequência ou intervalo — palpite erraria nos dois sentidos:
 * descartaria acesso real de quem navega rápido, e deixaria passar pré-busca de
 * quem navega devagar.
 *
 * # O que NÃO muda
 *
 * A auditoria continua best-effort e continua fora do caminho crítico: se este
 * módulo falhar ao ler o header, o padrão é REGISTRAR. Perder um evento real é
 * pior que gravar um a mais — a dúvida joga a favor de auditar.
 */
export async function isPrefetchRender(): Promise<boolean> {
  try {
    const requestHeaders = await headers()

    return requestHeaders.get('next-router-prefetch') !== null
  } catch {
    /*
     * Fora de um request (prerender de build, por exemplo) `headers()` lança.
     * Aí não há acesso humano nenhum para registrar — mas devolver `false`
     * mantém a regra acima: na dúvida, audita.
     */
    return false
  }
}

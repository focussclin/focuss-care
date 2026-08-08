import type { IntegrationsOverview } from './Integration'

/**
 * PORTA das integrações.
 *
 * # Esta porta só LÊ, e a ausência de escrita é o ponto
 *
 * Não há `connect`, `send`, `run` nem `enable`. Não é escopo cortado: **não há o
 * que chamar**. Não existe worker, provedor de WhatsApp configurado, provedor de
 * IA nem executor de automação neste ambiente — ver `EXTERNAL_SETUP.md` §3.
 *
 * Um método `send()` que gravasse a mensagem numa tabela e nunca a entregasse
 * seria a pior versão possível deste módulo: a recepção veria "enviada" e o
 * paciente não receberia nada. Enquanto o canal não existe, a única resposta
 * honesta é dizer que ele não existe.
 *
 * # O que a escrita vai exigir, quando vier
 *
 * W-01 precisa de worker + Redis + credenciais do provedor. AI-01 precisa da
 * aprovação de `docs/04-agente-ia.md` e do princípio P9 implementado (IA sugere,
 * humano assina). AU-01 depende de W-01. Cada um traz seu módulo; este continua
 * respondendo o que está conectado.
 */
export interface IntegrationRepository {
  /** Estado das três integrações, lido do banco. Nunca falha por ausência. */
  overview(clinicId: string): Promise<IntegrationsOverview>
}

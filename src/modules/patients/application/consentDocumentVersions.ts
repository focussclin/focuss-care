import 'server-only'

import type { PatientConsentPurpose } from '../domain/PatientConsentRepository'

/**
 * A versao vigente de cada documento de consentimento — decidida no SERVIDOR.
 *
 * ## Por que isto e uma constante, e nao um campo
 *
 * `consents.document_version` responde a pergunta "o paciente aceitou QUAL texto".
 * Se o valor viesse do formulario, a linha registraria a versao que o navegador
 * disse ter mostrado — e um registro que aceita a propria versao por parametro nao
 * prova nada em auditoria. Aqui o servidor afirma qual texto estava no ar no
 * momento do registro, e o cliente nao tem como discordar.
 *
 * `server-only` nao e decoracao: garante que este mapa nunca vire dado de bundle
 * que alguem edita no devtools antes de submeter.
 *
 * ## O formato
 *
 * `AAAA-MM.vN` — a data em que o texto entrou em vigor, mais o contador daquele
 * mes. Ordena sozinho e diz de cara se um consentimento e antigo. Nao ha ainda um
 * repositorio de textos de politica no produto (nem tabela para eles no schema
 * remoto): a versao e o que existe hoje para amarrar o registro a um documento.
 *
 * ## Como versionar
 *
 * Mudou o texto de uma finalidade -> incremente a versao DELA, so dela. Todo
 * consentimento vigente naquela finalidade passa a estar defasado, e o painel
 * mostra isso (`Versão registrada` diferente de `Versão vigente`). Nao ha
 * re-aceite automatico: quem decide se um texto novo exige novo consentimento e a
 * clinica, e a decisao precisa de um ato explicito na tela.
 */
const DOCUMENT_VERSIONS: Record<PatientConsentPurpose, string> = {
  terms_of_service: '2026-08.v1',
  privacy_policy: '2026-08.v1',
  health_data_processing: '2026-08.v1',
  marketing_communication: '2026-08.v1',
  ai_assisted_processing: '2026-08.v1',
}

/** A versao que o servidor grava ao registrar um consentimento agora. */
export function currentDocumentVersion(
  purpose: PatientConsentPurpose,
): string {
  return DOCUMENT_VERSIONS[purpose]
}

/**
 * Registro de ACESSO a dado clínico.
 *
 * # O buraco que este módulo fecha
 *
 * `MedicalRecordRepository.logAccess` cobria o prontuário, e só. A ficha do
 * paciente entrega **quatro** recortes clínicos na mesma abertura — prontuário,
 * prescrições, sinais vitais e alergias —, e três deles não deixavam rastro
 * nenhum.
 *
 * O caso que expõe o problema não é teórico: `receptionist` e `admin` têm
 * `encounter.read` e **não** têm `record.read`. Os dois abrem a ficha, recebem
 * os sinais vitais da pessoa e não passam por nenhum caminho auditado. A trilha
 * respondia "quem leu o prontuário", nunca "quem leu dado clínico".
 *
 * # Um ato, um evento
 *
 * Quatro chamadas, uma por painel, dariam quatro linhas por abertura de ficha —
 * a mesma poluição que a pré-busca causava antes de `isPrefetchRender`, e pelo
 * mesmo efeito: some o acesso que importa no meio dos que são repetição do
 * mesmo. Abrir a ficha é **um** ato de acesso, e o evento diz quais recortes
 * foram entregues nele.
 *
 * # Só o que ATRAVESSOU a fronteira
 *
 * O escopo entra quando o dado foi de fato lido e mandado para a tela. Papel sem
 * permissão, consulta recusada pela RLS e modo demonstração ficam de fora: um
 * evento afirmando leitura de alergias sobre uma consulta que falhou é uma
 * acusação falsa contra quem abriu a ficha.
 *
 * Lista vazia conta como acesso. "Esta paciente não tem alergia registrada"
 * também é informação de saúde, e quem perguntou recebeu a resposta.
 *
 * # Nenhum conteúdo entra aqui
 *
 * O evento carrega os NOMES dos recortes, nunca o que havia dentro deles.
 * `sanitizeMetadata` continua sendo a barreira final em `recordAuditEvent` — o
 * que este módulo faz é não dar a ela nada perigoso para filtrar.
 */

/** Vocabulário fechado: cada valor é um recorte clínico que a ficha entrega. */
export type ClinicalScope =
  | 'medical_records'
  | 'prescriptions'
  | 'vitals'
  | 'allergies'

/**
 * A ordem canônica do evento.
 *
 * Ordenar aqui, e não na chamada, é o que torna duas leituras iguais
 * comparáveis: sem isso, `'vitals,allergies'` e `'allergies,vitals'` seriam
 * duas strings diferentes para o mesmo acesso, e qualquer agrupamento por
 * escopo na trilha contaria os dois separados.
 *
 * A ordem é a da sensibilidade declarada pelo produto, do prontuário para fora —
 * a mesma dos painéis na ficha.
 */
const SCOPE_ORDER: readonly ClinicalScope[] = [
  'medical_records',
  'prescriptions',
  'vitals',
  'allergies',
]

const SCOPE_LABELS: Record<ClinicalScope, string> = {
  medical_records: 'prontuário',
  prescriptions: 'prescrições',
  vitals: 'sinais vitais',
  allergies: 'alergias',
}

/** Dedupe e ordem canônica. Valor desconhecido não passa. */
export function normalizeClinicalScopes(
  scopes: readonly ClinicalScope[],
): ClinicalScope[] {
  const unique = new Set(scopes)

  return SCOPE_ORDER.filter((scope) => unique.has(scope))
}

/**
 * Os recortes em texto, para a tela dizer o que está sendo registrado.
 *
 * Quem lê precisa saber que o acesso fica gravado, e precisa saber **de quê** —
 * a recepção que abre a ficha vê sinais vitais e não vê prontuário, e um aviso
 * genérico faria a mesma frase valer para acessos diferentes.
 */
export function describeClinicalScopes(
  scopes: readonly ClinicalScope[],
): string {
  const labels = normalizeClinicalScopes(scopes).map(
    (scope) => SCOPE_LABELS[scope],
  )

  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]

  // Português não leva vírgula antes do "e" final.
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`
}

export interface ClinicalAccess {
  /** Paciente cujo dado foi entregue. */
  patientId: string
  /** Recortes que realmente atravessaram a fronteira nesta leitura. */
  scopes: readonly ClinicalScope[]
}

/**
 * Grava o acesso. **Nunca lança** — `recordAuditEvent` já trata a própria falha.
 *
 * Best-effort pela mesma razão do resto da trilha: auditoria não pode impedir um
 * profissional de ver a ficha do paciente que está na frente dele.
 */
export async function recordClinicalAccess(
  access: ClinicalAccess,
): Promise<void> {
  const scopes = normalizeClinicalScopes(access.scopes)

  /*
   * Sem recorte clínico entregue, não houve acesso clínico.
   *
   * `finance` abre a ficha por `patient.read` e recebe nome, telefone e
   * documento — cadastro, não saúde. Gravar um `record.read` para ele encheria a
   * trilha de acessos que não aconteceram, e o efeito é pior que o silêncio:
   * uma trilha com acusação falsa deixa de servir para responder qualquer coisa.
   */
  if (scopes.length === 0 || access.patientId.trim() === '') return

  const { recordAuditEvent } = await import('./audit-log')

  await recordAuditEvent({
    action: 'record.read',
    entityType: 'patient',
    entityId: access.patientId,
    after: {
      scope: 'patient_chart',
      target: 'patient',
      /*
       * String, e não uma chave por recorte: `AuditMetadata` aceita escalares, e
       * quatro booleanos fariam a ausência de um escopo ficar indistinguível de
       * um evento gravado por uma versão anterior do código, que não conhecia
       * aquele nome.
       */
      clinical_scopes: scopes.join(','),
    },
  })
}

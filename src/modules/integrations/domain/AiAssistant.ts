/**
 * O assistente que responde paciente no WhatsApp.
 *
 * # A regra que dá forma a este arquivo
 *
 * Um modelo de linguagem responde com confiança sobre o que não sabe. Testado
 * contra a API real em 12/08/2026, com a pergunta "vocês atendem sábado?" e
 * nenhum dado da clínica no contexto, `gpt-5.4-mini` respondeu "atendemos, com
 * horário reduzido" e `gpt-4.1-mini` cravou "das 8h às 12h". Os dois inventaram.
 *
 * Numa clínica, isso não é um detalhe de qualidade: é o paciente aparecendo num
 * sábado em que ninguém trabalha. Por isso o desenho aqui não confia no modelo
 * para ser prudente — ele **recebe os fatos** e é instruído a não afirmar nada
 * fora deles, e o que sobra vai para uma pessoa.
 */

/** O que a IA pode fazer com uma mensagem que chegou. */
export type AiDecision =
  /** Respondeu, e a resposta pode ser enviada. */
  | 'reply'
  /** Assunto que exige gente: a IA cala e a conversa vai para a fila humana. */
  | 'escalate'

export interface AiAnswer {
  decision: AiDecision
  /** Texto a enviar. Vazio quando `escalate`. */
  text: string
  /** Por que escalou — para a recepção ver na conversa, não para o paciente. */
  escalationReason: string | null
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Os fatos da clínica que a IA pode afirmar.
 *
 * Tudo que não estiver aqui, ela não sabe — e é instruída a dizer que vai
 * verificar com a equipe, em vez de deduzir.
 */
export interface ClinicFacts {
  tradeName: string
  /** Ex.: 'Seg a sex, 8h às 18h'. Null quando a clínica não configurou. */
  businessHours: string | null
  address: string | null
  phone: string | null
}

/** O histórico recente, para a IA não repetir pergunta já respondida. */
export interface AiTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AiAssistantGateway {
  /**
   * Gera a resposta para a última mensagem do paciente.
   *
   * `patientName` é opcional de propósito: contato sem cadastro existe, e
   * cumprimentar pelo nome errado é pior que não cumprimentar.
   */
  answer(input: {
    facts: ClinicFacts
    history: readonly AiTurn[]
    patientName: string | null
  }): Promise<AiAnswer>
}

export type AiGatewayReason = 'not-configured' | 'unauthorized' | 'unavailable' | 'unexpected'

export class AiGatewayError extends Error {
  constructor(
    readonly reason: AiGatewayReason,
    message: string,
  ) {
    super(message)
    this.name = 'AiGatewayError'
  }
}

export function isAiGatewayError(value: unknown): value is AiGatewayError {
  return value instanceof AiGatewayError
}

/**
 * Assuntos em que a IA **não** responde, verificados antes de qualquer chamada.
 *
 * A checagem é local e vem primeiro por dois motivos: não gasta token com o que
 * já se sabe que vai escalar, e não depende de o modelo obedecer à instrução.
 * Instrução em prompt é pedido; isto é regra.
 *
 * A lista é deliberadamente ampla. Escalar demais custa o tempo de uma pessoa
 * ler a mensagem; escalar de menos custa uma orientação clínica errada dada em
 * nome da clínica.
 */
const ASSUNTO_CLINICO = new RegExp(
  [
    /*
     * RAÍZES, não palavras fechadas.
     *
     * A primeira versão terminava cada termo em `\b` e deixava passar
     * "a ferida está inflamada" — `inflama` seguido de `d` não é fronteira de
     * palavra, então o padrão não casava a flexão. O mesmo buraco valia para
     * "sangrando", "infeccionado", "vomitando". Onde a raiz é ambígua o `\b`
     * fica ("dor" precisa dele, senão casa "dormir" e "adorei").
     */
    'dor(es|zinha)?\\b',
    'sintoma',
    'febre\\b',
    'sangra',
    'sangue\\b',
    'sangrament',
    'infec',
    'inflama',
    'rem[ée]dio',
    'medicament',
    'dose\\b',
    'dosagem',
    'posologia',
    'antibi[óo]tic',
    'receita\\b',
    'prescri',
    'exame',
    'resultado',
    'diagn[óo]st',
    'tratamento',
    'cirurgia',
    'anestesia',
    'gr[áa]vid',
    'alergi',
    'al[ée]rgic',
    'efeito colateral',
    'piorou\\b',
    'inchad',
    'incha[çc]',
    'tontura',
    'desmai',
    'vomit',
    'n[áa]usea',
    'press[ãa]o alta',
    'diabet',
    /*
     * A INTENÇÃO, não só o vocabulário.
     *
     * "posso tomar dipirona?" não tem nenhuma das raízes acima — o nome do
     * remédio é comercial e a lista nunca estaria completa. O que se repete é a
     * pergunta, e é ela que o padrão captura.
     *
     * `tomar` sozinho gera falso positivo ("vou tomar um café"), e é um preço
     * aceitável: escalar demais custa o tempo de alguém ler a mensagem;
     * escalar de menos custa uma orientação sobre medicamento dada por uma
     * máquina em nome da clínica.
     */
    'poss[oa] (tomar|usar|beber|passar)',
    'pode (tomar|usar|beber|passar)',
    '\\btomar\\b',
  ].join('|'),
  'i',
)

/** Urgência: nunca é a IA que responde. */
const URGENCIA =
  /\b(urgente|urgência|urgencia|emergência|emergencia|socorro|grave|desmaiou|não consigo respirar|nao consigo respirar|muito mal|passando mal)\b/i

export interface EscalationCheck {
  shouldEscalate: boolean
  reason: string | null
}

export function checkEscalation(message: string): EscalationCheck {
  if (URGENCIA.test(message)) {
    return {
      shouldEscalate: true,
      reason: 'Possível urgência — mensagem encaminhada para atendimento humano.',
    }
  }

  if (ASSUNTO_CLINICO.test(message)) {
    return {
      shouldEscalate: true,
      reason: 'Assunto clínico — apenas a equipe de saúde responde.',
    }
  }

  return { shouldEscalate: false, reason: null }
}

/**
 * A instrução do sistema.
 *
 * Mora no domínio, e não no adapter, porque é **regra de negócio**: define o que
 * a clínica autoriza uma máquina a dizer em nome dela. Trocar de provedor não
 * pode trocar essa política junto.
 */
export function buildSystemPrompt(facts: ClinicFacts, patientName: string | null): string {
  const conhecidos = [
    `Nome da clínica: ${facts.tradeName}`,
    facts.businessHours ? `Horário de funcionamento: ${facts.businessHours}` : null,
    facts.address ? `Endereço: ${facts.address}` : null,
    facts.phone ? `Telefone: ${facts.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `Você atende no WhatsApp da clínica ${facts.tradeName}, em português do Brasil.`,
    patientName ? `Você fala com ${patientName}.` : null,
    '',
    'FATOS QUE VOCÊ CONHECE (a única informação que pode afirmar):',
    conhecidos,
    '',
    'REGRAS INVIOLÁVEIS:',
    '1. NUNCA invente horário, preço, endereço, disponibilidade de agenda ou',
    '   qualquer dado que não esteja na lista acima. Se não estiver, responda',
    '   que vai confirmar com a equipe e que alguém retorna em seguida.',
    '2. NUNCA dê orientação clínica: nada sobre sintoma, remédio, dose, exame,',
    '   resultado, diagnóstico ou tratamento. Diga que a equipe de saúde vai',
    '   responder.',
    '3. NUNCA confirme, marque, remarque ou cancele consulta. Você não tem',
    '   acesso à agenda. Diga que a recepção vai cuidar disso.',
    '4. Não peça dados sensíveis. Não repita dados de saúde.',
    '5. Seja breve: uma ou duas frases, tom cordial e direto. É WhatsApp.',
    '',
    'Você é um apoio da recepção para dúvidas simples. Na dúvida, encaminhe',
    'para a equipe — encaminhar nunca é erro.',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

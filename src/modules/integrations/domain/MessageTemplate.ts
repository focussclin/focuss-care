/**
 * Modelos de mensagem — texto que a clínica reaproveita.
 *
 * # Nada aqui envia nada
 *
 * Não há provedor, não há worker, não há fila. O que esta superfície faz é
 * guardar o texto padrão que hoje vive num bloco de notas da recepção: confirmação
 * de consulta, orientação de preparo, instrução de pós-operatório. Copiar e colar
 * já é ganho; o envio automático depende de W-01, que não faz parte desta
 * instalação.
 *
 * # Duas colunas pertencem ao PROVEDOR, e a aplicação não as escreve
 *
 * `is_approved` e `provider_template_id` são preenchidos por quem aprova modelo
 * de mensagem — a Meta, no caso do WhatsApp Business. Deixar a clínica marcar
 * "aprovado" seria afirmar uma aprovação que ninguém deu, e é o tipo de mentira
 * que só aparece quando a mensagem é recusada no envio.
 *
 * Elas são LIDAS e exibidas como estado do provedor. Nenhuma escrita desta
 * aplicação as toca.
 *
 * # `variables` é DERIVADO do corpo, nunca digitado
 *
 * A coluna é `jsonb`, e um campo livre para JSON faria a tela virar um canal
 * para gravar estrutura arbitrária no tenant. Pior: a lista digitada à mão
 * divergiria do texto no primeiro ajuste, e o dia em que o provedor existir ele
 * leria uma lista que não corresponde ao corpo.
 *
 * As variáveis saem do próprio texto, por `{{nome}}`. Corpo e lista não têm
 * como discordar porque são a mesma informação.
 */

export interface MessageTemplate {
  id: string
  name: string
  category: string | null
  language: string
  body: string
  variables: readonly string[]
  /** Do provedor. A aplicação lê e nunca grava. */
  isApproved: boolean
  /** Do provedor. A aplicação lê e nunca grava. */
  providerTemplateId: string | null
  isActive: boolean
  updatedAt: Date
}

export interface NewMessageTemplateData {
  name: string
  category: string | null
  body: string
}

/**
 * O idioma é fixo em `pt-BR`.
 *
 * A coluna é texto livre e nenhum registro existe para revelar a convenção. O
 * provedor de WhatsApp usa o próprio formato (`pt_BR`, com sublinhado), mas
 * confirmar isso exige o adapter que não existe — e chutar criaria uma coluna
 * cheia de valores que talvez precisem ser reescritos.
 *
 * Enquanto o produto é só pt-BR, um seletor de idioma seria escolha sem efeito.
 * O valor fica explícito aqui para que a conversa aconteça quando o provedor
 * entrar, e não fique escondida num literal solto no repositório.
 */
export const TEMPLATE_LANGUAGE = 'pt-BR'

/**
 * `{{nome_do_paciente}}` — letras, números e sublinhado.
 *
 * Sem espaço e sem acento de propósito: é o formato que os provedores de
 * mensagem aceitam como marcador, e aceitar mais aqui produziria modelos que
 * nenhum deles consegue processar depois.
 */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** As variáveis do corpo, sem repetição e na ordem em que aparecem. */
export function extractVariables(body: string): string[] {
  const found: string[] = []

  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]
    if (!found.includes(name)) found.push(name)
  }

  return found
}

/**
 * Marcador aberto e não fechado — `{{nome` — não vira variável e some do texto
 * enviado como lixo.
 *
 * O erro é fácil de cometer e difícil de ver: o texto parece certo na tela do
 * editor e chega ao paciente com chaves soltas.
 */
export function hasUnbalancedBraces(body: string): boolean {
  const opens = (body.match(/\{\{/g) ?? []).length
  const closes = (body.match(/\}\}/g) ?? []).length
  if (opens !== closes) return true

  // Mesmo número dos dois lados, mas nem todo par forma um marcador válido:
  // `{{ nome do paciente }}` tem espaço e não casa com o padrão.
  const valid = [...body.matchAll(VARIABLE_PATTERN)].length
  return valid !== opens
}

/** Ativos primeiro, e em ordem alfabética dentro de cada grupo. */
export function sortTemplates<T extends { isActive: boolean; name: string }>(
  templates: readonly T[],
): T[] {
  return [...templates].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    return left.name.localeCompare(right.name, 'pt-BR')
  })
}

/** As categorias em uso, para o filtro — nunca uma lista inventada. */
export function templateCategories(templates: readonly MessageTemplate[]): string[] {
  const found = new Set<string>()
  for (const template of templates) {
    if (template.category) found.add(template.category)
  }
  return [...found].sort((left, right) => left.localeCompare(right, 'pt-BR'))
}

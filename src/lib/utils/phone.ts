/**
 * Telefone: uma forma canonica no banco, uma forma legivel na tela.
 *
 * Por que normalizar na escrita, e nao depois: `patients.phone` e o identificador
 * de contato que a recepcionista digital vai consultar (modulo whatsapp, roadmap
 * P3). Se cada cadastro gravar a mascara que o usuario digitou — '(11) 98812-4471',
 * '11988124471', '+55 11 98812 4471' — a mesma pessoa vira tres registros
 * diferentes para qualquer busca, e arrumar isso depois vira migration de dado.
 *
 * A escolha e guardar so digitos (DDD + numero) e formatar na leitura. O codigo do
 * pais sai da forma armazenada porque hoje o produto e nacional; quando deixar de
 * ser, o lugar de mudar e este arquivo.
 */

/** So os digitos — descarta mascara, espaco e o '+' do codigo do pais. */
export function toPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Forma canonica de um telefone brasileiro: 10 digitos (fixo com DDD) ou 11
 * (celular com DDD). Devolve null quando o valor nao chega la — quem chama decide
 * se isso e erro de validacao ou apenas ausencia de telefone.
 */
export function normalizePhone(raw: string): string | null {
  const digits = toPhoneDigits(raw)
  if (!digits) return null

  // '+55 11 98812-4471' e '55 11 98812-4471' chegam com o codigo do pais colado.
  const withoutCountry =
    (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
      ? digits.slice(2)
      : digits

  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) return null

  return withoutCountry
}

/**
 * Forma de exibicao.
 *
 * Formata **apenas o que este modulo gravou**: digitos puros, 10 ou 11. Qualquer
 * outra coisa volta intacta.
 *
 * A restricao nao e preciosismo. Extrair digitos antes de decidir fazia
 * `+1 415 555 0134` — 11 digitos — virar `(14) 15555-0134`: um numero
 * estrangeiro reescrito como celular brasileiro na tela. Linha vinda de
 * importacao ou de cadastro antigo tem de sair como esta no banco.
 *
 * Limite conhecido: um numero estrangeiro gravado so em digitos e indistinguivel
 * de um brasileiro. Resolver isso exige coluna de pais, que o schema nao tem.
 */
export function formatPhone(stored: string): string {
  if (!/^\d{10,11}$/.test(stored)) return stored

  if (stored.length === 11) {
    return `(${stored.slice(0, 2)}) ${stored.slice(2, 7)}-${stored.slice(7)}`
  }

  return `(${stored.slice(0, 2)}) ${stored.slice(2, 6)}-${stored.slice(6)}`
}

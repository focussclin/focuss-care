/**
 * Dinheiro em CENTAVOS — inteiro, sempre.
 *
 * O roadmap fixa a regra (§3, módulo `billing`): valores em `*_cents`, sem ponto
 * flutuante. `0.1 + 0.2` em JavaScript dá `0.30000000000000004`, e uma clínica
 * que fecha o caixa com três centavos de diferença todo dia perde a confiança no
 * número — que é a única coisa que um caixa precisa ter.
 *
 * Este arquivo é a fronteira entre o inteiro do banco e o texto da tela. Nenhuma
 * conta acontece aqui em ponto flutuante: a única divisão é na FORMATAÇÃO, onde
 * o resultado já não volta para o banco.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** 12345 -> 'R$ 123,45'. */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100)
}

/**
 * O que o usuário digitou -> centavos.
 *
 * Aceita as formas que uma recepção realmente digita: '123,45', '123.45',
 * 'R$ 1.234,56' e '1234'. Devolve `null` quando não dá para entender — e
 * **`null` não é zero**: aceitar um valor ilegível como 0 registraria um
 * pagamento de nada como se fosse um pagamento.
 *
 * A conversão evita ponto flutuante no caminho crítico: separa a parte inteira
 * da decimal por texto e só então multiplica por 100.
 */
export function parseCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  // Tira símbolo de moeda e espaços; guarda o sinal.
  const negative = trimmed.startsWith('-')
  const digitsOnly = trimmed.replace(/[^\d.,]/g, '')
  if (digitsOnly === '') return null

  /*
   * Qual separador é o decimal?
   *
   * Em pt-BR a vírgula é decimal e o ponto é milhar ('1.234,56'). Quando só há
   * ponto, ele pode ser qualquer um dos dois: '1.234' é mil duzentos e trinta e
   * quatro, e '12.34' é doze e trinta e quatro. A regra abaixo decide pelo
   * tamanho do último grupo — dois dígitos depois do ponto é decimal, três é
   * milhar. É a mesma heurística que planilha usa, e erra apenas em entrada
   * ambígua de verdade ('1.234' com intenção de R$ 1,234 não existe).
   */
  const lastComma = digitsOnly.lastIndexOf(',')
  const lastDot = digitsOnly.lastIndexOf('.')

  let decimalSeparator: ',' | '.' | null = null
  if (lastComma >= 0) decimalSeparator = ','
  else if (lastDot >= 0 && digitsOnly.length - lastDot - 1 <= 2) {
    decimalSeparator = '.'
  }

  let integerPart = digitsOnly
  let decimalPart = ''

  if (decimalSeparator) {
    const index =
      decimalSeparator === ',' ? lastComma : digitsOnly.lastIndexOf('.')
    integerPart = digitsOnly.slice(0, index)
    decimalPart = digitsOnly.slice(index + 1)
  }

  integerPart = integerPart.replace(/\D/g, '')
  decimalPart = decimalPart.replace(/\D/g, '')

  if (integerPart === '' && decimalPart === '') return null
  // Mais de dois dígitos decimais não é dinheiro: é digitação errada.
  if (decimalPart.length > 2) return null

  const cents =
    Number(integerPart || '0') * 100 + Number(decimalPart.padEnd(2, '0') || '0')

  if (!Number.isFinite(cents)) return null

  return negative ? -cents : cents
}

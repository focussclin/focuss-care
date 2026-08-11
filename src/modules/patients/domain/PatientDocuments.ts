/**
 * O grupo DOCUMENTAL do paciente — CPF, CNS e endereço.
 *
 * As três colunas existem no schema desde o primeiro dia e **nunca foram
 * escritas**. §8.35 registrou por que ficaram de fora: o grupo pertence ao
 * faturamento, e gravar identificador fiscal sem validação de dígito e sem
 * política de duplicidade acumula risco sem contrapartida. Este arquivo é a
 * primeira das duas condições; a segunda vive na action, que confere se o CPF já
 * é de outro paciente da clínica.
 *
 * # Por que validar aqui, e não confiar no que foi digitado
 *
 * CPF errado não é erro de digitação inofensivo: ele viaja para a nota fiscal,
 * para a guia do convênio e para o pedido de exame. Quando a recusa chega, o
 * atendimento já aconteceu — e o retrabalho é de quem cobra, não de quem digitou.
 * O dígito verificador existe exatamente para pegar isso no balcão.
 *
 * # Guardado em dígitos, exibido formatado
 *
 * Mesma decisão de `lib/utils/phone`: a máscara é da tela. Guardar
 * `123.456.789-09` faria a mesma pessoa existir duas vezes na base — uma com
 * pontos, outra sem — e a checagem de duplicidade não encontraria nenhuma das
 * duas.
 */

import type { PatientAddress } from '@/modules/_shared/domain/types'

/** Tudo que não é dígito sai. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * CPF válido? Dígito verificador conferido, não formato.
 *
 * A sequência repetida (`111.111.111-11`) **passa** no cálculo do módulo 11 e é
 * inválida por definição da Receita. Sem esta recusa explícita, `00000000000`
 * entraria na base como CPF legítimo — e é justamente o que alguém digita para
 * pular o campo.
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value)

  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const checkDigit = (length: number): number => {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index)
    }

    const remainder = ((sum * 10) % 11) % 10
    return remainder
  }

  return (
    checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10])
  )
}

/** `12345678909` -> `123.456.789-09`. Valor fora de 11 dígitos volta como veio. */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return value

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * CNS válido? — Cartão Nacional de Saúde, 15 dígitos.
 *
 * São **duas** regras, e o primeiro dígito diz qual vale:
 *
 *  - `1` e `2` são cartões definitivos: os 11 primeiros dígitos formam o PIS, e o
 *    fim do número é calculado a partir dele.
 *  - `7`, `8` e `9` são provisórios: a soma ponderada dos 15 dígitos precisa ser
 *    múltipla de 11.
 *
 * Qualquer outro início não é CNS. Tratar as duas famílias como uma só recusaria
 * metade dos cartões reais — e um cartão recusado no balcão vira "o sistema não
 * aceita", que é como um campo válido deixa de ser preenchido.
 */
export function isValidCns(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 15) return false

  const weightedSum = (source: string): number => {
    let sum = 0
    for (let index = 0; index < source.length; index += 1) {
      sum += Number(source[index]) * (15 - index)
    }
    return sum
  }

  const first = digits[0]

  if (first === '7' || first === '8' || first === '9') {
    return weightedSum(digits) % 11 === 0
  }

  if (first !== '1' && first !== '2') return false

  const pis = digits.slice(0, 11)
  let sum = weightedSum(pis)
  let remainder = sum % 11
  let check = 11 - remainder

  if (check === 11) check = 0

  /*
   * Dígito 10 não existe: o padrão manda somar 2 à ponderação e recalcular, e o
   * cartão passa a terminar em `001`. Sem este ramo, todo CNS dessa família seria
   * recusado — e não são poucos.
   */
  if (check === 10) {
    sum += 2
    remainder = sum % 11
    check = 11 - remainder
    return digits === `${pis}001${check}`
  }

  return digits === `${pis}000${check}`
}

/** `123456789012345` -> `123 4567 8901 2345`. */
export function formatCns(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length !== 15) return value

  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)} ${digits.slice(11)}`
}

/** As 27 unidades federativas. Fechado: sigla inventada não vira endereço. */
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
] as const

export type BrazilianState = (typeof BRAZILIAN_STATES)[number]

export function isBrazilianState(value: string): value is BrazilianState {
  return (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase())
}

/** CEP tem oito dígitos. Formato, não existência — não há consulta a base alguma. */
export function isValidZip(value: string): boolean {
  return onlyDigits(value).length === 8
}

/** `01310930` -> `01310-930`. */
export function formatZip(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length !== 8) return value

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/**
 * O endereço em uma linha, para a ficha.
 *
 * Campo em branco **some** em vez de virar travessão — mesma regra da linha de
 * item da prescrição. Um endereço com "—" no meio parece cadastro corrompido; o
 * que falta simplesmente não é dito.
 */
export function formatAddress(address: PatientAddress): string {
  const streetLine = [address.street, address.number, address.complement]
    .filter((part) => part !== null && part !== '')
    .join(', ')

  const cityLine = [address.district, address.city, address.state]
    .filter((part) => part !== null && part !== '')
    .join(' · ')

  const zip = address.zip ? `CEP ${formatZip(address.zip)}` : ''

  return [streetLine, cityLine, zip].filter((part) => part !== '').join(' — ')
}

/**
 * O endereço tem o mínimo para servir de endereço?
 *
 * Rua, cidade e UF. Sem os três não dá para mandar nada nem localizar ninguém —
 * e um endereço com só "apto 42" ocupa a ficha afirmando que a pessoa tem
 * endereço cadastrado.
 *
 * **Número não entra**: "s/n" é endereço real em zona rural e em muita via
 * antiga, e exigi-lo faria o balcão inventar um número.
 */
export function hasMinimumAddress(address: PatientAddress): boolean {
  return Boolean(address.street && address.city && address.state)
}

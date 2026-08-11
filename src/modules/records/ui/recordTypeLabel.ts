import { recordTypeOptions } from '../schemas/record.schema'

/**
 * Como um tipo de registro é nomeado na tela.
 *
 * Vive fora dos componentes porque duas superfícies mostram o mesmo rótulo —
 * a lista de `/prontuarios` e o painel da ficha do paciente. Duas cópias
 * divergiriam, e o dia em que divergissem o mesmo registro apareceria como
 * "Evolução clínica" numa tela e "Evolução" na outra.
 *
 * `Map<string, string>` de propósito, e o fallback é o ponto: o DTO traz
 * `recordType` como string porque o enum do banco tem mais valores do que o
 * formulário oferece (`exam_request`, `referral`, `certificate`). Um registro
 * importado ou criado por outra via precisa **aparecer na lista**, não sumir
 * dela — por isso o valor cru é exibido quando não há rótulo, em vez de a linha
 * virar um espaço em branco.
 */
const labels = new Map<string, string>(
  recordTypeOptions.map((option) => [option.value, option.label]),
)

export function recordTypeLabel(recordType: string): string {
  return labels.get(recordType) ?? recordType
}

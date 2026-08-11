import { preferredPatientName } from '@/lib/patients/preferred-name'
import type { BiologicalSex } from '@/lib/supabase/database.types'
import type { EmergencyContact } from '@/modules/_shared/domain/types'

export type { EmergencyContact }

/**
 * Identificação do paciente — quem a pessoa é e como chamá-la.
 *
 * # O que estava faltando
 *
 * `PatientRepository` já registrava a dívida: "CPF, CNS, endereco, contato de
 * emergencia e foto ficam para a fatia de edicao". O cadastro gravava cinco
 * campos e preenchia o resto com constante — `biological_sex: 'not_informed'`
 * em toda linha, três dos quatro valores do enum inalcançáveis pela aplicação
 * inteira.
 *
 * # Nome social não é apelido
 *
 * `patients.social_name` existe separado de `full_name` porque são coisas
 * diferentes: um é como a pessoa é chamada, o outro é o que está no documento.
 * Chamar alguém pelo nome de registro na sala de espera, quando existe nome
 * social, é o dano que a coluna existe para evitar.
 *
 * # Sexo biológico e identidade de gênero são campos distintos
 *
 * O schema já os separa — `biological_sex` é enum fechado, `gender_identity` é
 * texto livre — e a separação é correta: o primeiro tem uso clínico (faixa de
 * referência de sinal vital, dose), o segundo é autodeclaração. Colapsá-los num
 * campo só produziria um dado que não serve para nenhum dos dois fins.
 *
 * Nenhum dos dois é filtrado por papel. Foi uma decisão, não um esquecimento:
 * nome social e identidade de gênero existem justamente para que **todo mundo
 * que atende** use o tratamento certo, e escondê-los da recepção derrotaria o
 * propósito. Sexo biológico está em qualquer carteirinha e a recepção precisa
 * dele para preencher pedido de exame e guia de convênio.
 */

/**
 * Os quatro valores de `biological_sex`, com o rótulo que a ficha mostra.
 *
 * `not_informed` é opção de verdade, e a primeira: é o estado de toda linha
 * criada antes desta fatia, e continua sendo a resposta honesta quando ninguém
 * perguntou. Forçar uma escolha inventaria dado clínico.
 */
export const BIOLOGICAL_SEX_VALUES = [
  'not_informed',
  'female',
  'male',
  'intersex',
] as const satisfies readonly BiologicalSex[]

const BIOLOGICAL_SEX_LABELS: Record<BiologicalSex, string> = {
  not_informed: 'Não informado',
  female: 'Feminino',
  male: 'Masculino',
  intersex: 'Intersexo',
}

export const BIOLOGICAL_SEX_OPTIONS = BIOLOGICAL_SEX_VALUES.map((value) => ({
  value,
  label: BIOLOGICAL_SEX_LABELS[value],
}))

export function biologicalSexLabel(value: BiologicalSex): string {
  return BIOLOGICAL_SEX_LABELS[value] ?? BIOLOGICAL_SEX_LABELS.not_informed
}

/**
 * As regras do contato de emergência.
 *
 * O TIPO mora em `_shared/domain/types.ts` porque `Patient` o carrega e
 * `_shared` não importa de módulo nenhum; as regras ficam aqui. A forma é
 * definida pela aplicação e relida na leitura — mesma disciplina de
 * `workflows.trigger_config`. Não é adivinhação de convenção alheia: nenhuma
 * linha tinha valor, porque nada escrevia nesta coluna.
 */

/**
 * Um contato de emergência sem telefone não serve para nada.
 *
 * O nome sozinho não permite avisar ninguém, e é numa emergência que alguém vai
 * procurar este campo. Ou tem nome e telefone, ou não há contato.
 */
export function isUsableEmergencyContact(
  contact: Pick<EmergencyContact, 'name' | 'phone'>,
): boolean {
  return contact.name.trim() !== '' && (contact.phone?.trim() ?? '') !== ''
}

/**
 * Como o paciente deve ser chamado.
 *
 * Nome social vence sempre que existir. É esta função que decide, e não cada
 * tela: espalhar `socialName ?? name` é como uma delas acaba mostrando o nome de
 * registro.
 */
export function preferredName(patient: {
  name: string
  socialName?: string | null
}): string {
  /*
   * Delega para `lib/patients/preferred-name`, que e onde a regra passou a
   * morar: os outros nove modulos que exibem nome de paciente nao podem
   * importar o interior deste. A assinatura daqui continua em `name` porque e a
   * forma da entidade `Patient`; la o campo e `fullName`, que e a forma da
   * linha do banco.
   */
  return preferredPatientName({
    fullName: patient.name,
    socialName: patient.socialName,
  })
}

/**
 * O nome de registro precisa aparecer junto?
 *
 * Sim, quando difere do social — quem confere documento, guia de convênio ou
 * receita precisa dos dois, e some-lo esconderia justamente a informação que
 * torna a conferência possível. Mostrar os dois é diferente de chamar pelo
 * errado.
 */
export function showsLegalName(patient: {
  name: string
  socialName?: string | null
}): boolean {
  const social = patient.socialName?.trim()
  return Boolean(social) && social !== patient.name
}

/**
 * O perfil de quem usa o sistema.
 *
 * # Uma pessoa, não um vínculo
 *
 * `profiles` é a PESSOA: o nome que aparece no topo da tela e no prontuário que
 * ela assina, e o telefone pelo qual a clínica a encontra. É diferente de
 * `memberships`, que é o vínculo com UMA clínica — a mesma pessoa pode ser
 * `owner` numa e `professional` em outra, e continua tendo um nome só.
 *
 * Por isso editar o próprio perfil **não passa por papel**: não há papel que
 * autorize alguém a ter nome. Ver `ProfileRepository`.
 */
export interface Profile {
  id: string
  fullName: string
  /** Vem do Supabase Auth. **Somente leitura aqui** — ver a porta. */
  email: string
  /** Dígitos canônicos (DDD + número), ou null. A tela formata. */
  phone: string | null
}

/** O que a pessoa pode alterar do próprio perfil. */
export interface ProfileInput {
  fullName: string
  phone: string | null
}

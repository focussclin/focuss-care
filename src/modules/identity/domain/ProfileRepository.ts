import type { Profile, ProfileInput } from './Profile'

/**
 * PORTA do perfil pessoal.
 *
 * # O que NÃO está aqui
 *
 * **Não há troca de e-mail.** `profiles.email` é uma cópia do que está no
 * Supabase Auth, e é o Auth que decide o que é um e-mail válido para entrar:
 * trocar exige `auth.updateUser` e a confirmação no endereço novo. Escrever
 * direto na coluna deixaria as duas fontes divergentes — a pessoa veria o
 * e-mail novo na tela e continuaria entrando com o antigo. A tela mostra o
 * e-mail e diz por que ele não se edita ali.
 *
 * **Não há foto.** `avatar_url` existe na tabela, e upload exige um bucket de
 * Storage cuja configuração não é verificável deste ambiente (bloqueio B1).
 *
 * **Não há `active_clinic_id`.** É a clínica ativa, e quem a troca é
 * `switch_clinic` (I-03). Deixá-la num formulário de perfil permitiria mudar de
 * tenant por um campo de texto.
 *
 * **Não há `delete`.** Apagar o perfil deixaria prontuário assinado por
 * ninguém. Encerrar a participação numa clínica é revogar o vínculo (S-01).
 */
export interface ProfileRepository {
  /** O perfil de um usuário. `null` quando a linha ainda não existe. */
  findById(userId: string): Promise<Profile | null>

  /**
   * Atualiza o próprio perfil.
   *
   * `userId` é parâmetro, e vem do `ActionContext` — **nunca da entrada**. É a
   * única defesa que importa aqui: sem ela, um `userId` no formulário deixaria
   * qualquer pessoa renomear qualquer outra.
   */
  update(userId: string, input: ProfileInput): Promise<Profile>
}

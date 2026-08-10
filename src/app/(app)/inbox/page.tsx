import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'

import {
  assignConversationFromScreen,
  markConversationReadFromScreen,
  setConversationStatusFromScreen,
} from '@/modules/inbox/actions/inboxScreen.actions'
import { groupMessagesByConversation } from '@/modules/inbox/application/groupMessages'
import { toInboxConversationDto } from '@/modules/inbox/application/toInboxDto'
import type { InboxConversation, InboxMessage } from '@/modules/inbox/domain/Inbox'
import { isInboxRepositoryError } from '@/modules/inbox/domain/InboxRepositoryError'
import { getInboxRepository } from '@/modules/inbox/infrastructure/repository'
import { inboxMessages } from '@/modules/inbox/schemas/inbox.schema'
import { InboxScreen } from '@/modules/inbox/ui/InboxScreen'
import { getTeamRepository } from '@/modules/team/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Inbox de atendimento',
  description: 'Conversas da clínica organizadas para a equipe.',
}

export default async function InboxPage() {
  await connection()

  const [source, role] = await Promise.all([
    getInboxRepository(),
    getActiveClinicRole(),
  ])

  if (source.isLive && !can(role, 'encounter.read')) forbidden()

  let conversations: InboxConversation[] = []
  let messages: InboxMessage[] = []
  let loadError: string | null = null

  /*
   * A rota carregava sem `try`: qualquer falha do repositório derrubava a
   * página inteira no boundary de erro. `conversations` já existe no banco
   * aplicado, então o que aparece aqui é queda de rede ou recusa de policy — e
   * nos dois casos a tela consegue dizer o que houve em vez de sumir.
   */
  try {
    conversations = await source.repository.listConversations(source.clinicId)
    messages = await source.repository.listMessages(
      source.clinicId,
      conversations.map((conversation) => conversation.id),
    )
  } catch (cause) {
    if (!isInboxRepositoryError(cause)) throw cause
    loadError =
      cause.reason === 'forbidden' ? inboxMessages.forbidden : inboxMessages.unavailable
  }

  /*
   * A lista de responsáveis é composta AQUI, e não dentro do módulo.
   *
   * `inbox` não pode importar as entranhas de `team` (regra 4 de boundaries), e
   * a rota é o lugar onde os dois se encontram. Se o time não carregar, a Inbox
   * continua funcionando sem o seletor — perder o atendimento inteiro por causa
   * da lista de nomes seria trocar um problema pequeno por um grande.
   */
  let assignees: { id: string; name: string }[] = []

  if (source.isLive && can(role, 'encounter.write')) {
    try {
      const team = await getTeamRepository()
      const members = await team.repository.listMembers(team.clinicId)
      assignees = members
        .filter((member) => member.status === 'active')
        .map((member) => ({ id: member.userId, name: member.name }))
    } catch {
      assignees = []
    }
  }

  const messagesByConversation = groupMessagesByConversation(messages)

  return (
    <InboxScreen
      conversations={conversations.map((conversation) =>
        toInboxConversationDto(
          conversation,
          messagesByConversation.get(conversation.id) ?? [],
        ),
      )}
      assignees={assignees}
      onChangeStatus={setConversationStatusFromScreen}
      onAssign={assignConversationFromScreen}
      onMarkRead={markConversationReadFromScreen}
      isLive={source.isLive && can(role, 'encounter.write')}
      loadError={loadError}
    />
  )
}

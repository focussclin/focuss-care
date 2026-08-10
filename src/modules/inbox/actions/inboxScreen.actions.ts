'use server'

import type { ConversationStatus } from '@/lib/supabase/database.types'

import { assignConversationAction } from './assignConversation.action'
import { markConversationReadAction } from './markConversationRead.action'
import { setConversationStatusAction } from './setConversationStatus.action'

export async function setConversationStatusFromScreen(
  conversationId: string,
  status: ConversationStatus,
): Promise<string | null> {
  const result = await setConversationStatusAction({ conversationId, status })
  return result.ok ? null : result.error.message
}

export async function assignConversationFromScreen(
  conversationId: string,
  assigneeId: string | null,
): Promise<string | null> {
  const result = await assignConversationAction({ conversationId, assigneeId })
  return result.ok ? null : result.error.message
}

export async function markConversationReadFromScreen(
  conversationId: string,
): Promise<string | null> {
  const result = await markConversationReadAction({ conversationId })
  return result.ok ? null : result.error.message
}

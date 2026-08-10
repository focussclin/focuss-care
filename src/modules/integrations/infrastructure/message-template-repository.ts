import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { MessageTemplate } from '../domain/MessageTemplate'
import {
  MessageTemplateError,
  type MessageTemplateRepository,
} from '../domain/MessageTemplateRepository'
import { SupabaseMessageTemplateRepository } from './SupabaseMessageTemplateRepository'

/** Demonstração começa vazia: um modelo fictício viraria texto enviado a paciente. */
class EmptyMessageTemplateRepository implements MessageTemplateRepository {
  async list(): Promise<MessageTemplate[]> {
    return []
  }

  async create(): Promise<MessageTemplate> {
    throw readOnly()
  }

  async update(): Promise<MessageTemplate> {
    throw readOnly()
  }

  async setActive(): Promise<MessageTemplate> {
    throw readOnly()
  }
}

function readOnly(): MessageTemplateError {
  return new MessageTemplateError('unavailable', 'demo repository is read-only')
}

export async function getMessageTemplateSource(): Promise<{
  repository: MessageTemplateRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseMessageTemplateRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyMessageTemplateRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function messageTemplateRepositoryFor(
  client: SupabaseClient<Database>,
): MessageTemplateRepository {
  return new SupabaseMessageTemplateRepository(client)
}

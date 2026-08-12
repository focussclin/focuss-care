import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { WhatsappConnection } from '../domain/WhatsappConnection'

/**
 * Reflete no banco o estado que o PROVEDOR relatou.
 *
 * # Por que a gravação é condicional
 *
 * `whatsapp_channels.phone_number` é NOT NULL, e o número só existe depois do
 * pareamento. Enquanto o QR não é lido não há linha a gravar — e inventar um
 * placeholder ('', 'pendente') criaria um canal que a tela leria como
 * configurado, com um número que não recebe mensagem nenhuma.
 *
 * O estado enquanto isso vive no provedor, que é a fonte de verdade sobre a
 * conexão. O banco guarda o que ficou: qual número está pareado.
 *
 * # Best-effort, e isso é deliberado
 *
 * Falhar aqui não pode derrubar a conexão que acabou de ser feita. O pareamento
 * já aconteceu no WhatsApp da pessoa; devolver erro faria ela ler o QR de novo
 * sem necessidade. O desencontro se resolve na consulta seguinte.
 */
export async function saveConnectedChannel(
  client: SupabaseClient<Database>,
  clinicId: string,
  connection: WhatsappConnection,
): Promise<void> {
  try {
    if (connection.state === 'connected' && connection.phoneNumber) {
      const { data: existing, error: lookupError } = await client
        .from('whatsapp_channels')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('provider', 'evolution')
        .maybeSingle()

      if (lookupError) throw lookupError

      const row = {
        clinic_id: clinicId,
        display_name: connection.instanceName,
        phone_number: connection.phoneNumber,
        provider: 'evolution' as const,
        // Guarda o vínculo com a instância — é o que permite reconhecer o canal
        // depois, mesmo que o número mude de aparelho.
        provider_config: { instanceName: connection.instanceName },
        is_active: true,
        connected_at: new Date().toISOString(),
      }

      if (existing) {
        const { error } = await client
          .from('whatsapp_channels')
          .update(row)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await client.from('whatsapp_channels').insert(row)
        if (error) throw error
      }

      return
    }

    /*
     * Desconectado: a linha PERMANECE, com `is_active: false`.
     *
     * Apagar perderia o histórico de qual número a clínica usava — e as
     * conversas em `conversations` continuam apontando para o canal.
     */
    if (connection.state === 'disconnected') {
      const { error } = await client
        .from('whatsapp_channels')
        .update({ is_active: false, connected_at: null })
        .eq('clinic_id', clinicId)
        .eq('provider', 'evolution')
      if (error) throw error
    }
  } catch (cause) {
    console.error('[whatsapp] nao foi possivel refletir o canal no banco', {
      kind: cause instanceof Error ? cause.name : typeof cause,
    })
  }
}

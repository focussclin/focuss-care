# Focuss Care — design do CRM e Leads

> **Status em 09/08/2026:** rota, pipeline, actions, adapter e testes locais
> implementados. A migration `supabase/migrations/20260809_clinic_leads.sql`
> ainda não foi aplicada; por isso o item permanece bloqueado e a interface não
> promete persistência antes do banco existir.

## Decisões de produto

- Lead é separado de paciente: pode nunca converter.
- O pipeline usa sete etapas: Novo, Contatado, Qualificado, Agendamento,
  Compareceu, Convertido e Perdido.
- Toda mudança de etapa grava `lead_events`; não existe exclusão física.
- Valor potencial é armazenado em centavos.
- A equipe pode criar e mover leads; autorização por papel mais restrita fica
  para uma decisão posterior do RBAC.
- Follow-up automático, WhatsApp e conversão assistida não são afirmados nesta
  fatia: dependem dos módulos de comunicação e automação.

## Estados da tela

- Pipeline Kanban horizontal no desktop e com rolagem controlada no mobile.
- Busca por nome, contato, origem, campanha ou interesse.
- Filtros por etapa e responsável.
- Estado vazio sem leads e estado sem resultado após filtros.
- Banner de migration pendente e modo demonstração sem dados fictícios.


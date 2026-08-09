# Inbox de atendimento

## Escopo entregue

`/inbox` é a primeira fatia vertical do Inbox: leitura real das conversas e
mensagens já persistidas em `conversations` e `messages`.

- filtro explícito por `clinic_id` em todas as leituras;
- conversas carregadas em uma consulta, com paciente e responsável;
- mensagens carregadas em lote para evitar uma consulta por conversa;
- busca por nome, telefone ou paciente;
- filtro por status;
- detalhe responsivo com histórico e link para a ficha do paciente;
- estado vazio sem dados fictícios;
- fallback de demonstração sem inventar conversas;
- limite documentado de 100 conversas e 500 mensagens por carregamento.

## Limite intencional

O envio, a ingestão de webhooks, a atualização de não lidas e a mudança de
status ainda não são expostos. O schema já existente não é suficiente para
conectar um canal real sozinho: é necessário definir o provedor de WhatsApp,
validar a assinatura do webhook e executar um worker idempotente para gravar
eventos em `messages`.

Até essa dependência existir, a rota permanece em andamento e o item continua
fora do menu operacional para não sugerir uma função que ainda não funciona.

## Próxima fatia

Depois de provisionar W-01, a sequência recomendada é:

1. adapter de provedor e validação de webhook;
2. ingestão idempotente de mensagens;
3. ações de envio e alteração de status com autorização tenant-scoped;
4. realtime e atualização de não lidas;
5. testes de contrato do provedor e testes de isolamento entre clínicas.

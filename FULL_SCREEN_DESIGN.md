# Focuss Care — handoff visual completo

Este documento complementa `LOGIN_DESIGN.md`, `DASHBOARD_DESIGN.md`, `AGENDA_DESIGN.md` e `PATIENTS_DESIGN.md`. A implementação deve usar uma única linguagem visual, navegação consistente e dados mockados quando integrações reais ainda não existirem.

## 1. Sistema visual compartilhado

### Direção

O Focuss Care deve parecer um espaço de trabalho calmo, humano e confiável para clínicas. A interface é clara, com muito respiro, verde profundo como âncora de marca e informações agrupadas em cartões leves.

### Tokens

- Fundo: `#F5F7F5`.
- Superfície: `#FFFFFF`.
- Verde principal: `#173F35`.
- Verde de ação: `#245C48`.
- Verde de foco: `#3C8C70`.
- Verde suave: `#E5F1E9`.
- Texto: `#1C2B25`.
- Texto secundário: `#61706A`.
- Borda: `#E1E9E4`.
- Atenção: `#8B5E18` sobre `#FFF1D6`.
- Erro: `#9B3D3D` sobre `#F8E2E2`.
- Sucesso: `#245C48` sobre `#DCEBE3`.
- Fonte: Geist.
- Raios: 10px em controles, 12px em inputs, 16px em cards.
- Controles: altura mínima de 44px; botão primário geralmente 52px.

### Casca autenticada

Desktop: sidebar de 248px em `#173F35`, conteúdo com topbar e área principal em `#F5F7F5`.

Sidebar:

1. Visão geral
2. Agenda
3. Pacientes
4. Atendimentos
5. Financeiro
6. Convênios
7. Funcionários
8. Relatórios
9. Chat IA
10. WhatsApp
11. Automações
12. Configurações

Itens que ainda não estiverem disponíveis devem usar o mesmo componente de navegação, nunca links quebrados. Mobile usa topbar com menu drawer.

Topbar:

- Seletor de clínica ativa.
- Busca global opcional.
- Notificações.
- Avatar e menu do usuário.

## 2. Fluxo de autenticação

### Cadastro — `/cadastro`

Usar o mesmo layout do login, sem sidebar.

- Título: `Comece a cuidar melhor da sua clínica`.
- Texto: `Crie seu espaço e convide sua equipe quando estiver pronto.`
- Campos: nome completo, e-mail profissional, senha e nome da clínica.
- Checkbox obrigatório: `Concordo com os termos de uso e a política de privacidade.`
- CTA: `Criar minha conta`.
- Link: `Já tenho uma conta`.
- Após o cadastro, abrir onboarding da clínica.

### Recuperar senha — `/recuperar-senha`

- Título: `Recupere seu acesso`.
- Texto: `Enviaremos um link para o e-mail cadastrado.`
- Campo de e-mail.
- CTA: `Enviar link de recuperação`.
- Link: `Voltar para o login`.
- Sucesso: `Confira seu e-mail para continuar.`
- Não revelar se um e-mail existe ou não no sistema.

### Nova senha — `/nova-senha`

- Título: `Crie uma nova senha`.
- Campos: nova senha e confirmar senha.
- Indicador de requisitos em lista curta.
- CTA: `Salvar nova senha`.
- Sucesso: `Senha atualizada. Você já pode entrar.` + `Ir para o login`.

### Onboarding — `/onboarding`

Fluxo em três passos, com indicador superior:

1. `Sobre sua clínica`: nome, especialidade e cidade.
2. `Sua equipe`: adicionar profissionais ou pular.
3. `Primeiro atendimento`: criar um atendimento de demonstração ou ir para o dashboard.

Mostrar progresso sem bloquear o usuário em informações não essenciais. Sempre exibir `Salvar e continuar` e `Pular por agora` quando possível.

## 3. Atendimentos — `/atendimentos`

Tela operacional para acompanhar o que está acontecendo agora, separada da agenda.

- Título: `Atendimentos`.
- Abas: `Hoje`, `Fila de espera`, `Histórico`.
- Filtros: profissional, status e tipo de atendimento.
- CTA: `Iniciar atendimento`.

### Fila de hoje

Cards ou tabela leve com horário, paciente, profissional, tipo e status. Status principais:

- `Aguardando` — amarelo suave.
- `Em atendimento` — verde profundo.
- `Concluído` — cinza suave.
- `Não compareceu` — vermelho suave.

Para cada paciente, ações `Chamar`, `Iniciar`, `Ver paciente` e menu secundário. Exibir um relógio ou tempo de espera com texto, nunca apenas cor.

### Tela de atendimento

Layout focado, com cabeçalho do paciente e cronômetro discreto. Abas `Resumo`, `Anotações`, `Documentos`. A ação final deve ser `Finalizar atendimento`; confirmar antes de sair se houver anotações não salvas.

## 4. Prontuário — `/pacientes/[patientId]/prontuario`

Área sensível e visualmente mais contida.

- Cabeçalho com nome do paciente, idade, alertas importantes e botão voltar.
- Abas: `Visão geral`, `Evoluções`, `Documentos`, `Histórico de acesso`.
- Banner discreto: `Informações protegidas. O acesso é registrado.`
- CTA principal: `Nova evolução`.

### Evoluções

Linha do tempo em ordem decrescente, com data, profissional, tipo e texto resumido. Cada registro assinado mostra `Assinado por [nome] em [data]` e não oferece edição destrutiva.

### Nova evolução

Painel com tipo de atendimento, texto da evolução, anexos e botão `Revisar e assinar`. A assinatura deve ser tratada como ação importante, com confirmação final.

## 5. Financeiro — `/financeiro`

Dashboard financeiro simples, sem aparência de planilha.

- Título: `Financeiro`.
- Seletor de período.
- CTA `+ Nova movimentação`.
- Cards: `Receitas`, `A receber`, `Despesas`, `Saldo do período`.
- Gráfico de barras ou linha com leitura simples de receitas e despesas.
- Tabela de últimas movimentações com data, descrição, categoria, valor e status.

Estados financeiros usam verde para entradas e vermelho somente para saídas/alertas. Valores monetários devem ser alinhados à direita e formatados em real brasileiro.

### Nova movimentação

Modal com tipo receita/despesa, descrição, categoria, valor, data, paciente opcional e observação. CTA `Salvar movimentação`.

### Financeiro do paciente — `/pacientes/[patientId]/financeiro`

Resumo de valores do paciente, cobranças pendentes, histórico e CTA `Registrar pagamento`. Não exibir dados financeiros como se fossem prontuário.

## 6. Convênios — `/convenios`

- Título: `Convênios`.
- Texto: `Gerencie operadoras, tabelas e o acompanhamento dos atendimentos.`
- Cards: convênios ativos, guias pendentes e glosas em análise.
- Lista de operadoras com nome, pacientes vinculados, tabela vigente e status.
- CTA `+ Adicionar convênio`.

Detalhe do convênio com abas `Dados`, `Tabela de valores`, `Guias`, `Glosas`. Estado vazio deve explicar o benefício de cadastrar o primeiro convênio.

## 7. Funcionários — `/funcionarios`

- Título: `Equipe`.
- Texto: `Organize as pessoas que fazem o cuidado acontecer.`
- CTA `+ Convidar profissional`.
- Cards: membros ativos, convites pendentes e profissionais disponíveis hoje.
- Tabela/lista com avatar, nome, função, e-mail, status e última atividade.
- Filtros por função e status.

### Convite

Modal com nome, e-mail, função e permissões resumidas. Mostrar claramente que o convite será enviado por e-mail.

### Detalhe e permissões

Painel com perfil, agenda de trabalho e matriz simples de permissões. Não usar uma tabela enorme; agrupar por `Pacientes`, `Agenda`, `Financeiro` e `Prontuários`. Prontuário deve ter aviso de acesso sensível.

## 8. Relatórios — `/relatorios`

Tela de entrada com cards de relatórios, não um mural de gráficos.

- Título: `Relatórios`.
- Seletor de período global.
- Cards: atendimentos, pacientes, financeiro e desempenho da equipe.
- Cada card possui título, descrição e CTA `Abrir relatório`.

### Relatório aberto

Cabeçalho com nome, período, filtros e ações `Exportar` e `Compartilhar`. Mostrar um gráfico principal, três indicadores e uma tabela de apoio. Estado de geração exibe progresso e permite continuar trabalhando.

## 9. Chat IA — `/chat-ia`

Interface de assistente em painel amplo, sem sugerir autonomia indevida.

- Título: `Assistente Focuss`.
- Texto: `Use seus dados da clínica para encontrar informações e organizar tarefas.`
- Conversa no centro com mensagens em balões leves.
- Campo inferior: `Pergunte algo sobre sua clínica...` + botão de envio.
- Sugestões iniciais: `Quais são os atendimentos de hoje?`, `Mostre pacientes sem retorno`, `Resuma a agenda da semana`.
- Mensagem persistente: `A IA sugere. Você revisa e confirma.`

Quando a IA propuser uma ação, exibir um card de confirmação com `Revisar ação` e `Confirmar`, nunca executar silenciosamente.

## 10. WhatsApp — `/whatsapp`

Caixa de entrada de mensagens da clínica.

- Título: `WhatsApp`.
- Estado de conexão no topo: `Conectado`, `Atenção` ou `Desconectado`.
- Layout desktop em três colunas: conversas, conversa ativa e contexto do paciente.
- Busca por conversa e filtros `Todas`, `Não lidas`, `Agendamentos`.
- Campo de resposta com anexar e respostas rápidas.
- Contexto lateral mostra paciente identificado, próximo atendimento e atalho `Ver perfil`.

Estado sem conexão deve explicar como conectar, com CTA `Conectar WhatsApp`, sem simular mensagens enviadas.

## 11. Automações — `/automacoes`

Área de regras que economizam trabalho repetitivo.

- Título: `Automações`.
- Texto: `Crie lembretes e ações para sua equipe trabalhar com mais tranquilidade.`
- Cards ou lista com nome, gatilho, última execução, status e menu.
- CTA `+ Nova automação`.
- Status: `Ativa`, `Pausada`, `Com erro`.

### Criar automação

Fluxo em três etapas: `Quando isso acontecer` → `Verifique estas condições` → `Faça isto`. Exemplos: lembrete de atendimento, retorno após consulta, aviso de aniversário. Mostrar uma prévia em linguagem natural antes de salvar.

## 12. Configurações — `/configuracoes`

Layout com navegação interna lateral e conteúdo de formulário à direita.

Seções:

1. Perfil pessoal
2. Clínica
3. Equipe e permissões
4. Notificações
5. Aparência
6. Privacidade e segurança
7. Plano e cobrança

Formulários devem ter títulos, descrições curtas e botão `Salvar alterações` por seção. Mostrar estado salvo inline, sem toast invasivo.

### Privacidade e segurança

Cards para sessões ativas, autenticação em dois fatores, exportação dos dados e política de retenção. Ações sensíveis precisam de confirmação e linguagem clara.

## 13. Páginas públicas

Se a área de marketing entrar no escopo visual, criar:

### Landing — `/`

Hero com `Mais clareza para cuidar melhor`, CTA `Começar agora`, link `Entrar`, prova social, três benefícios e seção final de convite. Fundo claro, blocos verdes suaves e visual editorial.

### Preços — `/precos`

Três planos em cards: Essencial, Clínica e Rede. Destacar o plano recomendado, mostrar o que está incluído e CTA consistente. Não inventar preços definitivos: usar placeholders configuráveis.

### Contato — `/contato`

Formulário simples com nome, e-mail, assunto e mensagem; ao lado, canais de suporte e horário de atendimento.

## 14. Estados globais obrigatórios

- `loading`: skeleton que preserve a geometria da tela.
- `error`: mensagem humana, causa curta e ação de recuperação.
- `empty`: explicar o que fazer em seguida, com CTA relevante.
- `unauthorized`: `Sua sessão expirou.` + `Entrar novamente`.
- `forbidden`: `Você não tem acesso a esta área.` + `Voltar ao dashboard`.
- `not-found`: `Não encontramos esta página.` + `Voltar ao início`.

## 15. Critérios de conclusão visual

1. Todas as rotas listadas na arquitetura existem e não exibem o template padrão do Next.
2. Cada tela tem cabeçalho, navegação e estado vazio/loading/erro coerentes.
3. Desktop e mobile funcionam sem overflow horizontal acidental.
4. Ações principais são claramente identificáveis e têm foco de teclado.
5. Dados sensíveis possuem linguagem de privacidade e não são expostos em componentes visuais genéricos.
6. O produto parece uma única aplicação, não um conjunto de páginas independentes.

# Focuss Care — design do dashboard principal

## Objetivo

Dar à equipe da clínica uma visão rápida do dia e indicar claramente o próximo passo. A home deve reduzir a sensação de sistema complexo: poucas informações importantes, bem agrupadas e com ações óbvias.

## Estrutura geral

- Fundo geral: `#F5F7F5`.
- Sidebar fixa no desktop, largura aproximada de 248px, fundo `#173F35`.
- Conteúdo principal com largura fluida e padding de 32px no desktop.
- Mobile: sidebar vira uma barra superior com marca e botão de menu; navegação abre em drawer.
- Cabeçalho do conteúdo com saudação, data atual e ações rápidas.

## Navegação lateral

Marca no topo: `Focuss Care`.

Itens, nesta ordem:

1. Visão geral (ativo)
2. Agenda
3. Pacientes
4. Equipe
5. Relatórios
6. Configurações

Na base da sidebar: avatar/nome do usuário e link `Sair`.

Estado ativo: fundo `rgba(255,255,255,0.12)`, texto branco e uma barra lateral de 3px em `#A9D7BD`. Estado normal: branco com 72% de opacidade.

## Cabeçalho

Eyebrow: `SEXTA-FEIRA, 07 DE AGOSTO` — ajustar dinamicamente.

Título: `Bom dia, [Nome]`.

Texto: `Aqui está o resumo da sua clínica hoje.`

No canto direito:

- Ícone de notificações com indicador discreto.
- Avatar do usuário.
- Botão primário `+ Novo atendimento`.

## Bloco de resumo do dia

Exibir quatro cards compactos em uma grade responsiva:

- `Atendimentos hoje` — `24` — variação `+12%`.
- `Pacientes aguardando` — `03` — usar cor de atenção suave.
- `Novos pacientes` — `08` — variação `+4%`.
- `Taxa de comparecimento` — `92%`.

Cards com fundo branco, borda `#E1E9E4`, raio de 16px e sombra quase imperceptível. Número em 26px, peso 650. Ícones simples em um círculo de 36px com fundo `#E5F1E9`; não usar gráficos chamativos.

## Conteúdo principal

Desktop: duas colunas, aproximadamente 60% / 40%.

### Agenda de hoje

Card maior com título `Agenda de hoje`, link `Ver agenda completa` e seletor de data.

Cada compromisso deve mostrar:

- Horário em destaque.
- Nome do paciente.
- Tipo de atendimento.
- Profissional responsável.
- Tag de status: `Confirmado`, `Aguardando` ou `Concluído`.

Usar uma linha vertical verde suave para conectar os horários. Estado vazio: `Sua agenda está livre por enquanto.` + botão `Adicionar atendimento`.

### Atividade recente

Card com título `Atividade recente` e link `Ver tudo`.

Exemplos:

- `Marina Costa` teve o cadastro atualizado.
- `João Almeida` confirmou o atendimento das 15:30.
- `Dra. Ana` adicionou uma observação ao prontuário.

Mostrar avatar ou iniciais, descrição curta e tempo relativo. Limitar a cinco itens.

## Ações rápidas

Uma faixa ou card menor abaixo do resumo, com três ações:

- `Cadastrar paciente`
- `Agendar atendimento`
- `Convidar profissional`

Usar ícone, título e descrição de uma linha. Cada ação deve parecer um atalho, não um card de métrica.

## Visual e espaçamento

- Usar Geist, em continuidade com o login.
- Título de página: 28px / peso 650.
- Títulos de card: 16px / peso 650.
- Texto auxiliar: 13–14px / `#61706A`.
- Escala de espaçamento baseada em 4px; gaps principais de 24px.
- Raios de 12–16px, sem excesso de arredondamento.
- Ícones lineares, consistentes e discretos.
- Evitar gradientes, excesso de cores e dashboards cheios de gráficos.

## Estados essenciais

- Loading: skeleton nos cards e na lista, preservando o layout.
- Erro: mensagem contextual no card afetado com ação `Tentar novamente`.
- Primeiro acesso: estado de boas-vindas com três passos — cadastrar clínica, adicionar equipe e criar primeiro atendimento.
- Sem notificações: não exibir um badge vazio.

## Responsividade

- Até 767px: cards de resumo em duas colunas; conteúdo em uma coluna; botão `+ Novo atendimento` ocupa a largura disponível no cabeçalho.
- De 768px a 1100px: sidebar reduzida para 80px, mostrando apenas ícones com tooltip; conteúdo em uma coluna quando necessário.
- A partir de 1100px: sidebar completa e duas colunas no conteúdo principal.
- Listas devem rolar horizontalmente apenas quando não houver alternativa; preferir reorganizar os dados em blocos.

## Acessibilidade

- Cada item da sidebar deve ser um link ou botão real, com estado ativo anunciado.
- Cards de métrica não devem ser clicáveis sem indicação visual e sem nome acessível.
- Contraste mínimo AA para texto e controles.
- Todos os ícones de ação devem ter `aria-label` ou texto visível.
- Manter foco visível e navegação completa por teclado.

## Critério visual de aceite

Ao abrir o dashboard, a pessoa deve entender em até cinco segundos: onde está, quantos atendimentos existem hoje e qual ação pode executar em seguida. A tela deve parecer tranquila e organizada, mesmo quando houver bastante informação.

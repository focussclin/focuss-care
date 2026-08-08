# Focuss Care — design da tela de agenda

## Objetivo

Permitir que a equipe visualize a rotina da clínica, encontre horários rapidamente e crie ou revise atendimentos sem perder contexto.

## Estrutura da tela

- Manter a sidebar do dashboard no desktop e o mesmo padrão de navegação no mobile.
- Fundo geral `#F5F7F5`.
- Conteúdo principal com padding de 32px no desktop e 20–24px no mobile.
- Cabeçalho da página com título, descrição curta e botão primário `+ Novo atendimento`.

Cabeçalho:

- Eyebrow: `AGENDA`.
- Título: `Agenda`.
- Texto: `Organize os atendimentos da sua clínica.`
- Ação: `+ Novo atendimento`.

## Barra de controle

Em um card branco, abaixo do cabeçalho:

- Botões de navegação anterior/próximo.
- Botão `Hoje`.
- Data ou intervalo atual em destaque: `07 de agosto de 2026`.
- Seletor de profissional: `Todos os profissionais`.
- Campo de busca opcional por paciente.
- Alternância de visualização: `Dia`, `Semana`, `Lista`.

No mobile, dividir os controles em duas linhas e manter o botão `Hoje` sempre visível. A data nunca deve ser truncada.

## Visualização semanal

Usar como visualização padrão em desktop:

- Colunas para segunda a domingo.
- Dia atual com fundo verde suave `#E5F1E9` e nome do dia em `#173F35`.
- Grade horária vertical, iniciando às 07:00 e terminando às 19:00.
- Intervalos de 30 minutos com linhas discretas.
- Horários à esquerda em 12px, cor `#61706A`.
- Compromissos como blocos coloridos com raio de 10px e borda lateral de 3px.

Cada compromisso deve exibir, quando houver espaço:

- Horário.
- Nome do paciente.
- Tipo de atendimento.
- Iniciais ou nome curto do profissional.

Usar cores de status com contraste suficiente:

- Confirmado: fundo `#DCEBE3`, texto `#245C48`.
- Aguardando confirmação: fundo `#FFF1D6`, texto `#8B5E18`.
- Concluído: fundo `#E9ECEA`, texto `#61706A`.
- Cancelado: fundo `#F8E2E2`, texto `#9B3D3D`.

## Visualização diária

- Cabeçalho com o dia completo e um indicador `Hoje` quando aplicável.
- Lista vertical de horários com bastante respiro.
- Compromissos mais largos, mostrando todos os detalhes e ações de contexto.
- Estado de horário livre com ação discreta `Adicionar atendimento` ao passar o mouse ou focar por teclado.

## Visualização em lista

Uma alternativa para mobile e para leitura rápida:

- Agrupar por dia.
- Cada linha mostra horário, paciente, atendimento, profissional e status.
- Usar menu de três pontos apenas para ações secundárias: editar, reagendar e cancelar.
- Não esconder ações essenciais atrás do menu.

## Modal de novo atendimento

Ao clicar em `+ Novo atendimento`, abrir modal ou painel lateral com:

1. Paciente — busca por nome, com opção `Cadastrar novo paciente`.
2. Profissional — seleção obrigatória.
3. Tipo de atendimento.
4. Data.
5. Horário de início e duração.
6. Observação opcional.
7. Status inicial — `Aguardando confirmação` por padrão.

Rodapé do modal:

- Botão secundário `Cancelar`.
- Botão primário `Salvar atendimento`.

O formulário deve indicar conflitos de horário antes de salvar: `Este profissional já possui um atendimento nesse horário.`

## Interações

- Clicar em um compromisso abre painel de detalhes, sem navegar para longe da agenda.
- Permitir editar e reagendar no painel de detalhes.
- Confirmar ações destrutivas, como cancelar, com uma mensagem clara.
- Arrastar compromissos pode ser deixado para uma etapa posterior; não simular uma interação que ainda não será persistida.
- Ao trocar de visualização, manter o mesmo dia/intervalo selecionado.

## Estados

- Loading: skeleton da grade ou da lista, sem deslocar o layout.
- Agenda vazia: ícone linear discreto, `Nenhum atendimento neste período.` e botão `Criar atendimento`.
- Filtro sem resultado: `Não encontramos atendimentos com esses filtros.` + `Limpar filtros`.
- Erro: `Não foi possível carregar a agenda.` + `Tentar novamente`.
- Conflito de horário: erro contextual no campo e destaque do intervalo conflitante.

## Visual e espaçamento

- Continuar usando Geist e a paleta do login/dashboard.
- Cards e painel com fundo branco, borda `#E1E9E4`, raio de 16px.
- Controles com altura mínima de 44px.
- Linhas da grade com `#E7EEEA`, nunca preto puro.
- Usar ícones lineares consistentes e evitar excesso de cores.
- O botão `+ Novo atendimento` é a ação visualmente dominante.

## Responsividade e acessibilidade

- Até 767px: iniciar na visualização `Lista`; oferecer `Dia` como alternativa. A visualização semanal pode virar uma faixa horizontal rolável, sem comprimir o conteúdo.
- A partir de 1024px: usar a visualização semanal como padrão.
- Todos os campos têm labels visíveis e associados.
- Controles de data têm nomes acessíveis e não dependem apenas de ícones.
- Status deve ser apresentado por texto, não apenas por cor.
- Compromissos e controles devem funcionar por teclado com foco visível.
- Modal deve prender o foco e fechar com `Escape`.

## Critério visual de aceite

Em poucos segundos, a pessoa deve identificar a data atual, os horários ocupados e como criar um novo atendimento. A agenda deve ser clara e respirável, mesmo com vários compromissos no mesmo dia.

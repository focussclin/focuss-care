# Focuss Care — design da tela de pacientes

## Objetivo

Criar uma base de pacientes simples de consultar e manter atualizada. A tela deve privilegiar busca, identificação rápida e acesso ao histórico sem transformar a listagem em uma tabela pesada.

## Estrutura da tela

- Manter a sidebar e o cabeçalho global do dashboard.
- Fundo geral `#F5F7F5`.
- Conteúdo com padding de 32px no desktop e 20–24px no mobile.
- Eyebrow: `GESTÃO DA CLÍNICA`.
- Título: `Pacientes`.
- Texto: `Acompanhe os pacientes e seus próximos cuidados.`
- Ação principal no canto direito: `+ Novo paciente`.

## Resumo rápido

Logo abaixo do cabeçalho, exibir três cards compactos:

- `Total de pacientes` — `1.284`.
- `Novos este mês` — `36`.
- `Atendimentos pendentes` — `18`.

Os cards seguem o padrão do dashboard: fundo branco, borda `#E1E9E4`, raio 16px e sombra mínima. Não criar uma seção de gráficos nesta tela.

## Busca e filtros

Em um painel branco:

- Campo de busca com placeholder `Buscar por nome, e-mail ou telefone`.
- Filtro de status: `Todos`, `Ativos`, `Inativos`.
- Filtro de última visita: `Qualquer período`, `Últimos 30 dias`, `Mais de 90 dias`.
- Botão secundário `Filtros` no mobile para abrir os filtros em drawer.
- Quando houver filtros ativos, exibir chips removíveis e a ação `Limpar filtros`.

O campo de busca deve ter destaque visual e permitir pesquisa sem exigir uma tela separada.

## Lista de pacientes

Desktop: tabela leve dentro de um card branco, sem linhas verticais pesadas. Colunas:

1. Paciente — avatar/iniciais, nome e e-mail.
2. Telefone.
3. Último atendimento.
4. Próximo atendimento.
5. Status.
6. Ações.

No rodapé do card, exibir contagem e paginação simples.

Cada linha deve ter altura mínima de 72px. Ao passar o mouse, usar fundo `#F7FAF8`. Clicar na linha abre o perfil do paciente; o menu de três pontos deve conter `Ver perfil`, `Editar dados` e `Agendar atendimento`.

Status:

- Ativo: fundo `#DCEBE3`, texto `#245C48`.
- Inativo: fundo `#E9ECEA`, texto `#61706A`.
- Acompanhamento: fundo `#FFF1D6`, texto `#8B5E18`.

Mobile: transformar cada linha em um card vertical compacto. Mostrar nome, próximo atendimento, status e botão de ação; detalhes complementares ficam no perfil.

## Perfil do paciente

Ao abrir um paciente, usar uma rota/página própria ou painel largo, mantendo o contexto da clínica.

Cabeçalho do perfil:

- Botão voltar `Pacientes`.
- Avatar grande com iniciais.
- Nome completo.
- Status do paciente.
- Data de cadastro.
- Ações `Editar paciente` e `+ Agendar atendimento`.

Conteúdo em duas colunas no desktop:

### Informações pessoais

- E-mail.
- Telefone.
- Data de nascimento.
- Documento, se aplicável.
- Preferência de contato.

### Próximo atendimento

Card destacado com data, horário, profissional e tipo de atendimento. Mostrar estado vazio quando não houver agendamento: `Nenhum atendimento agendado.` + `Agendar atendimento`.

### Histórico recente

Lista cronológica com até cinco atendimentos recentes, contendo data, profissional, tipo e status. Link `Ver histórico completo`.

### Observações

Área de texto ou lista de notas internas com indicação do autor e data. Manter a área visualmente discreta e não misturar observações com dados cadastrais.

## Modal de novo paciente

Abrir modal ou painel lateral com formulário dividido em grupos curtos:

1. Nome completo — obrigatório.
2. E-mail.
3. Telefone — obrigatório.
4. Data de nascimento.
5. Preferência de contato.
6. Observação inicial opcional.

Rodapé:

- `Cancelar`.
- `Cadastrar paciente`.

Após salvar, mostrar confirmação breve e oferecer as ações `Ver perfil` e `Agendar atendimento`.

## Estados

- Loading: skeleton da busca, cards e linhas sem mudança de layout.
- Nenhum paciente: `Ainda não há pacientes cadastrados.` + `Cadastrar primeiro paciente`.
- Busca sem resultado: `Não encontramos pacientes com esses dados.` + `Limpar busca`.
- Erro: `Não foi possível carregar os pacientes.` + `Tentar novamente`.
- Formulário inválido: erros contextuais abaixo dos campos, sem depender apenas da cor.

## Visual e comportamento

- Usar Geist, mesma paleta e mesmos raios de login/dashboard.
- Botão `+ Novo paciente` é a ação dominante.
- Links e ações secundárias em verde `#245C48`.
- Ícones lineares, pequenos e consistentes.
- Evitar tabela com excesso de bordas, sombras ou colunas pouco úteis.
- Operações destrutivas, como inativar paciente, exigem confirmação e explicação clara.

## Responsividade e acessibilidade

- Até 767px: cards de resumo em duas colunas; filtros em drawer; pacientes em cards verticais.
- A partir de 1024px: exibir tabela completa e perfil em duas colunas.
- Inputs com `label` visível e autocomplete adequado.
- Ações da tabela acessíveis por teclado e com foco visível.
- Status sempre deve conter texto.
- Modal prende o foco, fecha com `Escape` e devolve foco ao botão que o abriu.

## Critério visual de aceite

Em até cinco segundos, a pessoa deve encontrar como buscar um paciente e como cadastrar um novo. A tabela deve ser informativa sem parecer burocrática; o perfil deve apresentar contexto suficiente para agir sem sobrecarregar a tela.

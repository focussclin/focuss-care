# Focuss Care — design de salas e recursos

> **Handoff para o Codex.** O contrato de props é `RoomsScreen.props.ts` (dono:
> Claude). Esta tela **ainda não pode ser implementada**: depende da migration
> `supabase/migrations/20260809_rooms.sql`, que está escrita e revisada e não foi
> aplicada. O documento existe para que o desenho comece agora e o código entre
> no dia em que a tabela existir.

## Status de implementação — 09/08/2026

A tela foi implementada em `src/modules/rooms/ui/RoomsScreen.tsx` com lista
agrupada, modal acessível, estados de demonstração e de migration pendente,
criação, edição e ativação controladas por Server Actions. O menu segue
desabilitado enquanto `20260809_rooms.sql` não estiver aplicada; isso evita
prometer persistência em uma relação que ainda não existe no banco remoto.

## Objetivo

Dar à clínica o mapa do que ela tem para ocupar: consultórios, salas de exame e
equipamentos que andam entre salas. A tela é de **configuração**, não de
operação — quem a abre está organizando a clínica, não atendendo alguém.

O ganho real não está aqui: está na agenda. Hoje o sistema impede dois
atendimentos do mesmo profissional no mesmo horário e **não impede dois
profissionais na mesma sala**. Esta tela é o cadastro que torna aquela regra
possível.

## Estrutura da tela

- Sidebar e cabeçalho globais, como nas demais.
- Eyebrow: `OPERAÇÃO CLÍNICA`.
- Título: `Salas e recursos`.
- Texto: `Onde os atendimentos acontecem, e o que pode ser reservado.`
- Ação principal à direita: `+ Nova sala`.

## Lista

Uma lista simples, não uma tabela: a clínica típica tem entre três e dez linhas,
e uma tabela com seis colunas para oito linhas parece burocracia.

Cada linha mostra:

- **Nome** em destaque (`Consultório 1`, `Sala de ultrassom`).
- **Tipo** como etiqueta discreta: `Consultório`, `Sala de exame`,
  `Sala de procedimento`, `Equipamento`.
- **Capacidade**, quando houver, como texto simples (`2 pessoas`). Equipamento
  normalmente não tem — não exibir campo vazio.
- **Estado**: ativa ou inativa. Inativa aparece com o nome em `text-muted` e a
  etiqueta `Inativa`; não sai da lista.
- Ações: `Editar` e `Desativar` / `Reativar`.

Agrupar por tipo, com o cabeçalho do grupo em caixa alta discreta. Consultórios
primeiro, equipamentos por último — é a ordem em que a clínica pensa.

## Formulário (modal)

Campos, nesta ordem:

1. `Nome` — obrigatório, único na clínica.
2. `Tipo` — select com os quatro valores; padrão `Consultório`.
3. `Capacidade` — número, opcional, com dica `Deixe em branco se não se aplica.`
4. `Observações` — textarea opcional, curta.

O modal serve para criar e editar. No modo de edição o título é
`Editar sala`, e o botão primário, `Salvar alterações`.

## Estados

- **Nenhuma sala:** `Nenhuma sala cadastrada.` + texto explicando o ganho —
  `Cadastrando as salas, a agenda passa a avisar quando duas consultas caem no mesmo lugar.` +
  `Cadastrar primeira sala`.
- **Nome repetido:** `Já existe uma sala com esse nome.` no campo, não em banner.
- **Desativar:** confirmação explicando o efeito real —
  `A sala sai das opções de novos agendamentos. Os atendimentos que já a usam continuam como estão.`
- **Erro ao carregar:** `Não foi possível carregar as salas.` + `Tentar novamente`.
- **Sem permissão:** quem não é `owner` nem `admin` **não vê o item no menu**.
  A tela não precisa de estado para isso.

## O que esta tela NÃO faz

Declarar é melhor que deixar a pessoa procurar:

- **Não mostra a ocupação da sala.** Quem quer ver o que está marcado abre a
  agenda. Uma segunda visão do mesmo horário é onde as duas passam a discordar.
- **Não reserva sala fora de atendimento** (reunião, manutenção). Isso exigiria
  bloqueio de agenda por recurso, que é outra fatia.

## Responsividade e acessibilidade

- Até 767px: linhas viram cards verticais; ações no rodapé do card.
- A etiqueta de tipo precisa de **texto**, nunca só cor.
- O modal prende o foco, fecha com `Escape` e devolve o foco ao botão que o
  abriu — igual ao de novo paciente.
- `Desativar` exige confirmação e diz o que acontece com o histórico.

## Critério visual de aceite

Em cinco segundos a pessoa entende quantas salas a clínica tem e como cadastrar
outra. A tela não deve parecer um cadastro pesado: é uma lista curta que se lê de
uma vez.

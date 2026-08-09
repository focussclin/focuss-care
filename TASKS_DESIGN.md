# Focuss Care — design de tarefas

> **Handoff para o Codex.** O contrato de props é `TasksScreen.props.ts` (dono:
> Claude). Depende da migration `supabase/migrations/20260809_clinic_tasks.sql`,
> escrita e revisada, **ainda não aplicada**.

> **Status em 09/08/2026:** a rota, o adapter tenant-scoped, as actions, as
> validações e a interface responsiva foram implementados. O item continua
> bloqueado no menu e sem gravação até a migration ser aplicada no Supabase.

## Objetivo

Substituir o papel da recepção. "Ligar para a paciente que faltou", "conferir a
guia que a operadora devolveu", "cobrar o exame que não voltou" — hoje isso vive
num bloco de notas e some junto com ele.

O item do menu se chama **`Tarefas`**, e não "Tarefas inteligentes": o adjetivo
prometia geração automática por IA, que depende de W-01 e da aprovação de
`docs/04-agente-ia.md`. A tela entrega a tarefa **humana**, que é o que resolve o
problema de hoje.

## Estrutura da tela

- Eyebrow: `INTELIGÊNCIA` (seção atual do menu).
- Título: `Tarefas`.
- Texto: `O que a equipe combinou de fazer, e o que ainda está aberto.`
- Ação principal: `+ Nova tarefa`.

## Filtros

Uma linha de filtros, sem drawer — são poucos:

- **Responsável**: `Todas` · `Minhas` · pessoa específica.
- **Situação**: `Abertas` (padrão) · `Concluídas` · `Todas`.
- **Prazo**: `Todas` · `Vencidas` · `Hoje` · `Esta semana`.

`Abertas` como padrão é a decisão que faz a tela servir: quem abre quer o que
falta, não o histórico.

## Lista

Agrupada por prazo, nesta ordem — é a ordem em que a recepção age:

1. **Vencidas** — cabeçalho em `danger`, com a contagem.
2. **Hoje**
3. **Esta semana**
4. **Sem prazo**

Cada linha:

- **Caixa de seleção** à esquerda, que conclui a tarefa. É a ação mais frequente,
  e ela precisa custar um clique.
- **Título** em destaque. Riscado quando concluída.
- **Alvo**, quando houver, como link: nome do paciente, ou `Atendimento de
  12/08`, ou `Fatura #1234`. Leva para a tela correspondente.
- **Prazo** relativo (`vence em 2 dias`, `venceu há 3 dias`), com o absoluto no
  `title`.
- **Responsável** como avatar pequeno com iniciais; sem responsável mostra
  `Sem responsável` em `text-muted` — a ausência precisa ser visível, senão a
  tarefa fica órfã.
- Menu de ações: `Editar`, `Cancelar tarefa`.

## Formulário (modal)

1. `O que precisa ser feito` — obrigatório, uma linha. O rótulo é a pergunta, e
   não `Título`: ele induz a escrever a ação, não um assunto.
2. `Detalhes` — textarea opcional.
3. `Responsável` — select com a equipe; opcional.
4. `Prazo` — data, opcional.
5. `Prioridade` — `Normal` (padrão) · `Alta` · `Baixa`.
6. `Relacionado a` — busca opcional de paciente. Os outros alvos (atendimento,
   fatura) **não são escolhidos aqui**: eles chegam quando a tarefa é criada a
   partir daquela tela.

## Estados

- **Nenhuma tarefa aberta:** `Nada pendente por aqui.` + `Quando alguém da
  equipe anotar algo para fazer, aparece nesta lista.` Sem ilustração de
  "parabéns": a clínica pode simplesmente não estar usando o recurso.
- **Nenhuma tarefa cadastrada:** `Ainda não há tarefas.` + `Criar primeira tarefa`.
- **Filtro sem resultado:** `Nenhuma tarefa com esses filtros.` + `Limpar filtros`.
- **Concluir:** a linha risca e some do grupo depois de uma pequena espera, com
  `Desfazer` disponível nesse intervalo. Sumir na hora faz quem clicou errado
  perder a tarefa.
- **Cancelar tarefa:** confirmação. `Cancelada` é diferente de `concluída` — a
  primeira significa "não era para fazer", e as duas contam diferente.

## O que esta tela NÃO faz

- **Não gera tarefa sozinha.** Nenhuma automação escreve aqui hoje. A coluna
  `source` existe no banco para o dia em que isso mudar, e a tela deve estar
  pronta para marcar visualmente o que veio do sistema — mas **não invente o
  selo agora**: ele afirmaria um recurso que não existe.
- **Não notifica.** O produto não envia aviso nenhum; ver `NotificationBell`.

## Responsividade e acessibilidade

- Até 767px: filtros viram chips roláveis; a linha vira card com a caixa de
  seleção no topo.
- A caixa de seleção precisa de rótulo acessível com o título da tarefa —
  `Concluir: ligar para Maria`.
- Grupo de prazo é `<section>` com cabeçalho, não `<div>` com texto grande.
- Prazo vencido não pode depender só de cor: o texto já diz `venceu há 3 dias`.
- `Desfazer` precisa ser alcançável por teclado enquanto está visível.

## Critério visual de aceite

Quem abre a tela vê primeiro o que está vencido, e conclui uma tarefa com um
clique. A lista deve caber na tela sem rolagem numa clínica com dez pendências.

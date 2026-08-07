# Focuss Care — design da tela de login

## Direção visual

Uma tela acolhedora, calma e confiável. O produto deve parecer humano e profissional, sem a estética fria de um painel administrativo. A interface deve transmitir cuidado logo no primeiro contato e manter o foco no acesso rápido.

## Estrutura

- Tela inteira, com fundo `#F5F7F5`.
- Desktop: composição em duas colunas.
  - Esquerda: painel de marca ocupando aproximadamente 42% da largura, com fundo verde profundo `#173F35`.
  - Direita: área do formulário ocupando o restante, branca ou `#F5F7F5`.
- Mobile: esconder o painel de marca; manter apenas uma faixa superior discreta com o nome da marca.
- Conteúdo do formulário centralizado verticalmente, com largura máxima de 420px.

## Painel de marca

Usar uma composição abstrata e leve, sem banco de imagens: círculos orgânicos/linhas suaves em verde mais claro, com bastante espaço negativo. O painel deve conter:

> Cuidar de quem cuida.

Texto de apoio:

> Um espaço simples para acompanhar sua rotina de cuidado com mais clareza e tranquilidade.

Na base, exibir `Focuss Care` com uma marca tipográfica simples. Se não houver logotipo definido, usar o nome em semibold e um pequeno ponto circular como detalhe.

## Formulário

Ordem vertical:

1. Marca `Focuss Care` no topo do formulário.
2. Título: `Bem-vindo de volta`.
3. Descrição: `Entre na sua conta para continuar de onde parou.`
4. Campo `E-mail`.
5. Campo `Senha`, com botão de mostrar/ocultar senha.
6. Linha com checkbox `Lembrar de mim` e link `Esqueci minha senha`.
7. Botão primário `Entrar`.
8. Separador opcional `ou`.
9. Botão secundário `Continuar com Google` somente se autenticação social estiver disponível.
10. Rodapé: `Ainda não tem uma conta?` + link `Criar conta`.

## Tipografia

- Usar Geist, já disponível no projeto.
- Título: 32px, peso 650, line-height 1.15.
- Texto auxiliar: 15px, line-height 1.5, cor `#61706A`.
- Labels: 13px, peso 600, cor `#263B34`.
- Campos e botões: 15px.

## Cores

- Verde profundo / ação principal: `#173F35`.
- Verde de hover: `#0F3028`.
- Verde suave de apoio: `#DCEBE3`.
- Fundo: `#F5F7F5`.
- Superfície: `#FFFFFF`.
- Texto principal: `#1C2B25`.
- Texto secundário: `#61706A`.
- Borda padrão: `#D6E0DB`.
- Foco: `#3C8C70`.
- Erro: `#B84A4A`.

## Componentes e estados

- Campos com altura de 52px, raio de 12px, borda de 1px e padding horizontal de 16px.
- Estado hover: borda `#9DB8AA`.
- Estado focus: borda verde `#3C8C70` e anel externo de 3px com transparência.
- Estado erro: borda e mensagem em `#B84A4A`; mensagem curta abaixo do campo.
- Botão primário com altura de 52px, raio de 12px, peso 650 e largura total.
- Botão em loading: manter a largura, exibir indicador discreto e desabilitar novo envio.
- Link com sublinhado apenas no hover; área clicável mínima de 44px.

## Responsividade

- Até 767px: formulário com padding de 24px; título entre 28px e 30px; marca no topo.
- A partir de 768px: padding horizontal de 48px.
- A partir de 1024px: exibir painel de marca e formulário em duas colunas.
- Em telas muito baixas, permitir rolagem vertical; nunca cortar o botão de entrada.

## Acessibilidade

- Usar `label` associado a cada input.
- `type="email"` no campo de e-mail e `autocomplete="email"`.
- `autocomplete="current-password"` no campo de senha.
- O botão de mostrar senha precisa ter `aria-label` que indique a ação atual.
- Foco visível e navegação completa por teclado.
- Não depender apenas de cor para indicar erro.
- Respeitar `prefers-reduced-motion`.

## Copy e comportamento

- Não mostrar erro antes da primeira tentativa de envio.
- E-mail inválido: `Digite um e-mail válido.`
- Senha vazia: `Digite sua senha.`
- Credenciais inválidas: `Não foi possível entrar. Confira seus dados e tente novamente.`
- O link de recuperação deve preservar o e-mail preenchido quando navegar para a próxima etapa.
- Após envio válido, exibir estado de carregamento no botão.

## Critério visual de aceite

A primeira dobra deve parecer leve e organizada, com o botão `Entrar` claramente dominante. O painel verde deve reforçar a marca sem competir com o formulário. Em mobile, a experiência deve continuar completa sem depender do painel lateral.

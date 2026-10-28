# Desktop — propostas para a interface "esticada"

Mockups estáticos para análise. **Nada aqui é usado pelo app** e nenhum
código do produto foi alterado. Abra `index.html` no navegador (ou veja os
PNGs em `png/`, em 1440px e 1920px).

## 1. Diagnóstico (capturas em `png/00-atual-*`)

O app nasceu mobile e, no desktop, cada bloco simplesmente ocupa 100% da
largura. Em 1920px isso dá:

| Sintoma | Onde | Por que incomoda |
|---|---|---|
| Linhas de texto e barras de 1.800px | faixa do desafio, aviso de privacidade, card vazio do Progresso | o olho perde a linha; uma barra de progresso desse tamanho não comunica nada |
| Hero esticado | Início | a arte fica pequena no meio de um bloco enorme e vazio |
| Trilhos que acabam no meio da tela | "Ouvir de novo", Foco, Energia… | 3 a 6 cards e depois um vazio à direita parece erro de carregamento |
| Navegação espalhada | barra superior | logo num canto, "Ajuda agora" no outro, 1.900px de distância |
| Abas e chips presos à esquerda | Progresso | o resto da linha fica vazio |
| Um card por linha | Benefícios (em 1366px melhorou com 2 colunas, mas os cards ainda chegam a ~600px) | lista de mobile ampliada, não layout de desktop |

A causa é uma só: **não existe largura máxima de conteúdo nem uma grade de
desktop**. (Há um comentário no CSS dizendo que o limite foi removido porque a
coluna ficava presa à esquerda — o problema era o alinhamento, não o limite.)

## 2. Princípios (valem para qualquer uma das propostas)

1. **Largura máxima e centralizada.** Conteúdo em 1200–1280px; texto corrido
   em no máximo ~70 caracteres (≈ 680px). Fora disso, o fundo respira.
2. **Grade de 12 colunas** com 24px de gutter. Todo bloco escolhe 12, 8/4,
   6/6 ou 4/4/4 — nunca "o que sobrar".
3. **Componentes têm largura natural.** Botões nunca 100% no desktop; barras
   de progresso sempre dentro de um card; cards de sessão em grade que se
   completa (`auto-fill`), não em trilho que termina no meio.
4. **O topo da Home não empilha avisos.** Desafio, Loops e próxima conquista
   são um *resumo* — no desktop cabem ao lado do hero ou num painel lateral.
5. **Popup só quando necessário.** Com espaço sobrando, o detalhe
   (conquista, benefício) pode aparecer ao lado da lista (mestre-detalhe).
6. **Pontos de quebra:** < 900px = mobile atual (intocado) · 900–1279px =
   coluna única centralizada · ≥ 1280px = layout completo de desktop.

## 3. As propostas

### A — Coluna central (menor mudança) · `A1`, `A2`
Tudo dentro de um contêiner de 1200px, incluindo a barra de navegação.
- Início: hero (2/3) + "Seu cuidado" e desafio (1/3) lado a lado; trilhos de
  exatamente 6 cards; humores em grade 4×2.
- Benefícios: cabeçalho em 2 colunas (cuidado + marco), pilares como filtros,
  cards em grade de 3.
- **Prós:** quase só CSS; mantém a navegação no topo; menor risco.
- **Contras:** em 1920px sobram ~360px de cada lado (aceitável e comum —
  é o que Notion, Linear, Airbnb fazem).

### B — Barra lateral + coluna + painel "Seu cuidado" (recomendada) · `B1`, `B2`, `B3`
Padrão dos apps de bem-estar e mídia no desktop (Calm, Headspace, Spotify).
- Navegação vira barra lateral fixa (248px) com busca, "Ajuda agora" e perfil.
- Conteúdo em coluna de leitura de 860px, centralizada no espaço.
- Painel direito fixo (360–400px) com o resumo da pessoa: Loops do mês,
  desafio ativo, próxima conquista, aviso de privacidade.
- Conquistas e Benefícios viram **mestre-detalhe**: clicar mostra o detalhe
  no painel em vez de abrir um popup (a grade continua visível).
- Abaixo de 1280px o painel some e seu conteúdo volta para dentro da coluna.
- **Prós:** usa a largura toda *com propósito*; parece um produto de desktop,
  não um celular ampliado; tira os avisos do topo da Home.
- **Contras:** maior esforço (navegação e Início mudam de estrutura);
  pede validação com os stakeholders da hierarquia do painel direito.

### C — Grade bento para telas de painel · `C1`
Para Progresso › Resumo e Rankings: blocos em 8/4, 6/6, 4/4/4 numa grade de
12 colunas (semana, cuidado, calendário do humor, check-in, próxima
conquista, desafio, cidade). Estado vazio por bloco, nunca um card vazio
de tela inteira.
- Não é alternativa às outras: **combina com A ou B**.

## 4. Recomendação

**B para a estrutura + C para o Progresso › Resumo**, entregue em duas
etapas para reduzir risco:
1. Etapa 1 (rápida): princípios 1–3 em todas as telas (efeito imediato da
   proposta A, sem mudar navegação).
2. Etapa 2: barra lateral, painel "Seu cuidado" e mestre-detalhe (B), e a
   grade bento do Resumo (C).

O mobile não muda em nenhuma das etapas.

## 5. Perguntas para os stakeholders

- Navegação no topo (A) ou na lateral (B)?
- O painel direito deve mostrar "Seu cuidado" o tempo todo, ou só no Início?
- No desktop, detalhe ao lado (mestre-detalhe) ou janela central (como hoje)?
- Largura máxima: 1200px ou 1280px?

# Good Loop — Redesign de UI: instruções precisas para o Claude Code (v2)

## Leia isto antes de qualquer coisa

**Os mockups em `docs/ui-redesign/mockups/*.dc.html` são especificação em pixel, não referência visual.** Porte o DOM e os valores inline de cada arquivo literalmente para React. Não reinterprete, não "adapte ao design system atual", não reaproveite os componentes visuais antigos. O CSS existente do self-use **não se aplica** a estas telas: escope-o para fora (ver §2).

**Isto é só design.** Não altere nenhuma conta, nenhuma query, nenhuma tabela, nenhuma RLS, nenhuma chamada ao Supabase, nenhum fluxo de dados, nenhuma regra clínica. Onde o mockup mostra um número (1.240 Loops, 48 sessões, +3,1, semana 4 de 12), ligue o elemento ao valor que o app **já calcula hoje**, exatamente como calcula. Se o app não tem esse valor, deixe o elemento vazio ou escondido; nunca invente, nunca crie cálculo novo, nunca grave nada novo no banco.

**Me mostre uma tela pronta antes de construir a próxima.** Depois de cada tela, pare, rode o gate (§9) e me mande um screenshot em 1440×1000 (desktop) ou 390×844 (mobile) lado a lado com o mockup aberto no navegador. Só continue quando eu disser "move on".

---

## 1. Como ler e portar um `.dc.html`

Cada mockup tem três partes. É assim que cada uma vira código:

| No mockup | Vira em produção |
| --- | --- |
| `<helmet><style>…</style></helmet>` | Um arquivo CSS **por tela**, com o mesmo conteúdo, escopado por uma classe raiz (ex.: `.gl-home`). Copie as regras como estão. |
| O markup dentro de `<x-dc>` | O JSX do componente da tela. **Copie elemento por elemento, com os mesmos `style="…"` inline** (converta para objeto `style={{}}` do React). Mantenha a mesma ordem, os mesmos `aria-*`, os mesmos SVGs inline. |
| `<script type="text/x-dc">` com `renderVals()` | Um hook ou função que produz os mesmos valores. Onde `renderVals()` monta dados de exemplo (listas de protocolos, semanas, benefícios), troque a origem pelos dados que o app já carrega, **sem mudar a forma dos itens**. |

Sintaxe do template e equivalente em React:

- `{{nome}}` → `{nome}`
- `<sc-for list="{{lista}}" as="x">…</sc-for>` → `{lista.map((x) => (…))}` com `key`
- `<sc-if value="{{cond}}">…</sc-if>` → `{cond && (…)}`
- `onClick="{{fn}}"` → `onClick={fn}`; o mesmo para `onPointerMove`
- `hint-placeholder-*` → ignorar
- `<script src="./support.js">` → ignorar
- links `href="Xyz.dc.html"` → rota do app correspondente (tabela em §4)

Imagens: os mockups referenciam `../assets/bg-lago.jpg` e `../assets/bg-colinas.jpg`. Copie os dois para `public/ui/` e use-os **exatamente onde os mockups usam** (capas de tile e fundo do mobile). Não troque por outra imagem.

Não use Tailwind, não use styled-components, não use os componentes `Button`, `Card`, `Screen` etc. do app antigo nestas telas. É HTML + CSS + React puro, igual ao mockup.

---

## 2. Fundamentos (valem para todas as telas)

**2.1 Fundo e tema.** O app **não tem mais tema claro/escuro** e não usa mais o tema "Studio escuro" nestas telas. O fundo do app é a **cor do humor** escolhido no check-in (§6). Enquanto não houver check-in na sessão do navegador, a cor é a neutra `#BEB6A9`. Por cima dela ficam os dois gradientes radiais fixos de `HomeMood.dc.html` (`.gl-root{background-image:…}`): branco em cima à direita, preto embaixo à esquerda. Nada disso é persistido: a cor vive em estado React (um contexto `MoodProvider` na raiz), e some ao recarregar. Nenhuma gravação no banco.

**2.2 Tokens.** A cor do humor define um conjunto de variáveis CSS na raiz (`--ink`, `--ink-2`, `--link`, `--glass`, `--btn`, `--line`, `--act-bg`, `--act-fg`), com dois conjuntos, **claro e escuro**, escolhidos pela luminosidade L da cor: **L ≥ 0,65 → conjunto de texto escuro; senão → conjunto de texto claro**. Os valores exatos dos dois conjuntos estão no objeto `theme` de `HomeMood.dc.html`. Copie-os sem alterar. Todo texto, borda, botão e vidro destas telas usa só esses tokens.

**2.3 Fontes.** **Outfit** em títulos e números grandes, **DM Sans** no texto. Troque a regra global de Roboto nestas telas, mesmo que isso signifique mudar a regra. Carregue via Google Fonts com `display=swap` e fallback de sistema. Pesos: Outfit 300/400/500/600, DM Sans 400/500/600.

**2.4 Escala tipográfica.** É intencional e tem que mudar:
- Billboard da Home: 76px, weight 400, line-height .95, letter-spacing −.03em.
- H1 das outras telas desktop: 48px, weight 400, line-height 1.05, letter-spacing −.02em.
- H2 de seção: 22px weight 500 na Home; 19–20px nas demais.
- Corpo: 14–16px. Legendas: 12–13px.
Pegue os valores de cada mockup; não arredonde para a escala antiga.

**2.5 Vidro de verdade.** `.glass` = `background: var(--glass)` + `backdrop-filter: blur(22px) saturate(140%)` + borda `1px solid var(--line)`. Como o fundo é a cor do humor, **o vidro reflete essa cor**: um card em cima de fundo âmbar fica âmbar translúcido, em cima de terracota fica terracota translúcido. Superfícies sólidas só onde o mockup usa sólido (popover do check-in, botões primários). **Sem efeito 3D, sem bevel, sem sombra interna nos botões.** Isso foi testado e rejeitado.

**2.6 Raios.** Consistência é a regra: **999px** em tudo que é controle (botão, chip, busca, pílula, tab, switch) e **18–28px** nos blocos (cards 28px, tiles 22–24px, caixas internas 16–18px). Substitua os raios antigos.

**2.7 Transição.** `transition: background-color 1.5s ease, color 1.5s ease` na raiz, nos tokens e no círculo do chip. A tela inteira muda de cor devagar quando o humor muda. Respeite `prefers-reduced-motion`.

---

## 3. Navegação

**3.1 Desktop: rail vertical.** Largura **64px**, coluna de botões **circulares de 52px**, **só ícone, sem rótulo** (o rótulo fica em `aria-label`). Ativo = círculo preenchido com `var(--act-bg)` e ícone `var(--act-fg)`; inativo = `.glass-btn`. Substitua o rail atual de 92px com rótulos e os botões antigos. Copie os SVGs dos ícones de `HomeMood.dc.html`.

**3.2 Logo.** O logo está errado. No topo do rail: **quadrado 56×56, raio 18, fundo `#3DB189`**, com o **símbolo oficial do goodloop** (círculo com o laço interno) em `#06140f`, 30px. O símbolo é o SVG abaixo, copiado da identidade — use exatamente este, não o ícone genérico do app:

```html
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 19.5c-3.2-2-5.2-4.2-5.2-6.6a2.6 2.6 0 0 1 5.2-.6 2.6 2.6 0 0 1 5.2.6c0 2.4-2 4.6-5.2 6.6z"></path><circle cx="12" cy="8.2" r="1.7"></circle></svg>
```

O wordmark "goodloop" (Outfit 22px, weight 500, minúsculo) aparece no canto superior esquerdo da área de conteúdo, como nos mockups.

**3.3 Destinos, nesta ordem, com estes ícones (de cima para baixo):**

| # | Destino | O que é | Mockup | Ícone |
| --- | --- | --- | --- | --- |
| 1 | **Início** | **É a biblioteca.** Não existe tela "Biblioteca" separada. A Home tem todos os elementos de `HomeMood.dc.html`. | `HomeMood` | casa |
| 2 | **Terapia** | Área dedicada do psicólogo: próxima sessão, agendadas, histórico, agendar. | `WTerapia` → `WSalaEspera` → `WChamada` → `WTratamento` | balão com coração |
| 3 | **Percurso** | Os protocolos parametrizados pelo terapeuta para este usuário. Antes isso ficava dentro de Terapia; **agora é tela própria**. Use a tela de Protocolos do app como base de dados e o layout de lista do mockup `Protocolos` (mobile) em grade de 3 colunas no desktop. | `Protocolos` (mobile) | fones |
| 4 | **Minha jornada** | Anel de progresso, 12 semanas, "Como você se sentiu", check-in. | `WJornada` | rota |
| 5 | **Benefícios** | Saldo → desafio coletivo → conquistas → abas → lista. | `WBeneficios` | coração com + |
| 6 | **Perfil** | Identidade, preferências, suporte. | `WPerfil` | pessoa |

**Divergência conhecida:** a tela atual de **métricas / rankings / conquistas** do app não tem mockup. Mantenha-a na rota onde está hoje, com o conteúdo e as contas que já tem; aplique só os tokens, as fontes, os raios e o vidro (§2). Não a reestruture. Se ela hoje mora dentro de Benefícios ou Jornada, continua lá.

**3.4 Mobile é outro desenho.** Não é o desktop espremido. Siga os mockups mobile (`Mobile`, `Jornada`, `Protocolos`, `Beneficios`, `Perfil`, `Psi*`) literalmente: 390×844, foto de fundo (`bg-colinas.jpg`, com o gradiente escuro por cima que está no `.gl-m`), header próprio, barra de abas de vidro no rodapé com os seis destinos na mesma ordem. O humor no mobile são **5 carinhas** (§6.3). Ponto de corte: largura < 900px usa o desenho mobile.

---

## 4. Rotas

Mapeie no `PLAN.md` cada mockup para a rota existente que ele substitui. Não crie rotas novas além de **Percurso** (se a tela de protocolos do terapeuta ainda não tiver rota própria). Mantenha o hash routing.

---

## 5. Home (nova regra: é isto que POs e founders querem)

Porte `HomeMood.dc.html` inteiro. Em detalhe:

**5.1 Barra do topo.** Esquerda: wordmark. Centro: "Olá, {primeiro nome}." + **chip do check-in** (§6.4). Direita: pílula de Loops (valor que o app já tem) + avatar com iniciais.

**5.2 Billboard** (min-height 420px, `padding: 36px 8px 0`, alinhado ao rodapé):
- Eyebrow "EM DESTAQUE ESTA SEMANA" em caixa alta, 13px, letter-spacing .14em, com traço de 28×2px antes.
- Título 76px (§2.4).
- Linha de meta: durações "Rápida 6 min · Padrão · Profunda 24 min" e "Voz: {voz padrão}".
- Parágrafo 17px, line-height 1.55, máx. 600px.
- Botões "Ouvir agora" (primário: `--act-bg`/`--act-fg`, círculo verde `#3DB189` com play) e "Sobre este protocolo" (`.glass-btn`).
- **A busca fica na mesma linha, à direita, alinhada ao rodapé do bloco**: pílula `.glass` de 60px, largura `flex: 0 1 440px`, ícone de lupa, placeholder "Buscar por sentimento, objetivo ou protocolo".
- **Não existe mais a caixa "Sua trilha"** na Home.

**O que vai no billboard:** um **áudio de demonstração do self-use**, escolhido no catálogo pelo mesmo critério que o app já usa para destacar conteúdo. **Nunca mostre código clínico** (GL-CALM, GL-ANX etc.) para o funcionário — a regra antiga do app está certa. Remova a linha "GL-CALM" do billboard e os códigos dos tiles; no lugar do código do tile, mostre o tema (Calma, Foco…). O áudio em destaque **não pode ser um áudio de terapia** nem ser correlacionado a eles.

**5.3 Chips de categoria.** 42px, raio 999, `backdrop-filter: blur(14px)`, ativo `--act-bg`/`--act-fg`. **Só os temas que existem no catálogo real.** Dos 7 do mockup, remova os que não existem; não crie categorias.

**5.4 Trilhos horizontais** (não grade): `display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory`, cada tile `scroll-snap-align: start`. Cada trilho tem **título + subtítulo na mesma linha + "Ver tudo"** à direita. Trilhos, nesta ordem, cada um ligado ao filtro que o app já consegue fazer:
1. **Continuar ouvindo** — só se o app já souber o que o usuário ouviu recentemente. Se não souber, esconda o trilho.
2. **Recomendados para você**
3. **Sessões rápidas** — subtítulo "6 minutos, quando der"
4. **Mergulhos profundos** — subtítulo "24 minutos, olhos fechados"

**Remova "Trilhas de 12 semanas"**: esse objeto não existe mais no catálogo.

**5.5 Anatomia do tile paisagem** (300×170, raio 22, em ordem de empilhamento): capa (`bg-lago.jpg` via classe `.tile`, `background-size: 420% auto`, `background-position` por item) → tint colorido por tema (valores `T` do script) → gradiente escuro de baixo → ícone do tema em caixa 40px no canto superior esquerdo → duração em pílula à direita → tema (11px, caixa alta espaçada) → título (Outfit 19px). **Barra de progresso**: o app não grava posição de retomada; não implemente isso. Renderize a barra **só** se já existir um valor de progresso no app; senão, omita o elemento.

**5.6 Texto do tile** é sempre `#FAF8DF` sobre o gradiente escuro, independente do tema do humor (regra `.gl-root a.tile{color:#FAF8DF}`).

---

## 6. Check-in emocional (nova regra; só UI, sem persistência)

**6.1 É um popover, não uma tela.** Abre sob o chip da barra: `position: absolute; top: 60px; left: 0; right: 0; min-width: 380px`, fundo `rgba(255,255,255,.94)`, raio 28, sombra `0 24px 60px rgba(0,0,0,.25)`, texto `#1F2B2A` sempre escuro. Fecha ao escolher palavra, ao "Pular", ao clicar fora e com Esc.

**6.2 Grade** 200×200, raio 20, **quatro gradientes radiais fixos** sobre `#BEB6A9` (classe `.mood-grid` do mockup: amarelo `#FBC959` em cima à direita, vermelho `#C25237` em cima à esquerda, azul `#46576C` embaixo à esquerda, verde `#95E3D3` embaixo à direita), duas linhas brancas finas cruzando o centro, marcador circular de 26px com borda branca 3px e a cor atual. Clique e arraste (`onPointerMove` com `e.buttons === 1`) movem o ponto; setas do teclado movem em passos de 0,1. **Rótulos nos quatro lados**: "agitado" em cima, "calmo" embaixo, "desagradável" e "agradável" nas laterais em texto vertical (`writing-mode: vertical-rl`; o da esquerda com `transform: rotate(180deg)`).

**Os botões de palavra ficam ao lado da grade, em coluna**, não embaixo: 4 palavras do quadrante (listas PT-BR do spec), mais "Neutro(a)" quando a distância ao centro < 0,25; cada um pílula 40px, branco com borda, selecionado `#1F2B2A`/`#FAF8DF`. "Pular" é um link discreto sublinhado embaixo da coluna.

**6.3 Cor.** Use a função `moodColor` do spec, portada do `renderVals()` de `HomeMood.dc.html` para `src/mood/moodColor.ts`: interpolação em OKLab entre as cinco âncoras OKLCH, mistura pelo raio a partir do neutro, **teto de croma 0,15**, conversão para sRGB. Teste unitário: `(0,0)` → `#beb6a9`; cada canto → sua âncora; croma nunca > 0,15. A cor entra no `MoodProvider` (§2.1) e muda os tokens em 1,5 s.

**Mobile: 5 carinhas** em vez da grade (`Mobile.dc.html`). Cada carinha é um ponto fixo da mesma grade, para gerar a mesma cor com o mesmo motor: Muito mal (−0,8, −0,4) · Mal (−0,5, −0,2) · Neutro (0, 0) · Bem (0,5, −0,3) · Muito bem (0,8, 0,4). Depois da carinha, as mesmas 4 palavras do quadrante. São dois instrumentos para a mesma medida; é intencional.

**6.4 O chip** na barra: pílula `.glass` de 48px; dentro, **círculo de 32px com a cor do dia e borda 2px `var(--ink)`**, depois o texto, depois a seta. Texto: "Como você está agora?" antes do check-in; "Hoje você se sente: {Palavra}" depois; "Check-in feito · toque para mudar" se pulou.

**6.5 Confirmação.** Ao escolher a palavra, o popover fecha e o chip passa a mostrar a cor e a palavra. Não há tela de confirmação separada.

**6.6 Antes/depois de sessão.** Não implemente agora. Nada de `pre_session`/`post_session`, nada de tabela, nada de variante A/B. Isso fica para uma fatia futura com os POs.

---

## 7. Demais telas (nova regra)

Porte cada mockup literalmente (§1). Pontos que o Claude Code errou da primeira vez:

- **Percurso (Protocolos):** grade de 3 colunas no desktop, tela própria (§3.3). Cada item: ícone do tema em caixa 44px, nome, descrição curta, pílulas Rápida/Padrão/Profunda, botão play circular `#FAF8DF`. Sem códigos clínicos visíveis.
- **Minha jornada:** anel SVG (`r=50`, `stroke-width 10`, `stroke-dasharray` proporcional) com "Semana 4 de 12"; lista das 12 semanas com os três estados (concluída / agora / bloqueada) exatamente como no `renderVals()`; faixa "Como você se sentiu" (gráfico antes/depois, duas polilinhas, tracejada laranja `#E89D64` e cheia verde `#3DB189`); card do check-in de bem-estar. Números e estados vêm do que o app já calcula.
- **Benefícios:** ordem fixa: saldo → desafio coletivo → conquistas → abas Disponíveis/Resgatados → lista. Não parece loja: cards de vidro, benefícios de saúde.
- **Perfil:** três blocos: identidade (avatar, nome, três stats), preferências (voz, fones/estéreo, lembretes com switch, Privacidade/LGPD), suporte ("Falar com um psicólogo" → Terapia).
- **Terapia:** Próxima sessão / Agendadas / Histórico / Agendar nova sessão, **tudo numa tela** de 3 colunas (`WTerapia`). Linha "Sigiloso: sua empresa não vê suas sessões" sob o título.
- **Sala de espera:** "Teste de fones" é um **bloco próprio e visível** (pergunta "Em qual ouvido você escutou o som?", dois botões Esquerdo/Direito, confirmação em verde), acima do checklist.
- **Chamada / Tratamento:** copie `WChamada` e `WTratamento`. Tratamento é tela sem rail. Os controles de pausa/parada continuam só do terapeuta, como já é.
- **Console do terapeuta:** abre com **"Bom dia, Marina."** como saudação (48px, Outfit 400), não como título de tela; a segunda linha "4 sessões hoje." em `--ink-2`. Lista do dia à esquerda, card do paciente à direita. Sessão ao vivo: abas de fase, configuração do tratamento, e durante o tratamento só Pausar e Parar.

---

## 8. Dados que o mockup pede e o app não tem

| Pedido | O que fazer |
| --- | --- |
| Capa por tile | Use `bg-lago.jpg` com `background-position` por item, como o mockup. Quando existir `artworkUrl` no catálogo, ele substitui a foto. Não bloqueie por isso. |
| Barra de progresso no tile | Só se já houver progresso no app; senão omitir (§5.5). |
| "Trilhas de 12 semanas" | Remover o trilho. |
| 1.240 Loops, 48 sessões, +3,1, 3 de 4 | São demonstração. Use os valores que o app já tem, com as contas que já existem. **Não mude nenhuma conta.** |
| Código clínico no billboard/tiles | Remover; mostrar o tema. |
| Chips que não existem no catálogo | Remover. |

---

## 9. Ordem de trabalho e gates

1. `PLAN.md`: mapa mockup → rota/componente, lista do que será escondido por falta de dado, lista dos temas reais do catálogo. **Pare e me mostre.**
2. Fundamentos (§2) + `MoodProvider` + `moodColor.ts` com testes + rail e logo (§3). **Pare e me mostre** a Home vazia com o rail e o fundo mudando de cor.
3. Home completa (§5 + §6). **Pare e me mostre.**
4. Terapia (4 telas). **Pare.**
5. Percurso, Minha jornada, Benefícios, Perfil. **Pare** a cada tela.
6. Console do terapeuta (2 telas). **Pare.**
7. Mobile (todas as telas). **Pare** a cada tela.

Gate em cada parada: `npx tsc --noEmit` e `npm run build` limpos; teste do `moodColor` verde; nenhuma string em inglês visível ao funcionário; nenhuma mudança em `supabase/`, em queries, em cálculos ou em tipos de dados (confira com `git diff --stat`: só arquivos de UI podem aparecer). Screenshot lado a lado com o mockup em cada parada.

Branch `feat/ui-redesign-v2`, um commit por parada. Não faça deploy.

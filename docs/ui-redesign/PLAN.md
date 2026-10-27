# Redesign v2 — plano (parada 1)

Base: branch `feat/ui-redesign-v2`, criado de `e83d526` ("The code says which
company, the list says who"), que é a ponta de `feature/gamification` e o pai
do primeiro commit da v1. A v1 inteira fica para trás: nada dela entra aqui.

Regra que governa tudo o que está abaixo: **só design**. Nenhuma tabela,
nenhuma RLS, nenhuma query, nenhum cálculo. Onde o mockup mostra um número,
ele é ligado ao valor que o app já produz; onde o app não produz, o elemento
some.

---

## 1. Mapa: mockup → rota, componente, dado

Oito mockups de 1440×1000 (desktop) e treze de 390×844 (mobile). O corte é em
900px (§3.4 do briefing).

### Desktop

| Mockup | Destino | Componente hoje | Dado que alimenta |
| --- | --- | --- | --- |
| `HomeMood` | Início (aba `home`) | `Explore.tsx` + `Catalog.tsx` | `liveCatalog`, `resolveRails()`, `getWallet()`, `listSessions()` |
| `WTerapia` | Terapia (aba `therapist`) | `TherapistTab.tsx` | `therapyStore`, `getMyAppointment()`, `listMyAppointments()` |
| `WSalaEspera` | Sala de espera | `VideoCall.tsx` (antessala) | `getMyAppointment()` |
| `WChamada` | Chamada | `VideoCall.tsx` | idem |
| `WTratamento` | Tratamento ao vivo (sem rail) | `VideoCall.tsx` → modo tratamento | sessão ao vivo |
| `WJornada` | Minha jornada (aba `progress`, vista `summary`) | `ProgressTab.tsx` | pathway ativa, `listSessions()`, VAS |
| `WBeneficios` | Benefícios (aba `benefits`) | `BenefitsTab.tsx` | `getWallet()`, `listMyAchievements()`, `getMyCollectiveProgress()` |
| `WPerfil` | Perfil (aba `profile`) | `ProfileTab.tsx` | perfil, preferências de voz/idioma |
| `TerapeutaAgenda` | Console do terapeuta — agenda | `workspace/WorkspaceApp.tsx` | `workspace/data.ts` |
| `TerapeutaSessao` | Console do terapeuta — sessão ao vivo | `workspace/LiveSession.tsx` | idem |

### Mobile

| Mockup | Destino | Par desktop |
| --- | --- | --- |
| `Mobile` | Início | `HomeMood` |
| `PsiAgenda` | Terapia | `WTerapia` |
| `PsiEscolher` | Agendar sessão | (dentro de `WTerapia`) |
| `PsiSalaEspera` | Sala de espera | `WSalaEspera` |
| `PsiChamada` | Chamada | `WChamada` |
| `PsiTratamento` | Tratamento | `WTratamento` |
| `Protocolos` | **Percurso** (rota nova) | — (grade de 3 colunas no desktop, §3.3) |
| `Jornada` | Minha jornada | `WJornada` |
| `Beneficios` | Benefícios | `WBeneficios` |
| `Perfil` | Perfil | `WPerfil` |

**Sem mockup:** o console do terapeuta não tem versão mobile, e Percurso não
tem versão desktop. Para Percurso eu sigo o §3.3 (grade de 3 colunas). Para o
console mobile eu não invento tela: ele continua como está abaixo de 900px.

### Rota nova: Percurso

É a única rota nova autorizada. Dado: `Prescription` em
`src/selfuse/therapyStore.ts` — `slug`, `duration`, `perWeek`, `done`,
`status`. Hoje essas prescrições aparecem dentro de `TherapistTab`; passam a
ter tela própria e saem de lá.

---

## 2. Navegação: cinco destinos viram seis

Hoje: `home · therapist · progress · benefits · profile`.
Depois: `Início · Terapia · Percurso · Minha jornada · Benefícios · Perfil`.

`Percurso` é a prescrição do terapeuta, extraída de Terapia. Os outros cinco
são renomeações e reordenações de abas que já existem — nenhuma rota some.

**Divergência conhecida, tratada como o §3.3 manda:** a aba `progress` tem
hoje quatro sub-vistas — Conquistas, Rankings, Desafios e Resumo. Só o Resumo
tem mockup (`WJornada`). Rankings, Conquistas e Desafios **ficam onde estão,
com as contas que já têm**; recebem só tokens, fontes, raios e vidro. Não
reestruturo.

---

## 3. Temas reais do catálogo

O catálogo tem **cinco** temas (`src/data/selfuse.ts`), todos já traduzidos:

| id | PT-BR | IT |
| --- | --- | --- |
| `calm` | Calma | Calma |
| `focus` | Foco | Concentrazione |
| `energy` | Energia | Energia |
| `balance` | Equilíbrio | Equilibrio |
| `growth` | Crescimento | Crescita |

Chips da Home: **Todos + esses cinco = 6 chips.**

Caem os dois do mockup que não existem: **"Menos estresse"** e
**"Resiliência"**. Entra **"Equilíbrio"**, que existe no catálogo e não estava
no mockup — sem ele, parte da biblioteca não tem chip que a alcance.

Ícone e tint por tema vêm do `renderVals()` do `HomeMood`. Quatro mapeiam
direto; `balance` fica com o par que sobrou de `resil` (escudo, areia
translúcida), e `stress` é descartado:

| tema | ícone (`I`) | tint (`T`) |
| --- | --- | --- |
| `calm` | `calm` | `rgba(0,155,119,.42)` |
| `focus` | `focus` | `rgba(36,101,171,.5)` |
| `energy` | `ener` | `rgba(232,157,100,.45)` |
| `growth` | `grow` | `rgba(122,198,155,.38)` |
| `balance` | `resil` | `rgba(244,240,190,.22)` |

---

## 4. O que fica escondido por falta de dado

| Elemento do mockup | O que acontece | Por quê |
| --- | --- | --- |
| Barra de progresso no tile | **Não renderizada** | O app não grava posição de retomada. §5.5 manda omitir. |
| Trilho "Trilhas de 12 semanas" | **Removido** | §5.4: o objeto não existe mais no catálogo. |
| Código clínico (GL-CALM) no billboard e nos tiles | **Removido**, trocado pelo tema | Regra do produto, confirmada no §5.2. |
| Chips "Menos estresse" e "Resiliência" | **Removidos** | Não são temas do catálogo. |
| "48 sessões" nos cards de trilha | — | O trilho inteiro sai. |
| Caixa "Sua trilha" na Home | **Removida** | §5.2. |
| Subtítulo "com base em como você tem se sentido" | **Não usado** | O app não recomenda por humor. Seria uma afirmação que o produto não sustenta. O trilho fica sem subtítulo. |
| Trilho "Continuar ouvindo" | **Renderizado** | `listSessions()` já dá o histórico (`protocolCode`, `startedAt`, `completed`). Sem barra de progresso. Some quando o histórico está vazio. |
| Pílula "1.240 Loops" | **Renderizada** com `getWallet().loops` | Valor real, conta existente. |
| Avatar com iniciais | **Renderizado** do nome do perfil | — |
| Anel "Semana 4 de 12" | **Renderizado** com a pathway ativa | O app já tem `week`/`weeks`; o número real nem sempre é 12. |

---

## 5. Três pontos onde o briefing e o app discordam — decisões suas

### 5.1 Quais trilhos a Home mostra

O §5.4 nomeia quatro trilhos fixos. Mas a Home hoje é alimentada por
`resolveRails()` (`src/data/rails.ts`): **os trilhos são editáveis no console
de admin**, com ordem, título e sessões persistidos, e um conjunto padrão
derivado do catálogo quando ninguém definiu nada.

Fixar os quatro no código tira a Home das mãos do admin — isso é mudança de
produto, não de design.

**Minha recomendação:** `resolveRails()` continua mandando. Quando existem
trilhos salvos, são eles, no layout novo. Quando não existem, eu uso os quatro
do §5.4 como padrão no lugar do padrão atual. Assim o desenho é o do mockup e
o console continua valendo — e, se os POs quiserem exatamente aqueles quatro
títulos, eu os semeio no console, sem deploy.

O trilho **"My List"** (a lista que a própria pessoa monta) existe hoje e fica
acima dos demais. O mockup não o tem. Mantenho, a menos que você diga o
contrário.

### 5.2 O que toca no billboard

O §5.2 diz: áudio de demonstração do self-use, **nunca um áudio de terapia,
nem correlacionado a eles**.

A regra atual do app faz o oposto: o herói é a sessão do dia da pathway
ativa, e só cai para "a sessão de calma mais curta" quando não há pathway.

**Minha leitura:** o billboard passa a usar sempre a regra de fallback — a
sessão de calma mais curta do catálogo. É a única que não é correlacionada à
terapia. Nenhum cálculo muda; eu só deixo de passar `featuredSlug`.

### 5.3 Contraste dos tokens

O §2.2 manda copiar os dois conjuntos do `HomeMood` sem alterar. Copio. Mas
registro agora, para não virar surpresa: no conjunto claro,
`ink-2: rgba(31,43,42,.78)` sobre as cores de humor mais claras fica **abaixo
de 4,5:1**, e o mesmo vale para `link: #0B5E48` em parte da faixa. Isso é
WCAG AA reprovado para texto secundário e links.

Não altero nada sem sua palavra. Quando a Home estiver de pé eu te mostro
exatamente onde reprova, e aí você decide entre manter o valor do mockup ou
escurecer o secundário.

---

## 6. Ordem de trabalho

Como o §9 define. Paro em cada item e mando screenshot lado a lado.

1. **Este plano.** ← você está aqui
2. Fundamentos: tokens, fontes, vidro, raios, transição · `MoodProvider` ·
   `moodColor.ts` + testes · rail de 64px e logo. Entrego a Home vazia com o
   rail e o fundo mudando de cor.
3. Home completa (§5) + check-in (§6).
4. Terapia: `WTerapia`, `WSalaEspera`, `WChamada`, `WTratamento`.
5. Percurso · Minha jornada · Benefícios · Perfil — parada a cada tela.
6. Console do terapeuta: `TerapeutaAgenda`, `TerapeutaSessao`.
7. Mobile, tela a tela.

Gate em cada parada: `npx tsc --noEmit` e `npm run build` limpos, teste do
`moodColor` verde, nenhuma string em inglês visível ao funcionário, e
`git diff --stat` mostrando **só arquivos de UI** — nada em `supabase/`, nada
em `src/data/*.ts` além de leitura, nenhum tipo alterado.

Um commit por parada. Sem deploy.

---

## 7. Arquivos que vou criar ou tocar na parada 2

Criar: `src/mood/moodColor.ts`, `src/mood/MoodProvider.tsx`,
`src/mood/tokens.ts`, `src/ui2/shell.css`, `src/ui2/Rail.tsx`,
`tools/test-mood-color.ts`, `public/ui/bg-lago.jpg`,
`public/ui/bg-colinas.jpg`.

Tocar: `src/main.tsx` (ordem das folhas), `src/selfuse/SelfUseApp.tsx`
(shell e destinos), `index.html` (fontes).

Escopar para fora: `selfuse.css` e `selfuse-studio.css` deixam de valer sob a
raiz nova. Não apago — outras superfícies usam.

# Trocar os fundos e a força do filtro

Tudo o que você precisa mexer está em **`src/ui2/shell.css`**, em dois blocos.
Nenhum outro arquivo precisa saber.

Depois de salvar, o `npm run dev` recarrega sozinho. Para publicar, é commit
normal — não tem build especial nem nada para registrar em outro lugar.

---

## 0. Claro e escuro

Agora são **dois** fundos, e quem escolhe é a pessoa, em **Perfil › Conta ›
Fundo**. A escolha fica no aparelho dela (`localStorage`, chave `gl.ground`),
não na conta — trocar de celular começa de novo no claro.

- **Claro é o padrão.** A mesma foto, com um véu de areia por cima e tinta
  escura. É o que alguém que nunca abriu os ajustes vai ver.
- **Escuro** é exatamente o que o app sempre foi: a foto com o filtro escuro
  e a tinta creme.

No CSS, o claro é o bloco `html.gl2 {` e o escuro é o bloco
`html.gl2[data-ground='dark'] {`, logo abaixo. **Os dois são independentes**:
mexer num não mexe no outro. Para ver o outro sem trocar o ajuste, no console
do navegador (F12):

```js
document.documentElement.setAttribute('data-ground', 'dark')   // ou 'light'
```

(Recarregar desfaz, porque a escolha gravada volta a valer.)

---

## 1. O fundo do app (todas as telas menos a sessão)

No topo de `src/ui2/shell.css`, procure `html.gl2 {` — o **claro**:

```css
html.gl2 {
  --gl-ground: url('/media/ground.jpg');
  --gl-ground-pos: 50% 42%;
  --gl-ground-base: #f5eee4;
  --gl-ground-veil: 0.45;
}
```

E logo abaixo, o **escuro**:

```css
html.gl2[data-ground='dark'] {
  --gl-ground-dim: 0.78;
  --gl-ground-base: #07181e;
}
```

A foto (`--gl-ground`) e o enquadramento (`--gl-ground-pos`) são os mesmos nos
dois — estão só no bloco de cima. O que muda é a cor por baixo e a força do
véu.

### Trocar a imagem — `--gl-ground`

1. Ponha o arquivo em `public/media/`.
2. Aponte para ele: o caminho começa a partir de `public/`, então
   `public/media/por-do-sol.jpg` vira `url('/media/por-do-sol.jpg')`.

Use JPG para fotografia e PNG só se precisar de transparência. **Reduza antes
de subir** — o arquivo vai junto em todo carregamento do app. O `ground.jpg`
atual tem 2000px de largura e 86 KB; o original tinha 3648px e 3,6 MB. Para
reduzir um arquivo novo, com o ffmpeg que já está nesta máquina:

```bash
ffmpeg -y -i "ENTRADA.JPG" -vf "scale=2000:-2" -q:v 6 public/media/SAIDA.jpg
```

(`-q:v` vai de 2 a 31: menor = mais qualidade e mais peso. 6 é um bom meio.)

### Trocar a força do véu — `--gl-ground-veil` (claro)

Um número de **0 a 1**: quanta areia (`#F5EEE4`) entra na frente da foto.

| valor | efeito |
|------:|--------|
| `0`    | a foto crua — o texto escuro fica ilegível em cima dela |
| `0.45` | o atual: a foto bem visível, o vidro ainda lendo como vidro |
| `0.7`  | a foto vira um fundo discreto |
| `0.9`  | quase só a cor, a foto vira textura |

### Trocar a força do filtro — `--gl-ground-dim` (escuro)

Mesma escala, no bloco do escuro:

| valor | efeito |
|------:|--------|
| `0`    | a foto crua, sem filtro nenhum |
| `0.4`  | bem clara — ilegível, a tinta do escuro é creme |
| `0.78` | o atual |
| `0.9`  | quase preto, a foto vira uma textura |

Nos dois casos os três pontos do degradê saem desse número só, mantendo o topo
um pouco mais claro que o rodapé — é embaixo que ficam os controles.

**Se você trocar a foto, mexa no número do tema que ficou ruim.** O véu existe
porque os painéis de vidro precisam de algo uniforme por baixo: vidro fosco em
cima de uma fotografia crua é só um pedaço mais claro da fotografia.

> O grão (aquele chiado fino sobre o fundo) só existe no escuro. Em cima de
> areia ele não lê como textura, lê como sujeira.

### Trocar o enquadramento — `--gl-ground-pos`

A foto é cortada para caber na janela. Dois valores, horizontal e vertical:

- `50% 50%` — centro exato
- `50% 42%` — o atual, um pouco acima do centro
- `50% 80%` — mostra mais a parte de baixo da foto
- `20% 50%` — puxa para a esquerda

### `--gl-ground-base`

A cor sólida atrás da foto: aparece no instante antes dela carregar. Deixe
parecida com a ponta da foto que combina com o tema — a parte clara no claro,
a escura no escuro. Os dois degradês da montanha na Home também saem dela
(`.gl-homebg`), então ela é a cor em que a foto da Home se dissolve.

---

## 2. O fundo dentro de uma sessão (o protocolo tocando)

Dentro de uma sessão o fundo **não** é essa foto: é a capa do próprio
protocolo, para que cada sessão abra na própria imagem. Isso vem do catálogo
(a capa que o PO subiu) e muda sozinho a cada protocolo — não tem o que
configurar.

O que dá para ajustar é o filtro em cima dela. No mesmo arquivo, procure
`.su-session {`:

```css
  --gl-session-dim: 0.60;
```

Mesma escala de 0 a 1. Está mais baixo que o da página porque as capas já são
escuras e não carregam texto corrido por cima — só título e botões.

Se a capa de algum protocolo ficar lavada ou brigando com o botão creme, esse
é o número para subir.

---

## 3. Testar rápido sem mexer no código

Para achar o valor antes de salvar, abra o app no navegador, aperte **F12**,
vá em **Console** e cole:

```js
// a página
document.documentElement.style.setProperty('--gl-ground-veil', '0.55')  // claro
document.documentElement.style.setProperty('--gl-ground-dim', '0.55')   // escuro
document.documentElement.style.setProperty('--gl-ground-pos', '50% 70%')

// uma sessão, com ela aberta na tela
document.querySelector('.su-session').style.setProperty('--gl-session-dim', '0.4')
```

Muda na hora. Recarregar a página desfaz. Quando achar o número certo, escreva
ele no CSS.

Para experimentar uma imagem sem subir arquivo nenhum:

```js
document.documentElement.style.setProperty('--gl-ground', "url('https://…')")
```

---

## O que NÃO mudar por aqui

- **A cor do humor.** Ela não pinta mais o fundo: vive no check-in e no chip
  de Loops (`src/ui2/MoodSliders.tsx`, `src/ui2/MoodReveal.tsx`).
- **O grão.** A textura fina por cima de tudo é `html.gl2 body::before`, logo
  abaixo no mesmo arquivo. Ela existe para o efeito de vidro ter o que borrar;
  mexer nela costuma piorar o vidro, não o fundo.
- **O fundo das telas de login e cadastro.** Essas têm um vídeo próprio
  (`public/media/login-loop.mp4`, ver `docs/LOGIN_VIDEO.md`).

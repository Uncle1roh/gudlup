# Good Loop — Gamificação: cenários de teste

Um cenário por critério de aceite da SPEC (§10), em linguagem simples, para quem vai conferir o produto sem ler código. Cada cenário diz **onde**, **o que fazer** e **o que deve acontecer**. Quando um critério é técnico demais para ser visto na tela, o cenário diz qual prova automática o cobre e como rodá-la.

## Antes de começar

**Modo demonstração (sem servidor).** Rode `npm install` e depois `npm run dev`, e abra o endereço que aparecer.

| Onde | Endereço | Quem |
|---|---|---|
| App da pessoa | `/#app` | qualquer e-mail e senha |
| Portal de RH | `/#hr` | `camila@aurora.co` (RH da empresa de demonstração) |
| Console admin (italiano) | `/#admin` | uma conta admin |

O que saber sobre a demonstração:
- Na demonstração, a pessoa do app é colaboradora da empresa Aurora. A Aurora tem o add-on **Premium 1,5×**, e a tag "Alimentos e bebidas" está desligada.
- Os dados da demonstração vivem na memória do navegador. **Recarregar a página zera Loops, conquistas e resgates.**
- Para encurtar sessões, use o modo de sessão curta, se estiver disponível no seu ambiente.

**Provas automáticas.** As regras que a tela não mostra são provadas por:
- `npm test`: as suítes `gam-*`.
- `node tools/db-gate.mjs`: monta um banco Postgres 16 novo, aplica o `setup.sql`, aplica de novo e roda as provas em SQL. Tem que terminar em `db gate: PASS`.

**Dados de demonstração só na demonstração.** Os dados de exemplo existem apenas no modo demonstração: sem servidor configurado, ou quando um admin abre o app, a área do terapeuta ou a da empresa pela **prévia do console**. Ali a pessoa de demonstração já tem três semanas de história. No app real, com o banco de produção, não existe nenhum dado de demonstração.

---

## Fatia 1 — A economia de Loops

### 1.1 O banco é montado do zero e pode ser montado de novo
- **Como:** um desenvolvedor roda `node tools/db-gate.mjs`.
- **Esperado:** aparecem as linhas `setup.sql on a fresh database` e `setup.sql re-applied (idempotent)`, e no fim `db gate: PASS`.
- **Por que importa:** o mesmo arquivo serve para um projeto novo e para atualizar um que já existe, sem erro.

### 1.2 Cada minuto ouvido vira cuidado, uma vez só, com limites justos
- **Onde:** app, em Benefícios.
1. Anote o número em "Seu cuidado": os minutos do mês e os Loops.
2. Faça uma sessão **Standard (12 min)** até o fim.
3. Volte a Benefícios.
- **Esperado:**
  - Os minutos do mês sobem 12.
  - Os Loops sobem cerca de **3**: 2,20 da escuta mais 1,10 que a empresa multiplica, mostrados como número inteiro. Na primeira sessão entra também o bônus da conquista "Primeiro Loop" (+20).
  - Aparece a frase "Sua empresa multiplica seus Loops em 1,5×".
- **Esperado também:**
  - **Pontos não aparecem em lugar nenhum.** A pessoa só vê Loops.
  - **Sair da sessão no meio rende pontos reduzidos:** contam os minutos realmente ouvidos, sem o bônus de conclusão. O aviso de saída diz "Os minutos que você ouviu continuam valendo." Menos de um minuto não conta.
- **O que a tela não mostra** (`gam-economy` e `economy_parity`):
  - Sessões SOS e sessões feitas no console do terapeuta não geram nada.
  - Vale no máximo 120 minutos e 4 bônus de conclusão por dia, no horário de São Paulo.
  - O multiplicador só vale com assinatura ativa.
  - Uma sessão datada no passado não "usa" o limite de dias antigos.
  - Os 22 casos de paridade dão o mesmo resultado no navegador e no banco.

### 1.3 A regra é a mesma no app e no servidor
- **Como:** rode `npm test -- gam-economy` e `node tools/db-gate.mjs`.
- **Esperado:** as duas provas passam com as mesmas fixtures (`src/gamification/__fixtures__/economy.json`). Se alguém mudar uma regra num lugar só, uma das provas falha.

### 1.4 A carteira é lida, nunca escrita pelo app
- **Onde:** app, em Benefícios ("Seu cuidado").
- **Esperado:** o saldo aparece. O app não tem nenhum botão ou caminho que "dê" Loops: eles só nascem de sessões, conquistas e desafios.
- **Prova:** `economy_parity.sql` confirma que os registros não aceitam edição e que apagar a conta apaga também os registros da pessoa.

---

## Fatia 2 — Conquistas

### 2.1 Conquistas sobem uma vez e ficam para sempre
- **Onde:** app.
1. Faça a primeira sessão.
2. Feche o app e abra de novo, ou volte de outra aba.
- **Esperado:**
  - Sobre o Início aparece **"Conquista desbloqueada · Primeiro Loop"**.
  - Aparece a frase gentil e o selo "+20 Loops de bônus".
  - Os botões são "Ver minhas conquistas" e "Agora não".
- **Esperado também:**
  - Se a sessão desbloqueou mais de uma conquista, elas aparecem juntas com "1 de 3".
  - Depois de fechar, a folha não volta.
  - O bônus entra uma única vez.

### 2.2 Nada de comemoração na tela pós-sessão
- **Onde:** app, no fim de uma sessão.
- **Esperado:** a tela pós-sessão é a mesma de sempre (uma métrica, no máximo duas ações). Nenhuma conquista nem Loops aparecem ali. A folha só aparece **na próxima abertura**, sobre o Início.
- **Prova:** `gam-ui`.

### 2.3 Progresso › Conquistas
- **Onde:** app, em Progresso, no botão "Conquistas".
- **Esperado:**
  - Os chips "Individuais · X de 14" e "Coletivas · Y de 8".
  - O cartão "Próxima conquista", com barra e texto em tempo ("3h 40min de 5h · faltam 80 min"). Nunca em pontos.
  - A grade de selos: os individuais são círculos e os coletivos são hexágonos. Os bloqueados ficam acinzentados, com "Bloqueada".
  - O link "Ver todas as N conquistas".
- **Esperado também:** a aba "Resumo" mostra exatamente o que mostrava antes.

---

## Fatia 3 — Rankings por cidade

### 3.1 A cidade é a que a pessoa informa, e só com consentimento
- **Onde:** app, em Progresso › Conquistas › Coletivas.
- **Esperado:** aparece "Quer que seu cuidado some para a sua cidade? Usamos só a cidade que você informar, nunca sua localização."
1. Digite "camp".
2. Escolha "Campinas · SP".
3. Toque em "Participar dos rankings".
- **Esperado também:**
  - O app nunca pede a localização do aparelho.
  - Em Perfil › Privacidade aparece o interruptor "Participar dos rankings", com a cidade logo abaixo para trocar.
  - Desligar o interruptor tira a pessoa dos rankings na hora.
- **Prova:** a lista oficial do IBGE (5.571 municípios) é checada pela `gam-geo`.

### 3.2 Rankings justos, atualizados sozinhos
- **Onde:** app, em Coletivas, no cartão de ranking.
- **Esperado:**
  - Dá para alternar entre Cidades, Estados e Regiões, e entre "Este mês" e "Desde o início".
  - A ordem é por **cuidado por pessoa ativa**, então uma cidade pequena pode ficar à frente de São Paulo.
  - A própria cidade aparece destacada ("· sua cidade"), mesmo fora do top 5.
  - Só aparecem posições. Nenhum ponto é mostrado.
- **No console** (`/#admin`, em Economia): o botão **"Ricalcola ora"** atualiza os rankings e as conquistas coletivas. Onde o banco tem pg_cron, isso acontece sozinho a cada 15 minutos.

### 3.3 Cidade pequena nunca aparece
1. Em Perfil › Privacidade, troque a cidade para **Palmas · TO**. Na demonstração, Palmas tem só 31 pessoas ativas.
2. Volte a Coletivas.
- **Esperado:**
  - O cartão da cidade diz "Sua cidade entra nos rankings quando mais pessoas participarem no mesmo mês", sem nenhum número da cidade.
  - Palmas não aparece em nenhum ranking.
- **Prova:** `geo_privacy.sql` checa, com dados reais, que:
  - cidade abaixo do limite não aparece;
  - quem não consentiu não conta;
  - quem retirou o consentimento sai de tudo;
  - mudar de cidade não reescreve os meses anteriores.

---

## Fatia 4 — Benefícios e carteira

### 4.1 Trocar Loops por um benefício
- **Onde:** app, na aba **Benefícios** (agora para todos, no lugar de Parceiros).
1. Abra um benefício que caiba no saldo.
2. Leia "Por que isso cuida de você".
3. Toque em "Trocar por N Loops" e confirme.
- **Esperado:**
  - Aparece o código com o botão Copiar, a validade e "Como usar".
  - O saldo cai exatamente o preço.
  - O benefício passa para **Meus benefícios**.
- **Esperado também:**
  - Um benefício caro demais mostra "Faltam 12 Loops · cerca de N sessões Standard", sem pressa nem contagem regressiva.
  - Tentar trocar de novo o mesmo benefício não é possível.
- **Prova** (`benefits_redeem.sql`):
  - o saldo nunca fica negativo;
  - o mesmo código nunca vai para duas pessoas;
  - só quem recebeu o código consegue lê-lo, nem o admin;
  - o estorno devolve uma vez só;
  - um benefício Good Loop sem tag é recusado.

### 4.2 É cuidado, não loja
- **Onde:** app, em Benefícios.
- **Esperado:**
  - O topo é "Seu cuidado" ("Você dedicou 3h 40min a você este mês = 412 Loops").
  - Os benefícios vêm agrupados em Sono · Mente · Corpo · Movimento · Alimentação · Pausas e lazer, com no máximo 6 por pilar.
  - Não existe: "Comprar", "Loja", "Oferta", "Promoção", preço riscado, "últimas unidades", contagem regressiva ou "mais vendidos".
- **Prova:** `gam-copy` falha se alguma dessas palavras ou padrões aparecer nas telas.

---

## Fatia 5 — Desafios públicos

### 5.1 Um desafio com prêmio
- **Onde:** app, no Início.
- **Esperado:**
  - Um único cartão sob a saudação: **"Desafio Good Loop · faltam N dias · Outubro Sereno"**.
  - A barra mostra "Xh Ymin de 5h", e o prêmio é "90% em creme facial".
  - Tocar abre o detalhe, com o anel de progresso.
  - "Como funciona" inclui **"Sessões SOS não contam: use-as sempre que precisar."**
- **Depois de completar as 5 horas:**
  - O detalhe diz "Você concluiu".
  - O prêmio aparece em Benefícios › "Desbloqueados por desafios".
  - Na próxima abertura, sobe a conquista "Primeiro desafio".
- **Prova** (`challenges.sql`):
  - só contam sessões que terminam dentro do período;
  - SOS não conta;
  - o bônus é pago uma vez;
  - com estoque limitado, "primeiro a concluir" e "sorteio" funcionam, e o sorteio acontece uma vez só.

### 5.2a Modelos dos desafios de empresa
- **Onde:** `/#admin`, em **Modelli di sfida**.
- **Esperado:**
  - A lista mostra os quatro modelos (Boas-vindas, Sono em dia, Pausa consciente, Empresa em sintonia).
  - Em "Modifica" dá para mudar o nome e o texto em português, a meta proposta, a duração e a ícone, e desligar a oferta às empresas.
  - À direita aparece a prévia do cartão como o funcionário vai ver.
  - "+ Nuovo modello" cria um modelo novo, que aparece para o RH.
- **No RH:** um desafio em rascunho ou agendado tem o botão **Editar** (datas, meta, recompensa). O nome e o texto continuam os do modelo.

### 5.2 Criar um desafio no console
- **Onde:** `/#admin`, em Sfide.
- **Esperado:**
  - Indicadores (Sfide attive, Persone che partecipano, Hanno completato, Premi consegnati).
  - Filtros, busca e a tabela com as ações Modifica, Duplica, Termina e Annulla.
- **Ao criar (+ Nuova sfida):**
  - São 6 passos.
  - À direita fica o quadro fixo das regras e a **prévia do cartão do Início em português**, como a pessoa vai ver.
  - No passo do Ambito, escolher uma cidade mostra se há "popolazione attiva sufficiente" e a portata stimata.
  - O último passo lista cada regra com ✓ ou ✗. "Pubblica" só fica disponível com tudo ✓.

### 5.3 Não existe desafio de equipe nem sobre resultado
- **Onde:** console, em Sfide › Nuova sfida.
- **Esperado:**
  - Não há opção de equipe, área, unidade ou grupo.
  - Não há métrica sobre autoavaliação, VAS ou dias seguidos.
- **Prova:** `challenges.sql` tenta gravar isso direto no banco e o banco recusa.

---

## Fatia 6 — Add-on para empresas

### 6.1 O plano e o multiplicador
- **Onde:**
  - console, em Piani e aziende: os quatro planos (Essencial 1× · Plus 1,25× · Premium 1,5× · Max 2×);
  - para cada empresa, "Assegna / Cambia piano / Termina".
- **Faça:** troque a Aurora para **Max 2×**.
- **Esperado:**
  - No portal de RH, em **Plano**, aparece Max 2×.
  - No app, uma nova sessão Standard rende 2,20 + 2,20 Loops.
  - As sessões anteriores não mudam.
- **Em Report:** o bloco "Moltiplicatore per azienda e mese" tem o botão **"Scarica CSV per la fattura"**.

### 6.2 O RH configura, mas nunca vê pessoas
- **Onde:** `/#hr`, entrando como RH da Aurora.
- **Esperado:**
  - Aparecem os menus **Desafios (Add-on)**, **Benefícios (Add-on)** e **Plano**.
  - Em todas essas páginas fica o aviso: "Você vê apenas resultados agregados da empresa…".
- **Benefícios abertos:**
  - Cada tag tem um interruptor e o texto "afeta N benefícios".
  - Desligar uma tag pergunta "Seus colaboradores deixarão de ver N benefícios" e guarda histórico.
- **Benefícios da empresa:** só existem três modos de entrega:
  - código/voucher (CSV, sem saber quem resgatou);
  - coletivo;
  - resgate identificado.
- **Desafios:**
  - Começam sempre de um **modelo** (Boas-vindas, Sono em dia, Pausa consciente, Empresa em sintonia).
  - Valem sempre para a empresa inteira.
  - A recompensa é paga pela empresa.
  - O quadro "Checagem Good Loop" mostra ✓ por regra.
- **Painel:**
  - Mostra Desafios ativos, Adesão ao desafio, Loops gerados pelo multiplicador e Benefícios resgatados.
  - Tudo o que vem de menos de 25 pessoas aparece como "— menos de 25 pessoas". Isso vale também quando o grupo que sobra é que fica pequeno.
  - Nunca há recorte por área ou equipe.
- **Prova:** `company_addon.sql` mostra que:
  - só o RH da própria empresa, com add-on, consegue chamar essas funções;
  - o texto livre do RH não chega ao título do desafio;
  - a supressão por k funciona nos dois sentidos.

### 6.3 O colaborador vê o que a empresa oferece, e decide o que compartilha
- **Onde:** app.
- **Esperado:**
  - Os benefícios da empresa trazem o selo "Da sua empresa".
  - Os desafios da empresa aparecem como "Desafio da sua empresa", com a frase "A empresa vê só o resultado geral…".
  - Os benefícios com a tag que a empresa desligou ("Alimentos e bebidas") **não aparecem**. Essa regra vale no servidor, não só na tela.
- **Resgate identificado** ("Um dia de folga"):
  - Antes de confirmar, a pessoa vê exatamente o que vai para o RH: nome e com quem é compartilhado.
  - Ela digita a matrícula e marca o consentimento.
  - Sem isso, o resgate não acontece.
- **No portal de RH**, a aba "Resgates identificados" mostra esse resgate. Outros resgates nunca aparecem com nome.

---

## Fatia 7 — Console, demonstração e este roteiro

### 7.1 Console completo
- **Onde:** `/#admin`. O menu segue a ordem da SPEC: Economia · Traguardi · Sfide · Benefici · Tag · Piani e aziende · Report.
- **Economia:**
  - Mostra as regras editáveis.
  - O calcolatore diz "Una sessione Standard completata genera 22 punti e 2,20 Loops; con 1,5× ne genera 3,30".
  - A soglia per le aziende não desce abaixo de 25.
- **Traguardi:** edita limite, bônus e ativo, mostra o selo e tem o botão "Rivaluta tutti".
- **Tag:** permite criar e editar tags e mostra quantos benefícios usam cada uma.
- **Report:** mostra Punti e Loops emessi per origine, Loops riscattati, riscatti per beneficio, moltiplicatore per azienda (CSV) e risultati delle sfide. São só totais, nunca uma pessoa.

### 7.2 Dados de demonstração, só na prévia
- **Onde:** `/#admin`, na barra de prévia. Abra **App**, **Azienda** ou **Terapeuta**.
- **Esperado no App:**
  - Já há Loops e tempo dedicado no mês, e o Outubro Sereno está em andamento.
  - Ao abrir, uma conquista recente aparece na folha de desbloqueio.
  - Em Coletivas a pessoa já participa por São Paulo.
  - Em Meus benefícios há um ingresso de cinema resgatado.
- **Esperado na Azienda:** a Aurora com Premium 1,5×, "Alimentos e bebidas" desligada e o "Novembro em Loop" em andamento.
- **Esperado também:**
  - Mudar o plano no console ou desligar uma tag no RH aparece no App da mesma prévia.
  - Recarregar a página volta ao estado inicial da demonstração.
- **No app real** (banco de produção), nada disso existe.
- **Prova:** `gam-demo` falha se uma empresa, pessoa ou parceiro de demonstração aparecer no `setup.sql` ou no provedor real.

### 7.3 Este roteiro
- Um cenário por critério de aceite das sete fatias.
- As decisões que mudaram o que a SPEC pedia estão em `docs/gamification/PLAN.md`, na tabela A1–A31. Por exemplo: Pontos escondidos da pessoa, k = 25 em vez de 10, sessões interrompidas sem registro e desafios de empresa só por modelo.

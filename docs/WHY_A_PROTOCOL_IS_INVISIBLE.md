# "Publiquei o áudio e não aparece no app"

Um protocolo pode estar com o arquivo certo no lugar certo e mesmo assim não
aparecer, porque **a biblioteca passa por seis portões diferentes** e basta um
fechado. Este documento lista os seis, na ordem em que o app os aplica, e traz
as consultas para descobrir qual deles é.

Áudio é o **último** da lista. Na maioria dos casos o problema é um dos cinco
anteriores, e nenhum deles tem a ver com o arquivo.

---

## Os seis portões

| # | Portão | Onde está no código | Sintoma |
|---|--------|---------------------|---------|
| 1 | `enabled = true` | `supabase/23-protocols-read-scope.sql` | O protocolo nem chega ao navegador de quem não é admin. A policy exige `enabled`. |
| 2 | `tenants` | mesma policy | Se não for `"all"`, só quem é da empresa listada vê. |
| 3 | `audience = 'library'` | `data/liveCatalog.tsx:286` | **Era o caso de 28/10/2026** — veja a nota abaixo. O padrão da coluna é `'clinical'`, e protocolo clínico nunca aparece na biblioteca. |
| 4 | ~~tier / código clínico~~ | — | **NÃO existe hoje.** Ver a nota abaixo. |
| 5 | Arquivo **na língua E na forma** do ouvinte | `audioPick`, `playableDurations` | Sem o arquivo exato, a duração não é oferecida. Uma das dezenove sessões fixas fica visível porém **sem botão de tocar**; qualquer outro protocolo some da lista. |
| 6 | O arquivo abre | bucket `protocol-audio` | Se o bucket não for público, o protocolo **aparece** e falha ao tocar. |

### O que aconteceu em 28/10/2026 (portão 3)

O catálogo inteiro — mais de quarenta protocolos — estava com
`audience = 'clinical'`, inclusive `GL-CALM`, `GL-FOCUS`, `GL-ENER`,
`GL-GROW` e `GL-VIT`, que são autoguiados por definição.

Causa: `entryForPublish` (`src/admin/publishPlain.ts`) **nunca escrevia a
coluna**. Todo protocolo importado de um workbook PLAIN ficava com o default
do banco. Não havia campo nenhum no console que mostrasse isso, então nada
denunciava.

Consequência: só as dezenove sessões fixas do Self Use podiam aparecer, e
qualquer protocolo novo ia para o ar com o áudio certo e visível para
ninguém.

Corrigido em duas partes:

- **Código** — o publish agora escreve `audience`, com um palpite a partir
  do prefixo GL, e a tela de publicação tem o controle **"Chi lo usa?"**
  (Biblioteca / Clinico) logo acima dos botões. Prefixo desconhecido
  continua clínico de propósito: clínico aparecendo na biblioteca é o erro
  pior dos dois.
- **Dados** — `supabase/26-protocol-audience.sql` arruma as linhas que já
  existem. Rode no SQL Editor; ele mostra as contas antes e depois.

### Nota sobre o portão 4 — ele não está ligado

A regra de 2026-10-21 diz que um protocolo clínico nunca deve ser escolhido
pela pessoa na biblioteca, na busca, nas prateleiras ou nos cards de humor.
`isTherapistOnly()` existe e é calculado em `data/liveCatalog.tsx`, mas o
resultado é gravado num campo `therapistOnly` que **nenhuma tela lê**. Ou
seja: a regra está escrita e não está valendo.

Na prática o portão 3 cobre quase tudo — um protocolo clínico tem
`audience = 'clinical'` e já não entra na biblioteca por ali. A brecha são as
dezenove sessões fixas do Self Use, que são casadas por código e não passam
pelo portão 3: se uma delas for marcada "Clinico" no console, ela continua
aparecendo.

**Não liguei esse filtro agora de propósito**: ligar um filtro novo no meio de
uma investigação sobre protocolos que não aparecem só tornaria mais difícil
descobrir o que está acontecendo. Vale corrigir depois que o caso atual
estiver resolvido.

### Sobre o portão 5, que é o que mais confunde

Cada pessoa recebe **uma** combinação, sem substituto nenhum:

- A língua vem do **idioma do app** dela, não do país: `it` → `it`,
  qualquer outro → `pt-BR`, e `en` → nada (inglês ainda não é gravado).
- A forma vem do **"Como o áudio fala com você"** que ela escolheu no
  cadastro: masculino → `pt-BR`, feminino → `pt-BR:f`.

Não existe queda para a outra língua nem para a outra forma (sua regra de
2026-10-21). Então um arquivo `pt-BR` masculino **não aparece** para:

- quem está com o app em **italiano** — e o idioma padrão do app é o italiano;
- quem escolheu a forma **feminina** no cadastro.

O jeito mais rápido de eliminar isso: na conta de teste, vá em
**Perfil → Configurações da conta → Idioma** e confirme que está em Português,
e em **Perfil → Preferências das sessões → Como o áudio fala com você** e
confirme que está em Masculino.

---

## Antes de tudo: você está olhando o banco certo?

Se no alto da tela aparece a faixa

> **LOCAL** · Nenhum banco de dados conectado — são dados fictícios que se
> apagam ao recarregar a página.

então o app **não está lendo o catálogo de verdade**. Ele está usando o
catálogo de demonstração: dezenove sessões fixas, sem áudio nenhum, que tocam
um fundo sonoro sintetizado. **É esse o "áudio demonstrativo" que você ouviu** —
não é o seu arquivo tocando errado, é que o seu protocolo não está nessa tela.

Isso acontece em qualquer deploy sem as variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` — que é como as *previews* de branch estão
configuradas. Para testar publicação, use produção ou um deploy com essas
duas variáveis.

(Em produção esse fundo sintetizado não é alcançável: uma duração sem arquivo
não é oferecida. Se você ouvir o fundo sintetizado **em produção**, isso é um
defeito e vale me avisar.)

---

## Como extrair as informações

### Opção A — o console de admin (mais rápido, sem SQL)

Depois do último commit, a tela **Catálogo** mostra, para cada duração:

```
audio: IT·M ✓ · IT·F — · PT·M ✓ · PT·F —
```

Antes ela dizia só `IT ✓ · PT —`, e testava apenas a forma masculina — então
um arquivo feminino aparecia como "sem áudio". Agora as quatro combinações
aparecem separadas. Um print dessa linha já responde o portão 5.

### Opção B — SQL (responde os seis de uma vez)

No painel do Supabase: **SQL Editor → New query**, cola, **Run**. Todas as três
são apenas `select` — não escrevem nada.

#### B1. O catálogo inteiro, com todos os portões

```sql
select
  p.code                                        as codigo,
  p.enabled                                     as ativo,
  coalesce(p.audience, 'clinical')              as audiencia,
  p.tenants                                     as empresas,
  p.source                                      as origem,
  (v->>'duration')::int                         as minutos,
  coalesce(
    (select string_agg(kv.key, '  +  ' order by kv.key)
       from jsonb_each_text(coalesce(v->'audioUrl', '{}'::jsonb)) kv
      where coalesce(kv.value, '') <> ''),
    '-- SEM AUDIO --')                          as variantes_com_audio,
  p.updated_at                                  as atualizado
from protocols p
left join lateral jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) v on true
order by p.updated_at desc, minutos;
```

Em `variantes_com_audio` as chaves significam:
`pt-BR` = português masculino · `pt-BR:f` = português feminino ·
`it` = italiano masculino · `it:f` = italiano feminino.
(A forma masculina fica com a chave "nua" por compatibilidade — ver
`src/tts/voiceLang.ts`.)

#### B2. O veredito para UM protocolo

Troque o código na última linha:

```sql
select
  code,
  case
    when not enabled
      then 'INVISIVEL: enabled = false'
    when tenants::text <> '"all"'
      then 'RESTRITO as empresas: ' || tenants::text
    when coalesce(audience, 'clinical') <> 'library'
      then 'NAO APARECE NA BIBLIOTECA: audience = ' || coalesce(audience, 'clinical')
           || ' -- so aparece quando um terapeuta prescreve'
    when not exists (
      select 1
        from jsonb_array_elements(coalesce(versions, '[]'::jsonb)) v,
             jsonb_each_text(coalesce(v->'audioUrl', '{}'::jsonb)) kv
       where coalesce(kv.value, '') <> '')
      then 'SEM AUDIO em nenhuma duracao'
    else 'OK no catalogo -- se nao aparece, e a lingua/forma do leitor (portao 5)'
  end as veredito
from protocols
where code = 'COLOQUE O CODIGO AQUI';
```

#### B3. Os arquivos que realmente estão no storage

```sql
select
  b.id                                as bucket,
  b.public                            as publico,
  o.name                              as arquivo,
  (o.metadata->>'size')::bigint       as bytes,
  o.created_at                        as subido_em
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
where b.id = 'protocol-audio'
order by o.created_at desc nulls last
limit 40;
```

O nome do arquivo carrega a variante:
`GL-ANX_1_1/12min-pt-BR.mp3` é português masculino,
`…/12min-pt-BR-f.mp3` é feminino (`src/admin/attachAudio.ts`).

**Se `publico` vier `false`, esse é o portão 6**: o protocolo aparece no app e
falha na hora de tocar.

---

## O que me mandar

O resultado de **B1** (ou só as linhas do protocolo em questão) e de **B3**,
mais:

- o **código** do protocolo que você publicou;
- o **idioma do app** e a **forma** da conta com que você testou;
- se a faixa **LOCAL** aparece na tela onde você testou.

Com isso eu digo qual dos seis portões é, sem chutar.

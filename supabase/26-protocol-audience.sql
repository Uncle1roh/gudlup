-- ============================================================================
-- PROTOCOLS — quem usa cada protocolo
--
-- Para um banco que já está no ar. Rode no SQL Editor do Supabase.
-- Pode rodar de novo sem problema (é idempotente).
--
-- O PORQUÊ. `entryForPublish` (src/admin/publishPlain.ts) nunca escrevia a
-- coluna `audience`, então todo protocolo importado de um workbook PLAIN
-- ficava com o default da coluna: 'clinical'. A biblioteca do Self Use só
-- lista `audience = 'library'` (resolveSessions, src/data/liveCatalog.tsx),
-- e protocolo clínico só aparece quando um terapeuta prescreve.
--
-- Resultado: todo protocolo autoguiado publicado por esse caminho foi para o
-- ar com o áudio no lugar certo e visível para ninguém. Em 2026-10-28 o
-- catálogo inteiro — 40 e poucos protocolos — estava marcado 'clinical',
-- inclusive as famílias que são autoguiadas por definição.
--
-- O código já foi corrigido: a partir de agora o publish escreve a coluna,
-- com um palpite a partir do prefixo GL e um controle na tela para corrigir.
-- Este arquivo conserta o que já está gravado.
--
-- AS FAMÍLIAS. Clínicas: ANX, DEP, BURN, STRESS, RESIL — material que um
-- profissional coloca num percurso. Autoguiadas: LIB, CALM, FOCUS, ENER,
-- GROW, VIT, INTRO — a pessoa abre sozinha.
-- A mesma lista está em `LIBRARY_CODE_PREFIXES`, src/data/catalog.ts: se
-- mudar uma, mude a outra.
-- ============================================================================

-- 1. OLHE ANTES DE MUDAR. Quantas linhas cada prefixo tem, e como estão hoje.
select
  split_part(code, ' ', 1)        as prefixo,
  audience                        as hoje,
  count(*)                        as protocolos
from protocols
group by 1, 2
order by 1;

-- 2. A MUDANÇA. Só as famílias autoguiadas, e só as que ainda não estão
--    marcadas assim. Nada mais da linha é tocado.
update protocols
   set audience   = 'library',
       updated_at = now()
 where split_part(code, ' ', 1) in
       ('GL-LIB', 'GL-CALM', 'GL-FOCUS', 'GL-ENER', 'GL-GROW', 'GL-VIT', 'GL-INTRO')
   and coalesce(audience, 'clinical') <> 'library';

-- 3. CONFIRA. As mesmas contas de (1), agora depois da mudança.
select
  split_part(code, ' ', 1)        as prefixo,
  audience                        as agora,
  count(*)                        as protocolos
from protocols
group by 1, 2
order by 1;

-- 4. O QUE A PESSOA VAI VER DE VERDADE. Um protocolo só aparece se estiver
--    ativo, ser de biblioteca, e TER ARQUIVO na língua e na forma de quem
--    está olhando (audioPick, src/data/liveCatalog.tsx — não há fallback).
select
  p.code                                      as codigo,
  (v->>'duration')::int                       as minutos,
  coalesce(
    (select string_agg(kv.key, ' + ' order by kv.key)
       from jsonb_each_text(coalesce(v->'audioUrl', '{}'::jsonb)) kv
      where coalesce(kv.value, '') <> ''),
    '-- SEM AUDIO --')                        as quem_consegue_ouvir
from protocols p
left join lateral jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) v on true
where p.enabled
  and coalesce(p.audience, 'clinical') = 'library'
order by p.code, minutos;

notify pgrst, 'reload schema';

-- ============================================================================
-- 29 · Os textos legais que o console pode reescrever
--
-- POR QUE. Os ~120 avisos legais registrados vivem dentro do aplicativo
-- (`src/legal/messages.ts`): um ID, um tier e a frase em três idiomas. Esse é
-- o lugar certo para eles — são revisados juntos e publicados juntos — e é
-- também por isso que ninguém fora do repositório conseguia corrigir uma
-- vírgula em um deles. Os POs pediram uma tela no console para editar e
-- revisar esses textos.
--
-- O QUE ESTA TABELA É. Uma CAMADA POR CIMA, não uma substituição. Cada linha
-- reescreve UM aviso em UM idioma. O ID, o tier, o mercado e a cadeia de
-- fallback para o inglês continuam vindo do aplicativo, então uma linha aqui
-- muda o que uma frase DIZ e nunca muda qual frase aparece, onde, ou para
-- quem. Apagar a linha faz voltar a frase que veio no build.
--
-- A VERSÃO NÃO É OPCIONAL. O enquadramento legal mantém um registro de qual
-- texto estava em vigor e quando (LEG-07 / ADM-06). Um console que pudesse
-- reescrever um aviso tier A sem tocar nesse registro tornaria o registro um
-- documento sobre outra coisa que não o que as pessoas leem. Por isso cada
-- linha carrega a versão a que pertence, e `saveLegalTexts()` grava a linha
-- do registro na mesma chamada.
--
-- LEITURA PÚBLICA, ESCRITA SÓ DO ADMIN. As frases aparecem na porta, na
-- página legal e na primeira execução — nenhuma delas tem conta ainda — então
-- a leitura é liberada. Escrever é só para admin, como todo o resto do
-- console.
--
-- COMO RODAR. Cole no SQL Editor do Supabase (produção) e execute. É
-- idempotente: pode rodar duas vezes sem efeito nenhum.
-- ============================================================================

create table if not exists legal_texts (
  ref_id      text not null,              -- 'ONB-2.2', 'CRS-01', …
  locale      text not null check (locale in ('it', 'pt-BR', 'en')),
  body        text not null,
  version     text not null,              -- a versão legal a que este texto pertence
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (ref_id, locale)
);

alter table legal_texts enable row level security;

-- ---- leitura: qualquer um, inclusive deslogado -----------------------------
-- As frases são mostradas antes de existir conta. Um aviso legal que não
-- carrega porque ninguém fez login é um aviso que não foi dado.
do $$ begin
  create policy legal_texts_read on legal_texts for select using (true);
exception when duplicate_object then null; end $$;

-- ---- escrita: só admin -----------------------------------------------------
do $$ begin
  create policy legal_texts_write on legal_texts for all
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;

-- ---- quem mexeu, automaticamente -------------------------------------------
create or replace function legal_texts_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(
    (select p.email from profiles p where p.id = auth.uid()),
    new.updated_by);
  return new;
end $$;

drop trigger if exists legal_texts_stamp_t on legal_texts;
create trigger legal_texts_stamp_t before insert or update on legal_texts
  for each row execute function legal_texts_stamp();

-- ---- conferência -----------------------------------------------------------
-- Deve trazer zero linhas numa base nova, e nenhum erro.
select count(*) as textos_reescritos from legal_texts;

notify pgrst, 'reload schema';

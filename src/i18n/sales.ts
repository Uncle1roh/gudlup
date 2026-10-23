/* ============================================================================
   The commercial console, in Portuguese

   Italian in, Portuguese out. The key IS the Italian the screen was authored
   in — see the header of `src/sales/i18n.ts` for why this one dictionary is
   keyed differently from every other one in the project.

   A key with no row here falls through as Italian, which is the correct
   wrong answer: a string that has not been translated yet shows the words
   the screen was written with, rather than a blank or a key name.

   `{name}`-shaped holes are filled by `st`, and must survive translation —
   the Portuguese may move them, never drop them.
   ============================================================================ */

export const PT_SALES: Record<string, string> = {
  /* ---- the console itself ---- */
  'commerciale': 'comercial',
  'Sezioni della console': 'Seções do console',
  'Fare una demo': 'Fazer uma demo',
  'Dati dimostrativi: niente di reale viene letto o scritto.':
    'Dados fictícios: nada real é lido ou gravado.',
  'Utente': 'Usuário',
  'Terapeuta': 'Terapeuta',
  'Impresa': 'Empresa',
  'Apri un’altra app': 'Abrir outro app',
  'Anteprima con dati dimostrativi': 'Prévia com dados fictícios',
  'Informazioni legali ↗': 'Informações legais ↗',
  'La console è pensata per lo schermo di un computer: qui funziona tutto, ma le tabelle scorrono di lato.':
    'O console foi pensado para a tela de um computador: aqui tudo funciona, mas as tabelas rolam para o lado.',
  'Piani e moltiplicatori': 'Planos e multiplicadores',
  'Campagne': 'Campanhas',
  'Modelli di campagna': 'Modelos de campanha',
  'Benefici e partner': 'Benefícios e parceiros',

  /* ---- shared across the screens ---- */
  'Annulla': 'Cancelar',
  'Crea': 'Criar',
  'Salva': 'Salvar',
  'Modifica': 'Editar',
  'Elimina': 'Excluir',
  'Chiudi': 'Fechar',
  'Copia': 'Copiar',
  'Copiato': 'Copiado',
  'Caricamento…': 'Carregando…',
  'Salvataggio…': 'Salvando…',
  /* 'Stato' is the table column — the SCOPE of the same name is written
     'Stato (UF)' in the source for exactly this reason: one Italian word,
     two meanings, and a dictionary cannot hold both under one key. */
  'Stato': 'Situação',
  'Azione': 'Ação',
  'Azioni': 'Ações',
  'Creata': 'Criada',
  'Creato': 'Criado',
  'Data': 'Data',
  'Persona': 'Pessoa',
  'Filtro': 'Filtro',
  'Tag': 'Tags',
  'Partner': 'Parceiro',
  'Loops': 'Loops',
  'Pubblica': 'Publicar',
  'Archivia': 'Arquivar',
  'Nome *': 'Nome *',
  'Id *': 'Id *',

  /* ---- Aziende ---- */
  'Aziende': 'Empresas',
  'Azienda': 'Empresa',
  '+ Nuova azienda': '+ Nova empresa',
  'Nome azienda': 'Nome da empresa',
  'Codice azienda': 'Código da empresa',
  'E-mail del referente': 'E-mail do responsável',
  'Quante persone può registrare': 'Quantas pessoas pode cadastrar',
  'Le aziende su cui la piattaforma è attivata. {n} in totale.':
    'As empresas com a plataforma ativada. {n} no total.',
  'Il codice è l’accesso. Creare l’azienda non crea nessun login: l’HR si registra da sé su #hr con questo codice, e i dipendenti lo inseriscono alla registrazione.':
    'O código é o acesso. Criar a empresa não cria nenhum login: o RH se cadastra sozinho em #hr com este código, e os funcionários o informam no cadastro.',
  'Suggerito dal nome, e modificabile. È quello che l’HR e i dipendenti digitano.':
    'Sugerido pelo nome, e editável. É o que o RH e os funcionários digitam.',
  'A chi mandare il codice. Non crea un login: lo apre la persona stessa su #hr.':
    'Para quem enviar o código. Não cria um login: a própria pessoa o abre em #hr.',
  'Il numero di dipendenti coperti dal contratto.': 'O número de funcionários cobertos pelo contrato.',
  'Senza piano i Loops valgono 1×. Si può assegnare anche dopo, in «Piani e moltiplicatori».':
    'Sem plano os Loops valem 1×. Dá para atribuir depois, em «Planos e multiplicadores».',
  'Mandalo a {email} — con questo codice apre il pannello aziendale su #hr.':
    'Envie para {email} — com este código ela abre o painel da empresa em #hr.',
  'ES. BENVENUTO10': 'EX. BEMVINDO10',
  'Postazioni': 'Assentos',
  'Postazioni usate': 'Assentos usados',
  'Piano add-on': 'Plano add-on',
  'Nessun piano · 1×': 'Sem plano · 1×',
  'Codice / accesso': 'Código / acesso',
  'Copia il codice': 'Copiar o código',
  'Codice terapeuta': 'Código do terapeuta',
  'Sospendi': 'Pausar',
  'Riattiva': 'Reativar',
  'Attiva': 'Ativa',
  'In pausa': 'Pausada',
  'Sarà {code}.': 'Será {code}.',
  '{code} è già di un’altra azienda.': '{code} já é de outra empresa.',
  'Forma non valida: serve NOME-ANNO-XX.': 'Formato inválido: precisa ser NOME-ANO-XX.',
  '{name} creata. Codice azienda:': '{name} criada. Código da empresa:',
  'Impossibile generare il codice: {err}': 'Não foi possível gerar o código: {err}',
  'Azienda creata, ma il piano non è stato applicato: {err}':
    'Empresa criada, mas o plano não foi aplicado: {err}',
  'Assegnalo da “Piani e moltiplicatori”.': 'Atribua em “Planos e multiplicadores”.',
  'Con {plan} i Loops dell’ascolto valgono {mult}× per chi è di questa azienda, finché l’abbonamento è attivo. Vale per le sessioni che finiscono da adesso: niente viene ricalcolato all’indietro.':
    'Com o {plan}, os Loops da escuta valem {mult}× para quem é desta empresa, enquanto a assinatura estiver ativa. Vale para as sessões que terminarem a partir de agora: nada é recalculado para trás.',
  'Il codice azienda è anche l’accesso: con questo codice l’HR si registra su #hr e apre il pannello aziendale, e i dipendenti lo inseriscono alla registrazione per essere collegati.':
    'O código da empresa também é o acesso: com ele o RH se cadastra em #hr e abre o painel da empresa, e os funcionários o informam no cadastro para serem vinculados.',

  /* ---- Piani e moltiplicatori ---- */
  'Piani e aziende': 'Planos e empresas',
  'Piani': 'Planos',
  'Piano': 'Plano',
  '+ Nuovo piano': '+ Novo plano',
  'Moltiplicatore': 'Multiplicador',
  'Sfide aziendali': 'Desafios da empresa',
  'Benefici aziendali': 'Benefícios da empresa',
  'Filtro dei tag': 'Filtro de tags',
  'Vendibile': 'Vendável',
  'Include': 'Inclui',
  'sfide': 'desafios',
  'benefici': 'benefícios',
  'filtro tag': 'filtro de tags',
  'Piano in vigore': 'Plano vigente',
  'Dal': 'Desde',
  'Cambia': 'Alterar',
  'nessun piano': 'nenhum plano',
  'nessun add-on': 'sem add-on',
  'Cambia piano…': 'Alterar plano…',
  'Assegna piano…': 'Atribuir plano…',
  'Termina l’add-on': 'Encerrar o add-on',
  '{company}: {from} → {to}?': '{company}: {from} → {to}?',
  'Vale da adesso: le sessioni già accreditate non cambiano.':
    'Vale a partir de agora: as sessões já creditadas não mudam.',
  'L’id usa solo lettere minuscole, cifre e _.': 'O id usa apenas letras minúsculas, números e _.',
  'Il moltiplicatore va da 1 a 5.': 'O multiplicador vai de 1 a 5.',
  'Il moltiplicatore tocca solo i Loops dell’ascolto: mai i Punti, le classifiche, le conquiste, le sfide o i bonus.':
    'O multiplicador afeta apenas os Loops da escuta: nunca os Pontos, os rankings, as conquistas, os desafios ou os bônus.',

  /* ---- Codici promo ---- */
  'Codici promo': 'Códigos promocionais',
  'Codice': 'Código',
  '+ Nuovo codice': '+ Novo código',
  'Genera': 'Gerar',
  'Sconto': 'Desconto',
  'Sconto %': 'Desconto %',
  'Utilizzi': 'Usos',
  'Sì, elimina': 'Sim, excluir',
  'Forma non valida.': 'Formato inválido.',
  'Codici da inserire alla registrazione, ciascuno con la sua percentuale di sconto. {n} in totale.':
    'Códigos informados no cadastro, cada um com a sua porcentagem de desconto. {n} no total.',
  'Da 3 a 32 caratteri: lettere, numeri e trattini. Sconto da 1 a 100%.':
    'De 3 a 32 caracteres: letras, números e hifens. Desconto de 1 a 100%.',
  'Sarà {code} · {pct}%.': 'Será {code} · {pct}%.',
  '{code} esiste già.': '{code} já existe.',
  'Lo sconto è un numero intero da 1 a 100.': 'O desconto é um número inteiro de 1 a 100.',
  'Impossibile caricare i codici: {err} — esegui supabase/9-promo-codes.sql.':
    'Não foi possível carregar os códigos: {err} — rode supabase/9-promo-codes.sql.',
  'Ancora nessun codice. «＋ Nuovo codice» per crearne uno.':
    'Ainda não há códigos. Use «＋ Novo código» para criar um.',
  '{n} account lo hanno usato: mantengono lo sconto':
    '{n} contas já usaram: elas mantêm o desconto',
  'Eliminare un codice impedisce nuove registrazioni con quel codice; gli account già registrati mantengono lo sconto.':
    'Excluir um código impede novos cadastros com ele; as contas já cadastradas mantêm o desconto.',

  /* ---- Modelli di campagna ---- */
  'Modelli di sfida': 'Modelos de campanha',
  'Modello': 'Modelo',
  '+ Nuovo modello': '+ Novo modelo',
  'Salva modello': 'Salvar modelo',
  'Slug *': 'Slug *',
  'Nome (pt-BR) *': 'Nome (pt-BR) *',
  'Testo (pt-BR, una frase) *': 'Texto (pt-BR, uma frase) *',
  'Formato': 'Formato',
  'Individuale': 'Individual',
  'Collettiva': 'Coletiva',
  'Collettiva — tutta l’azienda': 'Coletiva — toda a empresa',
  'Obiettivo': 'Meta',
  'Obiettivo letto come': 'Meta lida como',
  'Totale comune': 'Total comum',
  '% dell’azienda che raggiunge il minimo': '% da empresa que atinge o mínimo',
  'Metrica': 'Métrica',
  'Minimo a persona': 'Mínimo por pessoa',
  'Icona': 'Ícone',
  'Offerto alle aziende': 'Oferecido às empresas',
  'Anteprima nella Home del dipendente': 'Prévia na Início do funcionário',
  '% con {n}+': '% com {n}+',
  '{n} gg': '{n} dias',
  'Lo slug usa solo lettere minuscole, cifre e _.': 'O slug usa apenas letras minúsculas, números e _.',
  'Servono un nome e un testo (in portoghese).': 'São necessários um nome e um texto (em português).',
  'Modello «{title}» salvato.': 'Modelo «{title}» salvo.',
  'L’RH sceglie un modello e imposta date, obiettivo e premio; nome e testo restano questi. Sono in portoghese, come li legge il dipendente.':
    'O RH escolhe um modelo e define datas, meta e prêmio; o nome e o texto continuam sendo estes. Estão em português, como o funcionário os lê.',

  /* the metrics a campaign can count */
  'Minuti ascoltati': 'Minutos ouvidos',
  'Sessioni completate': 'Sessões concluídas',
  'Sessioni Deep completate': 'Sessões Deep concluídas',
  'Sessioni in una fascia oraria': 'Sessões em uma faixa de horário',
  'Percorsi completati': 'Trilhas concluídas',

  /* the fixed rules, shown as a checklist */
  'Nessuna sequenza di giorni: nessuno perde progressi': 'Sem sequência de dias: ninguém perde progresso',
  'Nessun obiettivo su autovalutazioni, punteggi o VAS': 'Nenhuma meta sobre autoavaliações, escores ou VAS',
  'Le sessioni SOS non contano mai': 'As sessões SOS nunca contam',
  'Tutta l’azienda: niente squadre o gruppi piccoli': 'A empresa inteira: sem times ou grupos pequenos',
  'Nessuna squadra o piccolo gruppo: nazionale, regione, stato o città':
    'Sem times ou grupos pequenos: nacional, região, estado ou cidade',
  'Una durata valida': 'Uma duração válida',
  'La fine viene dopo l’inizio': 'O fim vem depois do início',
  'C’è un premio': 'Há um prêmio',
  'C’è un premio: Loops bonus e/o un beneficio esclusivo':
    'Há um prêmio: Loops bônus e/ou um benefício exclusivo',
  'Obiettivo valido (e un minimo a persona, se collettiva)':
    'Meta válida (e um mínimo por pessoa, se coletiva)',
  'Obiettivo valido (e un minimo per persona, se collettiva)':
    'Meta válida (e um mínimo por pessoa, se coletiva)',

  /* ---- Benefici e partner ---- */
  'Benefici': 'Benefícios',
  'Beneficio': 'Benefício',
  '+ Nuovo beneficio': '+ Novo benefício',
  'Modifica beneficio': 'Editar benefício',
  'Nuovo beneficio': 'Novo benefício',
  'Vista': 'Visão',
  'Catalogo': 'Catálogo',
  'Riscatti ({n})': 'Resgates ({n})',
  'Pilastro': 'Pilar',
  'Consegna': 'Entrega',
  'Titolo *': 'Título *',
  'Descrizione': 'Descrição',
  'Prezzo in Loops': 'Preço em Loops',
  'Riscatti per persona': 'Resgates por pessoa',
  'Valido dal': 'Válido de',
  'Valido fino al': 'Válido até',
  'Giorni di validità del codice': 'Dias de validade do código',
  'Condizioni e come usarlo': 'Condições e como usar',
  'Segmento del partner': 'Segmento do parceiro',
  'Tipo di beneficio': 'Tipo de benefício',
  'Rimborsa': 'Estornar',
  'Codici': 'Códigos',
  'Codici per «{title}»': 'Códigos para «{title}»',
  'solo sfida': 'só campanha',
  ' (solo sfida)': ' (só campanha)',
  'nessun tag': 'sem tag',
  'Azienda: {id}': 'Empresa: {id}',
  '{free} liberi di {total}': '{free} livres de {total}',
  'Nessun riscatto ancora.': 'Ainda não há resgates.',
  '{n} codici nuovi caricati.': '{n} códigos novos carregados.',
  'Carica {n} codici': 'Carregar {n} códigos',
  '— almeno uno per un beneficio Good Loop': '— ao menos uma para um benefício Good Loop',
  'Senza tag si può salvare solo come bozza.': 'Sem tag só é possível salvar como rascunho.',
  'Solo come premio di una sfida (lo collega la sfida)':
    'Apenas como prêmio de uma campanha (a campanha faz o vínculo)',
  'Perché si prende cura della persona (in portoghese, come la legge la persona)':
    'Por que cuida da pessoa (em português, como a pessoa lê)',
  'Serve almeno un tag per pubblicare un beneficio Good Loop.':
    'É preciso ao menos uma tag para publicar um benefício Good Loop.',
  'Rimborsare «{title}» a {who}?': 'Estornar «{title}» para {who}?',
  'I Loops tornano nel saldo della persona e l’unità torna disponibile. Un codice già mostrato non viene riassegnato.':
    'Os Loops voltam para o saldo da pessoa e a unidade fica disponível de novo. Um código já exibido não é reatribuído.',
  'Cura che torna alla persona, scambiata con i Loops. {n} benefici Good Loop, {active} attivi.':
    'Cuidado que volta para a pessoa, trocado por Loops. {n} benefícios Good Loop, {active} ativos.',
  'Un codice per riga (o un CSV: conta la prima colonna). I doppioni si saltano. Dopo il caricamento i codici non si rileggono: li vedrà solo chi li riceve.':
    'Um código por linha (ou um CSV: vale a primeira coluna). Duplicados são ignorados. Depois do envio os códigos não são mais legíveis: só quem recebe os vê.',
  'Nessun conto alla rovescia, nessun prezzo barrato, nessun «ultime unità»: l’app non li mostra e il testo non deve suggerirli.':
    'Sem contagem regressiva, sem preço riscado, sem «últimas unidades»: o app não mostra nada disso e o texto não deve sugerir.',

  /* the pillars and the delivery kinds */
  'Sonno': 'Sono',
  'Mente': 'Mente',
  'Corpo': 'Corpo',
  'Movimento': 'Movimento',
  'Alimentazione': 'Alimentação',
  'Pause e tempo libero': 'Pausas e lazer',
  'Codici unici (CSV)': 'Códigos únicos (CSV)',
  'Codice unico per tutti': 'Código único para todos',
  'Link': 'Link',
  'Collettivo': 'Coletivo',
  'Riscatto identificato': 'Resgate identificado',
  'bozza': 'rascunho',
  'attivo': 'ativo',
  'in pausa': 'pausado',
  'archiviato': 'arquivado',

  /* ---- Campagne ---- */
  'Sfide Good Loop': 'Campanhas Good Loop',
  'Sfida': 'Campanha',
  '+ Nuova sfida': '+ Nova campanha',
  'Modifica sfida': 'Editar campanha',
  'Nuova sfida': 'Nova campanha',
  'Nome da sfida': 'Nome da campanha',
  'Nessuna sfida.': 'Nenhuma campanha.',
  'Sfide attive': 'Campanhas ativas',
  'Persone che partecipano': 'Pessoas participando',
  'Hanno completato': 'Concluíram',
  'Premi consegnati': 'Prêmios entregues',
  'Cerca per nome': 'Buscar por nome',
  'Periodo': 'Período',
  'Formato / ambito': 'Formato / escopo',
  'Premio': 'Prêmio',
  'Partecipano / completato': 'Participam / concluíram',
  'beneficio': 'benefício',
  'Regole fisse in ogni sfida': 'Regras fixas em toda campanha',
  'Le sessioni SOS non contano mai · nessun obiettivo su autovalutazioni o VAS · nessuna sequenza di giorni · nessuno perde progressi · nessuna squadra o gruppo piccolo.':
    'As sessões SOS nunca contam · nenhuma meta sobre autoavaliações ou VAS · sem sequência de dias · ninguém perde progresso · sem times ou grupos pequenos.',
  /* the editor's steps */
  'Informazioni': 'Informações',
  'Formato e obiettivo': 'Formato e meta',
  'Comunicazione': 'Comunicação',
  'Rivedi e pubblica': 'Revisar e publicar',
  'Scorte dei premi': 'Estoque dos prêmios',
  'Icona del badge': 'Ícone do selo',
  'Nome (pt-BR, max 80) *': 'Nome (pt-BR, máx. 80) *',
  'Descrizione breve (pt-BR, una frase)': 'Descrição curta (pt-BR, uma frase)',
  '(minuti)': '(minutos)',
  'Dalle (ora)': 'Das (hora)',
  'Alle (ora)': 'Às (hora)',
  'Loops bonus (mai moltiplicati)': 'Loops bônus (nunca multiplicados)',
  'Obiettivo proposto': 'Meta proposta',
  'Durata proposta (giorni)': 'Duração proposta (dias)',
  'Link per usarlo': 'Link para usar',
  'Quantità totale (vuoto = senza limite)': 'Quantidade total (vazio = sem limite)',
  'Inizio': 'Início',
  'Fine': 'Fim',
  'Ambito': 'Escopo',
  'Regione': 'Região',
  'Minimo a persona per il premio': 'Mínimo por pessoa para o prêmio',
  'Beneficio esclusivo': 'Benefício exclusivo',
  '— nessuno —': '— nenhum —',
  'Se le unità non bastano': 'Se as unidades não bastarem',
  'A chi completa per primo': 'Para quem concluir primeiro',
  'Sorteggio alla chiusura': 'Sorteio no encerramento',
  'Salva bozza': 'Salvar rascunho',
  'Pubblica ora': 'Publicar agora',
  'Chiudi senza salvare': 'Fechar sem salvar',
  'Anteprima nella Home': 'Prévia na Início',
  'Sfida pubblicata.': 'Campanha publicada.',
  'Sfida programmata.': 'Campanha programada.',
  'Bozza salvata.': 'Rascunho salvo.',
  'Eventi a tempo, individuali o collettivi di massa, per tutto il Brasile o per una regione, uno stato, una città.':
    'Eventos com prazo, individuais ou coletivos de massa, para todo o Brasil ou para uma região, um estado, uma cidade.',
  'Individuale — ognuno il proprio obiettivo': 'Individual — cada um com a sua meta',
  'Collettiva di massa — un obiettivo comune': 'Coletiva de massa — uma meta comum',
  'Fuso orario: America/Sao_Paulo. Contano le sessioni che FINISCONO dentro il periodo.':
    'Fuso: America/Sao_Paulo. Contam as sessões que TERMINAM dentro do período.',
  'La quantità è quella del beneficio (Benefici › Quantità totale). Un beneficio «solo sfida» si collega a questa sfida al salvataggio.':
    'A quantidade é a do benefício (Benefícios › Quantidade total). Um benefício «só campanha» é vinculado a esta campanha ao salvar.',
  'Un beneficio esclusivo con quantità limitata va a chi completa per primo, oppure si sorteggia alla chiusura tra chi ha completato. Alla persona non si mostra mai quante unità restano.':
    'Um benefício exclusivo com quantidade limitada vai para quem concluir primeiro, ou é sorteado no encerramento entre quem concluiu. A pessoa nunca vê quantas unidades restam.',
  'Annunciare nell’app — un messaggio gentile, una volta sola, mai notifiche ripetute.':
    'Anunciar no app — uma mensagem gentil, uma única vez, nunca notificações repetidas.',
  'Terminare «{title}» adesso? Si chiude e si assegnano i premi (con sorteggio, se previsto).':
    'Encerrar «{title}» agora? Ela fecha e os prêmios são atribuídos (com sorteio, se previsto).',
  'Annullare «{title}»? Nessun premio verrà assegnato da qui in avanti.':
    'Cancelar «{title}»? Nenhum prêmio será atribuído daqui em diante.',

  /* the campaign states and scopes */
  'Bozza': 'Rascunho',
  'Programmata': 'Programada',
  'Conclusa': 'Encerrada',
  'Chiusa': 'Fechada',
  'Annullata': 'Cancelada',
  'Nazionale': 'Nacional',
  'Stato (UF)': 'Estado (UF)',
  'Città': 'Cidade',

  /* the filter chips above the campaign list */
  'Tutte': 'Todas',
  'Attive': 'Ativas',
  'Programmate': 'Programadas',
  'Bozze': 'Rascunhos',
  'Concluse': 'Encerradas',
}

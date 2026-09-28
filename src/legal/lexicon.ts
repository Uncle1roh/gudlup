/* ============================================================================
   Good Loop — the claims lexicon, as a linter (ADM-01, MN-09, MN-23)

   The prohibited vocabulary of GoodLoop_Module_Taxonomy_and_Lexicon_v5_PathA
   (Lexicon_Avoid, rows 1–18) in English, pt-BR and Italian, matched
   accent-insensitively (Lexicon_Notes 18: "insonia" is "insônia"). The
   console runs it over a title, a public name, a blurb and the tags before
   a row can be saved or enabled, and refuses on a hit — a word that names a
   condition in a catalogue label is a claim about the person, and the
   register says that is a defect, not a copy preference.

   What is NOT here: everyday feeling words ("teso", "stanco") and the
   situational vocabulary, which are the permitted register; and the words
   the notices themselves use in the negative ("non è un trattamento"). The
   linter runs over catalogue metadata, never over the legal corpus.
   ============================================================================ */

export interface LexiconHit {
  term: string
  category: string
}

interface LexRow { category: string; terms: string[] }

const AVOID: LexRow[] = [
  { category: 'condition', terms: [
    'anxiety', 'anxiety disorder', 'depression', 'panic', 'panic attack', 'phobia', 'ptsd', 'trauma', 'ocd', 'insomnia', 'burnout', 'stress disorder',
    'ansiedade', 'transtorno de ansiedade', 'depressão', 'pânico', 'síndrome do pânico', 'fobia', 'tept', 'toc', 'insônia', 'síndrome de burnout', 'esgotamento profissional', 'transtorno', 'distúrbio',
    'ansia', 'disturbo d\'ansia', 'depressione', 'panico', 'attacco di panico', 'dpts', 'doc', 'insonnia', 'esaurimento', 'disturbo',
  ] },
  { category: 'phobia', terms: [
    'fear of flying', 'flight phobia', 'aviophobia', 'claustrophobia', 'agoraphobia', 'dental phobia', 'social phobia', 'stage fright',
    'medo de voar', 'medo de avião', 'aerofobia', 'fobia de avião', 'claustrofobia', 'agorafobia', 'odontofobia', 'fobia social', 'medo de falar em público',
    'paura di volare', 'paura di parlare in pubblico', 'ansia da prestazione',
  ] },
  { category: 'treatment-verb', terms: [
    'cure', 'heal', 'remedy', 'relieve', 'alleviate', 'reduce symptoms', 'overcome', 'conquer', 'desensitise', 'desensitize',
    'tratar', 'curar', 'aliviar', 'amenizar', 'reduzir sintomas', 'superar', 'vencer', 'combater', 'dessensibilizar', 'sanar',
    'trattare', 'guarire', 'alleviare', 'lenire', 'ridurre i sintomi', 'superare', 'vincere', 'combattere', 'desensibilizzare',
  ] },
  { category: 'clinical-process', terms: [
    'therapy', 'therapeutic', 'psychotherapy', 'treatment', 'clinical', 'intervention', 'diagnosis', 'assessment', 'screening', 'triage', 'dose', 'prescription',
    'terapia', 'terapêutico', 'terapeutico', 'psicoterapia', 'tratamento', 'trattamento', 'clínico', 'clinico', 'intervenção', 'intervento', 'diagnóstico', 'diagnosi', 'avaliação', 'valutazione', 'triagem', 'atendimento', 'acompanhamento', 'apoio psicológico', 'acolhimento', 'presa in carico', 'sostegno psicologico', 'supporto psicologico',
  ] },
  { category: 'protocol', terms: [
    'protocol', 'programme', 'program', 'course', 'treatment plan', 'pathway',
    'protocolo', 'programa', 'curso', 'plano de tratamento', 'jornada terapêutica',
    'protocollo', 'programma', 'corso', 'piano di trattamento', 'percorso', 'seduta',
  ] },
  { category: 'outcome', terms: [
    'clinically proven', 'evidence-based treatment', 'improves mental health', 'lowers your stress', 'prevents',
    'clinicamente comprovado', 'cientificamente comprovado', 'melhora a saúde mental', 'reduz seu nível de estresse', 'previne', 'eficaz',
    'clinicamente provato', 'scientificamente provato', 'migliora la salute mentale', 'abbassa i livelli di stress', 'previene', 'efficace',
  ] },
  { category: 'population', terms: [
    'for people with', 'if you suffer from', 'designed for patients', 'for those struggling with', 'sufferers',
    'para pessoas com', 'se você sofre de', 'para pacientes', 'para quem tem', 'portadores de', 'para quem convive com', 'paciente',
    'per persone con', 'se soffri di', 'per pazienti', 'per chi soffre di', 'paziente',
  ] },
  { category: 'care-pathway', terms: [
    'pre-operative', 'post-operative', 'recovery', 'rehabilitation', 'aftercare', 'discharge', 'your procedure', 'your treatment', 'before your surgery',
    'pré-operatório', 'pós-operatório', 'recuperação', 'reabilitação', 'pós-alta', 'o seu procedimento', 'antes da sua cirurgia', 'preparo para cirurgia',
    'pre-operatorio', 'post-operatorio', 'recupero', 'riabilitazione', 'dimissione', 'la tua procedura', 'prima del tuo intervento',
  ] },
  { category: 'workplace-statutory', terms: [
    'work-related stress', 'psychosocial risk', 'psychosocial', 'nr-1', 'nr1', 'risk assessment', 'occupational health programme',
    'estresse ocupacional', 'estresse relacionado ao trabalho', 'riscos psicossociais', 'psicossocial', 'frprt', 'adequação à nr-1', 'pgr', 'gro', 'inventário de riscos', 'saúde mental do trabalhador',
    'stress lavoro-correlato', 'rischi psicosociali', 'psicosociale', 'valutazione dei rischi', 'dvr', 'sorveglianza sanitaria', 'salute e sicurezza sul lavoro',
  ] },
  { category: 'measurement', terms: [
    'score', 'severity', 'risk level', 'assessment result', 'we detected', 'based on your answers', 'personalised to how you feel',
    'pontuação', 'escore', 'nível de', 'grau de', 'resultado da avaliação', 'detectamos', 'identificamos que você', 'com base nas suas respostas',
    'punteggio', 'livello di', 'grado di', 'esito della valutazione', 'abbiamo rilevato', 'in base alle tue risposte',
  ] },
  { category: 'crisis', terms: [
    'crisis support', 'emergency help', 'immediate relief',
    'apoio em crise', 'ajuda imediata', 'alívio imediato', 'socorro emocional',
    'supporto in crisi', 'aiuto immediato', 'sollievo immediato',
  ] },
  { category: 'substitution', terms: [
    'instead of therapy', 'no need to see a professional', 'an alternative to treatment', 'cheaper than therapy',
    'em vez de terapia', 'sem precisar de psicólogo', 'alternativa ao tratamento', 'mais barato que terapia', 'terapia sem terapeuta',
    'al posto della terapia', 'senza bisogno dello psicologo', 'alternativa al trattamento', 'più economico della terapia',
  ] },
  { category: 'modality', terms: [
    'emdr', 'dbt', 'polyvagal', 'hypnotherapy', 'hypnosis', 'hypnotic',
    'hipnose', 'hipnoterapia', 'hipnótico', 'polivagal',
    'ipnosi', 'ipnoterapia', 'ipnotico', 'polivagale',
  ] },
  { category: 'regulatory-status', terms: [
    'certified', 'approved platform', 'cleared', 'authorised platform',
    'certificado', 'homologado', 'plataforma autorizada',
    'certificata', 'omologata', 'piattaforma autorizzata',
  ] },
]

/** Lower-case, accents stripped, so "insônia" and "insonia" are one term. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const INDEX: { folded: string; term: string; category: string }[] = AVOID.flatMap((row) =>
  row.terms.map((term) => ({ folded: foldText(term), term, category: row.category })),
)

/** Every prohibited term that appears in the text, as a whole word or a
    whole phrase — "doc" must not fire inside "documento". */
export function lintText(text: string): LexiconHit[] {
  const folded = ` ${foldText(text).replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ')} `
  const hits: LexiconHit[] = []
  for (const e of INDEX) {
    const needle = ` ${e.folded} `
    if (folded.includes(needle) || folded.includes(` ${e.folded}s `) || folded.includes(` ${e.folded}i `)) {
      if (!hits.some((h) => h.term === e.term)) hits.push({ term: e.term, category: e.category })
    }
  }
  return hits
}

/** One pass over everything a catalogue row prints to a person. */
export function lintFields(fields: Record<string, string | string[] | undefined | null>): { field: string; hits: LexiconHit[] }[] {
  const out: { field: string; hits: LexiconHit[] }[] = []
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue
    const text = Array.isArray(value) ? value.join(' ') : value
    const hits = lintText(text)
    if (hits.length) out.push({ field, hits })
  }
  return out
}

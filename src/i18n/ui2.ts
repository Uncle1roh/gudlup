/* Strings the redesigned surface adds (docs/ui-redesign). Registered last in
   index.tsx, so a key defined here wins over the same key in an older sheet.

   Both locales for every key, always: there is no English locale, so a key
   missing from one dictionary prints English to the person reading it. */

export const IT_UI2: Record<string, string> = {
  'Main navigation': 'Navigazione principale',
  'My path': 'Il mio percorso',
  'My journey': 'Il mio viaggio',
}

export const PT_UI2: Record<string, string> = {
  'Main navigation': 'Navegação principal',
  'My path': 'Percurso',
  'My journey': 'Minha jornada',
}

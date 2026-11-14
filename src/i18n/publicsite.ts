/* ============================================================================
   The door's words

   WHAT HAPPENED TO THIS FILE. It used to hold the whole public site — four
   pages of marketing copy in Italian and Portuguese, keyed by their English
   source string like every other dictionary here. The site is the POs' v19
   now (`Good Loop Visual ID/Website goodloop_v19.html`), and v19 brought
   its own dictionary: three languages, keyed by slot rather than by source
   string, lifted into `src/public/copy.ts` and `src/public/methodCopy.ts`.
   Seventy-four keys were left asking a question nobody was going to put to
   them again, so they were taken out.

   WHAT IS LEFT is the seven the SIGN-IN SCREEN asks for, which v19 does not
   have and does not replace: it is a site that stands beside the app and
   links into it, so the door kept the screen it was built with. Those seven
   are read by `auth/AuthScreen.tsx` and by the door's shell
   (`public/PublicSite.tsx`), and they are keyed and translated exactly as
   they were.

   The deleted copy is not lost — it is in the history of this file, and the
   wording that replaced it is in `src/public/copy.ts`, where the POs own it.
   ============================================================================ */

export const IT_PUBLIC: Record<string, string> = {
  'goodloop — home': 'goodloop — home',
  'Good to have you here': 'Che bello averti qui',
  'Sign in to carry on with your pauses.': 'Accedi per continuare le tue pause.',
  'E-mail': 'E-mail',
  'name@company.com': 'nome@azienda.it',
  'Your password': 'La tua password',
  'I forgot my password': 'Password dimenticata?',
}

export const PT_PUBLIC: Record<string, string> = {
  'goodloop — home': 'goodloop — início',
  'Good to have you here': 'Que bom ter você aqui',
  'Sign in to carry on with your pauses.': 'Entre para continuar suas pausas.',
  'E-mail': 'E-mail',
  'name@company.com': 'nome@empresa.com.br',
  'Your password': 'Sua senha',
  'I forgot my password': 'Esqueci minha senha',
}

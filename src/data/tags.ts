/* ============================================================================
   Good Loop — catalog TAGS

   A published protocol is one code and up to three time signatures (6 / 12 /
   24 min). Tags are the editorial layer on top of that: what the material is
   FOR, WHEN it is used, HOW it is delivered, and WHERE the person is when they
   press play. They exist so a growing catalog stays findable — for the admin
   filtering the console, and for a therapist looking for "something short, for
   the evening, without a voice".

   Three rules, and they are not cosmetic:

     1. A tag is NEVER a clinical claim. Good Loop is a mitigation tool; a tag
        says "serata" or "cuffie", not "cura l'insonnia". The `need` group uses
        the same neutral words the check-in already uses (see data/library.ts —
        `LibraryTag`), so nothing new enters the clinical vocabulary here.
     2. A tag NEVER routes a session on its own. The wizard, the plan and the
        program keep deciding by protocol code exactly as they did; tags filter
        lists, they do not choose treatment.
     3. Duration is NOT a tag. The three time signatures are structural — they
        live on `versions` and each one carries its own timeline and its own
        audio. `DURATION_TAG_IDS` exists only so a filter UI can offer them in
        the same row of chips; `filterByTags` resolves them against the real
        `versions`, never against the stored tag list.

   The vocabulary below is CURATED but not closed: `normalizeTags` accepts any
   slug the POs invent so the console never blocks on a missing word, and
   `tagLabel` falls back to the slug itself. Adding a word here just gives it a
   proper Italian label and a group to sit in.
   ============================================================================ */

import type { Duration, Protocol } from '../types/domain'

export type TagGroup = 'need' | 'moment' | 'delivery' | 'setting'

export interface ProtocolTag {
  id: string
  /** Italian label — the default UI locale. */
  label: string
  group: TagGroup
}

export const TAG_GROUPS: { id: TagGroup; label: string; hint: string }[] = [
  { id: 'need', label: 'A cosa serve', hint: 'Come si sente la persona quando lo apre' },
  { id: 'moment', label: 'Quando', hint: 'Il momento della giornata o della settimana' },
  { id: 'delivery', label: 'Come suona', hint: 'Voce, respiro, solo suono' },
  { id: 'setting', label: 'Dove', hint: 'Cuffie, letto, scrivania, in movimento' },
]

/** The curated vocabulary. Ids are ASCII slugs (stable across translations);
    labels are Italian and are the only part safe to change. */
export const PROTOCOL_TAGS: ProtocolTag[] = [
  // --- need: the same six words the check-in uses, plus the recurring asks ---
  { id: 'ansia', label: 'Ansia', group: 'need' },
  { id: 'stress', label: 'Stress', group: 'need' },
  { id: 'umore-basso', label: 'Umore basso', group: 'need' },
  { id: 'esaurimento', label: 'Esaurimento', group: 'need' },
  { id: 'resilienza', label: 'Resilienza', group: 'need' },
  { id: 'mantenimento', label: 'Sto bene', group: 'need' },
  { id: 'sonno', label: 'Sonno', group: 'need' },
  { id: 'concentrazione', label: 'Concentrazione', group: 'need' },
  { id: 'energia', label: 'Energia', group: 'need' },
  { id: 'radicamento', label: 'Radicamento', group: 'need' },

  // --- moment ---
  { id: 'mattina', label: 'Mattina', group: 'moment' },
  { id: 'pausa', label: 'Pausa', group: 'moment' },
  { id: 'sera', label: 'Sera', group: 'moment' },
  { id: 'notte', label: 'Notte', group: 'moment' },
  { id: 'prima-di', label: 'Prima di un momento importante', group: 'moment' },
  { id: 'dopo-il-lavoro', label: 'Dopo il lavoro', group: 'moment' },
  { id: 'primo-ascolto', label: 'Primo ascolto', group: 'moment' },

  // --- delivery ---
  { id: 'voce-guidata', label: 'Voce guidata', group: 'delivery' },
  { id: 'voce-femminile', label: 'Voce femminile', group: 'delivery' },
  { id: 'voce-maschile', label: 'Voce maschile', group: 'delivery' },
  { id: 'sussurro', label: 'Sussurro', group: 'delivery' },
  { id: 'solo-suono', label: 'Solo suono', group: 'delivery' },
  { id: 'binaurale', label: 'Binaurale', group: 'delivery' },
  { id: 'bilaterale', label: 'Bilaterale', group: 'delivery' },
  { id: 'solfeggio', label: 'Solfeggio', group: 'delivery' },
  { id: 'affermazioni', label: 'Affermazioni', group: 'delivery' },

  // --- setting ---
  { id: 'cuffie', label: 'Cuffie necessarie', group: 'setting' },
  { id: 'a-letto', label: 'A letto', group: 'setting' },
  { id: 'scrivania', label: 'Alla scrivania', group: 'setting' },
  { id: 'in-movimento', label: 'In movimento', group: 'setting' },
  { id: 'occhi-chiusi', label: 'Occhi chiusi', group: 'setting' },
]

const BY_ID = new Map(PROTOCOL_TAGS.map((t) => [t.id, t]))

/** Longest sensible tag list. Past this a tag stops narrowing anything. */
export const MAX_TAGS = 12

/** "Voce Guidata " → "voce-guidata". Accents are folded so an id typed with
    them matches the curated one. */
export function tagSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

/** Clean a tag list for storage: slugged, de-duplicated, order preserved,
    empties dropped, capped. Anything not in the vocabulary is KEPT — the POs
    may name something we have not thought of. */
export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return []
  const out: string[] = []
  for (const raw of tags) {
    const id = tagSlug(String(raw ?? ''))
    if (!id || out.includes(id)) continue
    out.push(id)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Display label for a tag id — the curated label, else the slug read back. */
export function tagLabel(id: string): string {
  const known = BY_ID.get(id)
  if (known) return known.label
  return id.replace(/-/g, ' ')
}

export function isKnownTag(id: string): boolean {
  return BY_ID.has(id)
}

export function tagGroupOf(id: string): TagGroup | null {
  return BY_ID.get(id)?.group ?? null
}

/** Stored tags of a protocol, cleaned. Safe on rows written before tags. */
export function tagsOf(p: Pick<Protocol, 'tags'>): string[] {
  return normalizeTags(p.tags)
}

/* ---------------------------------------------------------- time signature --

   Durations are structural, not tags — but a filter row wants to offer them
   next to the real tags. These pseudo-ids are resolved against `versions`. */

export const DURATION_TAG_IDS: Record<Duration, string> = { 6: '6min', 12: '12min', 24: '24min' }

const DURATION_BY_TAG: Record<string, Duration> = { '6min': 6, '12min': 12, '24min': 24 }

export function durationTagLabel(d: Duration): string {
  return `${d} min`
}

/**
 * Filter a catalog list by a selection of tag ids. A duration pseudo-tag
 * matches when the protocol HAS that version; a real tag matches its stored
 * list. Selecting several is an AND — each additional chip narrows.
 */
export function filterByTags<T extends Pick<Protocol, 'tags' | 'versions'>>(
  items: T[],
  selected: readonly string[],
): T[] {
  const wanted = normalizeTags(selected)
  if (!wanted.length) return items
  return items.filter((p) => {
    const own = tagsOf(p)
    return wanted.every((w) => {
      const dur = DURATION_BY_TAG[w]
      if (dur) return p.versions.some((v) => v.duration === dur)
      return own.includes(w)
    })
  })
}

/** Every tag actually in use across a catalog, most-used first — what a filter
    row should offer, so the console never shows a chip that matches nothing. */
export function tagsInUse(items: Pick<Protocol, 'tags'>[]): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of items) for (const id of tagsOf(p)) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

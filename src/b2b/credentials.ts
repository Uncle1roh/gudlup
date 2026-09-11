/* ============================================================================
   Good Loop — clinician credentials: the documents behind the number

   A therapist has always typed a registration number at sign-up, and the admin
   console has always had a queue to approve it. What was missing is the part
   that makes the review mean anything: the DOCUMENTS. The reviewer was
   approving a string somebody had typed about themselves.

   Files go to the private `credentials` bucket under the clinician's own auth
   id — the storage policies let them write and read that folder and nothing
   else, and let an admin read every folder, because reviewing them is the
   whole point. Nobody else can see anything, not even with the path: the
   bucket is not public and every read is a short-lived signed URL.

   The row is written by `submit_credentials()` (a SECURITY DEFINER function),
   never by an UPDATE from the client — a clinician must be able to write their
   number and their documents, and must never be able to write their `status`.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'

/** One submitted file, as stored on `therapists.documents`. */
export interface CredentialDoc {
  /** Object path inside the private `credentials` bucket. */
  path: string
  /** The file's own name, for the reviewer to read. */
  name: string
  sizeBytes: number
  /** When it was uploaded (epoch ms). */
  at: number
}

const BUCKET = 'credentials'

/** A diploma, a registration certificate, an ID. Images or PDF, nothing else:
    this is a document to be read, not an attachment channel. */
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 12 * 1024 * 1024

/** How long a reviewer's link to a document stays valid. Long enough to open
    and read it, short enough that a copied URL is not a permanent key. */
const SIGNED_URL_SECONDS = 300

function client() {
  if (!hasSupabaseEnv()) throw new Error('Nessun database collegato: i documenti non possono essere caricati.')
  return getSupabaseClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  )
}

/** Strip a filename down to something safe for a storage key, keeping enough
    of it that the reviewer still recognises what they are opening. */
function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-60)
  return cleaned || 'documento'
}

/**
 * Upload one document and return the record to store on the row.
 *
 * The folder is the caller's OWN auth id — not a parameter. A path a caller
 * could choose is a path a caller could point at somebody else's folder, and
 * the storage policy would refuse it anyway; taking it from the session means
 * the client and the policy cannot disagree.
 */
export async function uploadCredentialDoc(file: File): Promise<CredentialDoc> {
  if (file.type && !TYPES.includes(file.type)) {
    throw new Error('Formato non supportato — carica un PDF o una foto (JPG, PNG).')
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB) — massimo ${MAX_BYTES / 1024 / 1024} MB.`)
  }
  const sb = client()
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Sessione scaduta — accedi di nuovo.')

  const path = `${uid}/${Date.now()}-${safeName(file.name)}`
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw new Error(`Caricamento non riuscito: ${error.message}`)
  return { path, name: file.name, sizeBytes: file.size, at: Date.now() }
}

/** A link the reviewer can open, valid for a few minutes. Null when the object
    is gone or this account may not read it — the queue then says so instead of
    rendering a broken link. */
export async function credentialDocUrl(path: string): Promise<string | null> {
  try {
    const sb = client()
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
    if (error) return null
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

/** Remove a document the clinician has not submitted yet (or wants replaced).
    Failure is not worth surfacing: the row is what the reviewer reads, and a
    file nothing points at is invisible to everyone but the bucket. */
export async function deleteCredentialDoc(path: string): Promise<void> {
  try {
    await client().storage.from(BUCKET).remove([path])
  } catch {
    /* the record is already off the row; the orphan is harmless */
  }
}

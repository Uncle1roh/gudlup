/* ============================================================================
   Good Loop — "a request just went to ElevenLabs"

   Every synthesis request costs credits, and nothing on screen said when one
   was sent. The ElevenLabs provider calls `announceElevenLabsRequest` right
   before each paid request; <ElevenLabsNotice/> (mounted once, at the root)
   shows a short warning that fades by itself.

   Only the requests that make audio are announced. Listing voices and reading
   the account's quota cost nothing and stay silent.
   ============================================================================ */

export const ELEVENLABS_REQUEST_EVENT = 'gl:elevenlabs-request'

export interface ElevenLabsRequestInfo {
  /** Characters sent to be spoken — what the request is billed on. */
  chars: number
  /** How many lines were spoken in this one request (a joined block is several). */
  lines: number
  /** Running count of paid requests since the page was loaded. */
  count: number
}

let count = 0

export function announceElevenLabsRequest(chars: number, lines = 1): void {
  count += 1
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ElevenLabsRequestInfo>(ELEVENLABS_REQUEST_EVENT, { detail: { chars, lines, count } }),
  )
}

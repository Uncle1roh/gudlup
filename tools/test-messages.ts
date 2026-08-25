/* ============================================================================
   The patient/therapist thread

   The bug this file exists to prevent: two chats that each look like they
   work. Before `messageStore` the patient wrote into one storage key and the
   therapist into another, both rendered a bubble, both survived a reload, and
   nothing ever crossed. Every assertion below is about the crossing.

       npx esbuild tools/test-messages.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/m.mjs && node <tmp>/m.mjs
   ============================================================================ */

import {
  send,
  markRead,
  seedThread,
  threadFor,
  lastMessage,
  unreadFor,
  threadsAwaiting,
  MAX_LENGTH,
  type ChatMessage,
} from '../src/data/messageStore'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const P = 'me'
const Q = 'p-other'
const T = 1_700_000_000_000
const MIN = 60_000

/* ------------------------------------------------------- one thread ------ */
console.log('\n--- one thread, two ends ---')

let rows: ChatMessage[] = []
rows = send(rows, P, 'therapist', 'How did the week go?', T)
rows = send(rows, P, 'patient', 'Two hard days, then better.', T + MIN)

assert(threadFor(rows, P).length === 2, 'both ends write into the same thread')
assert(threadFor(rows, P)[0].from === 'therapist', 'and it reads oldest first, the way a conversation is read')
assert(lastMessage(rows, P)?.from === 'patient', 'the last message is the newest, not the first written')

/* The whole point: what the patient sent is visible to the therapist. */
const therapistSees = threadFor(rows, P).filter((m) => m.from === 'patient')
assert(therapistSees.length === 1, "the therapist's side can see what the patient wrote")
const patientSees = threadFor(rows, P).filter((m) => m.from === 'therapist')
assert(patientSees.length === 1, "and the patient's side can see the reply")

assert(threadFor(rows, Q).length === 0, "another patient's thread stays empty")
rows = send(rows, Q, 'patient', 'Hello', T + 2 * MIN)
assert(threadFor(rows, P).length === 2, 'and writing to it does not touch the first')

/* ------------------------------------------------------------ unread ----- */
console.log('\n--- unread is per side, not per message ---')

assert(unreadFor(rows, P, 'therapist') === 1, 'the therapist has one unread — the patient message')
assert(unreadFor(rows, P, 'patient') === 1, 'the patient has one unread — the therapist message')

/* A single shared `read` flag used to answer whichever question was asked
   last. Reading one side must not clear the other. */
rows = markRead(rows, P, 'therapist')
assert(unreadFor(rows, P, 'therapist') === 0, 'reading as the therapist clears the therapist side')
assert(unreadFor(rows, P, 'patient') === 1, 'and leaves the patient side alone')

rows = send(rows, P, 'patient', 'One more thing.', T + 3 * MIN)
assert(unreadFor(rows, P, 'therapist') === 1, 'a new patient message makes it unread again')
assert(unreadFor(rows, P, 'patient') === 1, 'the sender never has unread messages of their own')

const awaiting = threadsAwaiting(rows, 'therapist')
assert(awaiting.length === 2, 'both patients are waiting on the therapist')
assert(awaiting[0] === P, 'and the most recently written thread is first')

rows = markRead(rows, Q, 'therapist')
assert(threadsAwaiting(rows, 'therapist').join() === P, 'reading one thread removes only that one')

/* ------------------------------------------------------------- writes ---- */
console.log('\n--- what a write refuses to do ---')

const before = rows.length
assert(send(rows, P, 'patient', '   ', T).length === before, 'whitespace is not a message')
assert(send(rows, P, 'patient', '', T).length === before, 'and neither is nothing at all')

const padded = send([], P, 'patient', '  hello  ', T)
assert(padded[0].text === 'hello', 'text is trimmed before it is stored')

const long = send([], P, 'patient', 'x'.repeat(MAX_LENGTH + 500), T)
assert(long[0].text.length === MAX_LENGTH, 'an over-long message is cut to the shared limit, not rejected')

/* Nothing is edited or removed. There is no function here that can. */
const store = Object.keys({ send, markRead, seedThread, threadFor, lastMessage, unreadFor, threadsAwaiting })
assert(
  !store.some((k) => /delete|remove|edit|update/i.test(k)),
  'the module offers no way to delete or rewrite a message — the exchange is part of the record',
)

/* ------------------------------------------------------------- seeding --- */
console.log('\n--- seeding a demo thread ---')

let fresh = seedThread([], P, 'Welcome.', T)
assert(fresh.length === 1 && fresh[0].from === 'therapist', 'an empty thread gets its opening message')
fresh = seedThread(fresh, P, 'Welcome.', T)
assert(fresh.length === 1, 'and seeding again does nothing — a re-render cannot duplicate it')

const real = send([], P, 'patient', 'I wrote first.', T)
assert(seedThread(real, P, 'Welcome.', T).length === 1, 'seeding never lands on top of a real conversation')

/* ---------------------------------------------------------- ordering ----- */
console.log('\n--- ordering survives out-of-order writes ---')

let jumbled: ChatMessage[] = []
jumbled = send(jumbled, P, 'patient', 'third', T + 3 * MIN)
jumbled = send(jumbled, P, 'therapist', 'first', T)
jumbled = send(jumbled, P, 'patient', 'second', T + MIN)
assert(
  threadFor(jumbled, P).map((m) => m.text).join('|') === 'first|second|third',
  'the thread is sorted by time, not by the order rows happened to be appended',
)

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}

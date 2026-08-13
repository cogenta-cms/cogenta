/**
 * The layer REST and GraphQL share.
 *
 * The L1 spec is blunt: "REST and GraphQL expose the same thing and share the
 * same permission and serialisation layer. There are not two implementations."
 * Everything a transport could get wrong about *who sees what* lives here — the
 * draft guard, the preview scope, the filter, the keyset walk, the wire shape of
 * an entry — and a transport is left with parsing, batching and status codes.
 *
 * These are primitives at the level of one entry, not one flattened read
 * function. REST expands relations to depth in a single response; GraphQL stays
 * lazy per field so that field selection and the dataloader keep their meaning.
 * Both compose the same decisions; neither dictates the other's shape.
 */

export {
  assertUnpublishedReadable,
  draftGateFor,
  entryState,
  entryVisible,
  grantedEntryId,
  roleState,
} from './draft-access.js'
export { matchesFilter } from './filter.js'
export type { ScanRequest, ScanResult } from './pagination.js'
export { cursorFor, scanPages } from './pagination.js'
export type {
  ExpansionOptions,
  ExpansionSource,
  SerialisedEntry,
} from './serialise.js'
export { serialiseEntry } from './serialise.js'

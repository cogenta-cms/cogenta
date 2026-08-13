/**
 * Moved to `@cogenta/core`: id generation is infrastructure every package
 * needs (auth's sessions and users, the audit log, agent identifiers still to
 * come in L4), not content-schema logic. Re-exported here so nothing that
 * already imports from `@cogenta/schema` breaks.
 */
export { isUuidV7, newId, timestampOf } from '@cogenta/core'

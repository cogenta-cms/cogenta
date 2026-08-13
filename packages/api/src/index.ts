/**
 * `@cogenta/api` — REST and GraphQL over the content engine.
 *
 * Both transports run on one access layer and one content layer. The lot's rule
 * is that they expose the same thing and there are not two implementations, so
 * anything that decides *who sees what* lives in `access/` and `content/`, and
 * `rest/` and `graphql/` are compositions on top.
 */

export * from './access/index.js'
export * from './content/index.js'
export * from './graphql/index.js'
export * from './rest/index.js'
export * from './types.js'

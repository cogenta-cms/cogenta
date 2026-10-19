/** A neutral document icon, embedded as a 32px PNG inside a valid ICO container.
 * It carries no CMS mark and ships in the published dist without an asset-copy step.
 */
const DEFAULT_FAVICON_BASE64 =
  'AAABAAEAICAAAAEAIACPAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAgAAAAIAgGAAAAc3p69AAAAFZJREFUeJxjYBgFowAP0DWy+k8NPKAOGNAQoMhySh1AseWUOIAqlpPqgDsPnmDFA+6AAc8Fow4YXg7AldCwJbzhGQKjDhhNA6MOGE0Dow6guwNGwYgAALsr9D3bqoOqAAAAAElFTkSuQmCC'

export const DEFAULT_FAVICON_PATH = '/favicon.ico'
export const DEFAULT_FAVICON_CONTENT_TYPE = 'image/vnd.microsoft.icon'

export function defaultFaviconBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(DEFAULT_FAVICON_BASE64, 'base64'))
}

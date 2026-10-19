/** `/sitemap.xml` and the `/sitemap-N.xml` chunks a large site splits into. */
/** `relyingPartyId` is the bare host: WebAuthn ties a passkey to a domain, not a URL. */
export function webauthnConfigFor(site: { readonly name: string; readonly url: string }) {
  const host = new URL(site.url).hostname
  return { relyingPartyName: site.name, relyingPartyId: host, origin: site.url }
}

import type { AccessContext } from '@cogenta/api'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'
import { type PageChromeOptions, renderPageChrome } from './theme-render.js'

/**
 * The two pages a site shows when nothing it holds answers a URL (L36).
 *
 * Found on the packages as published, installed from npm into an empty
 * folder: a site created with every default answered `/` with
 * `{"error":{"code":"CONTENT_NOT_FOUND",…}}` — and so did **every dead link**
 * of a complete site, because the site's own 404 page is an entry someone has
 * to create at `site.notFoundPath` (L14), and without one there was no
 * fallback at all. A visitor following a broken link read an API error.
 *
 * Both pages go through `renderPageChrome`, the same wrapper the search page
 * uses: the active theme's header, footer, stylesheet and skip link, so an
 * error still looks like the site it happened on. What sits inside is a small
 * block of host markup, styled by a zero-specificity floor (`:where()`) that
 * any theme's own rules override.
 *
 * - **Not found** answers `404`. A site entry at `notFoundPath` always wins;
 *   this is only what shows when there is none.
 * - **Welcome** answers `/` when nothing resolves there: the site works, it
 *   has no home page yet, here is where to make one. `200` and `noindex`,
 *   like the default front page of any CMS; it disappears the moment a home
 *   page exists.
 */

/**
 * The languages these two pages speak.
 *
 * They were English and French only, which meant a Spanish or German site
 * showed its very first page — and its 404 — in a language its visitors may
 * not read. A site whose language is none of these still gets English rather
 * than nothing: a floor, matched on the language subtag so `de-AT` reads
 * German.
 */
type FallbackLocale = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'nl'

const STRINGS: Readonly<Record<FallbackLocale, Readonly<Record<string, string>>>> = {
  en: {
    notFoundEyebrow: 'Error 404',
    notFoundTitle: 'This page could not be found',
    notFoundBody:
      'The link may be out of date, or the page may have moved. Try a search, or start again from the home page.',
    home: 'Back to the home page',
    searchLabel: 'Search this site',
    searchPlaceholder: 'Search…',
    searchButton: 'Search',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Your site is up and running',
    welcomeBody:
      'It has no home page yet. This page stands in for it, and disappears as soon as there is one.',
    welcomeStepsLabel: 'Next steps',
    welcomeStep1: 'Sign in to the administration with the account created at installation.',
    welcomeStep2: 'Create a page whose slug is “home”: it becomes this address.',
    welcomeStep3: 'Choose a theme under Appearance, then fill in the menus and settings.',
    admin: 'Open the administration',
  },
  fr: {
    notFoundEyebrow: 'Erreur 404',
    notFoundTitle: 'Cette page est introuvable',
    notFoundBody:
      'Le lien est peut-être ancien, ou la page a été déplacée. Essayez une recherche, ou repartez de l’accueil.',
    home: 'Retour à l’accueil',
    searchLabel: 'Rechercher sur ce site',
    searchPlaceholder: 'Rechercher…',
    searchButton: 'Rechercher',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Votre site est en ligne',
    welcomeBody:
      'Il n’a pas encore de page d’accueil. Cette page la remplace, et disparaît dès qu’il y en a une.',
    welcomeStepsLabel: 'Pour commencer',
    welcomeStep1: 'Connectez-vous à l’administration avec le compte créé à l’installation.',
    welcomeStep2: 'Créez une page dont le slug est « home » : elle devient cette adresse.',
    welcomeStep3: 'Choisissez un thème dans Apparence, puis complétez menus et réglages.',
    admin: 'Ouvrir l’administration',
  },
  es: {
    notFoundEyebrow: 'Error 404',
    notFoundTitle: 'No se encuentra esta página',
    notFoundBody:
      'Puede que el enlace esté anticuado o que la página se haya movido. Prueba a buscar o vuelve a empezar desde la portada.',
    home: 'Volver a la portada',
    searchLabel: 'Buscar en este sitio',
    searchPlaceholder: 'Buscar…',
    searchButton: 'Buscar',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Tu sitio ya está en línea',
    welcomeBody:
      'Todavía no tiene portada. Esta página ocupa su lugar y desaparece en cuanto exista una.',
    welcomeStepsLabel: 'Para empezar',
    welcomeStep1: 'Entra en la administración con la cuenta creada durante la instalación.',
    welcomeStep2: 'Crea una página cuyo slug sea «home»: pasará a ser esta dirección.',
    welcomeStep3: 'Elige un tema en Apariencia y luego completa los menús y los ajustes.',
    admin: 'Abrir la administración',
  },
  de: {
    notFoundEyebrow: 'Fehler 404',
    notFoundTitle: 'Diese Seite wurde nicht gefunden',
    notFoundBody:
      'Der Link ist womöglich veraltet, oder die Seite wurde verschoben. Versuchen Sie eine Suche oder beginnen Sie auf der Startseite.',
    home: 'Zurück zur Startseite',
    searchLabel: 'Diese Website durchsuchen',
    searchPlaceholder: 'Suchen…',
    searchButton: 'Suchen',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Ihre Website läuft',
    welcomeBody:
      'Sie hat noch keine Startseite. Diese Seite vertritt sie und verschwindet, sobald es eine gibt.',
    welcomeStepsLabel: 'Nächste Schritte',
    welcomeStep1:
      'Melden Sie sich mit dem bei der Installation angelegten Konto in der Verwaltung an.',
    welcomeStep2: 'Legen Sie eine Seite mit dem Slug „home“ an: Sie wird zu dieser Adresse.',
    welcomeStep3:
      'Wählen Sie unter Darstellung ein Theme und füllen Sie dann Menüs und Einstellungen aus.',
    admin: 'Verwaltung öffnen',
  },
  it: {
    notFoundEyebrow: 'Errore 404',
    notFoundTitle: 'Questa pagina non è stata trovata',
    notFoundBody:
      'Il collegamento potrebbe essere vecchio, oppure la pagina è stata spostata. Prova una ricerca o riparti dalla home.',
    home: 'Torna alla home',
    searchLabel: 'Cerca in questo sito',
    searchPlaceholder: 'Cerca…',
    searchButton: 'Cerca',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Il tuo sito è online',
    welcomeBody:
      'Non ha ancora una home page. Questa pagina la sostituisce e sparisce non appena ne esiste una.',
    welcomeStepsLabel: 'Per iniziare',
    welcomeStep1: "Accedi all'amministrazione con l'account creato durante l'installazione.",
    welcomeStep2: 'Crea una pagina con slug «home»: diventerà questo indirizzo.',
    welcomeStep3: 'Scegli un tema in Aspetto, poi completa menu e impostazioni.',
    admin: "Apri l'amministrazione",
  },
  pt: {
    notFoundEyebrow: 'Erro 404',
    notFoundTitle: 'Não encontrámos esta página',
    notFoundBody:
      'A ligação pode estar desatualizada ou a página foi movida. Experimente pesquisar ou recomece pela página inicial.',
    home: 'Voltar à página inicial',
    searchLabel: 'Pesquisar neste site',
    searchPlaceholder: 'Pesquisar…',
    searchButton: 'Pesquisar',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'O seu site está no ar',
    welcomeBody:
      'Ainda não tem página inicial. Esta página fica no lugar dela e desaparece assim que existir uma.',
    welcomeStepsLabel: 'Para começar',
    welcomeStep1: 'Entre na administração com a conta criada durante a instalação.',
    welcomeStep2: 'Crie uma página cujo slug seja «home»: passa a ser este endereço.',
    welcomeStep3: 'Escolha um tema em Aparência e depois preencha menus e definições.',
    admin: 'Abrir a administração',
  },
  nl: {
    notFoundEyebrow: 'Fout 404',
    notFoundTitle: 'Deze pagina is niet gevonden',
    notFoundBody:
      'De link is misschien verouderd, of de pagina is verplaatst. Probeer een zoekopdracht, of begin opnieuw op de startpagina.',
    home: 'Terug naar de startpagina',
    searchLabel: 'Zoek op deze site',
    searchPlaceholder: 'Zoeken…',
    searchButton: 'Zoeken',
    welcomeEyebrow: 'Cogenta',
    welcomeTitle: 'Je site staat online',
    welcomeBody:
      'Er is nog geen startpagina. Deze pagina neemt die plaats in en verdwijnt zodra er een is.',
    welcomeStepsLabel: 'Om te beginnen',
    welcomeStep1: 'Meld je aan bij het beheer met het account dat bij de installatie is gemaakt.',
    welcomeStep2: 'Maak een pagina met de slug “home”: die wordt dit adres.',
    welcomeStep3: 'Kies een thema onder Weergave en vul daarna menu’s en instellingen in.',
    admin: 'Beheer openen',
  },
}

function stringsFor(locale: string): Readonly<Record<string, string>> {
  // The language subtag only: `fr-CA`, `de-AT` and `pt-BR` all read the
  // language they are written in, and anything else reads English.
  const language = locale.toLowerCase().split(/[-_]/u)[0] ?? ''
  const known = (STRINGS as Readonly<Record<string, Readonly<Record<string, string>> | undefined>>)[
    language
  ]
  return known ?? STRINGS.en
}

/**
 * A floor, never a design: zero specificity, so a theme that styles
 * `.cg-fallback` wins outright, and one that has never heard of it still
 * gets a readable, centred page in its own colours and typefaces.
 */
export const FALLBACK_PAGE_FLOOR_CSS = `:where(.cg-fallback){box-sizing:border-box;inline-size:min(100% - 2.5rem, 40rem);margin-inline:auto;padding-block:clamp(3rem, 10vw, 7rem)}
:where(.cg-fallback__eyebrow){margin:0 0 1rem;color:var(--cogenta-color-muted-fg);font-family:var(--cogenta-font-sans);font-size:.8125rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
:where(.cg-fallback__title){margin:0 0 1rem;font-size:clamp(2rem, 5vw, 3rem);line-height:1.1;text-wrap:balance}
:where(.cg-fallback__body){margin:0 0 2rem;color:var(--cogenta-color-muted-fg);font-size:1.0625rem;line-height:1.6;text-wrap:pretty}
:where(.cg-fallback__actions){display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.5rem;margin:0 0 2.5rem}
:where(.cg-fallback__primary){display:inline-flex;align-items:center;min-block-size:2.75rem;padding-inline:1.25rem;border-radius:var(--cogenta-radius-sm, 4px);background:var(--cogenta-color-accent);color:var(--cogenta-color-accent-fg);font-family:var(--cogenta-font-sans);font-weight:600;text-decoration:none}
:where(.cg-fallback__primary):hover{filter:brightness(1.08)}
:where(.cg-fallback__search){display:flex;flex-wrap:wrap;gap:.5rem;margin:0;padding-block-start:2rem;border-block-start:1px solid var(--cogenta-color-border)}
:where(.cg-fallback__search) label{flex-basis:100%;font-family:var(--cogenta-font-sans);font-size:.875rem;font-weight:600}
:where(.cg-fallback__search) input{flex:1 1 14rem;min-block-size:2.75rem;padding-inline:.875rem;border:1px solid var(--cogenta-color-border);border-radius:var(--cogenta-radius-sm, 4px);background:var(--cogenta-color-bg);color:var(--cogenta-color-fg);font:inherit}
:where(.cg-fallback__search) button{min-block-size:2.75rem;padding-inline:1.125rem;border:1px solid var(--cogenta-color-fg);border-radius:var(--cogenta-radius-sm, 4px);background:transparent;color:var(--cogenta-color-fg);font-family:var(--cogenta-font-sans);font-weight:600;cursor:pointer}
:where(.cg-fallback__steps){margin:0 0 2.5rem;padding:0;list-style:none;counter-reset:cg-step;border-block-start:1px solid var(--cogenta-color-border)}
:where(.cg-fallback__steps) li{counter-increment:cg-step;display:grid;grid-template-columns:2.5rem 1fr;gap:.75rem;padding-block:1rem;border-block-end:1px solid var(--cogenta-color-border);line-height:1.5}
:where(.cg-fallback__steps) li::before{content:counter(cg-step, decimal-leading-zero);color:var(--cogenta-color-accent);font-family:var(--cogenta-font-sans);font-weight:600;font-variant-numeric:tabular-nums}`

/** Everything the site chrome needs, minus what this module writes itself. */
export type FallbackPageOptions = Omit<PageChromeOptions, 'headHtml' | 'bodyHtml'>

function searchForm(s: Readonly<Record<string, string>>): string {
  return `<form class="cg-fallback__search" action="/search" method="get" role="search">
<label for="cg-fallback-q">${escapeHtmlText(s['searchLabel'] ?? '')}</label>
<input id="cg-fallback-q" type="search" name="q" placeholder="${escapeHtmlAttribute(s['searchPlaceholder'] ?? '')}" required>
<button type="submit">${escapeHtmlText(s['searchButton'] ?? '')}</button>
</form>`
}

function page(
  options: FallbackPageOptions,
  context: AccessContext,
  title: string,
  body: string,
): Promise<string> {
  return renderPageChrome(
    {
      ...options,
      headHtml: `<title>${escapeHtmlText(title)} — ${escapeHtmlText(options.site.name)}</title>
<meta name="robots" content="noindex, follow" />`,
      bodyHtml: `<main class="cg-main cg-fallback-page" id="cg-main">
${body}
</main>
<style>${FALLBACK_PAGE_FLOOR_CSS}</style>`,
    },
    context,
  )
}

/** The page shown for a URL nothing on the site answers, when the site has no 404 entry of its own. */
export function renderFallbackNotFoundPage(
  options: FallbackPageOptions,
  context: AccessContext,
): Promise<string> {
  const s = stringsFor(options.locale)
  return page(
    options,
    context,
    s['notFoundTitle'] ?? '',
    `<section class="cg-fallback cg-fallback--not-found" aria-labelledby="cg-fallback-title">
<p class="cg-fallback__eyebrow">${escapeHtmlText(s['notFoundEyebrow'] ?? '')}</p>
<h1 class="cg-fallback__title" id="cg-fallback-title">${escapeHtmlText(s['notFoundTitle'] ?? '')}</h1>
<p class="cg-fallback__body">${escapeHtmlText(s['notFoundBody'] ?? '')}</p>
<p class="cg-fallback__actions"><a class="cg-fallback__primary" href="/">${escapeHtmlText(s['home'] ?? '')}</a></p>
${searchForm(s)}
</section>`,
  )
}

/** The page shown at `/` while the site has no home page. */
export function renderWelcomePage(
  options: FallbackPageOptions,
  context: AccessContext,
): Promise<string> {
  const s = stringsFor(options.locale)
  const steps = ['welcomeStep1', 'welcomeStep2', 'welcomeStep3']
    .map((key) => `<li>${escapeHtmlText(s[key] ?? '')}</li>`)
    .join('\n')
  return page(
    options,
    context,
    s['welcomeTitle'] ?? '',
    `<section class="cg-fallback cg-fallback--welcome" aria-labelledby="cg-fallback-title">
<p class="cg-fallback__eyebrow">${escapeHtmlText(s['welcomeEyebrow'] ?? '')}</p>
<h1 class="cg-fallback__title" id="cg-fallback-title">${escapeHtmlText(s['welcomeTitle'] ?? '')}</h1>
<p class="cg-fallback__body">${escapeHtmlText(s['welcomeBody'] ?? '')}</p>
<ol class="cg-fallback__steps" aria-label="${escapeHtmlAttribute(s['welcomeStepsLabel'] ?? '')}">
${steps}
</ol>
<p class="cg-fallback__actions"><a class="cg-fallback__primary" href="/admin">${escapeHtmlText(s['admin'] ?? '')}</a></p>
</section>`,
  )
}

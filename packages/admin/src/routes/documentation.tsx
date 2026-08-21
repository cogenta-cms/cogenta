import type { JSX } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { NAV_ITEMS, type NavGroupId } from '../shell/nav-items.js'
import '../styles/documentation.css'
import { Card, CardBody, CardHeader, CardTitle } from '../ui/index.js'
import { EditorialFlowDiagram, PluginPermissionFlowDiagram } from './documentation-flows.js'

/**
 * Fiche 21 task 7 — "Documentation": a screen that explains the rest of this
 * admin, for someone who has never read the code.
 *
 * Honest about scope from the start (the fiche's own instruction): this is
 * one page per major nav group, each with a summary, a quickstart and the
 * real list of screens it leads to — not a field-by-field reference of every
 * screen. `packages/admin/src/routes/marketplace.tsx`'s item descriptions
 * are the closest precedent for "long-form content in this admin", and they
 * render as plain paragraphs with no markdown layer — this screen follows
 * that: plain JSX/`t()` strings, matching `assistant.tsx`'s own
 * `role="tablist"` pattern for switching between six panels without a
 * seventh design-system component (`../ui/index.js`'s own six-only rule).
 *
 * "Écrans de cette section" is not a hand-copied list: it is `NAV_ITEMS`
 * filtered by `group`, the same data `app-shell.tsx`'s sidebar itself reads
 * — so a screen added to a group later shows up here without this file
 * being touched, and a screen renamed here cannot drift from its real label.
 * Visibility conditions are not re-evaluated here (that needs live schema
 * and role state this page does not load) — the list names every screen a
 * group *can* contain, independent of what today's signed-in actor happens
 * to see in the sidebar; the paragraph above each list says so.
 *
 * Two flows get an animated diagram (the fiche's own bar: "the 2-3 most
 * complex flows"), each verified against the real implementation before it
 * was drawn — see `documentation-flows.tsx`'s own header comment for what
 * was checked and the one honest caveat (per-capability plugin permission
 * review has a data model and components, not yet a wired screen).
 */

const SECTIONS = ['content', 'appearance', 'commerce', 'ai', 'accounts', 'settings'] as const
type Section = (typeof SECTIONS)[number]

const QUICKSTART_STEPS: Readonly<Record<Section, readonly string[]>> = {
  content: [
    'documentation.sections.content.quickstart.step1',
    'documentation.sections.content.quickstart.step2',
    'documentation.sections.content.quickstart.step3',
    'documentation.sections.content.quickstart.step4',
    'documentation.sections.content.quickstart.step5',
  ],
  appearance: [
    'documentation.sections.appearance.quickstart.step1',
    'documentation.sections.appearance.quickstart.step2',
    'documentation.sections.appearance.quickstart.step3',
    'documentation.sections.appearance.quickstart.step4',
  ],
  commerce: [
    'documentation.sections.commerce.quickstart.step1',
    'documentation.sections.commerce.quickstart.step2',
    'documentation.sections.commerce.quickstart.step3',
    'documentation.sections.commerce.quickstart.step4',
    'documentation.sections.commerce.quickstart.step5',
  ],
  ai: [
    'documentation.sections.ai.quickstart.step1',
    'documentation.sections.ai.quickstart.step2',
    'documentation.sections.ai.quickstart.step3',
    'documentation.sections.ai.quickstart.step4',
  ],
  accounts: [
    'documentation.sections.accounts.quickstart.step1',
    'documentation.sections.accounts.quickstart.step2',
    'documentation.sections.accounts.quickstart.step3',
    'documentation.sections.accounts.quickstart.step4',
  ],
  settings: [
    'documentation.sections.settings.quickstart.step1',
    'documentation.sections.settings.quickstart.step2',
    'documentation.sections.settings.quickstart.step3',
    'documentation.sections.settings.quickstart.step4',
  ],
}

const EDITORIAL_FLOW_STEPS = [
  'documentation.flows.editorial.steps.step1',
  'documentation.flows.editorial.steps.step2',
  'documentation.flows.editorial.steps.step3',
  'documentation.flows.editorial.steps.step4',
  'documentation.flows.editorial.steps.step5',
] as const

const PLUGIN_FLOW_STEPS = [
  'documentation.flows.plugin.steps.step1',
  'documentation.flows.plugin.steps.step2',
  'documentation.flows.plugin.steps.step3',
  'documentation.flows.plugin.steps.step4',
  'documentation.flows.plugin.steps.step5',
] as const

const BRANDING_BASE = `${import.meta.env.BASE_URL}branding/`

export function DocumentationRoute(): JSX.Element {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('content')

  function screensOf(group: NavGroupId) {
    return NAV_ITEMS.filter((item) => item.group === group)
  }

  return (
    <section aria-labelledby="documentation-heading" className="flex flex-col gap-6">
      <div className="doc-header">
        <span className="doc-header__logo-plate">
          <img
            src={`${BRANDING_BASE}logo-cogenta-transparent.png`}
            alt=""
            aria-hidden="true"
            className="doc-header__logo"
          />
        </span>
        <div>
          <h1 id="documentation-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('documentation.heading')}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">{t('documentation.intro')}</p>
        </div>
      </div>

      {/*
        L22 task 7: the full functional/technical documentation tree, built
        from `docs-site/content/**` — the same source and renderer as the
        statically published site. This panel stays the fast per-section
        overview; the button below is the door to the deep guides (content,
        appearance, IA/agents, building a theme or a plugin, …).
      */}
      <Card>
        <CardBody className="flex items-center justify-between gap-4">
          <p className="m-0 text-sm">{t('documentation.docsLinkIntro')}</p>
          <Link
            to="/documentation/docs"
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground"
          >
            {t('documentation.docsLinkCta')}
          </Link>
        </CardBody>
      </Card>

      <div
        role="tablist"
        aria-label={t('documentation.tabsLabel')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`documentation-tab-${id}`}
            aria-selected={section === id}
            aria-controls={`documentation-panel-${id}`}
            className={
              section === id
                ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground'
            }
            onClick={() => setSection(id)}
          >
            {t(`nav.groups.${id}`)}
          </button>
        ))}
      </div>

      {SECTIONS.map((id) => (
        <div
          key={id}
          id={`documentation-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`documentation-tab-${id}`}
          hidden={section !== id}
        >
          {section === id && (
            <div className="flex flex-col gap-4">
              <Card aria-labelledby={`documentation-${id}-summary-heading`}>
                <CardHeader>
                  <CardTitle>
                    <h2 id={`documentation-${id}-summary-heading`}>{t(`nav.groups.${id}`)}</h2>
                  </CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <p className="m-0 text-sm">{t(`documentation.sections.${id}.summary`)}</p>

                  <div>
                    <h3 className="text-sm font-semibold">
                      {t('documentation.quickstartHeading')}
                    </h3>
                    <ol className="m-0 mt-2 flex flex-col gap-1 pl-5 text-sm">
                      {QUICKSTART_STEPS[id].map((key) => (
                        <li key={key}>{t(key)}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">{t('documentation.screensHeading')}</h3>
                    <p className="m-0 mt-1 text-xs text-muted-foreground">
                      {t('documentation.screensNote')}
                    </p>
                    <ul className="m-0 mt-2 flex flex-col gap-1 pl-5 text-sm">
                      {screensOf(id).map((item) => (
                        <li key={item.to}>
                          <Link to={item.to}>{t(item.labelKey)}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardBody>
              </Card>

              {id === 'content' && (
                <Card aria-labelledby="documentation-flow-editorial-heading">
                  <CardHeader>
                    <CardTitle>
                      <h2 id="documentation-flow-editorial-heading">
                        {t('documentation.flows.editorial.heading')}
                      </h2>
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="flex flex-col gap-3">
                    <p className="m-0 text-sm text-muted-foreground">
                      {t('documentation.flows.editorial.intro')}
                    </p>
                    <EditorialFlowDiagram t={t} />
                    <ol className="m-0 flex flex-col gap-1 pl-5 text-sm">
                      {EDITORIAL_FLOW_STEPS.map((key) => (
                        <li key={key}>{t(key)}</li>
                      ))}
                    </ol>
                    <p className="m-0 text-xs text-muted-foreground">
                      {t('documentation.flows.editorial.note')}
                    </p>
                  </CardBody>
                </Card>
              )}

              {id === 'settings' && (
                <Card aria-labelledby="documentation-flow-plugin-heading">
                  <CardHeader>
                    <CardTitle>
                      <h2 id="documentation-flow-plugin-heading">
                        {t('documentation.flows.plugin.heading')}
                      </h2>
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="flex flex-col gap-3">
                    <p className="m-0 text-sm text-muted-foreground">
                      {t('documentation.flows.plugin.intro')}
                    </p>
                    <PluginPermissionFlowDiagram t={t} />
                    <ol className="m-0 flex flex-col gap-1 pl-5 text-sm">
                      {PLUGIN_FLOW_STEPS.map((key) => (
                        <li key={key}>{t(key)}</li>
                      ))}
                    </ol>
                    <p className="m-0 text-xs text-muted-foreground">
                      {t('documentation.flows.plugin.note')}
                    </p>
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

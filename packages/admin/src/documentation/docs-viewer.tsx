import { type JSX, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/** Committed Markdown only, escaped by the existing documentation renderer. */
export function DocsViewer({
  html,
  title,
}: {
  readonly html: string
  readonly title: string
}): JSX.Element {
  const { t } = useTranslation()
  const content = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = content.current
    if (element === null) return
    element.querySelectorAll('table').forEach((table, index) => {
      let region = table.parentElement
      if (!region?.classList.contains('doc-table-scroll')) {
        region = document.createElement('div')
        region.className = 'doc-table-scroll'
        table.parentNode?.insertBefore(region, table)
        region.appendChild(table)
      }
      region.tabIndex = 0
      region.setAttribute('role', 'region')
      region.setAttribute(
        'aria-label',
        t('documentation.docs.tableScrollLabel', { index: index + 1, title }),
      )
    })
    element.querySelectorAll('pre').forEach((code, index) => {
      code.tabIndex = 0
      code.setAttribute('role', 'region')
      code.setAttribute(
        'aria-label',
        t('documentation.docs.codeScrollLabel', { index: index + 1, title }),
      )
    })
  }, [html, title, t])

  return <div ref={content} className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
}

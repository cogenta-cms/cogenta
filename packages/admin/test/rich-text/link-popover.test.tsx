import { render, screen } from '@testing-library/react'
import { createEditor, Editor, Element as SlateElement, Transforms } from 'slate'
import { Slate, withReact } from 'slate-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { insertInternalLink } from '../../src/rich-text/commands.js'
import { LinkPopover } from '../../src/rich-text/link-popover.js'
import type { RichTextSession } from '../../src/rich-text/session.js'
import { withInlines } from '../../src/rich-text/with-inlines.js'
import { installMockFetch, MOCK_SCHEMA, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * Fiche 04 task 2's own accessibility test: "le sélecteur d'entrée du lien
 * interne signale un brouillon" — reopening the link panel on a link whose
 * target is not published shows that, using the same `GET
 * /api/content/article/{id}` a real server answers (`installMockFetch`,
 * never a mock of the store itself, per AGENTS.md).
 */

function editorWithLinkTo(entryId: string): ReturnType<typeof withInlines> {
  const editor = withInlines(withReact(createEditor()))
  editor.children = [{ type: 'paragraph', children: [{ text: 'see the target' }] }]
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 'see the target'.length },
  })
  insertInternalLink(editor, 'article', entryId)

  const [match] = Editor.nodes(editor, {
    at: [],
    match: (node) => SlateElement.isElement(node) && node.type === 'link',
  })
  if (match === undefined) throw new Error('no link found')
  const [, path] = match
  Transforms.select(editor, { path: [...path, 0], offset: 1 })

  return editor
}

function session(): RichTextSession {
  return { token: VALID_TOKEN, roles: ['editor'], collections: MOCK_SCHEMA.collections as never }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LinkPopover — internal link target status', () => {
  it('warns when the linked entry is a draft', async () => {
    installMockFetch()
    const editor = editorWithLinkTo('entry-2') // MOCK_ENTRIES: entry-2 is a draft.

    render(
      <Slate editor={editor} initialValue={editor.children}>
        <LinkPopover session={session()} disabled={false} onClose={vi.fn()} />
      </Slate>,
    )

    // The current *target*'s status ("Cible : …"), not to be confused with
    // the browse list underneath, which independently badges "Second
    // article" (entry-2) as a draft too — a different sentence entirely.
    expect(await screen.findByText(/cible\s*:\s*brouillon|target:\s*draft/i)).toBeDefined()
  })

  it('says nothing about status for a published target', async () => {
    installMockFetch()
    const editor = editorWithLinkTo('entry-1') // MOCK_ENTRIES: entry-1 is published.

    render(
      <Slate editor={editor} initialValue={editor.children}>
        <LinkPopover session={session()} disabled={false} onClose={vi.fn()} />
      </Slate>,
    )

    // Give the async status lookup a turn, then assert neither badge showed up.
    await screen.findByRole('button', { name: /retirer le lien|remove link/i })
    expect(screen.queryByText(/cible\s*:\s*brouillon|target:\s*draft/i)).toBeNull()
    expect(screen.queryByText(/cible\s*:.*corbeille|target:.*trash/i)).toBeNull()
  })
})

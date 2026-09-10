import { defineTool, type ToolDefinition } from '@cogenta/agents'
import { z } from 'zod'

/**
 * The feedback signal the theme writer never had.
 *
 * Before this tool, a generation run was open-loop: the model wrote files and
 * heard back only "written" or a structural rejection (module failed to load,
 * manifest field wrong). It never saw the page its own code produced, which
 * is why asking it to reproduce a reference screenshot behaved like asking
 * someone to paint blindfolded — no amount of prompt work fixes a control
 * loop with no measurement in it.
 *
 * `renderSandboxPreview` (`@cogenta/cli`'s `theme-sandbox.ts`) already
 * rendered a sandbox theme to real HTML in an isolated module, and the admin
 * preview screen already used it. This exposes exactly that, unchanged, as a
 * tool — so the writer can render, read what it actually produced, and
 * correct it before finishing.
 *
 * Read-only by construction: `sideEffects: false`, no `revert` to have, and
 * the injected `renderPreview` neither writes to the sandbox nor touches
 * `themes/`. The HTML it returns is this theme's own output against a fixed
 * demo page — never real site content, so nothing a visitor stored can reach
 * the model through it.
 */

export interface PreviewSandboxToolOptions {
  /** Exactly `renderSandboxPreview`'s own result shape (`@cogenta/cli`), threaded in as a plain function — this package cannot import `@cogenta/cli`, the dependency arrow runs the other way. The returned HTML is a whole document, the theme's stylesheet included inline. */
  readonly renderPreview: (input: {
    readonly sandboxId: string
  }) => Promise<
    { readonly ok: true; readonly html: string } | { readonly ok: false; readonly error: string }
  >
  /**
   * Guard against one render filling the whole context window: a theme that
   * loops over demo entries can emit a lot of markup, and the model needs
   * enough to judge structure, not every last node.
   */
  readonly maxHtmlChars?: number
}

const DEFAULT_MAX_HTML_CHARS = 12_000

const PreviewSandboxInputSchema = z.object({
  sandboxId: z.string().min(1),
})
export type PreviewSandboxInput = z.infer<typeof PreviewSandboxInputSchema>

const PreviewSandboxOutputSchema = z.object({
  ok: z.boolean(),
  html: z.string().optional(),
  /** `false` means the rendered document carries no stylesheet at all — the theme will render as unstyled text no matter how good its markup is, and that is worth saying outright rather than leaving the model to notice. */
  hasStylesheet: z.boolean().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional(),
})
export type PreviewSandboxOutput = z.infer<typeof PreviewSandboxOutputSchema>

export function createPreviewSandboxTool(
  options: PreviewSandboxToolOptions,
): ToolDefinition<PreviewSandboxInput, PreviewSandboxOutput> {
  const limit = options.maxHtmlChars ?? DEFAULT_MAX_HTML_CHARS
  return defineTool({
    name: 'theme.preview_sandbox',
    version: '1.0.0',
    description: `Renders the theme currently written in a sandbox and returns the real HTML it produces, against a fixed demo page. This is the only way to find out what the theme you just wrote actually looks like — writing a file only reports that it was accepted, never that it renders the design you intended.

Call it after the theme's files are in place, and again after any correction. Read the returned markup as the page a visitor would get: check that the regions you designed are really there and really nested the way you meant, that no section silently rendered empty, and that the class names your CSS targets are the class names the markup actually carries — a selector that matches nothing is the single most common reason a written theme renders as unstyled text.

A render failure comes back with the real error message: fix the file it names and preview again. Never finish a run on a sandbox whose last preview failed.`,
    input: PreviewSandboxInputSchema,
    output: PreviewSandboxOutputSchema,
    permissions: ['theme.write_sandbox'],
    sideEffects: false,
    // Nothing to undo: this tool only reads. `false` here is the honest
    // declaration for a read-only tool, not a refusal to support undo.
    reversible: false,
    cost: 'low',
    async execute(input) {
      const result = await options.renderPreview({ sandboxId: input.sandboxId })
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      const truncated = result.html.length > limit
      return {
        ok: true,
        html: truncated ? `${result.html.slice(0, limit)}\n<!-- …truncated -->` : result.html,
        hasStylesheet: /<style[\s>]/u.test(result.html),
        truncated,
      }
    },
  })
}

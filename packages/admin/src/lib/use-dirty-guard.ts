import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

/**
 * Never lose a modification without being told (fiche 02 task 2).
 *
 * Two mechanisms, because they cover two different exits:
 *
 * - `beforeunload` for closing the tab or reloading — the browser's own
 *   dialog, which no app can replace with something nicer, only trigger.
 * - A capturing `click` listener on `document` for navigating *inside* the
 *   admin (a click on a `Link` in the shell's menu, `entry-edit.tsx`'s own
 *   "back to the list" link) — `beforeunload` never fires for that, since the
 *   document never actually unloads.
 *
 * The obvious tool for the second one is `useBlocker`, and it was tried
 * first — it needs a *data* router (`createBrowserRouter`/`RouterProvider`),
 * and this admin's tests mount `<App />` fresh per test and drive navigation
 * with direct `window.history.pushState` calls before that mount (the same
 * pattern `<BrowserRouter>` has always supported). Under a data router that
 * pattern hangs: nothing here calls the router's own imperative `navigate()`
 * for a `pushState` done directly on `window.history`, so the router's
 * internal state never catches up, and every test that logs in and expects
 * to land on the dashboard times out. Migrating the whole admin to a data
 * router to fix that was a far bigger, riskier change than one blocked
 * screen's exit guard justifies — so this intercepts the one concrete thing
 * task 2 actually asks for (a click on an in-app link) directly, and stays
 * compatible with the router this admin already uses everywhere else.
 *
 * What this does **not** catch: the browser's own back/forward buttons
 * (`popstate`), which have already changed `window.location` by the time an
 * event fires and would need a history-trap to intercept — a real gap,
 * documented rather than silently accepted, and out of proportion for this
 * fiche to fix by itself.
 */
export interface DirtyGuardBlocker {
  /** A click on an in-app link was intercepted and is waiting for a decision. */
  readonly blocked: boolean
  /** Navigates to the link that was intercepted. */
  proceed(): void
  /** Drops the intercepted navigation; the screen stays exactly as it was. */
  reset(): void
}

export function useDirtyGuard(dirty: boolean): DirtyGuardBlocker {
  const navigate = useNavigate()
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      // The browser ignores any custom string these days and shows its own
      // wording — setting `returnValue` is what actually triggers the prompt.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty])

  useEffect(() => {
    function onClickCapture(event: MouseEvent): void {
      if (!dirtyRef.current) return
      if (event.defaultPrevented || event.button !== 0) return
      // A modified click (open in new tab, etc.) is not "leave this page" —
      // the browser's own behaviour for it must not be hijacked.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (anchor === null || !(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target !== '' || anchor.hasAttribute('download')) return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // Same page (an in-page anchor, or the current route re-clicked): not
      // a departure, and blocking it would trap someone on their own screen.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }

      event.preventDefault()
      setPendingHref(`${url.pathname}${url.search}${url.hash}`)
    }

    // Capturing, so this runs before react-router's own `Link` click handler
    // (registered in the bubble phase) ever sees the event.
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  return {
    blocked: pendingHref !== null,
    proceed(): void {
      if (pendingHref !== null) navigate(pendingHref)
      setPendingHref(null)
    },
    reset(): void {
      setPendingHref(null)
    },
  }
}

import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a screen name its own browser tab when the name is data the shell
 * cannot know from the URL alone (a documentation page's title, say). The
 * shell provides the setter; the title it shows falls back to the breadcrumb
 * the moment the screen unmounts or passes `null`.
 */
export const PageTitleContext = createContext<((title: string | null) => void) | null>(null)

export function usePageTitle(title: string | null): void {
  const setTitle = useContext(PageTitleContext)
  useEffect(() => {
    setTitle?.(title)
    return () => setTitle?.(null)
  }, [title, setTitle])
}

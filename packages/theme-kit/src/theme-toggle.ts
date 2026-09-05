/**
 * The manual light/dark/system control ("dark mode is invisible without
 * it").
 *
 * `tokens.css` in every built-in theme already carries the full tri-state
 * pattern used across this project (a bare `:root` for light, a
 * `prefers-color-scheme: dark` block guarded by
 * `:not([data-theme="light"])`, and an explicit `[data-theme="dark"]` block
 * that wins either direction) — it has since each theme's own tokens file
 * was written. What never existed was anything that *sets*
 * `documentElement`'s `data-theme` attribute: a visitor whose OS is in light
 * mode had no way to preview dark, and vice versa, which is indistinguishable
 * from "this theme has no dark mode" during a demo.
 *
 * Two pieces, deliberately kept apart:
 *
 * - `renderThemeToggle` returns markup only (through `h()`/`serialize()`,
 *   same as `renderBrandMark`/`renderSocialLinks`) — a theme's own
 *   `renderChrome` places it, exactly like those two.
 * - `THEME_TOGGLE_SCRIPT` is raw JavaScript source, not markup, and is not
 *   this module's to wrap in a `<script>` tag: the host owns `<head>`, the
 *   same reasoning `ChromeBrand.faviconUrl`'s own doc comment gives for why
 *   a theme never writes `<link rel="icon">` itself. The host must place it
 *   early in `<head>`, before the stylesheet link, so a saved preference
 *   applies before first paint — no flash of the wrong theme.
 *
 * Zero dependencies, zero build step: a small inline script, the one
 * deliberate exception to these themes' otherwise-zero-client-JS design —
 * CSS alone cannot let a visitor override an OS preference and have that
 * choice survive a navigation without either JavaScript or a server-set
 * cookie, and a cookie would put theme choice on the request path of every
 * page for every visitor. R9 does not apply (no dependency); R5 does not
 * apply (touches neither the database nor a secret).
 */

import { type HtmlElement, h } from './html.js'
import { createThemeTranslator } from './strings.js'

const SUN_PATH =
  'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'
const MOON_PATH = 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z'

/**
 * The button a theme places in its header or footer. Carries three
 * `data-label-*` attributes (already in the page's own locale, via the same
 * `THEME_STRINGS` table every other visitor-facing theme string comes from)
 * so `THEME_TOGGLE_SCRIPT` can keep the accessible name correct after every
 * click without shipping its own translation table — the script only ever
 * copies a string the server already localised.
 *
 * Icon choice reflects the *current* effective appearance (sun while light,
 * moon while dark), swapped by CSS alone from the same `[data-theme]`
 * attribute and `prefers-color-scheme` query every theme's `tokens.css`
 * already keys its palette on — this module ships no CSS of its own,
 * matching `renderSocialLinks`'s own rule, so each theme styles
 * `.cg-theme-toggle` (sizing, border, the two `.cg-theme-toggle__icon--*`
 * visibility rules) in its own register.
 */
export function renderThemeToggle(
  locale: string,
  options: { readonly className?: string; readonly iconClassName?: string } = {},
): HtmlElement {
  const t = createThemeTranslator(locale)
  const labelLight = t('theme.toggle.switchToLight')
  const labelDark = t('theme.toggle.switchToDark')
  const labelSystem = t('theme.toggle.switchToSystem')
  const iconClass = (variant: 'sun' | 'moon'): string =>
    ['cg-theme-toggle__icon', `cg-theme-toggle__icon--${variant}`, options.iconClassName]
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(' ')
  return h(
    'button',
    {
      type: 'button',
      class: options.className,
      'data-cg-theme-toggle': true,
      'data-label-light': labelLight,
      'data-label-dark': labelDark,
      'data-label-system': labelSystem,
      // The page loads with no manual override (system), so the next click
      // switches to light — see `THEME_TOGGLE_SCRIPT`'s own cycle order.
      'aria-label': labelLight,
    },
    h(
      'svg',
      {
        class: iconClass('sun'),
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', { d: SUN_PATH }),
    ),
    h(
      'svg',
      {
        class: iconClass('moon'),
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', { d: MOON_PATH }),
    ),
  )
}

/**
 * Raw JavaScript, not markup — see this module's doc comment for why the
 * host, not a theme, wraps this in a `<script>` tag and where it must go.
 *
 * Cycle: system (no attribute) → light → dark → system. Its restore step
 * runs synchronously and unconditionally (a `<script>` this early in `<head>`
 * blocks parsing until it finishes, which is the point — the attribute is
 * set before the stylesheet is even requested, so there is nothing for a
 * visitor to see flip). The click handler is delegated on `document` itself,
 * so it works for a toggle button added anywhere in the page's header or
 * footer without this script knowing either exists yet.
 */
export const THEME_TOGGLE_SCRIPT = `(function(){
var KEY='cg-theme';
var root=document.documentElement;
function apply(next){
  if(next===null){root.removeAttribute('data-theme');}else{root.setAttribute('data-theme',next);}
  try{
    if(next===null){localStorage.removeItem(KEY);}else{localStorage.setItem(KEY,next);}
  }catch(e){}
}
function syncLabel(btn,current){
  var next=current==='light'?'dark':current==='dark'?null:'light';
  var label=next==='light'?btn.getAttribute('data-label-light'):next==='dark'?btn.getAttribute('data-label-dark'):btn.getAttribute('data-label-system');
  if(label){btn.setAttribute('aria-label',label);}
}
try{
  var saved=localStorage.getItem(KEY);
  if(saved==='light'||saved==='dark'){root.setAttribute('data-theme',saved);}
}catch(e){}
document.addEventListener('DOMContentLoaded',function(){
  var current=root.getAttribute('data-theme');
  var toggles=document.querySelectorAll('[data-cg-theme-toggle]');
  for(var i=0;i<toggles.length;i++){syncLabel(toggles[i],current);}
});
document.addEventListener('click',function(event){
  var target=event.target;
  var btn=target&&target.closest?target.closest('[data-cg-theme-toggle]'):null;
  if(!btn)return;
  var current=root.getAttribute('data-theme');
  var next=current==='light'?'dark':current==='dark'?null:'light';
  apply(next);
  var toggles=document.querySelectorAll('[data-cg-theme-toggle]');
  for(var i=0;i<toggles.length;i++){syncLabel(toggles[i],next);}
});
})();`

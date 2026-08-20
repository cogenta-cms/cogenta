import type { JSX, SVGAttributes } from 'react'

/**
 * The admin's icon set.
 *
 * Twenty hand-drawn glyphs, all sharing one stroke width, one corner style
 * (square, to match the sharp radius scale in `theme.css`) and one 20x20
 * grid — a deliberate, cohesive mark rather than a mix of whatever a package
 * happened to ship. Inline SVG, zero dependency (R9): no `lucide-react`, no
 * icon font.
 *
 * Every icon is `aria-hidden` by construction — it decorates a labelled
 * button or nav link, it never carries meaning on its own. A caller that
 * genuinely needs a standalone, meaningful icon wraps it and supplies its
 * own `aria-label` on the wrapper.
 */

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, 'viewBox' | 'aria-hidden'>

function icon(paths: JSX.Element, extra?: { fill?: 'currentColor' }) {
  return function Icon({ className, ...props }: IconProps): JSX.Element {
    return (
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
        fill={extra?.fill ?? 'none'}
        stroke={extra?.fill === undefined ? 'currentColor' : undefined}
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={className ?? 'size-4'}
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

export const DashboardIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="6.5" height="8" />
    <rect x="11" y="2.5" width="6.5" height="5" />
    <rect x="11" y="9.5" width="6.5" height="8" />
    <rect x="2.5" y="12.5" width="6.5" height="5" />
  </>,
)

export const CollectionsIcon = icon(
  <>
    <rect x="2.5" y="4" width="15" height="3.2" />
    <rect x="2.5" y="8.7" width="15" height="3.2" />
    <rect x="2.5" y="13.4" width="15" height="3.2" />
  </>,
)

export const TaxonomiesIcon = icon(
  <>
    <circle cx="5" cy="4.5" r="1.8" />
    <path d="M5 6.3v3.4h6.5" />
    <circle cx="13.5" cy="9.7" r="1.8" />
    <path d="M5 9.7v5.2h6.5" />
    <circle cx="13.5" cy="14.9" r="1.8" />
  </>,
)

export const TrashIcon = icon(
  <>
    <path d="M3.5 5.5h13" />
    <path d="M7 5.5V3.5h6v2" />
    <path d="M5 5.5l1 11h8l1-11" />
    <path d="M8.3 8.5v5.5M11.7 8.5v5.5" />
  </>,
)

export const MediaIcon = icon(
  <>
    <rect x="2.5" y="3.5" width="15" height="13" />
    <circle cx="6.7" cy="7.7" r="1.4" />
    <path d="M3.2 15.5l4.6-5 3 3.2 2.3-2.6 4.2 4.4" />
  </>,
)

export const AuditIcon = icon(
  <>
    <path d="M5 2.5h7l3 3v12H5z" />
    <path d="M12 2.5v3h3" />
    <path d="M7.3 10h5.4M7.3 12.4h5.4M7.3 14.8h3.4" />
  </>,
)

export const AgentsIcon = icon(
  <>
    <rect x="4.5" y="6" width="11" height="9" />
    <path d="M10 2.5v3.5" />
    <circle cx="10" cy="2" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="7.3" cy="10.2" r="1" fill="currentColor" stroke="none" />
    <circle cx="12.7" cy="10.2" r="1" fill="currentColor" stroke="none" />
    <path d="M7 13.2h6" />
    <path d="M2.5 9v3M17.5 9v3" />
  </>,
)

export const SitePlanIcon = icon(
  <>
    <path d="M10 2.5l7 4v7l-7 4-7-4v-7z" />
    <path d="M10 2.5v15" />
    <path d="M3 6.5l7 4 7-4" />
  </>,
)

export const UsersIcon = icon(
  <>
    <circle cx="7.3" cy="6.3" r="2.6" />
    <path d="M2.5 17c0-3 2.2-5 4.8-5s4.8 2 4.8 5" />
    <circle cx="14.3" cy="7.3" r="2" />
    <path d="M13 12.3c1.9.3 3.5 1.9 3.5 4.7" />
  </>,
)

export const ProfileIcon = icon(
  <>
    <circle cx="10" cy="6.5" r="3.5" />
    <path d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
  </>,
)

export const SettingsIcon = icon(
  <>
    <circle cx="10" cy="10" r="2.7" />
    <path d="M10 2.5v2.3M10 15.2v2.3M17.5 10h-2.3M4.8 10H2.5" />
    <path d="M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6M15.3 15.3l-1.6-1.6M6.3 6.3L4.7 4.7" />
  </>,
)

export const SearchIcon = icon(
  <>
    <circle cx="8.6" cy="8.6" r="5.1" />
    <path d="M12.5 12.6l4.5 4.5" />
  </>,
)

export const PublishIcon = icon(
  <>
    <path d="M10 16.5V5" />
    <path d="M5.3 9.7L10 5l4.7 4.7" />
    <path d="M4 16.5h12" />
  </>,
)

export const DeleteIcon = TrashIcon

export const EditIcon = icon(
  <>
    <path d="M12.4 3.6l4 4-9.2 9.2-4.6.6.6-4.6z" />
    <path d="M11 5l4 4" />
  </>,
)

export const PlusIcon = icon(<path d="M10 3.5v13M3.5 10h13" />)

export const CheckIcon = icon(<path d="M4 10.5l4 4 8-9" />)

export const CloseIcon = icon(<path d="M5 5l10 10M15 5L5 15" />)

export const ChevronRightIcon = icon(<path d="M7.5 4.5l6 5.5-6 5.5" />)

export const ChevronDownIcon = icon(<path d="M4.5 7.5l5.5 6 5.5-6" />)

export const LogoutIcon = icon(
  <>
    <path d="M8.5 3.5H4.5v13h4" />
    <path d="M12 6.5l4 3.5-4 3.5" />
    <path d="M7.5 10h8.3" />
  </>,
)

export const AlertIcon = icon(
  <>
    <path d="M10 2.5l8 14H2z" />
    <path d="M10 8v3.6" />
    <circle cx="10" cy="14.2" r="0.15" fill="currentColor" stroke="currentColor" />
  </>,
)

export const ClockIcon = icon(
  <>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 5.5V10l3.2 2" />
  </>,
)

export const PulseIcon = icon(<path d="M2.5 10.5h3l1.8-5.5 3 11 1.8-7.5 1.4 2h3.5" />)

export const TrendIcon = icon(
  <>
    <path d="M2.5 15.5h15" />
    <rect x="4" y="10.5" width="2.5" height="5" />
    <rect x="8.75" y="6.5" width="2.5" height="9" />
    <rect x="13.5" y="3.5" width="2.5" height="12" />
  </>,
)

export const InfoIcon = icon(
  <>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.4" />
    <circle cx="10" cy="6.6" r="0.15" fill="currentColor" stroke="currentColor" />
  </>,
)

/**
 * The rich text toolbar's own glyphs (fiche 04 task 1): one icon per
 * existing mark/block/insertion, no visible label — `RichTextToolbar` keeps
 * the same translated accessible name on `aria-label` that used to be the
 * button's text, so nothing here changes what a screen reader announces.
 */

export const BoldIcon = icon(
  <path d="M6.5 3.5h5a3 3 0 0 1 0 6h-5zM6.5 9.5h5.8a3.2 3.2 0 0 1 0 6.4H6.5z" />,
)

export const ItalicIcon = icon(<path d="M8.5 3.5h5.5M6 16.5h5.5M12 3.5l-4 13" />)

export const InlineCodeIcon = icon(<path d="M7 5.5L2.5 10l4.5 4.5M13 5.5l4.5 4.5-4.5 4.5" />)

function headingIcon(digit: string) {
  return icon(
    <>
      <path d="M3 4v12M3 10h5.5M8.5 4v12" />
      <text
        x="11.2"
        y="14.5"
        fontSize="7.5"
        fontFamily="system-ui, sans-serif"
        stroke="none"
        fill="currentColor"
      >
        {digit}
      </text>
    </>,
  )
}

export const Heading2Icon = headingIcon('2')
export const Heading3Icon = headingIcon('3')
export const Heading4Icon = headingIcon('4')

export const ParagraphIcon = icon(
  <>
    <path d="M11.5 3.5v13M8 3.5v13" />
    <path d="M11.5 3.5H9a3.5 3.5 0 1 0 0 7h2.5" />
  </>,
)

export const QuoteIcon = icon(
  <>
    <path d="M4.2 5.2c-1.6 1-2.2 2.6-2.2 4.6h3v5.4h-4.6v-4.3c0-3.1 1.4-5 3.8-6z" />
    <path d="M13.2 5.2c-1.6 1-2.2 2.6-2.2 4.6h3v5.4h-4.6v-4.3c0-3.1 1.4-5 3.8-6z" />
  </>,
)

export const BulletListIcon = icon(
  <>
    <circle cx="3.3" cy="5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.3" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.3" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <path d="M7 5h10M7 10h10M7 15h10" />
  </>,
)

export const NumberListIcon = icon(
  <>
    <text
      x="1.2"
      y="7"
      fontSize="6"
      fontFamily="system-ui, sans-serif"
      stroke="none"
      fill="currentColor"
    >
      1
    </text>
    <text
      x="1.2"
      y="12"
      fontSize="6"
      fontFamily="system-ui, sans-serif"
      stroke="none"
      fill="currentColor"
    >
      2
    </text>
    <text
      x="1.2"
      y="17"
      fontSize="6"
      fontFamily="system-ui, sans-serif"
      stroke="none"
      fill="currentColor"
    >
      3
    </text>
    <path d="M7 5h10M7 10h10M7 15h10" />
  </>,
)

export const LinkIcon = icon(
  <path d="M8.2 11.8l3.6-3.6M6.6 5.9l1.3-1.3a3.1 3.1 0 0 1 4.4 4.4l-1.3 1.3M13.4 14.1l-1.3 1.3a3.1 3.1 0 0 1-4.4-4.4l1.3-1.3" />,
)

export const ExternalLinkIcon = icon(
  <>
    <path d="M8.5 4.5h-4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
    <path d="M11 3.5h5.5V9M16.2 3.8l-7 7" />
  </>,
)

export const ImageIcon = MediaIcon

export const UndoIcon = icon(<path d="M6.5 5.5L2.5 9l4 3.5M2.5 9H12a5 5 0 0 1 0 10h-2.5" />)

export const RedoIcon = icon(<path d="M13.5 5.5L17.5 9l-4 3.5M17.5 9H8a5 5 0 0 0 0 10h2.5" />)

export const FullscreenIcon = icon(
  <path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" />,
)

export const FullscreenExitIcon = icon(
  <path d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />,
)

export const SlashIcon = icon(<path d="M13 3.5L7 16.5" />)

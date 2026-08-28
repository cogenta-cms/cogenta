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

/** Fiche 42 task 2 — an "S" shape crossed by the strike line, so it reads as a mark next to `BoldIcon`/`ItalicIcon` rather than as a stray line. */
export const StrikethroughIcon = icon(
  <>
    <path d="M6.2 6.3c0-1.7 1.6-2.8 3.8-2.8s3.7 1 3.9 2.5" />
    <path d="M6.6 13.7c.2 1.5 1.8 2.6 3.9 2.6 2.2 0 3.7-1 3.7-2.6 0-1-.6-1.7-1.7-2.2" />
    <path d="M3 10h14" />
  </>,
)

/** Fiche 42 task 2 — a rule with marked ends, distinct from a bare divider line. */
export const HorizontalRuleIcon = icon(
  <>
    <circle cx="3.5" cy="10" r="1" fill="currentColor" stroke="none" />
    <path d="M6.5 10h7" />
    <circle cx="16.5" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
)

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

/** A code block (L21 task 5) — a framed rectangle rather than `InlineCodeIcon`'s bare chevrons, to read as "a block" next to the block buttons it sits among rather than as another inline mark. */
export const CodeBlockIcon = icon(
  <>
    <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
    <path d="M7.3 8L5 10l2.3 2M12.7 8L15 10l-2.3 2" />
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

/** The notification centre's trigger (fiche 38 task 2). */
export const BellIcon = icon(
  <>
    <path d="M5 15v-4.5a5 5 0 0110 0V15l1.5 2h-13z" />
    <path d="M8.3 17.5a1.8 1.8 0 003.4 0" />
  </>,
)

/** The Documentation nav entry (fiche 21 task 7) — an open book, distinct from the flat-page `AuditIcon`. */
export const DocumentationIcon = icon(
  <>
    <path d="M10 5.3C8.6 4.2 6.6 3.6 4.5 3.6v11c2.1 0 4.1.6 5.5 1.7" />
    <path d="M10 5.3c1.4-1.1 3.4-1.7 5.5-1.7v11c-2.1 0-4.1.6-5.5 1.7z" />
    <path d="M10 5.3v11.7" />
  </>,
)

/**
 * Fiche 22 tâche 8, part 6 — the sidebar icon audit. Before this set, every
 * one of these nav entries fell back to its *group*'s icon (`app-shell.tsx`'s
 * `GROUP_ICONS`), so "Menus", "Comments", "Translations", "Forms" and
 * "Submissions" all showed the exact same three-bar glyph as "Content"
 * itself, six commerce screens all showed the same bar chart, and "Health",
 * "Tools", "Scheduled", "Import", "Marketplace" and "Analytics" all showed a
 * plain settings gear — a real user complaint ("several icons don't
 * represent what they link to"), not a hypothetical one. Each icon below
 * replaces exactly one of those collisions with something that actually
 * depicts its own screen; nothing here touches an icon that was already
 * distinct and correct (`AuditIcon`, `UsersIcon`, `TrashIcon`, …).
 */

/** "Review queue" (`/review`) — a document with an approval mark, distinct from the flat-page `AuditIcon`. */
export const ReviewIcon = icon(
  <>
    <path d="M5 2.5h7l3 3v12H5z" />
    <path d="M12 2.5v3h3" />
    <path d="M7.3 13.3l1.8 1.8 3.6-4" />
  </>,
)

/** "Menus" (`/menus`) — a small navigation tree, distinct from `CollectionsIcon`'s flat stacked bars. */
export const MenusIcon = icon(
  <>
    <circle cx="4" cy="4.5" r="1.3" />
    <path d="M4 5.8v3.7h4.5" />
    <circle cx="10" cy="10" r="1.3" />
    <path d="M4 9.5v5h4.5" />
    <circle cx="10" cy="15" r="1.3" />
    <path d="M12.8 4.5h4M12.8 10h4M12.8 15h4" />
  </>,
)

/** "Comments" (`/comments`) — a speech bubble. */
export const CommentsIcon = icon(
  <>
    <path d="M3 4.5h14v9H8.5L5 17v-3.5H3z" />
    <path d="M6.3 8h7.4M6.3 10.8h4.6" />
  </>,
)

/** "Translations" (`/translations`) — a globe, the conventional mark for language/locale switching. */
export const TranslationsIcon = icon(
  <>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M2.5 10h15" />
    <path d="M10 2.5c2.2 2 3.4 5 3.4 7.5s-1.2 5.5-3.4 7.5c-2.2-2-3.4-5-3.4-7.5S7.8 4.5 10 2.5z" />
  </>,
)

/** "Forms" (`/forms`) — a clipboard with checkboxes, distinct from `FormSubmissionsIcon`'s inbox. */
export const FormsIcon = icon(
  <>
    <path d="M6 3.5h8v14H6z" />
    <path d="M8 2.5h4v2H8z" />
    <path d="M7.6 8.3l1 1 1.8-2M7.6 12.3l1 1 1.8-2" />
    <path d="M12.2 8.6h1.8M12.2 12.6h1.8" />
  </>,
)

/** "Submissions" (`/form-submissions`) — an inbox tray, since these are received rather than authored. */
export const FormSubmissionsIcon = icon(
  <>
    <path d="M3 11.5l2.6-7h8.8l2.6 7" />
    <path d="M3 11.5v4.5h14v-4.5h-4.2a2.8 2.8 0 01-5.6 0z" />
  </>,
)

/** "SEO" (`/seo`) — a magnifying glass over a rising bar, search ranking rather than plain search (`SearchIcon`). */
export const SeoIcon = icon(
  <>
    <circle cx="8.3" cy="8.3" r="5" />
    <path d="M5.5 9.3l1.6-1.8 1.4 1 1.8-2.4" />
    <path d="M12.3 12.3l4.7 4.7" />
  </>,
)

/** "Products" (`/commerce/products`) — a packing box. */
export const CommerceProductsIcon = icon(
  <>
    <path d="M2.7 6.3L10 2.5l7.3 3.8V14L10 17.5 2.7 14z" />
    <path d="M2.7 6.3L10 10l7.3-3.7M10 10v7.5" />
  </>,
)

/** "Orders" (`/commerce/orders`) — a receipt, distinct from the plain document of `ReviewIcon`/`AuditIcon`. */
export const CommerceOrdersIcon = icon(
  <>
    <path d="M5.5 2.5h9v15l-2-1.3-2 1.3-2-1.3-2 1.3z" />
    <path d="M7.7 6.5h4.6M7.7 9.5h4.6M7.7 12.5h2.6" />
  </>,
)

/** "Coupons" (`/commerce/coupons`) — a ticket/tag shape with a punch hole. */
export const CommerceTicketIcon = icon(
  <>
    <path d="M2.5 8.3a2 2 0 000-3.6V3.5h15v13h-15v-1.2a2 2 0 000-3.6z" />
    <path d="M9.5 3.5v13" strokeDasharray="1.8 1.8" />
  </>,
)

/** "Subscriptions" (`/commerce/subscriptions`) — a recurring cycle, since a subscription renews rather than being a one-off order. */
export const CommerceSubscriptionsIcon = icon(
  <>
    <path d="M15.8 6.5A6 6 0 004.6 8.4M4.2 13.5A6 6 0 0015.4 11.6" />
    <path d="M15.8 3v3.5h-3.5M4.2 17v-3.5h3.5" />
  </>,
)

/** "Store settings" (`/commerce/settings`) — a storefront, the same mark used for the whole Commerce group. */
export const CommerceShopIcon = icon(
  <>
    <path d="M3 8.5V17h14V8.5" />
    <path d="M2.5 4.5h15l1 4a2.3 2.3 0 01-4.4 1 2.3 2.3 0 01-4.2 0 2.3 2.3 0 01-4.2 0 2.3 2.3 0 01-4.4-1z" />
    <path d="M8 17v-4.5h4V17" />
  </>,
)

/** "Tax" (`/commerce/tax`) — a percent sign. */
export const CommerceTaxIcon = icon(
  <>
    <path d="M15 5L5 15" />
    <circle cx="6.3" cy="6.3" r="2" />
    <circle cx="13.7" cy="13.7" r="2" />
  </>,
)

/** "Shipping" (`/commerce/shipping`) — a delivery truck. */
export const CommerceShippingIcon = icon(
  <>
    <path d="M2 6.5h9v8H2z" />
    <path d="M11 9.5h3.3l2.7 2.7v2.3h-6z" />
    <circle cx="5.8" cy="15.8" r="1.5" />
    <circle cx="13.5" cy="15.8" r="1.5" />
  </>,
)

/** "Payment" (`/commerce/payment`) — a credit card. */
export const CommercePaymentIcon = icon(
  <>
    <rect x="2.5" y="4.5" width="15" height="11" />
    <path d="M2.5 8h15" />
    <path d="M5 12.3h3.5" />
  </>,
)

/** "Assistant" (`/assistant`, chat + duplicate detection) — a chat bubble with a spark, distinct from `AgentsIcon`'s autonomous robot. */
export const AssistantIcon = icon(
  <>
    <path d="M3 4.5h14v9H9l-3.5 3.5V13.5H3z" />
    <path
      d="M9.8 6.3l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"
      fill="currentColor"
      stroke="none"
    />
  </>,
)

/** "MCP Server" (`/mcp`) and "MCP Clients" (`/mcp-clients`, fiche 58) — a plug, the connector metaphor for wiring up an external client or server. */
export const McpIcon = icon(
  <>
    <path d="M7 2.5v4M13 2.5v4" />
    <path d="M5.5 6.5h9v3a4.5 4.5 0 01-9 0z" />
    <path d="M10 13.5v4" />
  </>,
)

/** "API keys" (`/api-keys`) — a physical key, distinct from `RolesIcon`'s shield. */
export const ApiKeysIcon = icon(
  <>
    <circle cx="6" cy="10" r="3.5" />
    <path d="M9.3 10h8.2M14.5 10v3M17 10v2.3" />
  </>,
)

/** "Roles & permissions" (`/roles`) — a shield, distinct from `UsersIcon`'s people and `ApiKeysIcon`'s key. */
export const RolesIcon = icon(
  <>
    <path d="M10 2.7l6 2.3v5c0 4-2.6 6.7-6 7.6-3.4-.9-6-3.6-6-7.6V5z" />
    <path d="M7.3 10l1.8 1.8L13 8" />
  </>,
)

/** "Import" (`/import`) — an inward tray, mirroring `FormSubmissionsIcon`'s shape but with an explicit down-arrow for "bringing content in". */
export const ImportIcon = icon(
  <>
    <path d="M10 2.5v9.5M6.7 8.8L10 12l3.3-3.2" />
    <path d="M3 13v3.5h14V13" />
  </>,
)

/** A generic "download this" mark — the analytics CSV export button (fiche 22 tâche 8, part 1). Same tray as `ImportIcon`, since both are "content leaves/enters through this door", just without that icon's own nav-specific doc comment. */
export const DownloadIcon = ImportIcon

/** "Marketplace" (`/marketplace`) — a small catalogue grid, distinct from the storefront `CommerceShopIcon`. */
export const MarketplaceIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="6" height="6" />
    <rect x="11.5" y="2.5" width="6" height="6" />
    <rect x="2.5" y="11.5" width="6" height="6" />
    <rect x="11.5" y="11.5" width="6" height="6" />
  </>,
)

/** "Health" (`/health`) — a heartbeat trace inside a shield-like frame, distinct from the plain `PulseIcon` sparkline used inside dashboard widgets. */
export const HealthIcon = icon(
  <>
    <path d="M10 17c-4-2.4-7-5.4-7-8.8A3.7 3.7 0 0110 5.8a3.7 3.7 0 017 2.4c0 3.4-3 6.4-7 8.8z" />
    <path d="M6.5 9.8h2l1-2.4 1.5 4.8 1-2.4h2" />
  </>,
)

/** "Tools" (`/tools`) — a wrench, distinct from the settings gear (`SettingsIcon`, a personal/site preference, not a diagnostic tool). */
export const ToolsIcon = icon(
  <path d="M13.5 3a3.5 3.5 0 00-4.6 4.2L3 13l2.5 2.5 5.8-5.9A3.5 3.5 0 0017 5.5l-2.7 2.7-2-2z" />,
)

/** "Scheduled tasks" (`/scheduled`) — a calendar page, distinct from `ClockIcon`'s plain clock used elsewhere for "time-sensitive" dashboard items. */
export const ScheduledIcon = icon(
  <>
    <rect x="2.5" y="4" width="15" height="13" />
    <path d="M2.5 7.5h15M6 2.5v3M14 2.5v3" />
    <path d="M10 10.5v2.3l1.8 1" />
  </>,
)

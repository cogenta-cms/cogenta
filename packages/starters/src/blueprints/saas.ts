import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createMenuStore,
  defineCollection,
  ensureMenuTables,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, logoArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  richTextParagraph,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus, MenuItemSpec } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `saas` blueprint: the marketing site of a B2B software product for
 * finance and operations teams (spend approvals, an audit log, ERP sync),
 * rewritten to studio level by L27.
 *
 * The product is named after the site (`SeedContext.siteName`), falling back
 * to "Ledgerline". Its customers, people and figures are invented and
 * consistent from page to page: the customer quoted on the home page is the
 * workspace shown in every screenshot.
 *
 * Content model:
 *
 * - `feature`: one page per capability, routed at `/features/:slug`, with a
 *   short summary, an icon name (`@cogenta/theme-kit`'s `renderIcon`), a
 *   screenshot of that part of the product as its cover, and a block zone for
 *   the page itself.
 * - `changelog`: dated product updates at `/changelog/:slug`. `publishedAt`
 *   is declared so a seeded update carries the day it shipped rather than the
 *   instant of the scaffold.
 * - `page`: home, product, pricing, security, changelog, company, book a
 *   demo, legal and privacy.
 *
 * Pricing tiers stay page-authored content (a `pricingTable` block): a plan
 * has no lifecycle of its own. There is no signup or billing system behind
 * this site, so no action pretends there is one: every "Start a trial" and
 * "Book a demo" leads to the `demo` page, which says how a trial is set up by
 * a person, and gives a real email address and telephone number.
 */

export const DEFAULT_PRODUCT_NAME = 'Ledgerline'

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_PRODUCT_NAME : trimmed
}

/** An address at the product's own domain, derived from its name: `demo@ledgerline.com`. */
export function saasEmail(siteName: string | undefined, mailbox = 'hello'): string {
  const domain = nameOf(siteName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'example' : domain}.com`
}

/** A London number in the range Ofcom reserves for drama: it rings nobody. */
export const SAAS_PHONE = '+44 20 7946 0321'
const SAAS_PHONE_HREF = 'tel:+442079460321'

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const EDITORIAL_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  // An undeclared action grants nobody, admin included: without this line
  // nothing on this site could ever leave draft.
  publish: ['admin'],
} as const

export const feature = defineCollection({
  name: 'feature',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Feature', plural: 'Features' },
  routing: { pattern: '/features/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({
      max: 300,
      multiline: true,
      admin: {
        label: 'Summary',
        help: 'One or two sentences, shown under the name on the product pages and at the top of the feature page.',
      },
    }),
    icon: f.text({
      max: 64,
      admin: {
        label: 'Icon',
        help: 'One of the symbol names @cogenta/theme-kit recognises (for example "layers", "shield", "cloud", "lock", "chart", "code").',
      },
    }),
    coverImage: f.media({
      accept: ['image'],
      admin: {
        label: 'Screenshot',
        help: 'A screenshot of this part of the product, shown on the product tour and at the top of the feature page.',
      },
    }),
    blocks: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: EDITORIAL_PERMISSIONS,
})

export const changelog = defineCollection({
  name: 'changelog',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Changelog entry', plural: 'Changelog' },
  routing: { pattern: '/changelog/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({ max: 300, multiline: true }),
    // Declared so a seeded update can carry the day it shipped: without it
    // every entry's date would be the instant of the scaffold.
    publishedAt: f.datetime(),
    blocks: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: EDITORIAL_PERMISSIONS,
})

export const page = definePageCollection('/:slug')

export const SAAS_COLLECTIONS: readonly CollectionDefinition[] = [feature, changelog, page]

validateCollectionSet(SAAS_COLLECTIONS)

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

const BLOCK_VERSION = '1.0.0'

type RichPart =
  | { readonly h2: string }
  | { readonly h3: string }
  | { readonly p: string }
  | { readonly ul: readonly string[] }
  | { readonly ol: readonly string[] }

function textNode(
  key: string,
  text: string,
  style: 'normal' | 'h2' | 'h3',
  listItem?: 'bullet' | 'number',
): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
    children: [{ _key: `${key}-s`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function richText(key: string, parts: readonly RichPart[]): RichTextDocument {
  return parts.flatMap((part, index): RichTextDocument => {
    const at = `${key}-${index}`
    if ('h2' in part) return [textNode(at, part.h2, 'h2')]
    if ('h3' in part) return [textNode(at, part.h3, 'h3')]
    if ('p' in part) return [textNode(at, part.p, 'normal')]
    const items = 'ul' in part ? part.ul : part.ol
    const kind = 'ul' in part ? 'bullet' : 'number'
    return items.map((item, itemIndex) => textNode(`${at}-${itemIndex}`, item, 'normal', kind))
  })
}

function prose(key: string, parts: readonly RichPart[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richText(key, parts),
  } as VocabularyBlock
}

function qa(key: string, items: readonly (readonly [string, string])[]) {
  return items.map(([question, answer], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: richTextParagraph(`${key}-${index}-a`, answer),
  }))
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/** The customers whose wordmarks appear on the site, in the order of the strip. */
export const SAAS_CUSTOMERS = [
  { key: 'logo-halvorsen-freight', name: 'Halvorsen Freight' },
  { key: 'logo-brightwell-clinics', name: 'Brightwell Clinics' },
  { key: 'logo-castlemere-foods', name: 'Castlemere Foods' },
  { key: 'logo-tessaly-energy', name: 'Tessaly Energy' },
  { key: 'logo-orrin-and-vale', name: 'Orrin & Vale' },
  { key: 'logo-northgate-homes', name: 'Northgate Homes' },
] as const

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export interface SaasDemoFeature {
  readonly name: string
  readonly slug: string
  /** The line under the name on the home page grid: two lines at most. */
  readonly short: string
  /** The summary on the product tour and at the top of the feature page. */
  readonly description: string
  readonly icon: string
  /** `DemoMediaSpec.name` of the screenshot. */
  readonly screenshot: string
  readonly body: (name: string) => readonly RichPart[]
  readonly details: readonly (readonly [string, string])[]
}

export const SAAS_DEMO_FEATURES: readonly SaasDemoFeature[] = [
  {
    name: 'Approval routing',
    slug: 'approval-routing',
    short: 'Rules on amount, cost centre and vendor send each request to the right approvers.',
    description:
      'Write your approval matrix once, as rules on amount, cost centre, vendor and category, and every request finds its approvers without anyone forwarding it.',
    icon: 'layers',
    screenshot: 'policy-editor',
    body: (name) => [
      { h2: 'Your approval matrix, as rules' },
      {
        p: `Most finance teams already have an approval matrix: a spreadsheet that says who signs off on what, above which amount, for which cost centre. In ${name} that spreadsheet becomes a policy. Each row is a step with its conditions, its approvers and a deadline, and a request is matched against the policy the moment it is submitted.`,
      },
      {
        p: 'Approvers can be named people, roles such as the budget owner of a cost centre, or groups synced from your identity provider. Steps run in sequence by default. A step can also run in parallel with another, so procurement can review a new vendor while the budget owner reviews the spend.',
      },
      { h2: 'Change it safely' },
      {
        p: 'Policies are versioned. An edit is saved as a draft, and before you publish it you can run it against the requests of the last 90 days to see which of them would have been routed differently. Every published version stays in the audit log, with the name of the person who published it.',
      },
      {
        ul: [
          'Conditions on amount, currency, cost centre, vendor, category and any custom field',
          'Deadlines in business days, with reminders the day before',
          'Delegates for approvers who are away, and a fallback to their manager',
          'Separate policies for purchase requests, vendor invoices and contract changes',
        ],
      },
    ],
    details: [
      [
        'What happens when nobody matches a request?',
        'It goes to the default step you choose for the policy, usually the finance controller, and the request is flagged so the gap in the matrix can be fixed.',
      ],
      [
        'Can one person approve two steps?',
        'Only if you allow it. By default a person who approved one step is skipped on the next, and the step moves to the next eligible approver.',
      ],
      [
        'How many policies can we have?',
        'Ten on the Team plan and as many as you need on Business and Enterprise.',
      ],
    ],
  },
  {
    name: 'Audit log',
    slug: 'audit-log',
    short:
      'Every edit and decision is written once and never rewritten. Auditors read it directly.',
    description:
      'Every request, edit, comment and decision is written to a log that cannot be rewritten, and your auditors can filter and export it themselves.',
    icon: 'shield',
    screenshot: 'audit-log',
    body: (name) => [
      { h2: 'One record for every decision' },
      {
        p: `When a request is created, changed, commented on or decided, ${name} writes an event: who did it, what changed, when, and from where. Events are appended and never edited. Each one carries a hash of the event before it, so a gap or a change anywhere in the chain is detected the next time the log is verified.`,
      },
      {
        p: 'The log records what people do in the browser and what integrations do on their behalf. A bill posted to NetSuite, a budget line read from your ERP and a decision made from a Slack message all appear in the same list, in order.',
      },
      { h2: 'Evidence your auditors can pull themselves' },
      {
        p: 'Give an external auditor a read-only role limited to a date range. They can filter by request, person, event or amount and export exactly the sample they need, without a screenshot from your team and without seeing anything else in the workspace.',
      },
      {
        ul: [
          'Exports as CSV and PDF, signed so a file can be checked against the log',
          'Retention of one year on Team, seven years on Business and ten years on Enterprise',
          'Chain verification on demand and every night',
        ],
      },
    ],
    details: [
      [
        'Can an administrator delete an event?',
        'No. Administrators can hide personal data from an event after a valid erasure request, and the hiding is itself recorded as an event.',
      ],
      [
        'Which time zone does the log use?',
        'Events are stored in UTC and shown in the time zone of the person reading them. Exports use UTC.',
      ],
    ],
  },
  {
    name: 'ERP sync',
    slug: 'erp-sync',
    short: 'Approved bills and orders post to NetSuite, Xero, QuickBooks or Business Central.',
    description:
      'Approved vendor bills and purchase orders post to your ERP within a minute, and budget lines come back every fifteen minutes so approvers see what is left.',
    icon: 'cloud',
    screenshot: 'erp-sync',
    body: (name) => [
      { h2: 'Approvals that finish in the ledger' },
      {
        p: `An approval is only finished when the ERP knows about it. ${name} connects to NetSuite, Xero, QuickBooks Online and Microsoft Dynamics 365 Business Central. When the last step approves, the vendor bill or purchase order is created or updated in the ERP with the approvers, the dates and a link back to the request.`,
      },
      {
        p: 'The connection works in both directions. Vendors, cost centres, subsidiaries and budget lines are read from the ERP, so a request is coded the same way your books are, and an approver sees the remaining budget before deciding.',
      },
      { h2: 'Failures you can see' },
      {
        p: 'Every sync is listed with its result. When the ERP rejects a record or limits the rate of calls, the sync is retried with a delay and the finance team is told if it still fails after an hour. Nothing is dropped quietly.',
      },
      {
        ul: [
          'Mapping for subsidiaries, currencies and tax codes',
          'Posting as draft or approved, per record type',
          'A nightly CSV import for ERPs without an API',
        ],
      },
    ],
    details: [
      [
        'How long does a connection take to set up?',
        'Usually an hour with your ERP administrator. We send the list of permissions the integration user needs beforehand.',
      ],
      [
        'Does the sync write anything we did not approve?',
        'No. It writes approved records and the approval details, and reads the reference data listed above.',
      ],
    ],
  },
  {
    name: 'SSO and SCIM',
    slug: 'sso-and-scim',
    short: 'Sign in with Okta, Entra ID or Google. Access follows your directory.',
    description:
      'Members sign in through your identity provider, and SCIM keeps people, groups and roles in step with your directory.',
    icon: 'lock',
    screenshot: 'sso-scim',
    body: () => [
      { h2: 'Sign-in through your identity provider' },
      {
        p: 'SAML single sign-on works with Okta, Microsoft Entra ID, Google Workspace and any provider that follows the standard. Once it is on, you can turn password sign-in off for the whole workspace, and the session length follows the policy you set.',
      },
      { h2: 'Provisioning from your directory' },
      {
        p: 'With SCIM, a person added to a group in your directory appears in the workspace with the right role, and a person removed from the directory loses access at once. Groups map to roles, so the finance controllers group in Okta becomes the finance approvers in the product without anyone updating a list by hand.',
      },
      { h2: 'Access that ends on time' },
      {
        p: 'Auditors and contractors can be given an end date when they are invited. On that date their access ends, any step still waiting on them moves to the person who invited them, and the change is written to the audit log.',
      },
      {
        ul: [
          'Roles for requesters, approvers, accounts payable, administrators and auditors',
          'Time-limited auditor access, ended automatically on the date you set',
          'Sign-in events recorded in the audit log',
        ],
      },
    ],
    details: [
      [
        'Which plans include SSO?',
        'Google sign-in is included on every plan. SAML and SCIM are included on Business and Enterprise.',
      ],
      [
        'What happens to open approvals when someone leaves?',
        'Their pending steps move to their delegate, or to their manager if they had none, and the reassignment is recorded.',
      ],
    ],
  },
  {
    name: 'Spend reporting',
    slug: 'spend-reporting',
    short: 'See where requests wait, who is slow and which budgets are running over.',
    description:
      'Reports on time to approve, spend against budget and requests waiting too long, built from the same records as the audit log.',
    icon: 'chart',
    screenshot: 'spend-reporting',
    body: () => [
      { h2: 'Where approvals wait' },
      {
        p: 'The time-to-approve report shows the median time from request to final decision, by week, month or quarter, and breaks it down by step and by approver. When a step is slow, you see which one, and whether it is slow for every amount or only for large ones.',
      },
      { h2: 'Spend against budget' },
      {
        p: 'Because budget lines are read from the ERP, every approved request is counted against its cost centre as soon as it is approved, weeks before the invoice arrives. Budget owners see committed spend, and finance sees which cost centres will run over before the month closes.',
      },
      { h2: 'Figures you can trace' },
      {
        p: 'Every figure in a report opens the requests it was computed from, each with its approval chain and its history in the audit log. A median quoted in a board pack can be traced back to the individual requests in two clicks.',
      },
      {
        ul: [
          'Saved views that can be shared with a link',
          'A weekly email to budget owners with their committed spend',
          'CSV export of every report, and a read-only API for your data warehouse',
        ],
      },
    ],
    details: [
      [
        'Do reports include requests that were rejected?',
        'Yes, as a separate series, so the time spent on rejected requests is visible too.',
      ],
    ],
  },
  {
    name: 'API and webhooks',
    slug: 'api-and-webhooks',
    short: 'A versioned REST API and signed webhooks, with the permissions of the app.',
    description:
      'Everything the product does in the browser can be done through a versioned REST API, and signed webhooks tell your systems when a decision is made.',
    icon: 'code',
    screenshot: 'api-webhooks',
    body: () => [
      { h2: 'The same product, through an API' },
      {
        p: 'The REST API is versioned by date and covers requests, approvals, policies, vendors, the audit log and reports. API keys are scoped to read or write and to the parts of the workspace they need, and every call they make is written to the audit log like any other action.',
      },
      { h2: 'Webhooks for every decision' },
      {
        p: 'Webhooks fire when a request is created, approved, rejected or changed. Each delivery is signed with HMAC-SHA256 and retried for up to 24 hours when your endpoint does not answer, and the last deliveries of every endpoint are listed with their response codes.',
      },
      { h2: 'Changes announced in advance' },
      {
        p: 'A new API version is published with a date, and the previous version keeps working for at least 12 months after it. Every change is listed in the changelog, and the owners of the keys that still call a retiring version are told by email three months before it ends.',
      },
      {
        ul: [
          'Idempotency keys on every write',
          'A sandbox workspace with test data for every customer',
          'Rate limits of 600 requests a minute per key',
        ],
      },
    ],
    details: [
      [
        'Is there a client library?',
        'We publish clients for TypeScript and Python. Any language that can make an HTTPS request can use the API directly.',
      ],
    ],
  },
]

function featureBlocks(demo: SaasDemoFeature, name: string): readonly VocabularyBlock[] {
  return [
    prose(`feature-${demo.slug}-body`, demo.body(name)),
    {
      _key: `feature-${demo.slug}-details`,
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: 'Details',
      items: qa(`feature-${demo.slug}-details`, demo.details),
    } as VocabularyBlock,
    {
      _key: `feature-${demo.slug}-others`,
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'Other features',
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 6,
      layout: 'grid',
    } as VocabularyBlock,
  ]
}

/** The block zone of a feature page. Exported for the blueprint test. */
export function saasFeatureBlocks(
  demo: SaasDemoFeature,
  siteName?: string,
): readonly VocabularyBlock[] {
  return featureBlocks(demo, nameOf(siteName))
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

export interface SaasDemoUpdate {
  readonly title: string
  readonly slug: string
  readonly summary: string
  readonly publishedAt: string
  readonly body: (name: string) => readonly RichPart[]
  /** `DemoMediaSpec.name` of a screenshot shown under the text, when the change is visible in one. */
  readonly screenshot?: string
  readonly caption?: string
}

/** Oldest first: seeded in this order, listed newest first by id. */
export const SAAS_DEMO_UPDATES: readonly SaasDemoUpdate[] = [
  {
    title: 'SCIM group mapping',
    slug: 'scim-group-mapping',
    summary:
      'Groups in your identity provider now map to roles, so directory changes set permissions too.',
    publishedAt: '2026-05-14T09:00:00.000Z',
    screenshot: 'sso-scim',
    caption: 'Sign-in and provisioning settings, with five Okta groups mapped to roles.',
    body: () => [
      {
        p: 'Until now SCIM created and removed members, and roles were set by hand. From today you can map a group in Okta, Microsoft Entra ID or Google Workspace to a role, and membership of that group sets the role.',
      },
      {
        ul: [
          'A group can map to requester, approver, accounts payable, administrator or auditor',
          'An approver role can be limited to the cost centres the group owns',
          'Changes are applied within a minute of the directory sending them',
        ],
      },
      {
        p: 'Existing roles are left as they are until you save a mapping. Settings, then Sign-in and provisioning, lists every group your directory has sent.',
      },
    ],
  },
  {
    title: 'Deadlines and reminders on every step',
    slug: 'deadlines-and-reminders',
    summary:
      'Each step of a policy can now carry a deadline in business days, with a reminder the day before.',
    publishedAt: '2026-06-04T09:00:00.000Z',
    body: () => [
      {
        p: 'A request that waits on one person holds up everyone after them. Steps now carry a deadline, counted in business days from the moment the step opens and following the public holidays of the approver’s country.',
      },
      {
        p: 'The approver gets a reminder the working day before the deadline, by email and in Slack or Microsoft Teams if connected. When a deadline passes, the request is marked overdue in the queue and the step can move to a delegate automatically.',
      },
    ],
  },
  {
    title: 'Delegation while you are away',
    slug: 'delegation-while-away',
    summary:
      'Approvers can name a delegate for a date range, and their steps move to that person while they are out.',
    publishedAt: '2026-06-25T09:00:00.000Z',
    body: () => [
      {
        p: 'Set a date range and a delegate from your profile, or let your calendar do it: when Google Calendar or Outlook shows you out of office, the delegate you chose receives your steps for those days.',
      },
      {
        ul: [
          'A delegate cannot approve a request they submitted themselves',
          'Delegated decisions show both names in the request and in the audit log',
          'Administrators can set a delegate for someone on unplanned leave',
        ],
      },
    ],
  },
  {
    title: 'Microsoft Dynamics 365 Business Central',
    slug: 'business-central',
    summary:
      'Business Central joins NetSuite, Xero and QuickBooks Online as a two-way ERP connection.',
    publishedAt: '2026-07-16T09:00:00.000Z',
    screenshot: 'erp-sync',
    caption: 'The recent activity of an ERP connection, with one sync retried after a rate limit.',
    body: () => [
      {
        p: 'The Business Central connection reads vendors, dimensions and budget entries, and writes approved purchase invoices and purchase orders. Dimensions map to cost centres, so an approval policy written for a department works on the dimension your books already use.',
      },
      {
        p: 'Connections are available on Business and Enterprise. Setting one up takes a Business Central user with the permissions listed in the setup screen, and about an hour.',
      },
    ],
  },
  {
    title: 'Signed audit exports',
    slug: 'signed-audit-exports',
    summary:
      'CSV and PDF exports of the audit log are now signed, so a file can be checked against the log.',
    publishedAt: '2026-08-06T09:00:00.000Z',
    screenshot: 'audit-log',
    caption: 'The audit log filtered to one purchase request, ready to export.',
    body: () => [
      {
        p: 'Each export of the audit log now comes with a signature over its contents and the hash of the last event it includes. Anyone with the file can check it against the workspace’s public key, and an auditor can confirm that no row was added, removed or edited after the export.',
      },
      {
        p: 'Signing is on for every export from Business and Enterprise workspaces, with nothing to set up. The verification steps are described under Settings, then Audit log.',
      },
    ],
  },
  {
    title: 'Parallel approval steps',
    slug: 'parallel-approval-steps',
    summary:
      'Two steps can now run at the same time, so procurement and a budget owner review a request together.',
    publishedAt: '2026-08-27T09:00:00.000Z',
    screenshot: 'policy-editor',
    caption:
      'A purchase request policy with procurement reviewing new vendors in parallel with step 1.',
    body: () => [
      {
        p: 'Steps used to run strictly one after the other. A policy can now open two steps at once: procurement reviews a new vendor while the budget owner reviews the spend, and the request moves on when both have approved.',
      },
      {
        ul: [
          'Mark a step as parallel with the step before it in the policy editor',
          'A rejection on either step ends the request, with the reason shown to the requester',
          'Reports count the time of a parallel step from when it opened',
        ],
      },
      {
        p: 'Across the workspaces that tried it in August, requests from new vendors reached a decision a day and a half sooner.',
      },
    ],
  },
]

function updateBlocks(
  update: SaasDemoUpdate,
  name: string,
  media: Readonly<Record<string, string>>,
) {
  const screenshot = update.screenshot === undefined ? undefined : media[update.screenshot]
  return [
    prose(`update-${update.slug}-body`, update.body(name)),
    ...(screenshot === undefined
      ? []
      : [
          {
            _key: `update-${update.slug}-figure`,
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: screenshot,
            ...(update.caption === undefined ? {} : { caption: update.caption }),
            ratio: 'original',
            align: 'start',
          } as VocabularyBlock,
        ]),
    {
      _key: `update-${update.slug}-more`,
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'More updates',
      collection: 'changelog',
      sort: { field: 'id', direction: 'desc' },
      limit: 4,
      layout: 'list',
    } as VocabularyBlock,
  ] as readonly VocabularyBlock[]
}

/** The block zone of a changelog entry. Exported for the blueprint test. */
export function saasUpdateBlocks(
  update: SaasDemoUpdate,
  options: {
    readonly siteName?: string | undefined
    readonly media?: Readonly<Record<string, string>> | undefined
  } = {},
): readonly VocabularyBlock[] {
  return updateBlocks(update, nameOf(options.siteName), options.media ?? {})
}

// ---------------------------------------------------------------------------
// Pricing and questions
// ---------------------------------------------------------------------------

function pricingTiers(): readonly Record<string, unknown>[] {
  return [
    {
      _key: 'tier-team',
      name: 'Team',
      price: '$12',
      interval: 'per approver, per month, billed yearly',
      features: [
        'Approvers: Up to 25',
        'Requesters: Unlimited, free',
        'Approval policies: 10',
        'ERP connections: 1',
        'Audit log history: 1 year',
        'Single sign-on: Google',
        'Support: Email, next business day',
      ],
      action: { label: 'Start a trial', target: { href: '/demo' } },
    },
    {
      _key: 'tier-business',
      name: 'Business',
      price: '$24',
      interval: 'per approver, per month, billed yearly',
      features: [
        'Approvers: Up to 250',
        'Requesters: Unlimited, free',
        'Approval policies: Unlimited',
        'ERP connections: 3',
        'Audit log history: 7 years',
        'Single sign-on: SAML and SCIM',
        'Support: Email and chat, same business day',
        'Parallel approval steps',
        'Signed audit exports',
      ],
      action: { label: 'Start a trial', target: { href: '/demo' }, emphasis: 'primary' },
      highlighted: true,
    },
    {
      _key: 'tier-enterprise',
      name: 'Enterprise',
      price: 'Custom',
      interval: 'annual contract, from 100 approvers',
      features: [
        'Approvers: Unlimited',
        'Requesters: Unlimited, free',
        'Approval policies: Unlimited',
        'ERP connections: Unlimited',
        'Audit log history: 10 years',
        'Single sign-on: SAML and SCIM',
        'Support: Named engineer, 1-hour response',
        'Parallel approval steps',
        'Signed audit exports',
        'Data residency in the EU or the US',
        'Invoicing on 30-day terms',
      ],
      action: { label: 'Talk to sales', target: { href: '/demo' } },
    },
  ]
}

function homeQuestions(name: string): readonly (readonly [string, string])[] {
  return [
    [
      'How long does it take to set up?',
      `Most teams approve their first real request within two weeks. A solutions engineer turns your current approval matrix into a policy with you, and connecting the ERP takes about an hour with your administrator.`,
    ],
    [
      'Do requesters need a paid seat?',
      `No. Anyone in the company can submit a request or upload an invoice to ${name} at no cost. You pay for approvers, and only for the months in which they approve something.`,
    ],
    [
      'Which ERPs do you connect to?',
      'NetSuite, Xero, QuickBooks Online and Microsoft Dynamics 365 Business Central, in both directions. Any other system can use the API, or a nightly CSV import.',
    ],
    [
      'Can our auditors get access?',
      'Yes. The auditor role is read-only and limited to the date range you set. Auditors filter and export the log themselves, and their access ends on its own.',
    ],
    [
      'Where is our data stored?',
      'In Frankfurt or in northern Virginia, chosen when the workspace is created. Backups stay in the same region, and Enterprise customers can keep them in a second region of their choice.',
    ],
    [
      'What happens to our data if we leave?',
      'You can export every request, decision and attachment at any time. We delete the workspace 30 days after the end of the contract and send a certificate of deletion.',
    ],
  ]
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface SaasDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

function block<T extends VocabularyBlock['_type']>(
  key: string,
  type: T,
  data: Record<string, unknown>,
): VocabularyBlock {
  return { _key: key, _type: type, _version: BLOCK_VERSION, ...data } as VocabularyBlock
}

function demoAction(label = 'Book a demo') {
  return { label, target: { href: '/demo' }, emphasis: 'primary' }
}

/**
 * Every page of the site. A function of `media` (the ids `seedDemoMedia`
 * assigned), of the features' real ids (the home page grid links to each
 * feature page) and of the site's name.
 *
 * A block that needs a picture which was not seeded is left out rather than
 * emitted invalid, so the pages still validate with no media at all.
 */
export function buildSaasDemoPages(
  media: Readonly<Record<string, string>>,
  featureIdBySlug: ReadonlyMap<string, string>,
  siteName?: string,
): readonly SaasDemoPage[] {
  const name = nameOf(siteName)
  const featureLink = (slug: string) => {
    const id = featureIdBySlug.get(slug)
    return id === undefined ? {} : { link: { collection: 'feature', id } }
  }
  const logos = SAAS_CUSTOMERS.flatMap((customer) =>
    media[customer.key] === undefined
      ? []
      : [{ key: customer.key, name: customer.name, media: media[customer.key] as string }],
  )

  const home: VocabularyBlock[] = [
    block('home-hero', 'hero', {
      eyebrow: 'For finance and operations teams',
      title: 'Spend approvals with the audit trail built in',
      subtitle: `${name} routes purchase requests, vendor invoices and contract changes to the right approvers by amount, cost centre and vendor, then writes every decision to a log your auditors can read for themselves.`,
      ...(media.app === undefined ? {} : { media: media.app }),
      actions: [demoAction(), { label: 'See pricing', target: { href: '/pricing' } }],
    }),
    ...(logos.length === 0
      ? []
      : [
          block('home-customers', 'logoStrip', {
            caption: `Finance teams at 1,400 companies approve spend in ${name}`,
            logos: logos.map((logo) => ({ _key: `home-customers-${logo.key}`, media: logo.media })),
          }),
        ]),
    block('home-features', 'featureGrid', {
      title: 'One system for every spend decision',
      items: SAAS_DEMO_FEATURES.map((demo) => ({
        _key: `home-feature-${demo.slug}`,
        icon: demo.icon,
        title: demo.name,
        text: demo.short,
        ...featureLink(demo.slug),
      })),
    }),
    block('home-steps', 'featureGrid', {
      title: `How a request moves through ${name}`,
      items: [
        {
          _key: 'home-step-request',
          title: 'A request comes in',
          text: 'From a form, an email to your approvals address or a draft bill synced from the ERP, with the quote attached.',
        },
        {
          _key: 'home-step-route',
          title: 'Your policy routes it',
          text: 'Amount, cost centre, vendor and category decide who approves, in what order and by when.',
        },
        {
          _key: 'home-step-record',
          title: 'The decision is recorded',
          text: 'Approvers decide from the web, Slack or email. The ERP is updated and the audit log keeps who, what and when.',
        },
      ],
    }),
    block('home-tour', 'collectionList', {
      title: 'A closer look at the product',
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 3,
      layout: 'list',
    }),
    block('home-figures', 'stats', {
      title: 'Across every workspace, last quarter',
      items: [
        {
          _key: 'home-figure-time',
          value: '3.6',
          unit: 'h',
          label: 'median time from request to final approval',
        },
        {
          _key: 'home-figure-volume',
          value: '2.1',
          unit: 'M',
          label: 'requests and invoices approved',
        },
        {
          _key: 'home-figure-uptime',
          value: '99.99',
          unit: '%',
          label: 'uptime over the last twelve months',
        },
        {
          _key: 'home-figure-history',
          value: '7',
          unit: 'years',
          label: 'of audit history kept on Business',
        },
      ],
    }),
    block('home-customer', 'testimonial', {
      quote: [
        ...richTextParagraph(
          'home-customer-1',
          'We used to close the month with a folder of forwarded emails as our evidence. Now the auditors filter the log themselves and stop asking us for screenshots.',
        ),
        ...richTextParagraph(
          'home-customer-2',
          'Invoice approvals went from nine days to under two in the first quarter, and nobody on my team has chased a signature since March.',
        ),
      ],
      attribution: {
        name: 'Adrian Tan',
        role: 'Financial Controller, Halvorsen Freight',
        ...(media.portrait === undefined ? {} : { avatar: media.portrait }),
      },
    }),
    block('home-pricing', 'pricingTable', {
      title: 'Priced per approver',
      tiers: pricingTiers(),
    }),
    block('home-questions', 'faq', {
      title: 'Questions finance teams ask us',
      items: qa('home-questions', homeQuestions(name)),
    }),
    block('home-close', 'cta', {
      title: 'See it with your own approval policy',
      text: 'Send us your approval matrix. A solutions engineer builds it in a trial workspace before a 30-minute call.',
      actions: [
        demoAction(),
        { label: 'Read the security overview', target: { href: '/security' } },
      ],
    }),
  ]

  const product: VocabularyBlock[] = [
    block('product-hero', 'hero', {
      eyebrow: 'Product',
      title: 'From the request to the ledger in one system',
      subtitle: `${name} replaces the approval email chain, the matrix spreadsheet and the folder of evidence with one record per request, from the moment it is submitted to the moment it is posted.`,
      actions: [demoAction()],
    }),
    block('product-tour', 'collectionList', {
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 12,
      layout: 'list',
    }),
    block('product-steps', 'featureGrid', {
      title: 'What changes in the first month',
      items: [
        {
          _key: 'product-step-1',
          title: 'Week one',
          text: 'Your approval matrix becomes a policy, tested against last quarter’s requests before anyone uses it.',
        },
        {
          _key: 'product-step-2',
          title: 'Week two',
          text: 'The ERP is connected, and requesters start submitting through a form instead of an email.',
        },
        {
          _key: 'product-step-3',
          title: 'Week four',
          text: 'The first month closes with every approval in the log and the evidence exported in one file.',
        },
      ],
    }),
    block('product-close', 'cta', {
      title: 'See your own policy running',
      text: 'We build it in a trial workspace before the call, so the demo uses your cost centres and your amounts.',
      actions: [demoAction(), { label: 'Compare plans', target: { href: '/pricing' } }],
    }),
  ]

  const pricing: VocabularyBlock[] = [
    block('pricing-hero', 'hero', {
      eyebrow: 'Pricing',
      title: 'Pay for the people who approve',
      subtitle: `Anyone in the company can submit requests and invoices to ${name} at no cost. Plans are billed yearly per approver, and an approver who decides nothing in a month is not counted that month.`,
      actions: [demoAction('Start a trial')],
    }),
    block('pricing-plans', 'pricingTable', { title: 'Compare plans', tiers: pricingTiers() }),
    block('pricing-questions', 'faq', {
      title: 'Billing',
      items: qa('pricing-questions', [
        [
          'How does the trial work?',
          'A solutions engineer sets up a workspace with your approval policy and a copy of last month’s requests. You use it for 14 days. It does not turn into a subscription on its own, and no card is asked for.',
        ],
        [
          'Who counts as an approver?',
          'Anyone who approved or rejected at least one step in the month. People who only submit requests, upload invoices or read reports are free.',
        ],
        [
          'Can we pay by invoice?',
          'Yes. Business and Enterprise are invoiced yearly on 30-day terms, with your purchase order number on the invoice. Team is paid by card.',
        ],
        [
          'What if we grow during the year?',
          'Extra approvers are billed at the end of each quarter for the months they were active, at the rate of your plan. Nothing is charged in advance.',
        ],
        [
          'Do you offer discounts?',
          'Registered charities and schools get 40 percent off Team and Business. Write to us from your organisation’s address.',
        ],
        [
          'Can we change plans later?',
          'Yes. An upgrade applies at once and is prorated to the day. A downgrade applies at the next renewal.',
        ],
      ]),
    }),
    block('pricing-close', 'cta', {
      title: 'Help choosing a plan',
      text: 'Tell us how many people approve spend and which ERP you use, and we will recommend a plan in one email.',
      actions: [
        {
          label: 'Email sales',
          target: { href: `mailto:${saasEmail(name, 'sales')}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const security: VocabularyBlock[] = [
    block('security-hero', 'hero', {
      eyebrow: 'Security',
      title: 'How we protect your financial data',
      subtitle: `${name} holds your vendors, your budgets and the record of who approved what. Here is how that data is hosted, encrypted, accessed and kept.`,
      actions: [
        {
          label: 'Request the security pack',
          target: { href: `mailto:${saasEmail(name, 'security')}` },
          emphasis: 'primary',
        },
      ],
    }),
    block('security-controls', 'featureGrid', {
      title: 'Controls in place',
      items: [
        {
          _key: 'security-control-encryption',
          icon: 'lock',
          title: 'Encryption',
          text: 'TLS 1.3 in transit and AES-256 at rest, with keys rotated every 90 days.',
        },
        {
          _key: 'security-control-residency',
          icon: 'globe',
          title: 'Data residency',
          text: 'Workspaces are hosted in Frankfurt or northern Virginia, and data stays in the region.',
        },
        {
          _key: 'security-control-access',
          icon: 'users',
          title: 'Access',
          text: 'Single sign-on, SCIM and role-based permissions, with every sign-in recorded.',
        },
        {
          _key: 'security-control-log',
          icon: 'shield',
          title: 'Tamper-evident log',
          text: 'Every event carries the hash of the one before it, and the chain is verified nightly.',
        },
        {
          _key: 'security-control-backups',
          icon: 'refresh',
          title: 'Backups',
          text: 'Encrypted backups every hour, kept for 35 days and restored in a test every month.',
        },
        {
          _key: 'security-control-audits',
          icon: 'check',
          title: 'Independent audits',
          text: 'A SOC 2 Type II report each year and an external penetration test every six months.',
        },
      ],
    }),
    prose('security-detail', [
      { h2: 'Hosting' },
      {
        p: 'Workspaces run on Amazon Web Services, in eu-central-1 (Frankfurt) or us-east-1 (northern Virginia). The region is chosen when the workspace is created and cannot be changed by our staff. Production runs across three availability zones, and the database is replicated between them.',
      },
      { h2: 'Access by our staff' },
      {
        p: 'Nobody at the company can read your workspace by default. A support engineer can be granted access to one workspace for 24 hours, only after an administrator of that workspace approves it, and every action taken during that time is written to your audit log.',
      },
      { h2: 'Keeping the record' },
      {
        p: 'The audit log is append-only. Events are hashed in a chain, the chain is verified every night and on demand, and exports are signed so a file can be checked against the workspace. Deleted requests are kept in the log as deletions.',
      },
      { h2: 'Reporting a vulnerability' },
      {
        p: `Write to ${saasEmail(name, 'security')}. We acknowledge reports within one business day, keep you informed while we fix the issue, and credit you when it is resolved if you wish.`,
      },
    ]),
    ...(media['audit-log'] === undefined
      ? []
      : [
          block('security-log', 'mediaFigure', {
            media: media['audit-log'],
            caption: 'The audit log of one purchase request, with the chain verified.',
            ratio: 'original',
            align: 'start',
          }),
        ]),
    block('security-subprocessors', 'accordion', {
      title: 'Subprocessors',
      items: qa('security-subprocessors', [
        [
          'Amazon Web Services',
          'Hosting, storage and backups, in the region of the workspace. Data processing agreement in place.',
        ],
        [
          'Cloudflare',
          'Network protection and delivery of the web application. Request metadata only, never the contents of a workspace.',
        ],
        [
          'Postmark',
          'Transactional email: approval requests, reminders and receipts. The subject and summary of a request, never its attachments.',
        ],
        [
          'Slack and Microsoft Teams',
          'Only when a customer connects them. Approval messages sent to the channels the customer chooses.',
        ],
      ]),
    }),
    block('security-close', 'cta', {
      title: 'Security questionnaires',
      text: 'Our security pack includes the SOC 2 report, the latest penetration test summary and answers to the usual questionnaires.',
      actions: [
        {
          label: 'Request the security pack',
          target: { href: `mailto:${saasEmail(name, 'security')}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const changelogPage: VocabularyBlock[] = [
    block('changelog-hero', 'hero', {
      eyebrow: 'Changelog',
      title: `What is new in ${name}`,
      subtitle: 'We ship every week. These are the changes that alter how you work, newest first.',
    }),
    block('changelog-list', 'collectionList', {
      collection: 'changelog',
      sort: { field: 'id', direction: 'desc' },
      limit: 50,
      layout: 'list',
    }),
  ]

  const about: VocabularyBlock[] = [
    block('about-hero', 'hero', {
      eyebrow: 'Company',
      title: 'Built by people who have closed the books',
      subtitle: `${name} was started in London in 2019 by two former financial controllers who had spent too many month-ends chasing approvals by email.`,
    }),
    prose('about-story', [
      {
        p: `Ruth Okonjo and Tomasz Wierzbicki met at a logistics company where approving a purchase meant an email, a spreadsheet and a signature on a printed form. Each month-end, the finance team spent two days rebuilding who had approved what. They wrote the first version of ${name} for that team, and it ran there for a year before anyone else used it.`,
      },
      {
        p: 'Today 58 people work on the product, in London and Toronto. Half of them write software. Most of the rest have worked in finance, procurement or audit, and every solutions engineer has run a month-end close.',
      },
      { h2: 'How we work' },
      {
        ul: [
          'One product, sold to finance and operations teams, and nothing else',
          'Pricing on the website, the same for every customer of the same size',
          'Support answered by the people who build the product',
          'A changelog that lists every change that alters how you work',
        ],
      },
      { h2: 'Funding' },
      {
        p: 'We raised a seed round in 2020 and a Series A in 2023, and have been profitable since the last quarter of 2025.',
      },
    ]),
    block('about-numbers', 'statCounter', {
      title: 'The company today',
      stats: [
        { _key: 'about-number-customers', value: '1,400', label: 'customers' },
        { _key: 'about-number-countries', value: '31', label: 'countries' },
        { _key: 'about-number-people', value: '58', label: 'people' },
        { _key: 'about-number-offices', value: '2', label: 'offices' },
      ],
    }),
    ...(logos.length === 0
      ? []
      : [
          block('about-customers', 'logos', {
            title: 'Some of our customers',
            items: logos.map((logo) => ({
              _key: `about-customer-${logo.key}`,
              media: logo.media,
              name: logo.name,
            })),
          }),
        ]),
    block('about-close', 'cta', {
      title: 'Work with us',
      text: 'We hire engineers, solutions engineers and support specialists in London and Toronto.',
      actions: [
        {
          label: 'Write to us',
          target: { href: `mailto:${saasEmail(name, 'jobs')}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const demo: VocabularyBlock[] = [
    block('demo-hero', 'hero', {
      eyebrow: 'Book a demo',
      title: 'Talk to someone who has run a month-end close',
      subtitle:
        'A 30-minute call with a solutions engineer, then a trial workspace set up with your own approval policy.',
      actions: [
        {
          label: `Email ${saasEmail(name, 'demo')}`,
          target: {
            href: `mailto:${saasEmail(name, 'demo')}?subject=${encodeURIComponent('Demo request')}`,
          },
          emphasis: 'primary',
        },
      ],
    }),
    block('demo-contact', 'featureGrid', {
      title: 'Ways to reach us',
      items: [
        {
          _key: 'demo-contact-email',
          icon: 'mail',
          title: 'Email',
          text: `${saasEmail(name, 'demo')}, answered within one business day.`,
          link: { href: `mailto:${saasEmail(name, 'demo')}` },
        },
        {
          _key: 'demo-contact-phone',
          icon: 'phone',
          title: SAAS_PHONE,
          text: 'Monday to Friday, 08:00 to 18:00 UK time.',
          link: { href: SAAS_PHONE_HREF },
        },
        {
          _key: 'demo-contact-security',
          icon: 'shield',
          title: 'Security review',
          text: 'Start your security review before the call.',
          link: { href: '/security' },
        },
      ],
    }),
    prose('demo-how', [
      { h2: 'Before the call' },
      {
        p: 'Write to us with the number of people who approve spend, the ERP you use, and your current approval matrix if you can share it. A spreadsheet is fine. We reply within one business day to agree a time.',
      },
      { h2: 'On the call' },
      {
        p: 'A solutions engineer shows the product with your own policy already built, answers questions from finance, procurement and IT, and goes through what a rollout would take for your team.',
      },
      { h2: 'The trial' },
      {
        p: 'After the call, you get a workspace for 14 days with your policy and a copy of last month’s requests from a CSV export. Your team can submit and approve requests in it. The trial does not turn into a subscription on its own, and we do not ask for a card.',
      },
    ]),
  ]

  const legal: VocabularyBlock[] = [
    prose('legal-body', [
      { h2: 'Company details' },
      {
        p: `${name} is operated by ${name} Ltd, a company registered in England and Wales, whose registered office is at 2nd floor, 41 Tabernacle Street, London EC2A 4AA, United Kingdom.`,
      },
      { h2: 'Terms of service' },
      {
        p: 'Use of the product is governed by the subscription agreement signed with each customer, or for Team plans by the terms accepted when the workspace is created. Where the two differ, the signed agreement applies.',
      },
      { h2: 'Data processing' },
      {
        p: 'We process personal data in customer workspaces as a processor, under a data processing agreement that includes the standard contractual clauses. The list of subprocessors is on the security page, and customers are told 30 days before a new one is added.',
      },
      { h2: 'Contact' },
      { p: `For legal questions, write to ${saasEmail(name, 'legal')}.` },
    ]),
  ]

  const privacy: VocabularyBlock[] = [
    prose('privacy-body', [
      {
        p: 'This notice covers the personal data we collect through this website and when you contact us. Data inside a customer workspace is covered by that customer’s agreement with us.',
      },
      { h2: 'What we collect' },
      {
        ul: [
          'The name, work email and company you give us when you ask for a demo or write to us',
          'Records of our emails and calls with you',
          'Anonymous page views, counted without cookies and without tracking you across sites',
        ],
      },
      { h2: 'How long we keep it' },
      {
        p: 'Enquiries that do not lead to a contract are deleted after 24 months. Customer contacts are kept for the length of the contract and six years after it, as UK law requires for business records.',
      },
      { h2: 'Your rights' },
      {
        p: `You can ask to see, correct or delete the data we hold about you by writing to ${saasEmail(name, 'privacy')}. You can also complain to the Information Commissioner’s Office.`,
      },
    ]),
  ]

  return [
    { title: 'Home', slug: 'home', blocks: home },
    { title: 'Product', slug: 'product', blocks: product },
    { title: 'Pricing', slug: 'pricing', blocks: pricing },
    { title: 'Security', slug: 'security', blocks: security },
    { title: 'Changelog', slug: 'changelog', blocks: changelogPage },
    { title: 'Company', slug: 'about', blocks: about },
    { title: 'Book a demo', slug: 'demo', blocks: demo },
    { title: 'Legal', slug: 'legal', blocks: legal },
    { title: 'Privacy', slug: 'privacy', blocks: privacy },
  ]
}

/**
 * The side column a software company's site has beside the pages people read
 * rather than land on: a changelog entry, a month of the changelog, a feature
 * page (which opens on its screenshot, not on a hero) and search results.
 * Never on the home page, the pricing page or the other landing pages, which
 * open on a hero and carry their own calls to action.
 *
 * Nothing repeats what the page already shows: a changelog entry lists the
 * next updates under its text, so its column offers the months of the
 * changelog instead of the latest releases; a feature page lists the other
 * features under its text, so its column says what shipped recently; search
 * results already open on a search form, so the search box stays off them.
 */
type SaasPageTarget =
  | { readonly kind: 'collection'; readonly collection: 'changelog' | 'feature' }
  | { readonly kind: 'dateArchive' }
  | { readonly kind: 'search' }

const CHANGELOG_ENTRY: SaasPageTarget = { kind: 'collection', collection: 'changelog' }
const CHANGELOG_MONTH: SaasPageTarget = { kind: 'dateArchive' }
const FEATURE_PAGE: SaasPageTarget = { kind: 'collection', collection: 'feature' }
const SEARCH_RESULTS: SaasPageTarget = { kind: 'search' }

function onlyOn(...targets: readonly SaasPageTarget[]): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

export const SAAS_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'search',
    settings: { placeholder: 'Features, releases' },
    visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE),
  },
  {
    area: 'sidebar',
    type: 'archives',
    title: 'Changelog by month',
    settings: { collection: 'changelog', granularity: 'month', showCounts: true, limit: 12 },
    visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, SEARCH_RESULTS),
  },
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'Recently shipped',
    settings: { collection: 'changelog', count: 3, showDate: true },
    visibility: onlyOn(FEATURE_PAGE, SEARCH_RESULTS),
  },
  {
    area: 'sidebar',
    type: 'links',
    title: 'Resources',
    settings: {
      items: [
        { label: 'Product overview', href: '/product' },
        { label: 'API and webhooks', href: '/features/api-and-webhooks' },
        { label: 'ERP sync', href: '/features/erp-sync' },
        { label: 'Security and compliance', href: '/security' },
        { label: 'Pricing', href: '/pricing' },
      ],
    },
    visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE, SEARCH_RESULTS),
  },
  {
    area: 'sidebar',
    type: 'cta',
    settings: {
      heading: 'See it on your own approval policy',
      body: 'A 30-minute call with a solutions engineer, then a trial workspace set up with your policy.',
      label: 'Book a demo',
      href: '/demo',
    },
    visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE, SEARCH_RESULTS),
  },
]

export const SAAS_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Catches regressions on the product and pricing pages, the ones buyers read before a call.',
  },
  {
    name: 'securityAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Tracks dependency vulnerabilities, the first thing a buyer’s security review asks about.',
  },
]

/**
 * `saas`'s own starting skin, asserted present with a real check rather than
 * a `!`: `STARTING_SKINS` is keyed by blueprint id and TypeScript cannot see
 * that this key is always populated.
 */
function saasPalette(): Palette {
  const skin = STARTING_SKINS.saas
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.saas is missing.',
      hint: 'The "saas" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Every picture this blueprint seeds, all bundled files (`assets/photos/saas/`):
 * interface screenshots rendered once from the product's own UI language with
 * Geist and Geist Mono (OFL), six customer wordmarks rendered once from OFL
 * typefaces, and one customer portrait. The procedural `spec` is only the
 * fallback `DemoMediaSpec` requires when a file is missing.
 */
export const SAAS_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'app',
    spec: coverArt(saasPalette(), 21),
    alt: 'The approvals queue of a freight company, with a purchase request for brake servicing open beside the list and its approval chain',
    photo: 'saas/approvals-queue.png',
  },
  {
    name: 'policy-editor',
    spec: coverArt(saasPalette(), 22),
    alt: 'The policy editor for purchase requests, with four approval steps and their conditions on amount, vendor and category',
    photo: 'saas/policy-editor.png',
  },
  {
    name: 'audit-log',
    spec: coverArt(saasPalette(), 23),
    alt: 'The audit log filtered to one purchase request, listing six events with their time, actor and chain hash',
    photo: 'saas/audit-log.png',
  },
  {
    name: 'erp-sync',
    spec: coverArt(saasPalette(), 24),
    alt: 'The NetSuite connection settings and its recent activity, with four synced records',
    photo: 'saas/erp-sync.png',
  },
  {
    name: 'sso-scim',
    spec: coverArt(saasPalette(), 25),
    alt: 'Sign-in and provisioning settings, with SAML single sign-on through Okta and five groups mapped to roles',
    photo: 'saas/sso-scim.png',
  },
  {
    name: 'spend-reporting',
    spec: coverArt(saasPalette(), 26),
    alt: 'The time-to-approve report, a bar chart of the median hours to approval falling from 6.8 to 3.6 over thirteen weeks',
    photo: 'saas/spend-reporting.png',
  },
  {
    name: 'api-webhooks',
    spec: coverArt(saasPalette(), 27),
    alt: 'The API and webhooks settings, with an HTTP request creating a purchase request and two webhook endpoints',
    photo: 'saas/api-webhooks.png',
  },
  {
    name: 'portrait',
    spec: coverArt(saasPalette(), 28),
    alt: 'Portrait of Adrian Tan, financial controller at Halvorsen Freight',
    photo: 'saas/adrian-tan.jpg',
  },
  ...SAAS_CUSTOMERS.map(
    (customer, index): DemoMediaSpec => ({
      name: customer.key,
      spec: logoArt(30 + index),
      alt: `${customer.name} logo`,
      photo: `saas/${customer.key}.png`,
    }),
  ),
]

/** Header navigation and the header action. The footer is grouped in columns: see `SAAS_FOOTER`. */
export const SAAS_MENUS: BlueprintMenus = {
  header: [
    { label: 'Product', url: '/product' },
    { label: 'Security', url: '/security' },
    { label: 'Pricing', url: '/pricing' },
    { label: 'Changelog', url: '/changelog' },
    { label: 'Company', url: '/about' },
  ],
  // Seeded with the demo content instead (`seedFooterMenu`): a footer in
  // columns needs an unlinked heading per column, which `BlueprintMenus`
  // cannot express, and its links lead to pages the demo content creates.
  footer: [],
  headerAction: { label: 'Book a demo', url: '/demo' },
}

export interface FooterColumn {
  readonly heading: string
  readonly links: readonly MenuItemSpec[]
}

/** The footer menu: one unlinked heading per column, its links under it. */
export const SAAS_FOOTER: readonly FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Overview', url: '/product' },
      { label: 'Approval routing', url: '/features/approval-routing' },
      { label: 'Audit log', url: '/features/audit-log' },
      { label: 'Pricing', url: '/pricing' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', url: '/about' },
      { label: 'Security', url: '/security' },
      { label: 'Book a demo', url: '/demo' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Changelog', url: '/changelog' },
      { label: 'API and webhooks', url: '/features/api-and-webhooks' },
      { label: 'ERP sync', url: '/features/erp-sync' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms and company', url: '/legal' },
      { label: 'Privacy', url: '/privacy' },
    ],
  },
]

export const SAAS_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Spend approvals and audit trail for finance and operations teams.',
  'general.socialLinks': [
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
    { label: 'GitHub', url: 'https://github.com/example' },
    { label: 'X', url: 'https://x.com/example' },
  ],
  'general.footerNote':
    '2nd floor, 41 Tabernacle Street\nLondon EC2A 4AA\nUnited Kingdom\n\nSupport on business days, 08:00 to 18:00 UK time.',
  // A changelog entry and a feature page are not discussions.
  'discussion.enabled': false,
}

/** Seeds the footer menu at the `footer` location, one placeholder per column with its links as children. */
async function seedFooterMenu(db: DatabaseHandle, locale: string): Promise<void> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  if ((await store.byLocation('footer', locale)) !== null) return
  const menu = await store.create({ name: 'footer', locale, label: 'footer', location: 'footer' })
  for (const column of SAAS_FOOTER) {
    const heading = await store.createItem(menu.id, {
      label: column.heading,
      kind: 'submenu-placeholder',
    })
    for (const link of column.links) {
      await store.createItem(menu.id, {
        label: link.label,
        kind: 'url',
        url: link.url ?? '/',
        parent: heading.id,
      })
    }
  }
}

/**
 * Inserts the demo content through the real `ContentStore` and `MenuStore`,
 * never mocked (house rule). Features first, so the home page can link to
 * their real ids; changelog entries oldest first, so listing them by id
 * descending shows the newest first. Everything is published: a theme lists
 * only published entries.
 */
async function seedSaasDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const name = nameOf(ctx.siteName)
  const featureStore = createContentStore({ db, collection: feature, defaultLocale })
  const changelogStore = createContentStore({ db, collection: changelog, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const featureIdBySlug = new Map<string, string>()
  for (const demo of SAAS_DEMO_FEATURES) {
    const screenshot = media[demo.screenshot]
    const created = await featureStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        icon: demo.icon,
        ...(screenshot === undefined ? {} : { coverImage: screenshot }),
      },
      blocks: { blocks: featureBlocks(demo, name).map(toBlockZoneEntry) },
    })
    featureIdBySlug.set(demo.slug, created.id)
  }

  for (const update of SAAS_DEMO_UPDATES) {
    await changelogStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: update.title,
        slug: update.slug,
        summary: update.summary,
        publishedAt: update.publishedAt,
      },
      blocks: { blocks: updateBlocks(update, name, media).map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildSaasDemoPages(media, featureIdBySlug, name)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }

  await seedFooterMenu(db, defaultLocale)
}

export const saasContentPack: BlueprintContentPack = {
  collections: SAAS_COLLECTIONS,
  recommendedAgents: SAAS_RECOMMENDED_AGENTS,
  seedDemoContent: seedSaasDemoContent,
  defaultTheme: '@cogenta/theme-saas',
  menus: SAAS_MENUS,
  widgets: SAAS_WIDGETS,
  siteSettings: SAAS_SITE_SETTINGS,
  mediaSpecs: SAAS_MEDIA_SPECS,
}

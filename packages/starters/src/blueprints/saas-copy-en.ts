import type { SaasCopy, SaasFeatureCopy, SaasUpdateCopy } from './saas-copy.js'

/** The `saas` blueprint in English. See `saas-copy.ts` for the shape. */

const FEATURES: readonly SaasFeatureCopy[] = [
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

/** Oldest first: seeded in this order, listed newest first by id. */
const UPDATES: readonly SaasUpdateCopy[] = [
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

export const SAAS_COPY_EN: SaasCopy = {
  locale: 'en',
  defaultProductName: 'Ledgerline',
  schema: {
    routes: { feature: '/features/:slug', changelog: '/changelog/:slug' },
    labels: {
      feature: { singular: 'Feature', plural: 'Features' },
      changelog: { singular: 'Changelog entry', plural: 'Changelog' },
    },
  },
  slugs: {
    home: 'home',
    product: 'product',
    pricing: 'pricing',
    security: 'security',
    changelog: 'changelog',
    about: 'about',
    demo: 'demo',
    legal: 'legal',
    privacy: 'privacy',
    credits: 'photo-credits',
  },
  // A London number in the range Ofcom reserves for drama: it rings nobody.
  phone: { display: '+44 20 7946 0321', href: 'tel:+442079460321' },
  customers: [
    { key: 'logo-halvorsen-freight', name: 'Halvorsen Freight' },
    { key: 'logo-brightwell-clinics', name: 'Brightwell Clinics' },
    { key: 'logo-castlemere-foods', name: 'Castlemere Foods' },
    { key: 'logo-tessaly-energy', name: 'Tessaly Energy' },
    { key: 'logo-orrin-and-vale', name: 'Orrin & Vale' },
    { key: 'logo-northgate-homes', name: 'Northgate Homes' },
  ],
  features: FEATURES,
  updates: UPDATES,
  media: [
    {
      name: 'app',
      file: 'approvals-queue-en.png',
      alt: 'The approvals queue of a freight company, with a purchase request for brake servicing open beside the list and its approval chain',
    },
    {
      name: 'policy-editor',
      file: 'policy-editor-en.png',
      alt: 'The policy editor for purchase requests, with four approval steps and their conditions on amount, vendor and category',
    },
    {
      name: 'audit-log',
      file: 'audit-log-en.png',
      alt: 'The audit log filtered to one purchase request, listing six events with their time, actor and chain hash',
    },
    {
      name: 'erp-sync',
      file: 'erp-sync-en.png',
      alt: 'The NetSuite connection settings and its recent activity, with four synced records',
    },
    {
      name: 'sso-scim',
      file: 'sso-scim-en.png',
      alt: 'Sign-in and provisioning settings, with SAML single sign-on through Okta and five groups mapped to roles',
    },
    {
      name: 'spend-reporting',
      file: 'spend-reporting-en.png',
      alt: 'The time-to-approve report, a bar chart of the median hours to approval falling from 6.8 to 3.6 over thirteen weeks',
    },
    {
      name: 'api-webhooks',
      file: 'api-webhooks-en.png',
      alt: 'The API and webhooks settings, with an HTTP request creating a purchase request and two webhook endpoints',
    },
    {
      name: 'office-1',
      file: 'office-london.jpg',
      alt: 'The skyline of the City of London seen across the rooftops of south-east London, with the Shard, the Walkie-Talkie and the Gherkin',
    },
    {
      name: 'office-2',
      file: 'office-toronto.jpg',
      alt: 'The Toronto skyline and the CN Tower seen from the water, on a day of broken cloud',
    },
    {
      name: 'security-racks',
      file: 'security-racks.jpg',
      alt: 'A row of black equipment racks with patch panels and blue network cables, in a data centre room with a raised floor',
    },
  ],
  tiers: [
    {
      key: 'tier-team',
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
      actionLabel: 'Start a trial',
    },
    {
      key: 'tier-business',
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
      actionLabel: 'Start a trial',
      primary: true,
      highlighted: true,
    },
    {
      key: 'tier-enterprise',
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
      actionLabel: 'Talk to sales',
    },
  ],
  homeQuestions: (name) => [
    [
      'How long does it take to set up?',
      'Most teams approve their first real request within two weeks. A solutions engineer turns your current approval matrix into a policy with you, and connecting the ERP takes about an hour with your administrator.',
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
  ],
  detailsTitle: 'Details',
  otherFeaturesTitle: 'Other features',
  moreUpdatesTitle: 'More updates',
  pages: (name, mail) => ({
    titles: {
      home: 'Home',
      product: 'Product',
      pricing: 'Pricing',
      security: 'Security',
      changelog: 'Changelog',
      about: 'Company',
      demo: 'Book a demo',
      legal: 'Legal',
      privacy: 'Privacy',
      credits: 'Photo credits',
    },
    demoAction: 'Book a demo',
    home: {
      heroEyebrow: 'For finance and operations teams',
      heroTitle: 'Spend approvals with the audit trail built in',
      heroSubtitle: `${name} routes purchase requests, vendor invoices and contract changes to the right approvers by amount, cost centre and vendor, then writes every decision to a log your auditors can read for themselves.`,
      heroSecondary: 'See pricing',
      customersCaption: `Finance teams at 1,400 companies approve spend in ${name}`,
      featuresTitle: 'One system for every spend decision',
      stepsTitle: `How a request moves through ${name}`,
      steps: [
        {
          title: 'A request comes in',
          text: 'From a form, an email to your approvals address or a draft bill synced from the ERP, with the quote attached.',
        },
        {
          title: 'Your policy routes it',
          text: 'Amount, cost centre, vendor and category decide who approves, in what order and by when.',
        },
        {
          title: 'The decision is recorded',
          text: 'Approvers decide from the web, Slack or email. The ERP is updated and the audit log keeps who, what and when.',
        },
      ],
      tourTitle: 'A closer look at the product',
      figuresTitle: 'Across every workspace, last quarter',
      figures: [
        { value: '3.6', unit: 'h', label: 'median time from request to final approval' },
        { value: '2.1', unit: 'M', label: 'requests and invoices approved' },
        { value: '99.99', unit: '%', label: 'uptime over the last twelve months' },
        { value: '7', unit: 'years', label: 'of audit history kept on Business' },
      ],
      quote: [
        'We used to close the month with a folder of forwarded emails as our evidence. Now the auditors filter the log themselves and stop asking us for screenshots.',
        'Invoice approvals went from nine days to under two in the first quarter, and nobody on my team has chased a signature since March.',
      ],
      quoteName: 'Adrian Tan',
      quoteRole: 'Financial Controller, Halvorsen Freight',
      pricingTitle: 'Priced per approver',
      questionsTitle: 'Questions finance teams ask us',
      ctaTitle: 'See it with your own approval policy',
      ctaText:
        'Send us your approval matrix. A solutions engineer builds it in a trial workspace before a 30-minute call.',
      ctaSecurity: 'Read the security overview',
    },
    product: {
      heroEyebrow: 'Product',
      heroTitle: 'From the request to the ledger in one system',
      heroSubtitle: `${name} replaces the approval email chain, the matrix spreadsheet and the folder of evidence with one record per request, from the moment it is submitted to the moment it is posted.`,
      stepsTitle: 'What changes in the first month',
      steps: [
        {
          title: 'Week one',
          text: 'Your approval matrix becomes a policy, tested against last quarter’s requests before anyone uses it.',
        },
        {
          title: 'Week two',
          text: 'The ERP is connected, and requesters start submitting through a form instead of an email.',
        },
        {
          title: 'Week four',
          text: 'The first month closes with every approval in the log and the evidence exported in one file.',
        },
      ],
      ctaTitle: 'See your own policy running',
      ctaText:
        'We build it in a trial workspace before the call, so the demo uses your cost centres and your amounts.',
      ctaCompare: 'Compare plans',
    },
    pricing: {
      heroEyebrow: 'Pricing',
      heroTitle: 'Pay for the people who approve',
      heroSubtitle: `Anyone in the company can submit requests and invoices to ${name} at no cost. Plans are billed yearly per approver, and an approver who decides nothing in a month is not counted that month.`,
      trialAction: 'Start a trial',
      plansTitle: 'Compare plans',
      billingTitle: 'Billing',
      billing: [
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
      ],
      ctaTitle: 'Help choosing a plan',
      ctaText:
        'Tell us how many people approve spend and which ERP you use, and we will recommend a plan in one email.',
      ctaEmail: 'Email sales',
    },
    security: {
      heroEyebrow: 'Security',
      heroTitle: 'How we protect your financial data',
      heroSubtitle: `${name} holds your vendors, your budgets and the record of who approved what. Here is how that data is hosted, encrypted, accessed and kept.`,
      packAction: 'Request the security pack',
      controlsTitle: 'Controls in place',
      controls: [
        {
          icon: 'lock',
          title: 'Encryption',
          text: 'TLS 1.3 in transit and AES-256 at rest, with keys rotated every 90 days.',
        },
        {
          icon: 'globe',
          title: 'Data residency',
          text: 'Workspaces are hosted in Frankfurt or northern Virginia, and data stays in the region.',
        },
        {
          icon: 'users',
          title: 'Access',
          text: 'Single sign-on, SCIM and role-based permissions, with every sign-in recorded.',
        },
        {
          icon: 'shield',
          title: 'Tamper-evident log',
          text: 'Every event carries the hash of the one before it, and the chain is verified nightly.',
        },
        {
          icon: 'refresh',
          title: 'Backups',
          text: 'Encrypted backups every hour, kept for 35 days and restored in a test every month.',
        },
        {
          icon: 'check',
          title: 'Independent audits',
          text: 'A SOC 2 Type II report each year and an external penetration test every six months.',
        },
      ],
      detail: [
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
          p: `Write to ${mail('security')}. We acknowledge reports within one business day, keep you informed while we fix the issue, and credit you when it is resolved if you wish.`,
        },
      ],
      logCaption: 'The audit log of one purchase request, with the chain verified.',
      racksCaption:
        'Network racks in a data centre room. Our hosting provider runs the buildings; we run the software on top.',
      subprocessorsTitle: 'Subprocessors',
      subprocessors: [
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
      ],
      ctaTitle: 'Security questionnaires',
      ctaText:
        'Our security pack includes the SOC 2 report, the latest penetration test summary and answers to the usual questionnaires.',
    },
    changelog: {
      heroEyebrow: 'Changelog',
      heroTitle: `What is new in ${name}`,
      heroSubtitle:
        'We ship every week. These are the changes that alter how you work, newest first.',
    },
    about: {
      heroEyebrow: 'Company',
      heroTitle: 'Built by people who have closed the books',
      heroSubtitle: `${name} was started in London in 2019 by two former financial controllers who had spent too many month-ends chasing approvals by email.`,
      story: [
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
      ],
      numbersTitle: 'The company today',
      numbers: [
        { value: '1,400', label: 'customers' },
        { value: '31', label: 'countries' },
        { value: '58', label: 'people' },
        { value: '2', label: 'offices' },
      ],
      places: [
        { h2: 'Where we work' },
        {
          p: 'London. The team that answers support and builds the audit log works a few stops from the City.',
        },
        { p: 'Toronto. Our second office, opened in 2023, covers North American hours.' },
      ],
      customersTitle: 'Some of our customers',
      ctaTitle: 'Work with us',
      ctaText:
        'We hire engineers, solutions engineers and support specialists in London and Toronto.',
      ctaAction: 'Write to us',
    },
    demo: {
      heroEyebrow: 'Book a demo',
      heroTitle: 'Talk to someone who has run a month-end close',
      heroSubtitle:
        'A 30-minute call with a solutions engineer, then a trial workspace set up with your own approval policy.',
      emailAction: `Email ${mail('demo')}`,
      emailSubject: 'Demo request',
      contactTitle: 'Ways to reach us',
      emailText: `${mail('demo')}, answered within one business day.`,
      phoneText: 'Monday to Friday, 08:00 to 18:00 UK time.',
      securityTitle: 'Security review',
      securityText: 'Start your security review before the call.',
      how: [
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
      ],
    },
    legal: [
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
      { p: `For legal questions, write to ${mail('legal')}.` },
    ],
    privacy: [
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
        p: `You can ask to see, correct or delete the data we hold about you by writing to ${mail('privacy')}. You can also complain to the Information Commissioner’s Office.`,
      },
    ],
    credits: {
      intro: [
        {
          p: 'The photographs on this site come from Wikimedia Commons and are used under the licences below. The interface screenshots and the customer wordmarks were drawn for this site, and the people and companies they show are invented.',
        },
      ],
      sourceWord: 'source',
    },
  }),
  menus: {
    header: [
      { label: 'Product', page: 'product' },
      { label: 'Security', page: 'security' },
      { label: 'Pricing', page: 'pricing' },
      { label: 'Changelog', page: 'changelog' },
      { label: 'Company', page: 'about' },
    ],
    action: 'Book a demo',
  },
  footer: [
    {
      heading: 'Product',
      links: [
        { label: 'Overview', page: 'product' },
        { label: 'Approval routing', feature: 'approval-routing' },
        { label: 'Audit log', feature: 'audit-log' },
        { label: 'Pricing', page: 'pricing' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'About', page: 'about' },
        { label: 'Security', page: 'security' },
        { label: 'Book a demo', page: 'demo' },
      ],
    },
    {
      heading: 'Resources',
      links: [
        { label: 'Changelog', page: 'changelog' },
        { label: 'API and webhooks', feature: 'api-and-webhooks' },
        { label: 'ERP sync', feature: 'erp-sync' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Terms and company', page: 'legal' },
        { label: 'Privacy', page: 'privacy' },
        { label: 'Photo credits', page: 'credits' },
      ],
    },
  ],
  settings: {
    tagline: 'Spend approvals and audit trail for finance and operations teams.',
    footerNote:
      '2nd floor, 41 Tabernacle Street\nLondon EC2A 4AA\nUnited Kingdom\n\nSupport on business days, 08:00 to 18:00 UK time.',
  },
  widgets: {
    searchPlaceholder: 'Audit, ERP',
    archivesTitle: 'Changelog by month',
    recentTitle: 'Recently shipped',
    resourcesTitle: 'Resources',
    resources: [
      { label: 'Product overview', page: 'product' },
      { label: 'API and webhooks', feature: 'api-and-webhooks' },
      { label: 'ERP sync', feature: 'erp-sync' },
      { label: 'Security and compliance', page: 'security' },
      { label: 'Pricing', page: 'pricing' },
    ],
    ctaHeading: 'See it on your own approval policy',
    ctaBody:
      'A 30-minute call with a solutions engineer, then a trial workspace set up with your policy.',
    ctaLabel: 'Book a demo',
  },
}

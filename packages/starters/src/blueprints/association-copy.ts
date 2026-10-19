/**
 * The words of the `association` blueprint, in each language it ships in.
 *
 * The site is a neighbourhood charity run from an old library: a Thursday food
 * bank, a homework club, a community garden and a winter clothing bank, kept
 * going by volunteers. Every visitor-facing string lives here, typed once and
 * written twice (`fr`, `en`), so the French site is written in French — as a
 * French "association loi 1901" would write it, with its membership, its
 * general assembly and its tax receipts — rather than translated at render
 * time, and a missing sentence in one language is a type error, not a blank.
 *
 * Prose is written as lines, the way the blueprint has always written it:
 * `## ` starts a heading, `- ` a list item, `[words](href)` a link, anything
 * else a paragraph. `{name}` stands for the organisation's name.
 */

export type AssociationLocale = 'fr' | 'en'

/** What a copy needs to know about the site it is written for. */
export interface AssociationCopyContext {
  /** The organisation's name. */
  readonly name: string
  /** `hello@…` for the organisation's own name: `email('volunteer')`. */
  readonly email: (mailbox?: string) => string
  /** A `mailto:` link with a subject line. */
  readonly mailto: (mailbox: string, subject: string) => string
}

export interface AssociationProgrammeCopy {
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly schedule: string
  readonly location: string
  readonly audience: string
  readonly cost: string
  readonly mailbox: string
  /** `DemoMediaSpec.name` of its photograph. */
  readonly photo: string
  readonly body: readonly string[]
}

export interface AssociationEventCopy {
  readonly title: string
  readonly slug: string
  /** Days from scaffold time, so the calendar is never empty and never stale. */
  readonly daysFromNow: number
  readonly start: readonly [hour: number, minute: number]
  readonly end: readonly [hour: number, minute: number]
  readonly location: string
  readonly address: string
  readonly cost: string
  readonly booking: string
  readonly description: string
  readonly photo?: string
  readonly body: readonly string[]
}

export interface AssociationFact {
  readonly value: string
  readonly unit?: string
  readonly label: string
}

export interface AssociationQuestion {
  readonly question: string
  readonly answer: string
}

export interface AssociationIconItem {
  readonly icon?: string
  readonly title: string
  readonly text: string
  /** A page of the site, or an event or programme slug path. */
  readonly href?: string
}

export interface AssociationPagesCopy {
  readonly titles: {
    readonly home: string
    readonly whatWeDo: string
    readonly events: string
    readonly volunteer: string
    readonly donate: string
    readonly finances: string
    readonly about: string
    readonly contact: string
    readonly privacy: string
    readonly legal: string
    readonly credits: string
  }
  readonly home: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly heroPrimary: string
    readonly heroSecondary: string
    readonly impactTitle: string
    readonly impact: readonly AssociationFact[]
    readonly programmesTitle: string
    readonly eventsTitle: string
    readonly storyQuote: readonly string[]
    readonly storyName: string
    readonly storyRole: string
    readonly moneyTitle: string
    readonly money: readonly { readonly value: string; readonly label: string }[]
    readonly giveTitle: string
    readonly giveText: string
    readonly givePrimary: string
    readonly giveSecondary: string
    readonly partnersCaption: string
    readonly faqTitle: string
    readonly faq: readonly AssociationQuestion[]
  }
  readonly whatWeDo: {
    readonly intro: readonly string[]
    readonly stepsTitle: string
    readonly steps: readonly AssociationIconItem[]
  }
  readonly events: {
    readonly intro: readonly string[]
    readonly hostTitle: string
    readonly hostText: string
    readonly hostAction: string
    readonly hostSubject: string
  }
  readonly volunteer: {
    readonly intro: readonly string[]
    readonly rolesTitle: string
    readonly roles: readonly AssociationIconItem[]
    readonly stepsTitle: string
    readonly steps: readonly AssociationIconItem[]
    readonly photoCaption: string
    readonly notesTitle: string
    readonly notes: readonly AssociationQuestion[]
    readonly askTitle: string
    readonly askText: string
    readonly askAction: string
    readonly askSubject: string
    readonly phoneAction: string
  }
  readonly donate: {
    readonly intro: readonly string[]
    readonly monthlyTitle: string
    readonly tiers: readonly {
      readonly name: string
      readonly price: string
      readonly interval: string
      readonly features: readonly string[]
      readonly highlighted?: boolean
    }[]
    readonly ways: readonly string[]
    readonly questionsTitle: string
    readonly questions: readonly AssociationQuestion[]
    readonly askTitle: string
    readonly askText: string
    readonly askAction: string
    readonly askSubject: string
    readonly phoneAction: string
  }
  readonly finances: {
    readonly intro: readonly string[]
    readonly yearTitle: string
    readonly year: readonly AssociationFact[]
    readonly spendingTitle: string
    readonly spending: readonly { readonly value: string; readonly label: string }[]
    readonly incomeTitle: string
    readonly income: readonly { readonly value: string; readonly label: string }[]
    readonly notes: readonly string[]
  }
  readonly about: {
    readonly story: readonly string[]
    readonly years: readonly { readonly value: string; readonly label: string }[]
    readonly hallCaption: string
    readonly people: readonly string[]
    readonly quote: string
    readonly quoteAuthor: string
    readonly quoteRole: string
    readonly partnersTitle: string
  }
  readonly contact: {
    readonly intro: readonly string[]
    readonly ways: readonly AssociationIconItem[]
    readonly concerns: readonly string[]
  }
  readonly privacy: readonly string[]
  readonly legal: readonly string[]
  readonly credits: {
    readonly intro: readonly string[]
    readonly licenceWord: string
    readonly sourceWord: string
  }
}

export interface AssociationCopy {
  readonly locale: AssociationLocale
  readonly defaultName: string
  /** The identity of the fictional charity: contact details in this country's formats. */
  readonly identity: {
    readonly phone: string
    readonly phoneHref: string
    /** One line: hall, street, postcode and town. */
    readonly address: string
    readonly hall: string
    readonly street: string
    readonly town: string
    /** The registration line of the charity. */
    readonly registration: string
    /** `org.uk` or `fr`: what an email domain ends with. */
    readonly emailSuffix: string
    readonly emailFallback: string
    /** The mailboxes the pages write to: `volunteer@…`, `benevoles@…`. */
    readonly mailboxes: {
      readonly volunteer: string
      readonly treasurer: string
      readonly events: string
    }
    readonly mapHref: string
  }
  readonly schema: {
    readonly routes: { readonly event: string; readonly programme: string }
    readonly labels: {
      readonly event: { readonly singular: string; readonly plural: string }
      readonly programme: { readonly singular: string; readonly plural: string }
    }
    readonly fields: Readonly<
      Record<'starts' | 'ends' | 'place' | 'address' | 'summary' | 'when' | 'audience', string>
    >
    readonly help: Readonly<
      Record<'place' | 'cost' | 'booking' | 'summary' | 'when' | 'contact', string>
    >
  }
  readonly pageSlugs: {
    readonly home: string
    readonly whatWeDo: string
    readonly events: string
    readonly volunteer: string
    readonly donate: string
    readonly finances: string
    readonly about: string
    readonly contact: string
    readonly privacy: string
    readonly legal: string
    readonly credits: string
  }
  readonly programmes: readonly AssociationProgrammeCopy[]
  readonly events: readonly AssociationEventCopy[]
  readonly partners: readonly {
    readonly key: string
    readonly name: string
    readonly file: string
  }[]
  readonly media: readonly {
    readonly name: string
    readonly file: string
    readonly alt: string
  }[]
  readonly pages: (context: AssociationCopyContext) => AssociationPagesCopy
  readonly programmeBlocks: {
    readonly othersTitle: string
    readonly eventOthersTitle: string
  }
  readonly menus: {
    readonly header: readonly { readonly label: string; readonly page: string }[]
    readonly action: string
  }
  readonly footer: readonly {
    readonly heading: string
    readonly links: readonly { readonly label: string; readonly url: string }[]
  }[]
  readonly footerNote: (context: AssociationCopyContext) => string
  readonly settings: { readonly tagline: string }
  readonly widgets: {
    readonly keepFreeHeading: string
    readonly keepFreeBody: string
    readonly keepFreeLabel: string
    readonly adviceTitle: string
    readonly adviceLines: readonly string[]
    readonly weeklyTitle: string
    readonly handHeading: string
    readonly handBody: string
    readonly handLabel: string
  }
}

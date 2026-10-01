import type { Vertical } from '../types'

/**
 * The 8 GDG verticals, in the order the spec lists them.
 *
 * SECURITY: this file contains display labels ONLY. Not a single Google Form
 * URL is bundled into the frontend. The `key` values are the identifiers the
 * server validates against — they must stay byte-identical to
 * config/verticals.js on the backend, including the "sponsership" spelling.
 * Form URLs are only ever learned at runtime from the /api/register response.
 */
export const VERTICALS: readonly Vertical[] = [
  {
    key: 'content',
    label: 'Content',
    labelHi: 'कंटेंट',
    blurb: 'Articles, newsletters, technical writing',
  },
  {
    key: 'creatives',
    label: 'Creatives',
    labelHi: 'क्रिएटिव्स',
    blurb: 'Video, photography, graphic design',
  },
  {
    key: 'production and social media',
    label: 'Production and Social Media',
    labelHi: 'प्रोडक्शन और सोशल मीडिया',
    blurb: 'Event production, reels, community reach',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    labelHi: 'मार्केटिंग',
    blurb: 'Campaigns, growth, partnerships',
  },
  {
    key: 'pr and sponsership',
    label: 'PR and Sponsorship',
    labelHi: 'पीआर और स्पॉन्सरशिप',
    blurb: 'Outreach, sponsors, public relations',
  },
  {
    key: 'technical',
    label: 'Technical',
    labelHi: 'टेक्निकल',
    blurb: 'Code, app development, workshops',
  },
  {
    key: 'design',
    label: 'Design',
    labelHi: 'डिज़ाइन',
    blurb: 'UI/UX, product design, branding',
  },
  {
    key: 'operations',
    label: 'Operations',
    labelHi: 'ऑपरेशन्स',
    blurb: 'Logistics, events, team management',
  },
] as const

export function verticalByKey(key: string | null | undefined): Vertical | undefined {
  if (!key) return undefined
  return VERTICALS.find((v) => v.key === key)
}

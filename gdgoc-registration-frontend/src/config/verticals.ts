import type { Vertical } from '../types'

/**
 * The 10 GDG verticals, in the order the final spec lists them.
 *
 * SECURITY: this file contains display labels ONLY. Not a single Google Form
 * URL is bundled into the frontend. The `key` values are the identifiers the
 * server validates against — they must stay byte-identical to
 * config/verticals.js on the backend. Form URLs are only ever learned at
 * runtime from the /api/register response.
 *
 * Order matters: it is the order the dropdown presents and the order the
 * backend exposes via VERTICAL_KEYS.
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
    key: 'operations',
    label: 'Operations',
    labelHi: 'ऑपरेशन्स',
    blurb: 'Logistics, events, team management',
  },
  {
    key: 'social media',
    label: 'Social Media',
    labelHi: 'सोशल मीडिया',
    blurb: 'Reels, community reach, content calendars',
  },
  {
    key: 'design',
    label: 'Design',
    labelHi: 'डिज़ाइन',
    blurb: 'UI/UX, product design, branding',
  },
  {
    key: 'production',
    label: 'Production',
    labelHi: 'प्रोडक्शन',
    blurb: 'Event production, filming, on-ground logistics',
  },
  {
    key: 'pr',
    label: 'PR',
    labelHi: 'पीआर',
    blurb: 'Outreach, public relations, communications',
  },
  {
    key: 'sponsorship',
    label: 'Sponsorship',
    labelHi: 'स्पॉन्सरशिप',
    blurb: 'Sponsor relations, partnerships, pitching',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    labelHi: 'मार्केटिंग',
    blurb: 'Campaigns, growth, promotions',
  },
  {
    key: 'technical',
    label: 'Technical',
    labelHi: 'टेक्निकल',
    blurb: 'Code, app development, workshops',
  },
] as const

export function verticalByKey(key: string | null | undefined): Vertical | undefined {
  if (!key) return undefined
  return VERTICALS.find((v) => v.key === key)
}

/** Shared domain types. */

/**
 * One of the 10 GDG verticals. Keys must match config/verticals.js on the server.
 *
 * Declared as a union rather than derived from the config array so that a typo
 * in one place cannot silently widen what the server will accept.
 */
export type VerticalKey =
  | 'content'
  | 'creatives'
  | 'operations'
  | 'social media'
  | 'design'
  | 'production'
  | 'pr'
  | 'sponsorship'
  | 'marketing'
  | 'technical'

/** A vertical as presented in the UI. */
export interface Vertical {
  key: VerticalKey
  label: string
  labelHi: string
  blurb: string
}

/** The student detail payload, mirrored by the server's validator. */
export interface StudentDetails {
  rollNumber: string
  fullName: string
  branch: string
  section: string
  yearOfStudy: string
  contactNumber: string
  gender: string
  email: string
  linkedin: string
  github: string
  instagram: string
  skills: string
  /**
   * Free-text note to the team. Required. Deliberately NOT a roster field: it
   * is the student's own words, so it is never pre-filled, never locked, and
   * absent from the /api/lookup response.
   */
  teamMessage: string
}

/**
 * What the portal already holds about a roll number that has responded.
 *
 * Deliberately free of every personal column the log stores. A roll number is
 * printed on an ID card, so this is readable by anyone who has one, and it only
 * needs to answer two questions: have you responded, and can you still open the
 * forms you were assigned?
 */
export interface ExistingRegistration {
  submittedAt: string | null
  priority1: string
  priority2: string
  priority1CompletedAt: string | null
  priority2CompletedAt: string | null
  formsCompletedAt: string | null
  forms: Partial<AuthorisedForms>
}

/** Result of GET /api/lookup/:rollNumber */
export type LookupResult =
| { success: true; found: true; student: StudentDetails; registered: boolean; registration?: ExistingRegistration }
      /**
       * Not in the roster. `registration` is still populated when the roll
       * number HAS registered — a student missing from the roster must still get
       * the confirmation screen, or the duplicate rule locks them out of their
       * own forms.
       */
      | { success: true; found: false; registered: boolean; registration?: ExistingRegistration }

/** The two form links the server authorises for this student. */
export interface AuthorisedForms {
  priority1: { name: string; url: string }
  priority2: { name: string; url: string }
}

export type RegisterResult = { success: true; forms: AuthorisedForms }

export type CompleteResult = { success: true; completedAt: string }

export type Language = 'en' | 'hi'

export type Step = 1 | 2 | 3

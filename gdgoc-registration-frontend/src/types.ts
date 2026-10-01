/** Shared domain types. */

/** One of the 8 GDG verticals. Keys must match config/verticals.js on the server. */
export type VerticalKey =
  | 'content'
  | 'creatives'
  | 'production and social media'
  | 'marketing'
  | 'pr and sponsership'
  | 'technical'
  | 'design'
  | 'operations'

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
}

/** Result of GET /api/lookup/:rollNumber */
export type LookupResult =
  | { success: true; found: true; student: StudentDetails }
  | { success: true; found: false }

/** The two form links the server authorises for this student. */
export interface AuthorisedForms {
  priority1: { name: string; url: string }
  priority2: { name: string; url: string }
}

export type RegisterResult = { success: true; forms: AuthorisedForms }

export type Language = 'en' | 'hi'

export type Step = 1 | 2 | 3

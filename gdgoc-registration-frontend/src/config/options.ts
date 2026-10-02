/**
 * Static option lists for the Step 1 form.
 *
 * The server only checks that `branch` is present and within its length cap -
 * it does not enforce an allowlist - so this list is the single source of truth
 * for what a student can pick. Keep the `value` strings identical to the
 * `branch` values in the roster (data/students.json), otherwise an autofilled
 * student will not match an option here.
 */

export interface BranchOption {
  value: string
  label: string
  /**
   * The sections this branch actually runs. A length of 1 means the branch has
   * no A/B split, so the Section control is disabled and pinned to that one
   * value rather than letting the student invent one the server will store.
   */
  sections: readonly string[]
}

export const BRANCHES: readonly BranchOption[] = [
  { value: 'CS', label: 'CS — Computer Science & Engineering', sections: ['A', 'B'] },
  { value: 'IT', label: 'IT — Information Technology', sections: ['A', 'B'] },
  { value: 'CSBS', label: 'CSBS — Computer Science & Business Systems', sections: ['A', 'B'] },
  { value: 'ENTC', label: 'ENTC — Electronics & Telecommunication', sections: ['A', 'B'] },
  { value: 'Mechanical Engineering', label: 'Mechanical Engineering', sections: ['A'] },
  { value: 'Electronics and Instrumentation', label: 'Electronics and Instrumentation', sections: ['A'] },
  { value: 'EEE', label: 'EEE — Electronics & Electrical', sections: ['A'] },
  { value: 'IP', label: 'IP — Industrial Production', sections: ['A'] },
  { value: 'Civil Engineering', label: 'Civil Engineering', sections: ['A'] },
  { value: 'B.Design', label: 'B.Design — Bachelor of Design', sections: ['A'] },
  // The integrated programmes run a single section, and none of them use the
  // official (24|25|26)(letter)(4 digits) enrollment format - every one of
  // these students has a batch code such as "CS-2K26-01" instead. That is why
  // the roster keeps them: see scripts/import-google-form.js --strict-roll,
  // which would exclude every one of them.
  { value: 'Mtech Integrated IIPS', label: 'Mtech Integrated (IIPS)', sections: ['A'] },
  { value: 'MCA Integrated IIPS', label: 'MCA Integrated (IIPS)', sections: ['A'] },
  { value: 'Mtech Integrated SDF', label: 'Mtech Integrated (SDF)', sections: ['A'] },
]

/** True when the branch runs a single section, so Section is not a choice. */
export function isSingleSectionBranch(branch: string): boolean {
  return sectionsForBranch(branch).length < 2
}

/**
 * Sections available for a branch.
 *
 * An unrecognised branch falls back to A/B. The roster stores free text
 * ("Information Technology") rather than the short code ("IT"), so an
 * autofilled value must still be allowed to pick a section instead of
 * silently stranding the student on a disabled field.
 */
export function sectionsForBranch(branch: string): readonly string[] {
  return BRANCHES.find((option) => option.value === branch)?.sections ?? ['A', 'B']
}

export const SECTIONS = [
  { value: 'A', label: 'Section A' },
  { value: 'B', label: 'Section B' },
] as const

/** Default is "1st Year" per the spec. Order is irrelevant to the API. */
export const YEARS_OF_STUDY = [
  { value: '1st Year', label: '1st Year' },
  { value: '2nd Year', label: '2nd Year' },
  { value: '3rd Year', label: '3rd Year' },
  { value: '4th Year', label: '4th Year' },
] as const

export const GENDERS = [
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
  { value: 'Non-binary', label: 'Non-binary' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
] as const

/**
 * "Interest & Skills" is a required dropdown. Sent to the server as the free
 * text `skills` field, which caps it at 500 characters.
 */
export const SKILLS = [
  { value: 'Web Development', label: 'Web Development' },
  { value: 'App Development', label: 'App Development' },
  { value: 'Data Science & AI', label: 'Data Science & AI' },
  { value: 'Machine Learning', label: 'Machine Learning' },
  { value: 'Cloud & DevOps', label: 'Cloud & DevOps' },
  { value: 'Cybersecurity', label: 'Cybersecurity' },
  { value: 'Graphic Design', label: 'Graphic Design' },
  { value: 'UI / UX Design', label: 'UI / UX Design' },
  { value: 'Video Editing', label: 'Video Editing' },
  { value: 'Photography', label: 'Photography' },
  { value: 'Content Writing', label: 'Content Writing' },
  { value: 'Social Media Management', label: 'Social Media Management' },
  { value: 'Digital Marketing', label: 'Digital Marketing' },
  { value: 'Event Management', label: 'Event Management' },
  { value: 'Public Relations', label: 'Public Relations' },
  { value: 'Technical Writing', label: 'Technical Writing' },
  { value: '3D / Animation', label: '3D / Animation' },
  { value: 'JavaScript', label: 'JavaScript' },
  { value: 'Python', label: 'Python' },
  { value: 'Java', label: 'Java' },
  { value: 'C / C++', label: 'C / C++' },
  { value: 'Flutter', label: 'Flutter' },
  { value: 'React', label: 'React' },
  { value: 'Figma', label: 'Figma' },
  { value: 'Not Decided Yet', label: 'Not Decided Yet' },
] as const

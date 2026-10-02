/**
 * Guards the one contract that spans the repo boundary: the vertical list is
 * written down in three places, and a mismatch between any two of them is
 * invisible until a student picks a vertical and gets a 400 back.
 *
 *   1. src/types.ts               -> the VerticalKey union
 *   2. src/config/verticals.ts    -> the array the dropdown renders
 *   3. backend config/verticals.js -> the allowlist that resolves form URLs
 *
 * The keys must be identical *and in the same order*, because the order is the
 * order the dropdown presents and VERTICAL_KEYS order is part of the public
 * response shape.
 *
 * Why regexes instead of importing the modules: the two frontend files are
 * TypeScript and this runs after `tsc`, so there is no compiled artefact to
 * require. The patterns are anchored on syntax that only appears in the
 * declarations we care about, and a parse failure fails the build loudly
 * rather than silently comparing the wrong thing.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')
const backendConfig = resolve(frontendRoot, '..', 'gdgoc-registration-backend', 'config', 'verticals.js')

const EXPECTED_COUNT = 10

function read(path) {
  return readFileSync(resolve(frontendRoot, path), 'utf8')
}

/** Keys from the `VERTICALS` array literal, in source order. */
function keysFromConfig() {
  const src = read('src/config/verticals.ts')
  const body = src.slice(src.indexOf('export const VERTICALS'))
  // Stop at `as const` so the helper below cannot contribute anything.
  const keys = [...body.matchAll(/^\s*key:\s*'([^']+)'/gm)].map((m) => m[1])
  if (keys.length === 0) throw new Error('assert-verticals-match: no keys parsed from src/config/verticals.ts')
  return keys
}

/** Members of the `VerticalKey` union, in source order. */
function keysFromTypes() {
  const src = read('src/types.ts')
  const start = src.indexOf('export type VerticalKey')
  if (start === -1) throw new Error('assert-verticals-match: VerticalKey union not found in src/types.ts')
  // Slice up to the next top-level `export`, whatever its kind. Matching only
  // `export type` would run past the union into StudentDetails and pick up
  // quoted prose from its doc comments.
  const rest = src.slice(start)
  const next = rest.slice(1).search(/\nexport\s/)
  const body = next === -1 ? rest : rest.slice(0, next + 1)
  const keys = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (keys.length === 0) throw new Error('assert-verticals-match: VerticalKey union is empty')
  return keys
}

/** Keys the backend will actually accept, in VERTICAL_FORMS order. */
function keysFromBackend() {
  if (!existsSync(backendConfig)) return null
  // config/verticals.js is plain CommonJS, so require works directly.
  return Object.keys(createRequire(import.meta.url)(backendConfig).VERTICAL_FORMS)
}

function compare(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    console.error(`\n  ✗ ${label} does not match the backend vertical list.\n`)
    console.error('    backend : ' + JSON.stringify(expected))
    console.error('    ' + label.padEnd(8) + ': ' + JSON.stringify(actual))
    const missing = expected.filter((k) => !actual.includes(k))
    const extra = actual.filter((k) => !expected.includes(k))
    if (missing.length) console.error(`\n    missing : ${JSON.stringify(missing)}`)
    if (extra.length) console.error(`    unlisted: ${JSON.stringify(extra)}`)
    console.error('\n  These three must stay in sync:')
    console.error('    src/types.ts, src/config/verticals.ts, backend config/verticals.js\n')
    process.exit(1)
  }
}

const backend = keysFromBackend()
const config = keysFromConfig()
const types = keysFromTypes()

if (backend === null) {
  // Frontend deployed on its own. Still worth checking the two frontend files
  // against each other, and the pinned count, so drift is caught either way.
  console.log(`scanned vertical list: ${types.length} keys (backend config not present, cross-check skipped)`)
} else {
  compare('config', config, backend)
  compare('types', types, backend)
  console.log(`scanned ${backend.length} verticals across frontend and backend: lists match.`)
}

if (backend !== null && backend.length !== EXPECTED_COUNT) {
  console.error(`\n  ✗ expected ${EXPECTED_COUNT} verticals, found ${backend.length}.`)
  console.error('    If the list really changed, update EXPECTED_COUNT and the pinned')
  console.error('    order in backend test/api.test.js in the same commit.\n')
  process.exit(1)
}

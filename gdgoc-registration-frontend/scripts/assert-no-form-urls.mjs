import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Build-time security guard.
 *
 * The spec requires that none of the 8 Google Form URLs ever appear in the
 * frontend bundle, the HTML, or client state — only the two the server
 * authorises for a given student, fetched at runtime.
 *
 * This script fails the build if any form URL is ever hardcoded in the
 * frontend, so a future contributor cannot quietly reintroduce the leak.
 * It also flags any other "placeholder-" style URL from the vertical map.
 */

const DIST = 'dist'
const PATTERNS = [
  /forms\.google\.com/i,
  /docs\.google\.com\/forms/i,
  /placeholder-(content|creatives|prod-social|marketing|pr-sponsorship|technical|design|operations)/i,
]

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

let scanned = 0
const violations = []

for await (const file of walk(DIST)) {
  // Skip sourcemaps (they mirror source) but scan them too if they exist.
  const contents = await readFile(file, 'utf8')
  scanned += 1
  for (const pattern of PATTERNS) {
    const match = pattern.exec(contents)
    if (match) {
      violations.push({ file, match: match[0] })
    }
  }
}

if (violations.length > 0) {
  console.error('\n  BUILD BLOCKED — Google Form URL found in the frontend bundle:\n')
  for (const v of violations) {
    console.error(`    ${v.file}  ->  ${v.match}`)
  }
  console.error(
    '\n  Form links must only be learned at runtime from POST /api/register.\n',
  )
  process.exit(1)
}

console.log(`  scanned ${scanned} bundle file(s): no form URLs present.`)

import type {
  CompleteResult,
  LookupResult,
  RegisterResult,
  StudentDetails,
  VerticalKey,
} from '../types'

/**
 * Thin API client. All paths are relative so the Vite dev proxy (and a
 * same-origin production deploy) can serve them without CORS.
 *
 * Every call is abortable and time-boxed: a student staring at a spinner on a
 * dead backend is a support ticket, so nothing is allowed to hang forever.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const TIMEOUT_MS = 12_000

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>
  /** Stable server-side tag, e.g. "alreadyRegistered". Absent for most errors. */
  readonly code: string | undefined

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
    this.code = code
  }
}

/**
 * 502/503/504 can only mean "the API is not reachable".
 *
 * The Vite dev proxy answers 502 with an EMPTY text/plain body when it cannot
 * connect to Express, and Express never emits 502 itself. So an empty gateway
 * response is not a malformed request and not a rejected payload — it is the API
 * process being down. Reporting it as "Request failed with HTTP 502" is
 * unactionable for whoever is testing, so it gets its own message.
 */
function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function gatewayMessage(status: number): string {
  if (import.meta.env.DEV) {
    return (
      'Cannot reach the registration server (HTTP ' +
      status +
      '). It is probably not running — start it with "npm run dev" in the ' +
      'gdgoc-registration-backend folder, then submit again.'
    )
  }
  return 'The registration service is temporarily unavailable. Please try again in a moment.'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })

    // Checked before parsing: the proxy's gateway body is empty, so there is no
    // JSON to read and the generic parse-failure message would be misleading.
    if (isGatewayStatus(response.status)) {
      throw new ApiError(gatewayMessage(response.status), response.status)
    }

    const text = await response.text()
    // A proxy or crash can return HTML; never let that throw a raw SyntaxError.
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      throw new ApiError(`Unexpected response from the server (HTTP ${response.status}).`, response.status)
    }

    if (!response.ok) {
      const record = (body ?? {}) as {
        error?: string
        fields?: Record<string, string>
        code?: string
      }
      throw new ApiError(
        record.error ?? `Request failed with HTTP ${response.status}.`,
        response.status,
        record.fields ?? {},
        record.code,
      )
    }

    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request timed out. Please check your connection and try again.', 0)
    }
    throw new ApiError('Could not reach the registration server. Please try again.', 0)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /api/lookup/:rollNumber
 *
 * A miss is a normal outcome, not an error, so `found: false` resolves rather
 * than throwing. Only genuine failures throw.
 */
export async function lookupRollNumber(
  rollNumber: string,
  signal?: AbortSignal,
): Promise<LookupResult> {
  const encoded = encodeURIComponent(rollNumber.trim())
  return request<LookupResult>(`/api/lookup/${encoded}`, { signal })
}

/** POST /api/register — returns ONLY the two authorised form links. */
export function register(
  details: StudentDetails,
  priority1: VerticalKey,
  priority2: VerticalKey,
): Promise<RegisterResult> {
  return request<RegisterResult>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ ...details, priority1, priority2 }),
  })
}

/**
 * POST /api/register/:rollNumber/complete — record that a Priority form was
 * submitted.
 *
 * Driven by the student pressing "I have submitted this form". A cross-origin
 * Google Form cannot report its own submission, so this confirmation is the only
 * completion signal that exists.
 *
 * Failures are deliberately swallowed by the caller rather than thrown here: a
 * student who has genuinely filled in the form must never be held on a button
 * because a timestamp did not save.
 */
export function markFormComplete(
  rollNumber: string,
  stage: 1 | 2,
): Promise<CompleteResult | null> {
  const encoded = encodeURIComponent(rollNumber.trim())
  return request<CompleteResult>(`/api/register/${encoded}/complete`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  }).catch(() => null)
}

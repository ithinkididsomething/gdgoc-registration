import { useCallback, useState } from 'react'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { ResponseNoted } from './components/ResponseNoted'
import { ApiError, register } from './api/client'
import { Step1Details } from './steps/Step1Details'
import { Step2Priorities } from './steps/Step2Priorities'
import { Step3Forms } from './steps/Step3Forms'
import { useLanguage } from './i18n'
import type {
  AuthorisedForms,
  ExistingRegistration,
  StudentDetails,
  Step,
  VerticalKey,
} from './types'

const EMPTY_DETAILS: StudentDetails = {
  rollNumber: '',
  fullName: '',
  branch: '',
  section: '',
  yearOfStudy: '1st Year',
  contactNumber: '',
  gender: '',
  email: '',
  linkedin: '',
  github: '',
  instagram: '',
  skills: '',
  teamMessage: '',
}

/**
 * Three-step registration flow.
 *
 *   1. Student details (roll-number autofill + locking)
 *   2. Domain priority selection -> POST /api/register
 *   3. Delivery of the two server-authorised form links
 *
 * `forms` is the only place a Google Form URL ever exists in this app's
 * memory, and it is populated exclusively from the /api/register response.
 *
 * ONE RESPONSE PER STUDENT: typing a roll number that has already registered
 * swaps the entire flow for the "response noted" screen. The duplicate is also
 * refused server-side with 409, but the server cannot un-send the questions, and
 * making a student fill in twelve fields only to be told at the end that they
 * already answered is the exact experience this avoids.
 */
export default function App() {
  const { t } = useLanguage()
  const [step, setStep] = useState<Step>(1)
  const [details, setDetails] = useState<StudentDetails>(EMPTY_DETAILS)
  const [forms, setForms] = useState<AuthorisedForms | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noted, setNoted] = useState<{
    rollNumber: string
    registration: ExistingRegistration
  } | null>(null)

  // Referenced from handleConfirm's 409 branch, so it must be stable rather than
  // a fresh closure on every render.
  const showNoted = useCallback((rollNumber: string, registration: ExistingRegistration) => {
    setNoted({ rollNumber, registration })
  }, [])

  async function handleConfirm(priority1: VerticalKey, priority2: VerticalKey) {
    setSubmitting(true)
    setError(null)
    try {
      const result = await register(details, priority1, priority2)
      setForms(result.forms)
      setStep(3)
      // Bring the confirmation into view for keyboard and screen-reader users.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      if (caught instanceof ApiError) {
        // The duplicate check fired. Reach for the record we already hold so the
        // student lands on the confirmation screen instead of an error they
        // cannot act on. This is the backstop for the roll-number check in step
        // 1: a stale tab, a second device, or a lookup that raced a submission
        // all end up here.
        if (caught.code === 'alreadyRegistered' && details.rollNumber.trim()) {
          showNoted(details.rollNumber.trim(), {
            submittedAt: null,
            priority1,
            priority2,
            priority1CompletedAt: null,
            priority2CompletedAt: null,
            formsCompletedAt: null,
            forms: {},
          })
          return
        }
        // Surface the first field error the server reported, if any.
        const [firstField] = Object.values(caught.fields)
        setError(firstField ?? caught.message)
      } else {
        setError(t('error.required'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const showMainTitle = step === 1 && !noted

  return (
    <div className="page-surface flex min-h-screen flex-col items-center px-4 py-6 sm:py-10">
      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
        {/* No step counter: there is no step to be on. The student is not partway
            through anything, they are finished. */}
        <Header step={noted ? undefined : step} />

        <main className="neu-card flex-1 px-5 py-8 sm:px-10 sm:py-10">
          {showMainTitle ? (
            <div className="mb-8 text-center">
              <h1 className="text-xl leading-tight font-black tracking-tight text-ink sm:text-2xl">
                {t('title.main')}
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-ink-soft/70">
                {t('title.sub')}
              </p>
            </div>
          ) : null}

          {/* Errors are suppressed while the noted screen is up: there is no
              question on it that an error could belong to. */}
          {error && !noted ? (
            <div
              role="alert"
              className="mb-6 rounded-2xl bg-accent-red/10 px-5 py-4 text-center text-xs font-bold text-accent-red"
            >
              <span className="mr-1 uppercase">{t('error.title')}:</span>
              {error}
            </div>
          ) : null}

          {/* Once a student is shown the "response noted" screen, the form is
              UNMOUNTED, not merely covered.

              It used to render alongside it, which looked harmless and was not:
              the student could keep typing into every field, the UI updated
              live, and pressing submit returned the same 409 the lookup had
              already predicted. So the screen showed edits that were never
              saved and could be changed forever, which is precisely the
              "submitted once, that is it" promise this app is supposed to keep.
              A screen the student cannot leave by typing is also an honest one -
              the only way forward is the links on the card.

              `noted` wins over `step` rather than being ANDed with it, so no
              future step can reintroduce an editable form underneath. */}
          {noted ? (
            <ResponseNoted rollNumber={noted.rollNumber} registration={noted.registration} />
          ) : null}

          {!noted && step === 1 ? (
            <Step1Details
              onSubmit={(next) => {
                setDetails(next)
                setError(null)
                setStep(2)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onAlreadyRegistered={showNoted}
            />
          ) : null}

          {!noted && step === 2 ? (
            <Step2Priorities
              details={details}
              submitting={submitting}
              onBack={() => {
                setError(null)
                setStep(1)
              }}
              onConfirm={handleConfirm}
            />
          ) : null}

          {!noted && step === 3 && forms ? <Step3Forms details={details} forms={forms} /> : null}
        </main>

        <Footer />
      </div>
    </div>
  )
}

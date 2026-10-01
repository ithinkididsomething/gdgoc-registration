import { useState } from 'react'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { ApiError, register } from './api/client'
import { Step1Details } from './steps/Step1Details'
import { Step2Priorities } from './steps/Step2Priorities'
import { Step3Forms } from './steps/Step3Forms'
import { useLanguage } from './i18n'
import type { AuthorisedForms, StudentDetails, Step, VerticalKey } from './types'

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
 */
export default function App() {
  const { t } = useLanguage()
  const [step, setStep] = useState<Step>(1)
  const [details, setDetails] = useState<StudentDetails>(EMPTY_DETAILS)
  const [forms, setForms] = useState<AuthorisedForms | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const showMainTitle = step === 1

  return (
    <div className="page-surface flex min-h-screen flex-col items-center px-4 py-6 sm:py-10">
      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
        <Header step={step} />

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

          {error ? (
            <div
              role="alert"
              className="mb-6 rounded-2xl bg-accent-red/10 px-5 py-4 text-center text-xs font-bold text-accent-red"
            >
              <span className="mr-1 uppercase">{t('error.title')}:</span>
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <Step1Details
              onSubmit={(next) => {
                setDetails(next)
                setError(null)
                setStep(2)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          ) : null}

          {step === 2 ? (
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

          {step === 3 && forms ? <Step3Forms details={details} forms={forms} /> : null}
        </main>

        <Footer />
      </div>
    </div>
  )
}

import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'

/**
 * Shared field chrome for Step 1: uppercase label, red asterisk, inset pill
 * control, and an error slot. Keeping this in one place is what makes the
 * locked state and the error state apply consistently across 12 fields.
 */

interface BaseProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  /** Renders the locked (auto-filled) treatment and blocks interaction. */
  locked?: boolean
  /**
   * Greys the control out and blocks interaction without the LOCKED badge.
   * Distinct from `locked`: that means "the server filled this in and you may
   * not change it", this means "this field is not applicable".
   */
  disabled?: boolean
  className?: string
  /** Stable DOM id, so focus can be moved to a specific invalid field. */
  inputId?: string
}

function FieldFrame({
  label,
  required,
  error,
  hint,
  locked,
  htmlFor,
  children,
  className,
}: BaseProps & { htmlFor: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label mb-2 flex items-center gap-1">
        <span>{label}</span>
        {required ? (
          <span className="text-accent-red" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        {children}
        {locked ? (
          <span
            className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-xs font-bold text-ink-soft/70"
            aria-hidden="true"
          >
            LOCKED
          </span>
        ) : null}
      </div>

      {hint && !error ? <p className="mt-1.5 px-4 text-[0.68rem] text-ink-soft/70">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 px-4 text-[0.68rem] font-semibold text-accent-red">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const controlBase =
  'w-full rounded-full px-5 py-3 text-sm font-medium text-ink placeholder:text-ink-soft/45 focus:outline-none transition-shadow'

type TextFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id' | 'required'>

export function TextField({
  label,
  required,
  error,
  hint,
  locked,
  className,
  inputId,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId()
  const id = inputId ?? generatedId
  return (
    <FieldFrame
      label={label}
      required={required}
      error={error}
      hint={hint}
      locked={locked}
      htmlFor={id}
      className={className}
    >
      <input
        {...inputProps}
        id={id}
        required={required}
        disabled={locked}
        readOnly={locked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`neu-inset ${controlBase} ${locked ? 'neu-locked' : ''} ${
          error ? 'ring-2 ring-accent-red/60' : ''
        } ${locked ? 'pr-24' : ''}`}
      />
    </FieldFrame>
  )
}

type SelectFieldProps = BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id' | 'required'> & {
    options: readonly { value: string; label: string }[]
    placeholder: string
  }

export function SelectField({
  label,
  required,
  error,
  hint,
  locked,
  disabled,
  className,
  options,
  placeholder,
  inputId,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId()
  const id = inputId ?? generatedId
  // `locked` wins: a locked field is locked regardless of anything else.
  const inert = locked ?? disabled ?? false
  return (
    <FieldFrame
      label={label}
      required={required}
      error={error}
      hint={hint}
      locked={locked}
      htmlFor={id}
      className={className}
    >
      <select
        {...selectProps}
        id={id}
        required={required}
        disabled={inert}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`neu-inset ${controlBase} appearance-none ${
          locked ? 'pr-24' : 'pr-12'
        } ${inert ? 'neu-locked' : ''} ${error ? 'ring-2 ring-accent-red/60' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Custom chevron: the native arrow cannot be styled on an inset pill. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
          locked ? 'right-24' : 'right-5'
        } h-4 w-4 text-ink-soft/70`}
      >
        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </FieldFrame>
  )
}

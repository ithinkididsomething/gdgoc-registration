/** Neumorphic spinner used while the register request is in flight. */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-3" role="status" aria-live="polite">
      <span className="relative inline-block h-5 w-5" aria-hidden="true">
        <span className="neu-inset absolute inset-0" />
        <span className="absolute inset-[3px] animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
      </span>
      {label ? <span className="text-xs font-bold tracking-wide text-white/90">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  )
}

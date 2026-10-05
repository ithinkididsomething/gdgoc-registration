import { useLanguage } from '../i18n'

/**
 * Recruitment WhatsApp invite, shown on both closing screens.
 *
 * Extracted because two unrelated components end a registration: DonePanel for
 * a fresh submission, ResponseNoted for a roll number that was already
 * registered. Those are different pages with different layouts, so the pebble
 * has to be wired into both and duplicating it would let them drift.
 *
 * The URL is a constant rather than a dictionary entry: it is a fixed link, not
 * prose, so it must not be translated. Only the label is.
 */
const WHATSAPP_INVITE_URL = 'https://chat.whatsapp.com/Jujh8zgkGqrL7ZxdvSwQRn'

/**
 * Shares the .neu-btn geometry with the Google Form pebbles so all three read
 * as one set. `full` lets the caller control width: the noted page centres it
 * beneath the two form pebbles, the end screen has no pebbles to match so it
 * sizes to its own label.
 */
export function WhatsAppInvite({ full = false }: { full?: boolean }) {
  const { t } = useLanguage()

  return (
    <a
      href={WHATSAPP_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`neu-btn whatsapp-btn inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-extrabold tracking-wide ${
        full ? 'w-full' : ''
      }`}
    >
      <WhatsAppGlyph />
      {t('step3.whatsappCta')}
    </a>
  )
}

/** WhatsApp mark, inline at the button's own text size. */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.36c0-4.53 3.69-8.22 8.23-8.22 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.2-8.22 8.2Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  )
}
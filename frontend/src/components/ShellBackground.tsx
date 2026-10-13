import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '../lib/utils'

/**
 * The page surface behind the app shell and the sign-in form: light Nardo grey with a faint brushed-metal sheen
 * and a fine engineering grid that fades out below the header. Static (no animation, no image requests).
 */
export const ShellBackground = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ children, className, ...props }, ref) => (
  <div ref={ref} data-slot="shell-background" className={cn('relative isolate bg-paper', className)} {...props}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(255_255_255/0.65),transparent_320px)] print:hidden" />
    <div aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(var(--color-zinc-200)_1px,transparent_1px),linear-gradient(90deg,var(--color-zinc-200)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(180deg,black,transparent_420px)] print:hidden" />
    {children}
  </div>
))
ShellBackground.displayName = 'ShellBackground'

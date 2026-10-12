import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '../lib/utils'

export interface MintLagoonBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/**
 * Soft blurred-light background. Same construction as the original "mint lagoon" (blurred colour fields + a fine dot
 * texture), retinted to Thread's palette: olive, sage, sand and cream, so it sits with the brand instead of against it.
 */
const MintLagoonBackground = forwardRef<HTMLDivElement, MintLagoonBackgroundProps>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="soft-background"
      className={cn('relative isolate overflow-hidden bg-[#FBFAF7]', className)}
      {...props}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -inset-6 -z-10 blur-xl print:hidden">
        <div className="absolute inset-0 bg-[#FBFAF7]" />

        <div className="absolute top-[-18%] left-[22%] h-[72%] w-[72%] rounded-full bg-[#DDE3BE] opacity-70 blur-3xl" />

        <div className="absolute top-[12%] -right-[12%] h-[60%] w-[60%] rounded-full bg-[#EED9BC] opacity-60 blur-3xl" />

        <div className="absolute bottom-[-28%] left-[-8%] h-[68%] w-[68%] rounded-full bg-[#CFD8B0] opacity-55 blur-3xl" />

        <div className="absolute right-[18%] bottom-[4%] h-[54%] w-[54%] rounded-full bg-[#F4EBDD] opacity-75 blur-3xl" />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_center,#3F4720_1px,transparent_1px)] [background-size:5px_5px] opacity-[0.03] print:hidden"
      />

      {children}
    </div>
  )
})

MintLagoonBackground.displayName = 'MintLagoonBackground'

export { MintLagoonBackground }

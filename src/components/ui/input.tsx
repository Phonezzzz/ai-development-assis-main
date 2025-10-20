import { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-xl border border-transparent bg-neutral-1/85 px-3 py-1.5 text-base shadow-[0_0_18px_rgba(255,102,0,0.22)] transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-orange-500/60 focus-visible:ring-orange-500/35 focus-visible:ring-[3px] focus-visible:shadow-[0_0_28px_rgba(255,102,0,0.45)]"
      )}
      {...props}
    />
  )
}

export { Input }

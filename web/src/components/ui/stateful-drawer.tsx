import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { Button } from "./button"

interface StatefulDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  direction?: "left" | "right"
  trigger?: React.ReactNode
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * A drawer component that preserves state by keeping content mounted.
 * Content is always rendered but hidden with CSS when closed.
 */
export function StatefulDrawer({
  open,
  onOpenChange,
  direction = "left",
  trigger,
  title,
  description,
  children,
  className,
}: StatefulDrawerProps) {
  return (
    <>
      {trigger && (
        <div onClick={() => onOpenChange(true)}>
          {trigger}
        </div>
      )}
      
      {/* Overlay - always mounted */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden={!open}
      />
      
      {/* Drawer Content - always mounted */}
      <div
        className={cn(
          "fixed z-[60] bg-background flex flex-col h-full w-3/4 sm:max-w-sm transition-transform duration-300 ease-in-out",
          direction === "left" && [
            "left-0 top-0 border-r",
            open ? "translate-x-0" : "-translate-x-full"
          ],
          direction === "right" && [
            "right-0 top-0 border-l",
            open ? "translate-x-0" : "translate-x-full"
          ],
          className
        )}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
      >
        {(title || description) && (
          <div className="flex flex-col gap-0.5 p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                {title && (
                  <h2 className="text-foreground font-semibold">{title}</h2>
                )}
                {description && (
                  <p className="text-muted-foreground text-sm mt-1">{description}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}


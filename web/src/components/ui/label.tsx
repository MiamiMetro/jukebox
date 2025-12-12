import * as React from "react"
import { cn } from "@/lib/utils"

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    htmlFor?: string;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, htmlFor, ...props }, ref) => {
        return (
            <label
                ref={ref}
                htmlFor={htmlFor}
                className={cn(
                    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                    className
                )}
                {...props}
            />
        )
    }
)
Label.displayName = "Label"


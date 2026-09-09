import { buttonVariants } from "@components/ui/button";
import { cn } from "@lib/utils";
import type { VariantProps } from "class-variance-authority";
import { Link } from "react-router";

export default function ButtonLink({
    to,
    className,
    variant = "default",
    size = "default",
    children,
}: {
    to: string;
    className?: string;
    variant?: VariantProps<typeof buttonVariants>["variant"];
    size?: VariantProps<typeof buttonVariants>["size"];
    children: React.ReactNode;
}) {
    return (
        <Link
            to={to}
            className={cn(
                buttonVariants({
                    variant,
                    size,
                }),
                className,
            )}
        >
            {children}
        </Link>
    );
}

import Link from "next/link";
import type { LinkComponent } from "@pokepet/ui";

/** Next.js link adapter handed to shared UI components. */
export const AppLink: LinkComponent = ({ href, className, children, ...rest }) => (
  <Link href={href} className={className} {...rest}>
    {children}
  </Link>
);

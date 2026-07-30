import Link from "next/link";

interface BackLinkProps {
    href: string;
    label: string;
}

// The circular back arrow that sits at the start of every ag-topbar title.
export default function BackLink({ href, label }: BackLinkProps) {
    return (
        <Link href={href} className="ag-back" aria-label={label}>←</Link>
    );
}

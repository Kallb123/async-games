import Link from "next/link";
import BackArrow from "@/components/ui/BackArrow";

interface BackLinkProps {
    href: string;
    label: string;
}

// The circular back arrow that sits at the start of every ag-topbar title.
export default function BackLink({ href, label }: BackLinkProps) {
    return (
        <Link href={href} className="ag-back" aria-label={label}>
            <BackArrow />
        </Link>
    );
}

import { LEGAL_CONTACT } from "@/utils/ui/legal";

/** The address the legal pages tell you to write to, as a mailto link. */
export default function LegalEmail() {
    return <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>;
}

import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/ui/LegalPage";
import { LEGAL_CONTACT } from "@/utils/ui/legal";

export const metadata: Metadata = {
    title: "Terms of Service — Async Games",
    description: "The rules for using Async Games.",
};

/**
 * The terms of service. Public: no auth guard, no data fetching, so it renders
 * for a signed-out visitor (and for a crawler) as a static server component.
 */
export default function Terms() {
    return (
        <LegalPage
            title="Terms of Service"
            summary="The rules for using Async Games. Be decent to the people you play with."
            href="/terms"
        >
            <h2>The short version</h2>
            <p>
                Play games, be decent to the other players, don&apos;t attack the
                service or try to cheat it. Async Games is a small service run with
                care but without guarantees — it can change, break, or go away. If you
                stop wanting an account, we&apos;ll delete it.
            </p>

            <h2>Agreeing to these terms</h2>
            <p>
                By creating an account or using Async Games (&ldquo;the service&rdquo;)
                you agree to these terms. If you don&apos;t agree with them, please
                don&apos;t use the service. Our <Link href="/privacy">Privacy Policy</Link> explains
                how we handle your data and forms part of these terms.
            </p>

            <h2>Who can use the service</h2>
            <p>
                You must be at least 13 years old to have an account. Some parts of the
                service are in early access and need an access code as well as an
                account; having a code doesn&apos;t entitle you to continued access, and
                you shouldn&apos;t share it with people we haven&apos;t given it to.
            </p>

            <h2>Your account</h2>
            <p>
                Keep your sign-in details to yourself — you&apos;re responsible for what
                happens under your account. Give accurate details when you sign up, and
                pick a username that isn&apos;t offensive, misleading, or impersonating
                someone else. Tell us at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> if
                you think someone else is using your account.
            </p>

            <h2>Playing fairly</h2>
            <p>While using the service, please don&apos;t:</p>
            <ul>
                <li>harass, threaten, abuse or spam other players, in usernames, messages, reactions or anywhere else;</li>
                <li>cheat — exploiting a bug in a game rather than reporting it, using scripts or bots to play or to take turns for you, or using more than one account to gain an advantage in a game;</li>
                <li>interfere with the service: probing, overloading or attacking it, bypassing rate limits or access controls, or scraping it automatically;</li>
                <li>use the service to break the law, or to post anything unlawful;</li>
                <li>attempt to access another player&apos;s account or data.</li>
            </ul>
            <p>
                Found a security problem instead of exploiting it? Please tell us
                at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> — that&apos;s
                genuinely appreciated.
            </p>

            <h2>Games, turns and timers</h2>
            <p>
                Every game has a turn timer, chosen when the game is set up. If you
                don&apos;t take your turn before it expires, the service may take a
                default action for you, skip your turn, or — if you miss several turns
                in a row — end the game. That&apos;s how games with an absent player
                keep moving; it isn&apos;t a fault.
            </p>
            <p>
                Completed games are recorded, and their results, statistics and history
                are visible to the players who were in them. Games are played between
                people: we don&apos;t referee disagreements between players about how a
                game went.
            </p>

            <h2>Notifications</h2>
            <p>
                Notifications are opt-in, and only ever about your games — it&apos;s your
                turn, someone invited you, someone reacted. We don&apos;t send marketing
                messages. You can turn any channel off in Settings, or revoke
                notification permission in your browser or device settings.
            </p>

            <h2>Availability and changes</h2>
            <p>
                The service is provided as-is and as-available. There&apos;s no uptime
                guarantee: we may change, add or remove games and features, take the
                service down for maintenance, or discontinue it. During early access,
                data may occasionally be reset — please don&apos;t treat the service as
                the only place anything important to you is stored.
            </p>

            <h2>Intellectual property</h2>
            <p>
                The Async Games name, logo, artwork and site design belong to us. The
                app&apos;s own source code carries the GNU General Public License v3.0,
                and where you hold a copy of that code, the licence — not these terms —
                governs what you may do with it.
            </p>
            <p>
                Some games on Async Games are our own implementations of well-known
                game mechanics. We&apos;re not affiliated with, endorsed by or sponsored
                by any board game publisher, and any resemblance to a commercial game
                doesn&apos;t imply a connection with it.
            </p>

            <h2>Content you contribute</h2>
            <p>
                You keep ownership of what you contribute — your username, moves,
                reactions and any messages. You grant us permission to store and display
                that content within the service so the game works and other players can
                see it. We may remove content that breaks these terms.
            </p>

            <h2>Third-party services</h2>
            <p>
                Sign-in, hosting and push notifications are provided by third parties
                (listed in the <Link href="/privacy">Privacy Policy</Link>). Your use of those
                services through Async Games is also subject to their own terms, and we
                aren&apos;t responsible for outages or changes on their side.
            </p>

            <h2>Suspension and ending your account</h2>
            <p>
                You can stop using the service at any time, and can ask us to delete your
                account by emailing <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>. We
                may suspend or remove an account that breaks these terms or that
                endangers the service or its players — where it&apos;s reasonable to do
                so, we&apos;ll tell you why first.
            </p>

            <h2>Disclaimers and liability</h2>
            <p>
                The service is provided without warranties of any kind, to the fullest
                extent the law allows: we don&apos;t promise it will be uninterrupted,
                error-free, or that game data will never be lost. To the extent
                permitted by law, we aren&apos;t liable for indirect or consequential
                loss, lost data, or loss arising from another player&apos;s conduct.
                Nothing here limits liability that can&apos;t legally be limited — such
                as for death or personal injury caused by negligence, or for fraud — and
                if you use the service as a consumer, your statutory rights are
                unaffected.
            </p>

            <h2>Changes to these terms</h2>
            <p>
                We may update these terms as the service changes. The date at the top of
                the page says when they were last updated, and we&apos;ll flag
                significant changes in the app. Continuing to use the service after a
                change means you accept the updated terms.
            </p>

            <h2>Contact</h2>
            <p>
                Questions about these terms go
                to <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
            </p>
        </LegalPage>
    );
}

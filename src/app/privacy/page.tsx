import type { Metadata } from "next";
import LegalPage from "@/components/ui/LegalPage";
import { LEGAL_CONTACT } from "@/utils/ui/legal";

export const metadata: Metadata = {
    title: "Privacy Policy — Async Games",
    description: "What Async Games collects, why, and who else touches it.",
};

/**
 * The privacy policy. Public: no auth guard, no data fetching, so it renders
 * for a signed-out visitor (and for a crawler) as a static server component.
 */
export default function Privacy() {
    return (
        <LegalPage
            title="Privacy Policy"
            summary="What we collect, why we collect it, and who else touches it."
            href="/privacy"
        >
            <h2>The short version</h2>
            <p>
                Async Games collects what it needs to run your games and tell you when
                it&apos;s your turn — and nothing else. In particular:
            </p>
            <ul>
                <li><strong>We do not sell or rent your data</strong>, to anyone, ever.</li>
                <li><strong>We do not send marketing emails.</strong> The only messages we send are the push notifications you turn on.</li>
                <li><strong>We do not run advertising or third-party analytics</strong>, and there are no tracking cookies.</li>
                <li>We don&apos;t build profiles of you or make automated decisions about you.</li>
            </ul>
            <p>
                The rest of this page is the detail behind those promises. If anything
                here is unclear, email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
            </p>

            <h2>Who this policy covers</h2>
            <p>
                This policy applies to Async Games, the turn-based games service at
                asyncgames.com and its installed app. Async Games is the controller of
                the personal data described below. You can reach us
                at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
            </p>

            <h2>What we collect</h2>

            <h3>Account information</h3>
            <p>
                Accounts are created and held through <strong>Clerk</strong>, our
                authentication provider. Depending on how you sign up, that means your
                email address, a username, optionally a first and last name, and either
                a password or an identifier from the sign-in provider you chose. We
                never see or store your password ourselves.
            </p>

            <h3>Game data</h3>
            <p>
                To run a game we store, keyed to your account ID: the games and
                invitations you are part of, the other players in them, every move you
                make and the history of moves in the game, the turn timer you chose and
                when each turn was taken, finished-game results and the statistics
                derived from them, reactions you leave on other players&apos; turns, and
                your friend connections and pending friend requests.
            </p>

            <h3>Notification data</h3>
            <p>
                If you turn on push notifications, we store a notification token for
                each device you enable them on, along with a short description of that
                device worked out from your browser&apos;s user-agent string (device
                type, operating system and browser — for example &ldquo;iPhone ·
                Safari&rdquo;), so you can tell your devices apart in Settings, plus
                when it was registered and last seen. We also store which notification
                channels you have switched on. Tokens that stop working are deleted
                automatically by a nightly job, and you can remove any device yourself
                from Settings.
            </p>

            <h3>Technical logs</h3>
            <p>
                Our hosting provider records standard server logs for requests to the
                site — IP address, user agent, the URL requested and a timestamp. These
                are used to run the service, debug faults and protect against abuse,
                and are kept for a short period before being deleted.
            </p>

            <h2>Why we use it, and our lawful bases</h2>
            <ul>
                <li><strong>To provide the service</strong> — creating your account, running games, showing your history and stats, connecting you with friends. Lawful basis: performance of our contract with you.</li>
                <li><strong>To notify you</strong> that it&apos;s your turn or that something happened in a game. Lawful basis: your consent, given when you allow notifications in your browser and enable channels in Settings. You can withdraw it at any time.</li>
                <li><strong>To keep the service working and safe</strong> — debugging, preventing abuse and enforcing our terms. Lawful basis: our legitimate interests in operating a secure service.</li>
            </ul>

            <h2>What other players can see</h2>
            <p>
                Async Games is a multiplayer service, so some of your data is shown to
                the people you play with: your username and display name, your avatar,
                the moves you make and the history and recap of games you share, results
                and statistics from those games, reactions you leave, whether you are
                friends, and roughly when you last took a turn. <strong>Your email
                address is never shown to other players.</strong>
            </p>

            <h2>Who else processes your data</h2>
            <p>
                We use a small number of service providers to run Async Games. They
                process data on our instructions and are not permitted to use it for
                their own purposes:
            </p>
            <ul>
                <li><strong>Clerk</strong> — authentication and account storage. Holds your account details, your notification tokens and your notification preferences.</li>
                <li><strong>MongoDB Atlas</strong> — the database holding games, invitations, results, reactions and friendships.</li>
                <li><strong>Vercel</strong> — hosting, content delivery, the API that serves the app, and the server logs described above.</li>
                <li><strong>Google Firebase Cloud Messaging</strong> — delivering push notifications. Firebase receives the notification token for the device being notified and the contents of the notification (for example &ldquo;It&apos;s your turn in Dice Cities&rdquo;). The push service worker in your browser also loads the Firebase messaging library from Google&apos;s CDN (gstatic.com), which means Google sees a request from your browser when the app registers for push.</li>
                <li><strong>Your device&apos;s push service</strong> — Firebase hands notifications to Apple, Google, Mozilla or Microsoft&apos;s push infrastructure depending on the browser and device you use, so the message can reach you.</li>
                <li><strong>A scheduling service</strong> calls a fixed endpoint on our API on a timer, so that turn timers expire on time. It sends no personal data and receives none.</li>
            </ul>
            <p>
                We do not use Google Analytics, Firebase Analytics or any other
                analytics product. The site&apos;s font is bundled with the app rather
                than fetched from a font CDN, so loading a page doesn&apos;t tell a
                third party you visited.
            </p>

            <h2>Cookies and local storage</h2>
            <p>
                We use only what the service needs to function. Clerk sets essential
                cookies to keep you signed in. Your browser&apos;s local storage
                remembers small interface preferences, such as a banner you dismissed,
                and the app&apos;s service worker caches files so the installed app can
                open offline. There are no advertising or tracking cookies, and we do
                not share cookie data with anyone.
            </p>

            <h2>International transfers</h2>
            <p>
                Our providers are based in, or store data in, the United States and
                other countries. Where data is transferred out of the UK or European
                Economic Area, that transfer relies on the safeguards those providers
                put in place — typically the UK Addendum and the EU Standard
                Contractual Clauses.
            </p>

            <h2>How long we keep it</h2>
            <ul>
                <li>Account data is kept while your account exists.</li>
                <li>Games, results and reactions are kept while your account exists, so your history and statistics stay intact — they involve other players too, so a finished game remains visible to them.</li>
                <li>Notification tokens are removed as soon as they stop working, or when you remove the device.</li>
                <li>Server logs are kept only briefly, for debugging and security.</li>
            </ul>

            <h2>Your rights</h2>
            <p>
                You can access, correct, export or delete your personal data, object to
                or restrict how we use it, and withdraw consent for notifications at any
                time (Settings, or your browser&apos;s notification permission). Some of
                this you can do yourself in the app; for anything else — including
                deleting your account and the data attached to it — email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and
                we will deal with it within one month.
            </p>
            <p>
                If you are in the UK or the EEA and you think we have handled your data
                badly, you can complain to your data protection authority — in the UK,
                the Information Commissioner&apos;s Office
                (<a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>).
                We&apos;d appreciate the chance to put it right first.
            </p>

            <h2>Children</h2>
            <p>
                Async Games isn&apos;t intended for children under 13, and we don&apos;t
                knowingly collect their data. If you believe a child has created an
                account, email us and we&apos;ll remove it.
            </p>

            <h2>Security</h2>
            <p>
                Traffic to the site is encrypted in transit, credentials are handled by
                our authentication provider rather than stored by us, and access to the
                database is restricted. No service can promise perfect security, but we
                keep the amount of data we hold small deliberately.
            </p>

            <h2>Changes to this policy</h2>
            <p>
                If we change this policy we&apos;ll update the date at the top of the
                page, and we&apos;ll tell you in the app if the change is significant.
            </p>
        </LegalPage>
    );
}

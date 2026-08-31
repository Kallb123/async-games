'use client'

import { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import Avatar from '@/components/ui/Avatar';
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import { useToast } from '@/components/ToastContext';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import { useNowToTheMinute } from '@/utils/hooks/useNow';
import { formatRelativeTime } from '@/utils/ui/time';
import { shareOrCopyLink } from '@/utils/ui/share';
import type {
    AdminGuestDto,
    AdminGuestSeat,
    IAdminGuestResumeRequest,
    IAdminGuestResumeResponse,
    IAdminGuestsResponse,
} from '@/utils/users/adminGuests';

// What each seat reads as in the row's sub-line — "Train Time with Ann & Bob".
// `nameList` isn't used here on purpose: an admin checking an identity wants
// every name at the table, not "& 2 others".
const SEAT_STATE_LABEL: Record<AdminGuestSeat['state'], string> = {
    live: 'playing',
    finished: 'finished',
    lobby: 'waiting in a lobby',
};

function seatLine(seat: AdminGuestSeat): string {
    const others = seat.others.length ? ` with ${seat.others.join(', ')}` : '';
    return `${seat.game} — ${SEAT_STATE_LABEL[seat.state]}${others}`;
}

// "Joined 3d ago · last seen 2h ago", and empty before hydration — there is no
// honest clock reading to render until then (see `useNowToTheMinute`), so each
// half appears only once it has something to say.
function activityLine(guest: AdminGuestDto, now: number | null): string {
    return ([['Joined', guest.createdAt], ['last seen', guest.lastActiveAt]] as const)
        .map(([label, iso]) => {
            const when = iso ? formatRelativeTime(iso, now) : null;
            return when ? `${label} ${when}` : null;
        })
        .filter(Boolean)
        .join(' · ');
}

/**
 * Guest-account recovery (docs/admin-tools.md): the guests the app is holding,
 * what each of them is playing, and a button that mints a fresh resume link to
 * send the one who wrote in.
 *
 * The seats are the point. A guest has no email and no handle — only a name
 * they typed once — so "Dave" is not an identification and the table they are
 * sitting at is: check it against what the player said before pressing
 * anything, because the link is a way into that account.
 */
export default function AdminGuestRecovery() {
    const { showToast } = useToast();
    const now = useNowToTheMinute();
    // The term the list has actually been fetched for, set on submit — a
    // keystroke-by-keystroke search would walk the whole Clerk instance per
    // letter typed (see listGuestAccounts).
    const [term, setTerm] = useState('');
    const [typed, setTyped] = useState('');
    // The links minted this visit, by guest id. Nothing stores them, here or
    // on the server, so leaving one on screen is what lets an admin paste it a
    // second time without minting a second link.
    const [links, setLinks] = useState<Record<string, IAdminGuestResumeResponse>>({});
    const [minting, setMinting] = useState<string | null>(null);

    const { data, isLoading, isRefreshing, status, refresh } = useRefreshableData<IAdminGuestsResponse>(
        `/api/admin/guests?q=${encodeURIComponent(term)}`
    );

    const mintLink = async (guest: AdminGuestDto) => {
        if (minting) return;
        setMinting(guest.userId);
        try {
            const body: IAdminGuestResumeRequest = { userId: guest.userId };
            const response = await fetch('/api/admin/guests/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(response.statusText || `HTTP ${response.status}`);
            const minted = await response.json() as IAdminGuestResumeResponse;
            setLinks(current => ({ ...current, [guest.userId]: minted }));
            const shared = await shareOrCopyLink(minted.resumeUrl, `Your way back into Async Games, ${minted.name}.`);
            if (shared === 'copied') showToast('Link copied — send it to them.', 'success');
            if (shared === 'failed') showToast('Link ready below — copy it from there.', 'info');
        } catch (error) {
            console.error('Failed to mint a resume link', error);
            showToast('Could not mint a link. Please try again.', 'danger');
        } finally {
            setMinting(null);
        }
    };

    return (
        <>
            <div className="ag-section">
                <div className="ag-callout">
                    A resume link signs whoever opens it straight in as that guest. Check the
                    game and the players against what they told you before you send one.
                </div>
                <form
                    className="ag-stack"
                    style={{ marginTop: 12 }}
                    onSubmit={event => { event.preventDefault(); setTerm(typed.trim()); }}
                >
                    <label className="ag-field-label" htmlFor="guest-search">Find a guest</label>
                    <input
                        id="guest-search"
                        className="ag-input"
                        value={typed}
                        onChange={event => setTyped(event.target.value)}
                        placeholder="Name they played under, or account id"
                        autoComplete="off"
                    />
                    <div className="ag-btn-row">
                        <button type="submit" className="ag-btn ag-btn--dark ag-btn--block">Search</button>
                        {term && (
                            <button
                                type="button"
                                className="ag-btn ag-btn--light ag-btn--block"
                                onClick={() => { setTyped(''); setTerm(''); }}
                            >
                                Show all
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <ListSection
                label="Guests"
                showCount
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                skeletonIcon="avatar"
                action={
                    <button type="button" className="ag-section-action" onClick={refresh}>Refresh</button>
                }
                empty={
                    <div className="ag-empty">
                        {status !== null && status >= 400
                            ? "Couldn't load the guest list."
                            : term
                                ? `No guest matches “${term}”.`
                                : 'No unclaimed guest accounts right now.'}
                    </div>
                }
                hint={data?.truncated
                    ? `Showing the newest ${data.guests.length} of more — narrow the search to find an older guest.`
                    : undefined}
            >
                {(data?.guests ?? []).map(guest => {
                    const link = links[guest.userId];
                    return (
                        <ListRow
                            key={guest.userId}
                            icon={<Avatar name={guest.name} />}
                            title={guest.name}
                            sub={
                                <>
                                    {guest.seats.length === 0
                                        ? <div>No game or lobby — nothing to come back to.</div>
                                        : guest.seats.map(seat => (
                                            <div key={seat.href}>
                                                <a href={seat.href} target="_blank" rel="noreferrer">{seatLine(seat)}</a>
                                            </div>
                                        ))}
                                    <div>{activityLine(guest, now)}</div>
                                    {/* Shown in full for the admin whose browser refused the
                                        clipboard, or whose support channel isn't in the share
                                        sheet — `ag-digest` is the app's "a token to be read
                                        back, not prose" style. */}
                                    {link && <div className="ag-digest">{link.resumeUrl}</div>}
                                </>
                            }
                            action={
                                <ActionButton
                                    className="ag-btn ag-btn--light"
                                    pending={minting === guest.userId}
                                    pendingLabel="Minting…"
                                    onClick={() => mintLink(guest)}
                                >
                                    {link ? 'New link' : 'Resume link'}
                                </ActionButton>
                            }
                        />
                    );
                })}
            </ListSection>
        </>
    );
}

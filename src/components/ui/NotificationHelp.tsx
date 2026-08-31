'use client'

import { useState } from 'react';
import InfoModal, { type InfoSection } from '@/components/ui/InfoModal';

// The whole answer to "notifications are on, so why am I not getting any?",
// which is too long to sit on the settings screen and too useful to leave out.
// Written for a phone, because that is where a missed turn matters and where
// almost everything on this list goes wrong: the OS has its own switches, its
// own idea of which apps deserve battery, and no obligation to tell the app
// about either.
const SECTIONS: InfoSection[] = [
    {
        heading: "Three things have to line up",
        body: "This device has to allow notifications, it has to register itself with us, and the kind of notification has to be switched on above. The Enable button covers the first, opening the app covers the second, and the switches above are the third — the line under this section says how far this device has got.",
    },
    {
        heading: "It's per device, not per account",
        body: "Every phone, tablet and browser registers separately, so turning notifications on here says nothing about your other devices. Your devices below is the real list: if a device isn't on it, nothing will be sent to it. A private or incognito window registers a new one every time and forgets it when you close it.",
    },
    {
        heading: "If they stop arriving",
        body: "Open Async Games once on the device that has gone quiet — that re-registers it, and is usually the whole fix. Then check it appears under Your devices, that the notification you're expecting is switched on, and press Send a test notification to see whether one can get through.",
    },
    {
        heading: "Your phone can hold them back",
        body: "Phones pause apps to save battery, and a paused app gets its notifications late or not at all. On Android, look for Battery in the app's system settings and set it to unrestricted, and leave background data on. Some phones — Samsung, Xiaomi, OnePlus and Huawei especially — have a second, more aggressive setting of their own, often called battery optimisation, app sleeping or protected apps.",
    },
    {
        heading: "Your phone can also switch them off",
        body: "Android keeps its own notification settings per app and per category, and an app is never told when one of them is switched off — so notifications can look allowed here and be blocked there. Check Settings › Apps › Notifications for whichever app you play in, and turn every category back on. If you use the site in Chrome rather than the installed app, Chrome adds a switch per website: look for asyncgames.com in Chrome's own notification settings.",
    },
    {
        heading: "Nothing shows while you're looking",
        body: "A notification isn't shown if you already have Async Games open — the screen just updates instead. That's deliberate. The one exception is the test notification below, which always shows, so pressing it tells you something even with the app in front of you.",
    },
];

/**
 * The "?" beside the Notifications heading, and the sheet it opens.
 *
 * Owns its own open state because nothing else needs it, and `InfoModal` (the
 * game guide's popup) supplies the sheet — this is only the trigger and the
 * copy.
 */
export default function NotificationHelp() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className="ag-section-action ag-section-action--help"
                onClick={() => setOpen(true)}
                aria-label="How notifications work"
            >?</button>

            {open && (
                <InfoModal
                    title="How notifications work"
                    sections={SECTIONS}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

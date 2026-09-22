'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import UserInviteList from "@/components/UserInviteList";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import Section from "@/components/ui/Section";
import type { KingdomBuilderWorldRequest, KingdomBuilderWorldResponse } from "@/app/api/newgame/kingdombuilder/route";
import { UNLIMITED_TURN_TIMER } from "@/utils/games/TurnTimer";
import { REQUEST_TIMEOUT_MS } from "@/utils/hooks/fetchWithSessionRetry";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePartySeats } from "@/utils/hooks/usePartySeats";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";

const META = GAME_META.kingdombuilder;

export default function NewKingdomBuilder() {
    useAuthGuard();
    const router = useRouter();
    const { userList, setItem, players } = usePlayerList();
    // A world is a shared one by default (§1): every seat the host doesn't
    // fill by name is left open for the code.
    const { seatCount, setSeatCount, maxSeats, partySize, partySizeError } = usePartySeats(META, players.length, META.maxPlayers - 1);
    const [starting, setStarting] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (starting || partySizeError) return;
        setStarting(true);
        try {
            const body: KingdomBuilderWorldRequest = { userList: players, turnTimer: UNLIMITED_TURN_TIMER, openSeats: seatCount };
            const response = await fetch("/api/newgame/kingdombuilder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(response.statusText || "The world could not be created.");
            const result = await response.json() as KingdomBuilderWorldResponse;
            if (result.invitationFailed) showToast("Your world is ready, but the invitations couldn't be sent — nobody else can join it.", "danger");
            router.push(`/kingdombuilder/${result.worldId}`);
        } catch (cause) {
            console.error("Failed to start Kingdom Builder", cause);
            showToast("Your world could not be created. Check your connection and try again.", "danger");
            setStarting(false);
        }
    };

    return (
        <GameSetupLayout
            meta={META}
            onSubmit={handleSubmit}
            actionLabel={starting ? "Founding…" : "Found a world"}
            actionDisabled={starting || !!partySizeError}
            footnote={seatCount > 0 ? "Share the code from the world map to fill the open seats" : players.length > 0 ? "Friends join as they accept" : "A world of your own"}
        >
            <Section label="Your world">
                <p>Everyone starts with a town centre and an empty 3×3 settlement on a fair starting site. Resources arrive every 15 minutes, ready for you to build lumber camps, quarries and mines. The world keeps running after it opens, so friends can join days later.</p>
            </Section>
            <UserInviteList userList={userList} setItem={setItem} />
            <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
            <PartySizeHint meta={META} total={partySize} />
            <FcmTokenComp />
        </GameSetupLayout>
    );
}

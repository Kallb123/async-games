'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

import GameSetupLayout from "@/components/ui/GameSetupLayout";
import Section from "@/components/ui/Section";
import { REQUEST_TIMEOUT_MS } from "@/utils/hooks/fetchWithSessionRetry";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { GAME_META } from "@/utils/ui/games";

interface NewKingdomBuilderResponse {
    worldId: string;
    settlementId: string;
}

export default function NewKingdomBuilder() {
    useAuthGuard();
    const router = useRouter();
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (starting) return;
        setStarting(true);
        setError(null);
        try {
            const response = await fetch("/api/newgame/kingdombuilder", {
                method: "POST",
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error("The settlement could not be founded.");
            const result = await response.json() as NewKingdomBuilderResponse;
            router.push(`/kingdombuilder/${result.worldId}/${result.settlementId}`);
        } catch (cause) {
            console.error("Failed to start Kingdom Builder", cause);
            setError("Your world could not be created. Check your connection and try again.");
            setStarting(false);
        }
    };

    return (
        <GameSetupLayout
            meta={GAME_META.kingdombuilder}
            onSubmit={handleSubmit}
            actionLabel={starting ? "Founding…" : "Found a settlement"}
            actionDisabled={starting}
        >
            <Section label="Prototype world">
                <p>Start with a town centre and an empty 3×3 settlement. Resources arrive every hour, ready for you to build lumber camps, quarries and mines.</p>
                {error && <div className="ag-callout" role="alert">{error}</div>}
            </Section>
        </GameSetupLayout>
    );
}

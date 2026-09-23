'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

import ActionButton from "@/components/ui/ActionButton";
import Section from "@/components/ui/Section";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";

import type { KingdomBuilderWorldPlayer } from "../worldView";

type Exit = "end" | "delete" | "leave";

interface WorldExitSectionProps {
    endpoint: string;
    players: KingdomBuilderWorldPlayer[];
}

/**
 * The way out of a world (GDD §9.1): its host can end it — or end it and
 * remove it outright — and anyone can leave. Nothing happens on the first tap:
 * it opens a confirmation that says what becomes of everyone else first.
 */
export default function WorldExitSection({ endpoint, players }: WorldExitSectionProps) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<"end" | "leave" | null>(null);
    const [exiting, setExiting] = useState<Exit | null>(null);
    const { submit, isPending, message } = useJsonMutation<{ ended?: boolean; left?: boolean }>(endpoint, "That didn't go through — try again.");

    const me = players.find(player => player.isMe);
    const others = players.filter(player => !player.isMe);
    const host = players.find(player => player.isHost);
    const successor = others[0];

    const exit = async (how: Exit) => {
        setExiting(how);
        const body = how === "leave" ? { action: "leave" } : { action: "end", deleteNow: how === "delete" };
        if (await submit(body)) router.push("/");
        else setExiting(null);
    };

    const othersLine = others.length === 1 ? "the other player" : `the ${others.length} other players`;
    const leaveConsequence = others.length === 0
        ? "You're the only player here, so the world ends when you go."
        : me?.isHost
            ? `Your settlements are removed and ${successor.name} becomes the host.`
            : `Your settlements are removed and your start is freed for someone new. ${host?.name ?? "The host"} and everyone else carry on.`;

    return (
        <Section label="Leave this world">
            {!confirming && (
                <div className="ag-btn-row">
                    {me?.isHost && <button type="button" className="ag-btn ag-btn--danger" onClick={() => setConfirming("end")}>End world</button>}
                    {(!me?.isHost || others.length > 0) && <button type="button" className="ag-btn ag-btn--light" onClick={() => setConfirming("leave")}>Leave world</button>}
                </div>
            )}
            {confirming === "end" && <>
                <div className="ag-callout">
                    Ending the world stops it for you{others.length > 0 ? ` and ${othersLine}` : ""}: it stops ticking, nobody can build or join,
                    and it&apos;s removed after a week — or straight away, if you choose. This can&apos;t be undone.
                </div>
                <div className="ag-btn-row">
                    <button type="button" className="ag-btn ag-btn--ghost" disabled={isPending} onClick={() => setConfirming(null)}>Cancel</button>
                    <ActionButton className="ag-btn ag-btn--danger" pending={exiting === "delete"} pendingLabel="Deleting…" disabled={isPending} onClick={() => exit("delete")}>End and delete now</ActionButton>
                    <ActionButton className="ag-btn ag-btn--primary" pending={exiting === "end"} pendingLabel="Ending…" disabled={isPending} onClick={() => exit("end")}>End world</ActionButton>
                </div>
            </>}
            {confirming === "leave" && <>
                <div className="ag-callout">{leaveConsequence} This can&apos;t be undone.</div>
                <div className="ag-btn-row">
                    <button type="button" className="ag-btn ag-btn--ghost" disabled={isPending} onClick={() => setConfirming(null)}>Cancel</button>
                    <ActionButton className="ag-btn ag-btn--primary" pending={exiting === "leave"} pendingLabel="Leaving…" disabled={isPending} onClick={() => exit("leave")}>Leave world</ActionButton>
                </div>
            </>}
            {message && <div className="ag-callout" role="alert">{message}</div>}
        </Section>
    );
}

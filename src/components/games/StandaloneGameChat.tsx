'use client'

import { useState } from "react";

import GameChatSection, { useGameChatSection } from "@/components/games/GameChatSection";
import type { GameShellChat } from "@/components/ui/GameShell";

/** The shared chat experience for standalone games that do not wear GameShell. */
export default function StandaloneGameChat(chat: GameShellChat) {
    const [open, setOpen] = useState(false);
    const [enabled, state, panelRef] = useGameChatSection(chat, open);
    return <GameChatSection chat={chat} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
        enabled={enabled} state={state} panelRef={panelRef} />;
}

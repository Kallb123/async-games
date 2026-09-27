'use client'

import GameChat from "@/components/games/GameChat";
import PanelToggleRow from "@/components/ui/PanelToggleRow";
import type { GameShellChat } from "@/components/ui/GameShell";
import { useGameChat } from "@/utils/hooks/useGameChat";
import { useScrollIntoViewOnOpen } from "@/utils/hooks/useScrollIntoViewOnOpen";

export function useGameChatSection(chat: GameShellChat | undefined, open: boolean) {
    const enabled = !!chat && chat.userIdList.length >= 2;
    const state = useGameChat(chat?.gameId ?? "", open, enabled, chat?.viewerId);
    const panelRef = useScrollIntoViewOnOpen(open && enabled);
    return [enabled, state, panelRef] as const;
}

type ChatState = ReturnType<typeof useGameChat>;
type PanelRef = ReturnType<typeof useScrollIntoViewOnOpen>;

/** The standard open/closed chat panel shared by shell and standalone games. */
export default function GameChatSection({ chat, open, onOpen, onClose, enabled, state, panelRef }: {
    chat: GameShellChat;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    enabled: boolean;
    state: ChatState;
    panelRef: PanelRef;
}) {
    if (!enabled) return null;
    return open ? (
        <div ref={panelRef}>
            <GameChat {...state} onClose={onClose} userIdList={chat.userIdList} usernameList={chat.usernameList} />
        </div>
    ) : <PanelToggleRow title={state.hasUnread ? "Chat · new messages" : "Chat"} onOpen={onOpen} />;
}

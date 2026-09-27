'use client'

import GameChat from "@/components/games/GameChat";
import PanelToggleRow from "@/components/ui/PanelToggleRow";
import type { GameShellChat } from "@/components/ui/GameShell";
import { useGameChat } from "@/utils/hooks/useGameChat";
import { useScrollIntoViewOnOpen } from "@/utils/hooks/useScrollIntoViewOnOpen";

export function useGameChatSection(chat: GameShellChat | undefined, open: boolean) {
    const enabled = !!chat && chat.userIdList.length >= 2;
    const state = useGameChat(chat?.gameId ?? "", open, enabled);
    const panelRef = useScrollIntoViewOnOpen(open && enabled);
    return { enabled, state, panelRef };
}

type Controller = ReturnType<typeof useGameChatSection>;

/** The standard open/closed chat panel shared by shell and standalone games. */
export default function GameChatSection({ chat, open, onOpen, onClose, controller }: {
    chat: GameShellChat;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    controller: Controller;
}) {
    if (!controller.enabled) return null;
    return open ? (
        <div ref={controller.panelRef}>
            <GameChat {...controller.state} onClose={onClose} userIdList={chat.userIdList} usernameList={chat.usernameList} />
        </div>
    ) : <PanelToggleRow title={controller.state.hasUnread ? "Chat · new messages" : "Chat"} onOpen={onOpen} />;
}

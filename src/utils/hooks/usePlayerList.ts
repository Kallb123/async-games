'use client'
import { useState } from "react";

// Shared state for the "who's playing" invite picker used by every game
// setup screen. Keeps a trailing empty slot so a new name can always be
// added, and exposes the non-empty names for submission. `initialPlayers`
// pre-fills the list (e.g. from a rematch link) with a trailing empty slot
// appended.
export default function usePlayerList(initialPlayers: string[] = []) {
    const [userList, setUserList] = useState<string[]>(() => {
        const seeded = initialPlayers.filter(u => u !== "");
        return seeded.length > 0 ? [...seeded, ""] : [""];
    });

    const setItem = (index: number, value: string) => {
        const changed = userList.map((u, i) => (i === index ? value : u));
        const filtered = changed.filter(u => u !== "");
        if (filtered.length === 0) {
            setUserList([""]);
        } else if (filtered[filtered.length - 1] === "") {
            setUserList(filtered);
        } else {
            setUserList([...filtered, ""]);
        }
    };

    const players = userList.filter(u => u !== "");

    return { userList, setItem, players };
}

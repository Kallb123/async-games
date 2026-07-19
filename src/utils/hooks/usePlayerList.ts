'use client'
import { useState } from "react";

// Shared state for the "who's playing" invite picker used by every game
// setup screen. Keeps a trailing empty slot so a new name can always be
// added, and exposes the non-empty names for submission.
export default function usePlayerList() {
    const [userList, setUserList] = useState<string[]>([""]);

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

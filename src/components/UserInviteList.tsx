'use client'
import { IFriendRequestResponse } from '@/utils/mongodb/FriendshipData';
import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import Section from '@/components/ui/Section';
import { profileImageUrl } from '@/utils/ui/avatar';
import { personalName, publicHandle, displayName } from '@/utils/ui/players';

interface UserInviteProps {
    userList: string[],
    setItem: (index: number, value: string) => void
}

export default function UserInviteList({ userList, setItem }: UserInviteProps) {
    const { user } = useUser();
    const [friends, setFriends] = useState([] as IFriendRequestResponse[]);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        fetch('/api/friends')
        .then(response => response.json())
        .then(data => { if (data && data.friends) setFriends(data.friends); })
        .catch(error => console.error('Failed to load friends', error));
    }, []);

    const added = userList.filter(u => u !== "");

    const addUser = (username: string) => {
        const name = username.trim();
        if (!name || added.includes(name)) return;
        const emptyIndex = userList.findIndex(u => u === "");
        setItem(emptyIndex === -1 ? userList.length : emptyIndex, name);
    };

    const removeUser = (username: string) => {
        const index = userList.findIndex(u => u === username);
        if (index !== -1) setItem(index, "");
    };

    const commitDraft = () => {
        if (draft.trim()) {
            addUser(draft);
            setDraft("");
        }
    };

    // Invites resolve by handle (usersByUsername), so a friend only belongs in
    // the suggestions if they have one to invite by — publicHandle is null for a
    // guest, whose Clerk username is a meaningless account id, not a handle.
    const suggestions = friends.filter(f => {
        const handle = publicHandle(f.user);
        return handle && !added.includes(handle);
    });

    // A chip is added by its handle, so the only picture we have for one is
    // whatever the friends list already told us about that handle.
    const pictureFor = (handle: string) => friends.find(f => publicHandle(f.user) === handle)?.user.imageUrl ?? null;

    return (
        <Section label="Who's playing">

            <div className="ag-chips">
                <span className="ag-person-chip ag-person-chip--you">
                    <Avatar name={personalName(user, "You")} imageUrl={profileImageUrl(user)} size={28} />
                    You
                </span>
                {added.map(username => (
                    <span key={username} className="ag-person-chip">
                        <Avatar name={username} imageUrl={pictureFor(username)} size={28} />
                        {username}
                        <button type="button" aria-label={`Remove ${username}`} onClick={() => removeUser(username)}>✕</button>
                    </span>
                ))}
            </div>

            <input
                className="ag-input"
                style={{ marginTop: 12 }}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitDraft();
                    }
                }}
                onBlur={commitDraft}
                placeholder="Add by username or email"
            />

            {suggestions.length > 0 && (
                <div className="ag-list" style={{ marginTop: 12 }}>
                    {suggestions.map(friend => (
                        <div key={friend.friendshipId} className="ag-list-row">
                            <Avatar name={personalName(friend.user)} imageUrl={friend.user.imageUrl} size={30} />
                            <div className="ag-list-row-main">
                                <div className="ag-list-row-title">{displayName(friend.user)}</div>
                            </div>
                            <button type="button" className="ag-pill-action" onClick={() => addUser(publicHandle(friend.user)!)}>Add</button>
                        </div>
                    ))}
                </div>
            )}
        </Section>
    );
}

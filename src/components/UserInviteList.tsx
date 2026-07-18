'use client'
import { IFriendRequestResponse } from '@/utils/mongodb/FriendshipData';
import { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';

interface UserInviteProps {
    userList: string[],
    setItem: (index: number, value: string) => void
}

export default function UserInviteList({userList, setItem}: UserInviteProps) {
    const [friends, setFriends] = useState([] as IFriendRequestResponse[]);

    useEffect(() => {
        fetch('/api/friends')
        .then(response => response.json())
        .then(data => {if (data && data.friends) setFriends(data.friends);})
        .catch(error => console.error('Failed to load friends', error));
    }, []);

    const addFriend = (username: string) => {
        if (userList.includes(username)) {
            return;
        }
        const emptyIndex = userList.findIndex(user => user === "");
        setItem(emptyIndex === -1 ? userList.length : emptyIndex, username);
    }

    return (
        <>
            <h3>Invite Users</h3>
            {friends.length > 0 && (
                <div className="mb-2">
                    <div>Friends</div>
                    {friends.map((friend) => friend.user.username && (
                        <Button
                            key={friend.friendshipId}
                            variant={userList.includes(friend.user.username) ? "secondary" : "outline-primary"}
                            size="sm"
                            className="me-1 mb-1"
                            disabled={userList.includes(friend.user.username)}
                            onClick={() => addFriend(friend.user.username!)}
                        >
                            {friend.user.username}
                        </Button>
                    ))}
                </div>
            )}
            <div>
                {userList.map((user, i) => (
                    <Form.Control type="text" key={i} value={user} onChange={(e) => setItem(i, e.target.value)} placeholder="Username or email" />
                ))}
            </div>
        </>
    );
}

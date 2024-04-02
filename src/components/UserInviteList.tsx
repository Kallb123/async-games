"use client"

import { Form } from 'react-bootstrap';

interface UserInviteProps {
    userList: string[],
    setItem: (index: number, value: string) => void
}

export default function UserInviteList({userList, setItem}: UserInviteProps) {
    return (
        <>
            <h3>Invite Users</h3>
            <div>
                {userList.map((user, i) => (
                    <Form.Control type="text" key={i} value={user} onChange={(e) => setItem(i, e.target.value)} placeholder="Username or email" />
                ))}
            </div>
        </>
    );
}

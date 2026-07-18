'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import { IFriendRequestResponse, IFriendUser } from "@/utils/mongodb/FriendshipData";
import { useUser } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";

function friendDisplayName(user: IFriendUser) {
    const fullName = [user.firstName, user.lastName].filter(name => name).join(" ");
    if (fullName) {
        return `${fullName} (${user.username})`;
    }
    return `${user.username}`;
}

export default function Profile() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    const [friends, setFriends] = useState([] as IFriendRequestResponse[]);
    const [incomingRequests, setIncomingRequests] = useState([] as IFriendRequestResponse[]);
    const [outgoingRequests, setOutgoingRequests] = useState([] as IFriendRequestResponse[]);
    const [isLoading, setIsLoading] = useState(false);
    const [inviteUsername, setInviteUsername] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        window.addEventListener('FriendInvite', () => {
            console.log('Profile message received: FriendInvite');
            refreshFriends();
        });
        window.addEventListener('FriendAccepted', () => {
            console.log('Profile message received: FriendAccepted');
            refreshFriends();
        });

        if (isLoaded) {
            if (!user) {
                router.push('/login');
                return;
            }

            // Use `user` to render user details or create UI elements
            const unlocked = user?.publicMetadata.unlocked;

            if (unlocked !== true) {
                router.push('/unlockaccess');
            }

            refreshFriends();
        }
    }, [isLoaded]);

    const refreshFriends = () => {
        setIsLoading(true);
        fetch('/api/friends')
        .then(response => response.json())
        .then(data => {
            if (data && data.success) {
                setFriends(data.friends);
                setIncomingRequests(data.incomingRequests);
                setOutgoingRequests(data.outgoingRequests);
            }
        })
        .catch(error => console.error('Failed to load friends', error))
        .finally(() => setIsLoading(false));
    }

    const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const username = inviteUsername.trim();
        if (!username) {
            return;
        }

        setIsSending(true);
        try {
            const response = await fetch('/api/friends/invite', {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({username})
            });
            if (!response.ok) {
                showToast(response.statusText || 'Failed to send the friend request.', 'danger');
                return;
            }
            showToast(`Friend request sent to ${username}!`, 'success', 'Friend Request');
            setInviteUsername("");
            refreshFriends();
        } catch (error) {
            console.error(error);
            showToast('Failed to send the friend request. Please try again.', 'danger');
        } finally {
            setIsSending(false);
        }
    }

    const handleAccept = (friendshipId: string) => {
        fetch('/api/friends/accept', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({friendshipId})
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to accept friend request');
            }
            showToast('Friend request accepted!', 'success', 'New Friend');
            refreshFriends();
        })
        .catch(() => {
            showToast('Failed to accept the friend request. Please try again.', 'danger');
        });
    }

    const handleRemove = (friendshipId: string, successMessage: string) => {
        fetch('/api/friends/remove', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({friendshipId})
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to remove friendship');
            }
            showToast(successMessage, 'success');
            refreshFriends();
        })
        .catch(() => {
            showToast('Something went wrong. Please try again.', 'danger');
        });
    }

    const fullName = [user?.firstName, user?.lastName].filter(name => name).join(" ");

    return (
        <main>
            <h1>My Profile</h1>
            <h2><a href="/">Home</a></h2>
            <div>
                <p>Username: <span style={{fontWeight: "bold"}}>{user?.username ?? "No username"}</span></p>
                <p>Full name: <span style={{fontWeight: "bold"}}>{fullName || "Not set"}</span></p>
            </div>
            <hr />
            <h2>Add a Friend</h2>
            <Form onSubmit={handleInvite}>
                <Form.Control
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Username"
                    style={{maxWidth: "300px", display: "inline-block", marginRight: "0.5rem"}}
                />
                <Button type="submit" disabled={isSending || inviteUsername.trim() === ""}>Send Friend Request</Button>
            </Form>
            <hr />
            <h2>Friends</h2>
            {isLoading && <Spinner animation="border" role="status" size="sm"><span className="visually-hidden">Loading...</span></Spinner>}
            {!isLoading && friends.length === 0 && <p>No friends yet. Send a friend request to get started!</p>}
            {friends.map((friend) => (
                <div key={friend.friendshipId}>
                    <span style={{fontWeight: "bold"}}>{friendDisplayName(friend.user)}</span>
                    {' - '}<a href="#" onClick={(e) => {e.preventDefault(); handleRemove(friend.friendshipId, 'Friend removed.');}}>Remove</a>
                </div>
            ))}
            <hr />
            <h2>Incoming Friend Requests</h2>
            {incomingRequests.length === 0 && <p>No incoming friend requests.</p>}
            {incomingRequests.map((request) => (
                <div key={request.friendshipId}>
                    <span style={{fontWeight: "bold"}}>{friendDisplayName(request.user)}</span> wants to be your friend<br />
                    <span>{moment(request.timestamp).fromNow()}</span>
                    {' - '}<a href="#" onClick={(e) => {e.preventDefault(); handleAccept(request.friendshipId);}}>Accept</a>
                    {' or '}<a href="#" onClick={(e) => {e.preventDefault(); handleRemove(request.friendshipId, 'Friend request declined.');}}>Decline</a>
                </div>
            ))}
            <hr />
            <h2>Outgoing Friend Requests</h2>
            {outgoingRequests.length === 0 && <p>No outgoing friend requests.</p>}
            {outgoingRequests.map((request) => (
                <div key={request.friendshipId}>
                    <span style={{fontWeight: "bold"}}>{friendDisplayName(request.user)}</span> - waiting for them to accept<br />
                    <span>{moment(request.timestamp).fromNow()}</span>
                    {' - '}<a href="#" onClick={(e) => {e.preventDefault(); handleRemove(request.friendshipId, 'Friend request cancelled.');}}>Cancel</a>
                </div>
            ))}
            <hr />
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}

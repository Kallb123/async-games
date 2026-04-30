'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

interface PublicUser {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export default function Users() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [users, setUsers] = useState([] as PublicUser[]);

  useEffect(() => {
    if (isLoaded) {
        if (!user) {
            router.push('/login');
        }

        // Use `user` to render user details or create UI elements
        const unlocked = user?.publicMetadata.unlocked;
      
        if (unlocked !== true) {
          router.push('/unlockaccess');
        }

        fetch('/api/users')
        .then(response => response.json())
        .then(data => setUsers(data.users));
    }
  }, [isLoaded]);
    
  const handleNotify = async (userId: string, e: React.MouseEvent<HTMLLIElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/notifyuser', {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({userId})
      });

      if (!response.ok) {
          console.error(response);
      }

      console.log("User notified");
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <main>
      <CurrentUserInfo />
      <div>
        <ul>
            {users.map((userMap) => (
                <li key={userMap.id} onClick={(e) => handleNotify(userMap.id, e)}>{userMap.firstName} {userMap.lastName} ({userMap.username})</li>
            ))}
        </ul>
      </div>
      <FcmTokenComp /> 
    </main>
  );
}

'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePathname } from 'next/navigation';

interface PublicUser {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export default function Users() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const { data } = useRefreshableData<{ users: PublicUser[] }>('/api/users');
  const users = data?.users ?? [];
    
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

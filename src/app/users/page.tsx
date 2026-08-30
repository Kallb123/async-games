'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePathname, notFound } from 'next/navigation';
import { isDevDeployment } from "@/utils/devEnvironment";
import { displayName } from "@/utils/ui/players";
import type { UserDto } from "@/utils/users/clerk";



// The push test bench: every player, tap one to fire a test notification at
// their devices. Dev deployments only — /api/notifyuser answers 404 off one, so
// in production this is a page of buttons that cannot work, and it was never
// linked from anywhere.
//
// The gate is its own component so the bench's hooks stay unconditional: this
// one throws before any of them run, rather than skipping half of them.
export default function Users() {
  if (!isDevDeployment) {
    notFound();
  }
  return <UsersTestBench />;
}

function UsersTestBench() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const { data } = useRefreshableData<{ users: UserDto[] }>('/api/users');
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
          return;
      }

      const { devices } = await response.json();
      console.log(devices
        ? `Notified ${userId} on ${devices} device(s)`
        : `Nothing sent to ${userId} — no registered device, or they have turn notifications off`);
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
                <li key={userMap.userId} onClick={(e) => handleNotify(userMap.userId, e)}>{displayName(userMap)}</li>
            ))}
        </ul>
      </div>
      <FcmTokenComp /> 
    </main>
  );
}

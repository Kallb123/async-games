import CurrentUserInfo from "@/components/CurrentUserInfo";
import { auth, currentUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

export default async function Login() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  // Get the userId from auth() -- if null, the user is not signed in
  const { userId } = auth();
 
  if (userId) {
    // Query DB for user specific information or display assets only to signed in users 
  }
 
  // Get the Backend API User object when you need access to the user's information
  const user = await currentUser();
  // Use `user` to render user details or create UI elements
  const unlocked = user?.publicMetadata.unlocked;

  return (
    <main>
      <CurrentUserInfo />
    </main>
  );
}

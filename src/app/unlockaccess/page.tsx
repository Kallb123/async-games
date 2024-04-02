import PasswordForm from "@/components/PasswordForm";
import { auth, currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import CurrentUserInfo from "@/components/CurrentUserInfo";

export default async function Home() {
  // Get the userId from auth() -- if null, the user is not signed in
  const { userId } = auth();
 
  if (!userId) {
    redirect("/login");
  }
 
  // Get the Backend API User object when you need access to the user's information
  const user = await currentUser();
  // Use `user` to render user details or create UI elements
  const unlocked = user?.publicMetadata.unlocked;

  return (
    <main>
      <CurrentUserInfo />
      <PasswordForm></PasswordForm>
    </main>
  );
}

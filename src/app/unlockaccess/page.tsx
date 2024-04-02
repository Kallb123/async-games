import PasswordForm from "@/components/PasswordForm";
import styles from "./page.module.css";
import { auth, currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";

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
    <main className={styles.main}>
      <div className={styles.description}>
        <p>
          Hello {user?.firstName} {user?.lastName}. Unlocked: {unlocked === true ? "Yes" : "No"}
        </p>
      </div>
      <PasswordForm></PasswordForm>
    </main>
  );
}

import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);
  // Get the userId from auth() -- if null, the user is not signed in
  const { userId } = await auth();
 
  if (userId) {
    // Query DB for user specific information or display assets only to signed in users 
  }
 
  // Get the Backend API User object when you need access to the user's information
  const thisUser = await currentUser();
  // Use `user` to render user details or create UI elements
  const unlocked = thisUser?.publicMetadata.unlocked;

  if (unlocked !== true) {
    redirect('/')
  }

  const { data: users } = await (await clerkClient()).users.getUserList();
  const publicUsers = users.map((user) => {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName
    }
  })

  return NextResponse.json({success: true, users: publicUsers});
}

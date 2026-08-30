import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { forEachClerkUser, isUnlockedUser, toUserDto, UserDto } from '@/utils/users/clerk';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const thisUser = await currentUser();
  // A JSON endpoint answers with a status, not a redirect: this used to
  // `redirect('/')`, which reaches a fetching client as a 307 to an HTML page
  // and gets parsed as JSON.
  if (!isUnlockedUser(thisUser)) {
    return NextResponse.json({}, { status: 403, statusText: "Account not unlocked" });
  }

  // Every user, a page at a time. A bare `getUserList()` answers with Clerk's
  // default ten, so the picker this feeds only ever offered the ten users who
  // happened to come back first.
  const users: UserDto[] = [];
  await forEachClerkUser(async user => {
    users.push(toUserDto(user));
  });

  return NextResponse.json({success: true, users});
}

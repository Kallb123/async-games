import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';

export interface IGetRollDiceParams {
    dicenumber: string
}

export async function GET(request: NextRequest, {params}: { params: Promise<IGetRollDiceParams>}) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
    }

    const { dicenumber } = await params;
    const roll = 1 + Math.floor(Math.random() * Number(dicenumber));

    return NextResponse.json({success: true, roll});
}

import { auth } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';

export interface IGetRollDiceParams {
    dicenumber: number
}

export async function GET(request: NextRequest, {params}: { params: IGetRollDiceParams}) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
    }

    const roll = 1 + Math.floor(Math.random() * params.dicenumber);

    return NextResponse.json({success: true, roll});
}

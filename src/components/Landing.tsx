'use client'

import Link from "next/link";
import Brand from "@/components/ui/Brand";
import LegalLinks from "@/components/ui/LegalLinks";
import GameLibrary from "@/components/ui/GameLibrary";
import { GAME_META } from "@/utils/ui/games";

// Anonymous visitors have no account to set a game up with, so every game in
// the browser points at sign-up rather than at its setup screen.
const SIGN_UP = "/signup";

const HOW_IT_WORKS = [
    {
        icon: "🎲",
        title: "Pick a game and invite your friends",
        sub: "Choose from the library, add the people you want to play with, and set how long each turn can take.",
    },
    {
        icon: "🔔",
        title: "Take your turn whenever you like",
        sub: "Play a move, and the next player gets a notification that it's their go. No one has to be online at the same time.",
    },
    {
        icon: "🏆",
        title: "Pick up right where you left off",
        sub: "Every game keeps its board, its history and a recap of what you missed, waiting for you when you come back.",
    },
];

/**
 * The public home page — the one screen that renders with no account and no
 * access code. Sells the platform, then hands visitors the same game browser
 * the signed-in library uses so they can see what they'd be signing up for.
 */
export default function Landing() {
    const gameCount = Object.keys(GAME_META).length;

    return (
        <main>
            <div className="ag-topbar">
                <Brand />
                <Link href="/login" className="ag-pill-action">Sign in</Link>
            </div>

            <div className="ag-hero">
                <h1 className="ag-hero-title">Board games with your friends, one turn at a time.</h1>
                <p className="ag-hero-sub">
                    Async Games is a home for turn-based games you play at your own pace —
                    a turn on the bus, a turn before bed. No scheduling a game night that
                    never happens.
                </p>
            </div>

            <div className="ag-section">
                <div className="ag-btn-row">
                    <Link href={SIGN_UP} className="ag-btn ag-btn--primary">Create an account</Link>
                    <Link href="/login" className="ag-btn ag-btn--light">Sign in</Link>
                </div>
                <p className="ag-hint">
                    {gameCount} games to play and free to join.
                </p>
            </div>

            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">How it works</h2>
                </div>
                <div className="ag-list">
                    {HOW_IT_WORKS.map(step => (
                        <div key={step.title} className="ag-list-row">
                            <div className="ag-icon-box">{step.icon}</div>
                            <div className="ag-list-row-main">
                                <div className="ag-list-row-title">{step.title}</div>
                                <div className="ag-list-row-sub">{step.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <GameLibrary hrefFor={() => SIGN_UP} featuredCta="Sign up to play" label="Browse the games" />

            <div className="ag-section">
                <Link href={SIGN_UP} className="ag-cta ag-cta--dark">
                    <div className="ag-cta-main">
                        <div className="ag-cta-title">Start playing</div>
                        <div className="ag-cta-sub">Create an account and set up your first game</div>
                    </div>
                    <span aria-hidden="true" className="ag-cta-arrow">→</span>
                </Link>
            </div>

            <div className="ag-footer">
                <div>Already have an account? <Link href="/login">Sign in</Link></div>
                <LegalLinks />
            </div>
        </main>
    );
}

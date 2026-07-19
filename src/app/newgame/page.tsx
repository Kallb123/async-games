'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_META, COMING_SOON, GameCategory } from "@/utils/ui/games";
import GameThumb, { accentVar } from "@/components/ui/GameThumb";

const FILTERS: ("All" | GameCategory)[] = ["All", "Dice", "Strategy", "Word"];

export default function NewGame() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [filter, setFilter] = useState<"All" | GameCategory>("All");

  useEffect(() => {
    if (isLoaded) {
        if (!user) {
            router.push('/login');
        }
        const unlocked = user?.publicMetadata.unlocked;
        if (unlocked !== true) {
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded]);

  const featured = GAME_META.dicecities;
  const otherGames = Object.values(GAME_META)
    .filter(g => g.url !== featured.url)
    .filter(g => filter === "All" || g.category === filter);
  const featuredVisible = filter === "All" || featured.category === filter;

  return (
    <main>
      <div className="ag-topbar">
        <div className="ag-topbar-title">
          <a href="/" className="ag-back" aria-label="Back home">←</a>
          <span className="ag-wordmark">The library</span>
        </div>
      </div>

      <div className="ag-section">
        <div className="ag-chips">
          {FILTERS.map(f => (
            <button
              key={f}
              type="button"
              className={`ag-chip ${filter === f ? "ag-chip--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {featuredVisible && (
        <div className="ag-section">
          <a href={`/newgame/${featured.url}`} className="ag-featured" style={{ background: accentVar(featured.accent) }}>
            {featured.art && <img src={featured.art} alt="" className="ag-featured-art" />}
            <div className="ag-featured-eyebrow">Featured this week</div>
            <div className="ag-featured-title">{featured.name}</div>
            <div className="ag-featured-desc">{featured.tagline}</div>
            <div className="ag-featured-row">
              <span className="ag-featured-btn">Start a game</span>
              <span className="ag-featured-meta">{featured.players}</span>
            </div>
          </a>
        </div>
      )}

      <div className="ag-section">
        <div className="ag-game-grid">
          {otherGames.map(game => (
            <a key={game.url} href={`/newgame/${game.url}`} className="ag-game-card">
              <div className="ag-game-thumb" style={{ background: accentVar(game.accent) }}>
                {game.art
                  ? <GameThumb meta={game} size={74} radius={0} />
                  : game.glyph}
              </div>
              <div className="ag-game-body">
                <div className="ag-game-name">{game.name}</div>
                <div className="ag-game-meta">{game.category} · {game.players.replace(" players", "")}</div>
              </div>
            </a>
          ))}

          {filter === "All" && (
            <div className="ag-game-card ag-game-card--soon">
              <div style={{ font: "800 13px/1.3 var(--ag-font)", color: "var(--ag-ink-soft)", textAlign: "center" }}>
                {COMING_SOON.slice(0, 2).join(", ")} &amp;<br />more coming
              </div>
              <div style={{ font: "600 11px var(--ag-font)", color: "var(--ag-terracotta)" }}>Suggest a game →</div>
            </div>
          )}
        </div>

        {otherGames.length === 0 && !featuredVisible && (
          <div className="ag-empty">No games in this category yet.</div>
        )}
      </div>

      <FcmTokenComp />
    </main>
  );
}

import { redirect } from "next/navigation";

/**
 * Every "your game has started" path in the app — accepting an invite on the
 * dashboard, entering a join code, a lobby that has filled — sends the player
 * to `gamePath(gameUrl, gameId)`. For a Kingdom Builder world that is this
 * address, and the world lives at its own route, so this only forwards there.
 */
export default async function KingdomBuilderGameRedirect({ params }: { params: Promise<{ worldId: string }> }) {
    const { worldId } = await params;
    redirect(`/kingdombuilder/${encodeURIComponent(worldId)}`);
}

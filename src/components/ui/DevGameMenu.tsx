'use client'
import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import GameOptionsMenu, { GameOption } from '@/components/ui/GameOptionsMenu';
import { useToast } from '@/components/ToastContext';
import { REQUEST_TIMEOUT_MS } from '@/utils/hooks/fetchWithSessionRetry';
import { isDevDeployment } from '@/utils/devEnvironment';
import type { IDuplicateGameResponse } from '@/app/api/dev/duplicategame/route';

/**
 * The 🚧 DEV badge on an in-game top bar, which is a menu of dev-only tools
 * rather than a label: today one row, "Duplicate this game" (see
 * docs/environments.md), with room for the next one.
 *
 * It renders nothing off a dev deployment — the same gate as `DevTools` in the
 * settings footer, and the same one `/api/dev/*` answers 404 behind, so this
 * only hides buttons that wouldn't work anyway. Every other top bar in the app
 * still gets the plain CSS badge (`ag-theme.css`, "Dev-deployment marker");
 * the in-game bar's is this.
 *
 * The game it acts on comes from the route rather than a prop: every board
 * screen lives at `/games/<game>/[gameid]`, so `GameShell` can carry the menu
 * for all of them without nine screens passing their id down to it.
 */
export default function DevGameMenu() {
    const { gameid } = useParams<{ gameid: string }>();
    const router = useRouter();
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);

    const duplicate = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
            // The same deadline every other request in the app gets: `fetch`
            // has none of its own, and a request that never settles would leave
            // the row stuck on "Duplicating…" until the page was reloaded.
            const res = await fetch('/api/dev/duplicategame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: gameid }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!res.ok) {
                // The one refusal worth wording: only a live game can be
                // copied, since a copy of a finished one is a board nobody can
                // play and neither dashboard list can show.
                throw new Error(res.status === 409
                    ? 'This game has finished — only a live game can be duplicated.'
                    : `Could not duplicate this game (${res.status}).`);
            }
            const { path }: IDuplicateGameResponse = await res.json();
            // Straight into the copy: the point of duplicating is to carry on
            // playing this position without spending the original.
            router.push(path);
        } catch (error) {
            console.error('Failed to duplicate game', error);
            showToast(error instanceof Error ? error.message : 'Could not duplicate this game.', 'danger');
        } finally {
            setBusy(false);
        }
    }, [busy, gameid, router, showToast]);

    if (!isDevDeployment || !gameid) {
        return null;
    }

    const options: GameOption[] = [{
        key: 'duplicate',
        label: busy ? 'Duplicating…' : 'Duplicate this game',
        icon: '⧉',
        disabled: busy,
        onClick: duplicate,
    }];

    return <GameOptionsMenu options={options} label="Dev tools" trigger="🚧 DEV" triggerClassName="ag-dev-badge" />;
}

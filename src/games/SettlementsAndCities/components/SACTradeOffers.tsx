'use client'
import { useState } from 'react';
import type { ISACSpecificGameStateResponse } from '@/games/SettlementsAndCities/apiModels';
import type { ISACResources, ISACTradeOffer } from '@/games/SettlementsAndCities/board';
import { NO_RESOURCES, SAC_RESOURCES } from '@/games/SettlementsAndCities/board';
import {
    SAC_MAX_OFFERS_POSTED_PER_TURN,
    SAC_MAX_OPEN_OFFERS,
    SAC_MAX_TRADE_AMOUNT,
    sacCanCover,
    sacMainTurnPlayer,
    sacOfferEndsThisTurn,
    sacTradingOpen,
    sacValidTradeTerms,
} from '@/games/SettlementsAndCities/trading';
import { SAC_RESOURCE_EMOJI, sacAmountsText, sacShortfall } from '@/games/SettlementsAndCities/ui';
import { SACAcceptTrade, SACOfferTrade, SACWithdrawTrade } from '@/utils/apiModels/GameLogic';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import ActionButton from '@/components/ui/ActionButton';
import AmountSteppers from '@/components/ui/AmountSteppers';
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import { useToast } from '@/components/ToastContext';
import { capitalise } from '@/utils/ui/text';

interface SACTradeOffersProps {
    gs: ISACSpecificGameStateResponse;
    myUserId: string;
    currentTurn: string;
    playerName: (userId: string) => string;
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
}

/**
 * The table's standing trade offers (docs/games/settlements-and-cities.md §10):
 * every open offer, each saying whether the viewer can fill it, with Accept on
 * everyone else's and Withdraw on their own — and a way to post one. All of it
 * works on anyone's turn, which is why it sits outside the turn sheet's
 * `ReadOnlyPanel` rather than inside it.
 *
 * Whether a row can be filled is read off the viewer's own hand only — the one
 * hand the response carries. Nothing here says whether anyone else could.
 */
export default function SACTradeOffers({ gs, myUserId, currentTurn, playerName, submitCommand, pendingTarget }: SACTradeOffersProps) {
    const { showToast } = useToast();
    const [draft, setDraft] = useState<{ give: ISACResources; want: ISACResources } | null>(null);

    const me = gs.playerStates[myUserId];
    const hand = me?.resources ?? NO_RESOURCES;
    const tradingOpen = sacTradingOpen(gs);
    const mainTurnPlayer = sacMainTurnPlayer(gs, currentTurn);
    const offers = gs.tradeOffers ?? [];
    const myOpen = offers.filter(offer => offer.proposerId === myUserId).length;

    // Why the viewer can't post an offer right now, if they can't.
    const postBlocked = !me ? "You've left this game."
        : !tradingOpen ? 'Trading pauses while the robber moves.'
        : myOpen >= SAC_MAX_OPEN_OFFERS ? `You have ${SAC_MAX_OPEN_OFFERS} offers open — withdraw one to post another.`
        : gs.myTradeOffersPosted >= SAC_MAX_OFFERS_POSTED_PER_TURN ? "You've posted all the offers you can this turn."
        : null;

    const draftShort = draft ? sacShortfall(draft.give, hand) : null;
    const draftValid = !!draft && sacValidTradeTerms(draft.give, draft.want);
    const canPost = !!draft && !postBlocked && draftValid && !draftShort;

    function expiry(offer: ISACTradeOffer, mine: boolean): string {
        if (sacOfferEndsThisTurn(offer, mainTurnPlayer)) return 'open until this turn ends';
        return `open until the end of ${mine ? 'your' : `${playerName(offer.proposerId)}'s`} next turn`;
    }

    function post() {
        if (!draft || !canPost) return;
        const command = new SACOfferTrade();
        command.give = draft.give;
        command.want = draft.want;
        submitCommand(command, () => {
            setDraft(null);
            showToast(`${sacAmountsText(draft.give)} for ${sacAmountsText(draft.want)}`, 'success', 'Offer posted');
        }, 'offerTrade');
    }

    function accept(offer: ISACTradeOffer) {
        const command = new SACAcceptTrade();
        command.offerId = offer.offerId;
        submitCommand(command, () => showToast(
            `You gave ${sacAmountsText(offer.want)} for ${sacAmountsText(offer.give)}`,
            'success',
            `Traded with ${playerName(offer.proposerId)}`,
        ), `acceptTrade:${offer.offerId}`);
    }

    function withdraw(offer: ISACTradeOffer) {
        const command = new SACWithdrawTrade();
        command.offerId = offer.offerId;
        submitCommand(command, undefined, `withdrawTrade:${offer.offerId}`);
    }

    const rows = offers.map(offer => {
        const terms = `${sacAmountsText(offer.give)} for ${sacAmountsText(offer.want)}`;
        if (offer.proposerId === myUserId) {
            const short = sacShortfall(offer.give, hand);
            return (
                <ListRow
                    key={offer.offerId}
                    icon="📣"
                    title={`You offer ${terms}`}
                    sub={[short ? `you'd ${short} to pay` : null, expiry(offer, true)].filter(Boolean).join(' · ')}
                    action={(
                        <ActionButton
                            className="ag-pill-action"
                            pending={pendingTarget === `withdrawTrade:${offer.offerId}`}
                            pendingLabel="Withdrawing…"
                            onClick={() => withdraw(offer)}
                        >
                            Withdraw
                        </ActionButton>
                    )}
                />
            );
        }
        const short = sacShortfall(offer.want, hand);
        const canAccept = !!me && tradingOpen && sacCanCover(hand, offer.want);
        const status = !me ? null
            : !tradingOpen ? 'trading pauses while the robber moves'
            : short ? `you ${short}`
            : 'you can make this trade';
        return (
            <ListRow
                key={offer.offerId}
                icon="🤝"
                title={`${playerName(offer.proposerId)} offers ${terms}`}
                sub={[status, expiry(offer, false)].filter(Boolean).join(' · ')}
                action={(
                    <ActionButton
                        className="ag-pill-action ag-pill-action--accept"
                        disabled={!canAccept}
                        pending={pendingTarget === `acceptTrade:${offer.offerId}`}
                        pendingLabel="Trading…"
                        onClick={() => accept(offer)}
                    >
                        Accept
                    </ActionButton>
                )}
            />
        );
    });

    const composer = draft ? (
        <div className="ag-stack" style={{ marginBottom: 12 }}>
            <p className="ag-hint">You give</p>
            <AmountSteppers
                kinds={SAC_RESOURCES}
                icon={resource => SAC_RESOURCE_EMOJI[resource]}
                title={capitalise}
                amounts={draft.give}
                max={resource => hand[resource]}
                sub={resource => `you have ${hand[resource]}`}
                onChange={give => setDraft({ ...draft, give })}
            />
            <p className="ag-hint">You ask for</p>
            <AmountSteppers
                kinds={SAC_RESOURCES}
                icon={resource => SAC_RESOURCE_EMOJI[resource]}
                title={capitalise}
                amounts={draft.want}
                max={() => SAC_MAX_TRADE_AMOUNT}
                onChange={want => setDraft({ ...draft, want })}
            />
            {draftValid && <div className="ag-trade-preview">
                <span>{sacAmountsText(draft.give)}</span>
                <span className="ag-trade-preview-arrow">→</span>
                <span>{sacAmountsText(draft.want)}</span>
            </div>}
            <p className="ag-hint">
                {postBlocked
                    ?? (draftShort ? `You ${draftShort} to offer that.`
                    : !draftValid ? 'Give something and ask for something else in return.'
                    : 'Anyone else can accept it, on any turn. Nothing leaves your hand until they do.')}
            </p>
            <div className="ag-btn-row">
                <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setDraft(null)}>Cancel</button>
                <ActionButton
                    className="ag-btn ag-btn--primary"
                    disabled={!canPost}
                    pending={pendingTarget === 'offerTrade'}
                    pendingLabel="Posting…"
                    onClick={post}
                >
                    Post offer
                </ActionButton>
            </div>
        </div>
    ) : null;

    return (
        <ListSection
            label="Trade offers"
            showCount
            isLoading={false}
            action={!draft && me ? (
                <button
                    type="button"
                    className="ag-pill-action"
                    disabled={!!postBlocked}
                    title={postBlocked ?? undefined}
                    onClick={() => setDraft({ give: { ...NO_RESOURCES }, want: { ...NO_RESOURCES } })}
                >
                    + New offer
                </button>
            ) : undefined}
            beforeList={composer}
            empty={<p className="ag-hint">No offers on the table. Post one — anyone can take it up on any turn.</p>}
        >
            {rows}
        </ListSection>
    );
}

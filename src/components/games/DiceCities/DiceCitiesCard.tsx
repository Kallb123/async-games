import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import DiceCitiesPlayerActions from "./DiceCitiesPlayerActions";
import { DiceCitiesRequestBusinessCenterOpponentSelection, DiceCitiesRequestBusinessCenterOwnSelection, DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation, IGameCommand } from "@/utils/apiModels/GameLogic";
import { ICommandResponse } from "@/app/api/game/command/route";
import { Button } from "react-bootstrap";
import { uuidString } from "@/utils/apiModels/GameDataApi";

interface DiceCitiesCardProps {
    card: IDiceCitiesCard
}

export default function DiceCitiesCard({card}: DiceCitiesCardProps) {
    const { user, isLoaded } = useUser();
    const [isMe, setIsMe] = useState(false);
    const [myTurn, setMyTurn] = useState(false);

    useEffect(() => {
      if (isLoaded) {

      }
    }, [isLoaded]);

    return (
        <>
            {card.art ?
                <img src={`/art/dicecities/japanese/${card.art}`} />
            : 
            <li title={card.text}>{card.title}</li>}
        </>
    );
}

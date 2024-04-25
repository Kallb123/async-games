import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

interface DiceCitiesCardProps {
    card: IDiceCitiesCard,
    disabled: boolean
}

export default function DiceCitiesCard({card, disabled}: DiceCitiesCardProps) {
    const { user, isLoaded } = useUser();

    useEffect(() => {
      if (isLoaded) {

      }
    }, [isLoaded]);

    return (
        <>
            {card.art ?
                <img src={`/art/dicecities/japanese/${card.art}`} style={disabled ? {filter: "saturate(0)"} : {}} />
            : 
            <li title={card.text}>{card.title}</li>}
        </>
    );
}

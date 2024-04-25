import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import DiceCitiesCard from "./DiceCitiesCard";

interface DiceCitiesCardStackProps {
    card: IDiceCitiesCard,
    amount: number,
    disabled: boolean
}

export default function DiceCitiesCardStack({card, amount, disabled}: DiceCitiesCardStackProps) {
    const { user, isLoaded } = useUser();

    useEffect(() => {
      if (isLoaded) {

      }
    }, [isLoaded]);

    return (
        <div style={{position: "relative", width: `${162+(amount-1)*30}px`, height: "250px"}}>
        {
            [...Array(amount)].map((e, index) => (
                <div style={{position: "absolute", left: `${index*30}px`}}>
                    <DiceCitiesCard key={e} card={card} disabled={disabled}></DiceCitiesCard>
                </div>
            ))
        }
        </div>
    );
}

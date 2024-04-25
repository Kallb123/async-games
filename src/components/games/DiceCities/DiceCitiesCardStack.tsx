import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import DiceCitiesCard from "./DiceCitiesCard";
import { AnimatePresence, motion } from "framer-motion";

const CARD_STACK_OFFSET = 25;

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
        <div style={{position: "relative", width: `${162+(amount-1)*CARD_STACK_OFFSET}px`, height: "250px"}}>
            <AnimatePresence>
                {
                    [...Array(amount)].map((e, index) => (
                        <motion.div key={index} transition={{duration: 1.0, damping: "spring"}} initial={{translateX: "150vw"}} animate={{ translateX: "0vw" }} exit={{ translateX: "150vw" }} style={{position: "absolute", left: `${index*CARD_STACK_OFFSET}px`}}>
                            <DiceCitiesCard card={card} disabled={disabled}></DiceCitiesCard>
                        </motion.div>
                    ))
                }
            </AnimatePresence>
        </div>
    );
}

import type { ICommandResponse } from "@/app/api/game/command/route";
import AnimatedDice from "@/components/AnimatedDice";
import { ISnakesAndLaddersDiceRollOutcome, IGameCommand, SnakesAndLaddersRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button, Col, Row } from "react-bootstrap";

interface SnakesAndLaddersPlayerActionsProps {
    hasRolled: boolean,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function SnakesAndLaddersPlayerActions({ hasRolled, submitCommand }: SnakesAndLaddersPlayerActionsProps) {
    const [rollNumber, setRollNumber] = useState(1);
    const [showDie, setShowDie] = useState(false);

    const rollDice = async () => {
        const diceRoll = new SnakesAndLaddersRequestDiceRoll();
        submitCommand(diceRoll, (commandResponse) => {
            console.log(commandResponse);
            const rollOutcome = commandResponse.outcome as ISnakesAndLaddersDiceRollOutcome;
            setRollNumber(rollOutcome.roll);
            setShowDie(true);
            setTimeout(() => {
                setShowDie(false);
            }, 5000);
        });
    };

    return (
        <>
            <Button onClick={rollDice} disabled={hasRolled}>Roll Dice</Button>
            <Row>
                <Col>
                    <AnimatePresence>
                        {showDie ?
                            <motion.div transition={{ duration: 0.5, type: "spring" }} initial={{ translateX: "150vw", opacity: 1 }} animate={{ translateX: "0vw", opacity: 1 }} exit={{ translateX: "0vw", opacity: 0 }} style={{ position: "relative" }}>
                                <AnimatedDice number={rollNumber} color={"#72b4db"} />
                            </motion.div>
                            : ""}
                    </AnimatePresence>
                </Col>
            </Row>
        </>
    );
}

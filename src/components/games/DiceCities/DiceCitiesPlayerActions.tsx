import type { ICommandResponse } from "@/app/api/game/command/route";
import AnimatedDice from "@/components/AnimatedDice";
import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, DiceCitiesRequestRadioTowerReroll, IDiceCitiesDiceRollOutcome, IGameCommand } from "@/utils/apiModels/GameLogic";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button, Col, Row } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    hasRolled: boolean,
    playerState: IDiceCitiesPlayerStateResponse,
    awaitingSteal: boolean,
    hasReRolled: boolean,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesPlayerActions({playerState, hasRolled, hasReRolled, awaitingSteal, submitCommand}: DiceCitiesPlayerProps) {
    const [roll1Number, setRoll1Number] = useState(1);
    const [showDie1, setShowDie1] = useState(false);
    const [roll2Number, setRoll2Number] = useState(1);
    const [showDie2, setShowDie2] = useState(false);

    const rollDice6 = async () => {
        const diceRoll = new DiceCitiesRequestDiceRoll();
        submitCommand(diceRoll, (commandResponse) => {
            console.log(commandResponse);
            const rollOutcome = commandResponse.outcome as IDiceCitiesDiceRollOutcome;
            // setRoll1Number((6-rollOutcome.roll1)+1);
            setRoll1Number(rollOutcome.roll1);
            setShowDie1(true);
            setTimeout(() => {
                // setRoll1Number(rollOutcome.roll1);
                setShowDie1(false);
            }, 5000);
        });
    }

    const rollDice12 = async () => {
        const diceRoll = new DiceCitiesRequestDiceRoll();
        diceRoll.doubleDice = true;
        submitCommand(diceRoll, (commandResponse) => {
            console.log(commandResponse);
            const rollOutcome = commandResponse.outcome as IDiceCitiesDiceRollOutcome;
            if (!rollOutcome.roll2) {
                return;
            }
            setRoll1Number(rollOutcome.roll1);
            setRoll2Number(rollOutcome.roll2);
            setShowDie1(true);
            setShowDie2(true);
            setTimeout(() => {
                setShowDie1(false);
                setShowDie2(false);
            }, 5000);
        });
    }

    const passTurn = async () => {
        const pass = new DiceCitiesRequestPassTurn();
        submitCommand(pass, (commandResponse) => {
        });
    }

    const reRoll = async () => {
        const reRollCommand = new DiceCitiesRequestRadioTowerReroll();
        submitCommand(reRollCommand, (commandResponse) => {
            console.log(commandResponse);
            const rollOutcome = commandResponse.outcome as IDiceCitiesDiceRollOutcome;
            setRoll1Number(rollOutcome.roll1);
            setShowDie1(true);
            if (rollOutcome.roll2) {
                setRoll2Number(rollOutcome.roll2);
                setShowDie2(true);
            }
            setTimeout(() => {
                setShowDie1(false);
                setShowDie2(false);
            }, 5000);
        });
    }

    const testRoll = async () => {
        setRoll1Number((6-roll1Number)+1);
        setShowDie1(true);
        setRoll2Number((6-roll2Number)+1);
        setShowDie2(true);
        setTimeout(() => {
            setShowDie1(false);
            setShowDie2(false);
        }, 4000);
    }

    return (
        <>
            <Button onClick={rollDice6} disabled={hasRolled || awaitingSteal}>Roll 1 die</Button>
            <Button onClick={rollDice12} disabled={hasRolled || awaitingSteal || !playerState.doubleUnlocked}>Roll 2 dice</Button>
            {playerState.oneReroll ? <Button onClick={reRoll} disabled={!hasRolled || hasReRolled}>Re-roll</Button> : ""}
            <Button onClick={passTurn} disabled={!hasRolled}>Pass Without Buying</Button>
            {/* <Button onClick={testRoll}>Test Dice</Button> */}
            <Row style={{
                // display: "grid",
                // gridTemplateColumns: "1fr"
            }}>
                <Col>
                    <AnimatePresence>
                        {showDie1 ?
                            <motion.div transition={{duration: 0.5, type: "spring"}} initial={{translateX: "150vw", opacity: 1 }} animate={{ translateX: "0vw", opacity: 1 }} exit={{ translateX: "0vw", opacity: 0 }} style={{position: "relative"}}>
                                <AnimatedDice number={roll1Number} color={"#72b4db"} />
                            </motion.div>
                        : ""}
                    </AnimatePresence>
                </Col>
                <Col>
                    <AnimatePresence>
                    {showDie2 ?
                            <motion.div transition={{duration: 0.5, type: "spring"}} initial={{translateX: "150vw", opacity: 1 }} animate={{ translateX: "0vw", opacity: 1 }} exit={{ translateX: "0vw", opacity: 0 }} style={{position: "relative"}}>
                                <AnimatedDice number={roll2Number} color={"#8eb37d"} />
                            </motion.div>
                    : ""}
                    </AnimatePresence>
                </Col>
            </Row>
        </>
    );
}

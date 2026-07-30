import { useEffect, useState } from "react";
import styles from './AnimatedDice.module.css'

interface AnimatedDiceProps {
    number: number,
    color: string
}

export default function AnimatedDice({number, color}: AnimatedDiceProps) {
    // Alternating this on every new number restarts the CSS roll animation.
    const [isEven, setIsEven] = useState(true);

    useEffect(() => {
      const flip = setTimeout(() => setIsEven(even => !even), 200);
      return () => clearTimeout(flip);
    }, [number]);

    return (
        <>
            <div className={`${styles.dice} ${styles.diceElements}`}>
                <ol className={`${styles.dieList} ${styles.diceElements} ${isEven ? styles.evenRoll : styles.oddRoll}`} data-roll={number}>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="1">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="2">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="3">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="4">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="5">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                    <li className={`${styles.dieItem} ${styles.diceElements}`} style={{backgroundColor: color}} data-side="6">
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    <span className={`${styles.dot} ${styles.diceElements}`}></span>
                    </li>
                </ol>
            </div>
            {/* {card.art ?
                <img src={`/art/dicecities/japanese/${card.art}`} style={disabled ? {filter: "saturate(0)"} : {}} />
            : 
            <li title={card.text}>{card.title}</li>} */}
        </>
    );
}

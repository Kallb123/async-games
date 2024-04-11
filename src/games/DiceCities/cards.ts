import { IDiceCitiesCard } from "@/utils/mongodb/GameData";
import { UUID } from "mongodb";

export enum DiceCitiesCardIds {
    WHEAT_FIELD = "2d5aaaa4-e939-43a4-84ab-7ebb89e16ee5",
    RANCH = "ff935104-9d5e-403f-82c7-a01bdaed330d",
    BAKERY = "2e39db49-1ce2-4622-a4c0-38997a6c96c4",
    CAFE = "e88383e3-59fe-4805-9517-acf56b8516dd",
    CONVENIENCE_STORE = "a64cea71-c38d-46cb-8574-8e9e70403ae6",
}

const wheatField: IDiceCitiesCard = {
    cardId: new UUID("2d5aaaa4-e939-43a4-84ab-7ebb89e16ee5"),
    title: "Wheat Field",
    cost: 1,
    rollNumber: [1],
    text: "Get 1 coin from the bank, on anyone's turn.",
    art: "",
    type: "farm",
    icon: "",
    ownLimit: 20,
    bankGain: 1,
    onOwnTurn: true,
    onOponentsTurn: true,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const ranch: IDiceCitiesCard = {
    cardId: new UUID("ff935104-9d5e-403f-82c7-a01bdaed330d"),
    title: "Ranch",
    cost: 1,
    rollNumber: [2],
    text: "Get 1 coin from the bank, on anyone's turn.",
    art: "",
    type: "pasture",
    icon: "",
    ownLimit: 20,
    bankGain: 1,
    onOwnTurn: true,
    onOponentsTurn: true,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const bakery: IDiceCitiesCard = {
    cardId: new UUID("2e39db49-1ce2-4622-a4c0-38997a6c96c4"),
    title: "Bakery",
    cost: 1,
    rollNumber: [2, 3],
    text: "Get 1 coin from the bank, on your turn only.",
    art: "",
    type: "store",
    icon: "",
    ownLimit: 20,
    bankGain: 1,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const cafe: IDiceCitiesCard = {
    cardId: new UUID("e88383e3-59fe-4805-9517-acf56b8516dd"),
    title: "Cafe",
    cost: 2,
    rollNumber: [3],
    text: "Get 1 coin from the player who rolled the dice.",
    art: "",
    type: "dining",
    icon: "",
    ownLimit: 20,
    bankGain: 0,
    onOwnTurn: false,
    onOponentsTurn: true,
    stealRollerGain: 1,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const convenienceStore: IDiceCitiesCard = {
    cardId: new UUID("a64cea71-c38d-46cb-8574-8e9e70403ae6"),
    title: "Convenience Store",
    cost: 2,
    rollNumber: [4],
    text: "Get 3 coins from the bank, on your turn only.",
    art: "",
    type: "store",
    icon: "",
    ownLimit: 20,
    bankGain: 3,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

export const DiceCitiesCards: { [key: string]: IDiceCitiesCard } = {
    "2d5aaaa4-e939-43a4-84ab-7ebb89e16ee5": wheatField,
    "ff935104-9d5e-403f-82c7-a01bdaed330d": ranch,
    "2e39db49-1ce2-4622-a4c0-38997a6c96c4": bakery,
    "e88383e3-59fe-4805-9517-acf56b8516dd": cafe,
    "a64cea71-c38d-46cb-8574-8e9e70403ae6": convenienceStore,
}

import { IDiceCitiesCard } from "./apiModels";

// The whole coin supply of a Dice Cities game. Every coin a player holds came
// out of the bank (starting coins, dice payouts) and every coin they spend on a
// card goes straight back in, so the bank plus all the players' purses always
// add up to exactly this. A payout the bank can't cover is paid short rather
// than minting coins that don't exist.
export const BANK_TOTAL_COINS = 60;

// Coins each player is dealt out of the bank when the game is created.
export const STARTING_PLAYER_COINS = 3;

export enum DiceCitiesCardIds {
    WHEAT_FIELD = "2d5aaaa4-e939-43a4-84ab-7ebb89e16ee5",
    RANCH = "ff935104-9d5e-403f-82c7-a01bdaed330d",
    BAKERY = "2e39db49-1ce2-4622-a4c0-38997a6c96c4",
    CAFE = "e88383e3-59fe-4805-9517-acf56b8516dd",
    FAMILY_RESTAURANT = "f8962796-e8f1-4d2e-a6ae-cf16b4b111aa",
    CONVENIENCE_STORE = "a64cea71-c38d-46cb-8574-8e9e70403ae6",
    FOREST = "0973e5a9-33dc-4cbc-9894-49ab6d0d81a5",
    MINE = "0d467870-047b-4ab7-9ff4-73329432374b",
    APPLE_ORCHARD = "f4e6dfc0-7d0a-430b-b207-6ec7dafb7e6b",
    CHEESE_FACTORY = "5c5ffacd-be5c-4581-aca9-54344aab183c",
    FURNITURE_FACTORY = "3bc8d1dd-a387-4e48-89bf-923e0bcfdb04",
    FRUIT_MARKET = "f8dd441e-5bed-444f-9659-b025d769af92",
    STADIUM = "bfc9001e-bddf-40c0-a61b-1ecd2d70cbfe",
    TV_STATION = "9a7c01d1-8513-4b69-af68-f0e04d57cbfe",
    BUSINESS_CENTER = "a08ebbbe-21af-43bf-b92e-892559213e6d",
    TRAIN_STATION = "5ca38fd7-eef0-4155-b5bb-8ff07ff5305a",
    SHOPPING_MALL = "8a5ca6e4-f987-4273-b1eb-e1cc9e855c10",
    AMUSEMENT_PARK = "a16f6202-ad15-41b9-a3f6-d5302acc033f",
    RADIO_TOWER = "a8df8c37-e3b0-45d4-acc2-09815a151c04"
}

const wheatField: IDiceCitiesCard = {
    cardId: "2d5aaaa4-e939-43a4-84ab-7ebb89e16ee5",
    title: "Wheat Field",
    cost: 1,
    rollNumber: [1],
    text: "Get 1 coin from the bank, on anyone's turn.",
    art: "wheat-field.png",
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
    cardId: "ff935104-9d5e-403f-82c7-a01bdaed330d",
    title: "Ranch",
    cost: 1,
    rollNumber: [2],
    text: "Get 1 coin from the bank, on anyone's turn.",
    art: "ranch.png",
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
    cardId: "2e39db49-1ce2-4622-a4c0-38997a6c96c4",
    title: "Bakery",
    cost: 1,
    rollNumber: [2, 3],
    text: "Get 1 coin from the bank, on your turn only.",
    art: "bakery.png",
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
    cardId: "e88383e3-59fe-4805-9517-acf56b8516dd",
    title: "Cafe",
    cost: 2,
    rollNumber: [3],
    text: "Get 1 coin from the player who rolled the dice.",
    art: "cafe.png",
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

const familyRestaurant: IDiceCitiesCard = {
    cardId: "f8962796-e8f1-4d2e-a6ae-cf16b4b111aa",
    title: "Family Restaurant",
    cost: 3,
    rollNumber: [9,10],
    text: "Get 2 coins from the player who rolled the dice.",
    art: "family-restaurant.png",
    type: "dining",
    icon: "",
    ownLimit: 20,
    bankGain: 0,
    onOwnTurn: false,
    onOponentsTurn: true,
    stealRollerGain: 2,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const convenienceStore: IDiceCitiesCard = {
    cardId: "a64cea71-c38d-46cb-8574-8e9e70403ae6",
    title: "Convenience Store",
    cost: 2,
    rollNumber: [4],
    text: "Get 3 coins from the bank, on your turn only.",
    art: "convenience-store.png",
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

const forest: IDiceCitiesCard = {
    cardId: "0973e5a9-33dc-4cbc-9894-49ab6d0d81a5",
    title: "Forest",
    cost: 3,
    rollNumber: [5],
    text: "Get 1 coin from the bank, on anyone's turn.",
    art: "forest.png",
    type: "production",
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

const mine: IDiceCitiesCard = {
    cardId: "0d467870-047b-4ab7-9ff4-73329432374b",
    title: "Mine",
    cost: 6,
    rollNumber: [9],
    text: "Get 5 coins from the bank, on anyone's turn.",
    art: "mine.png",
    type: "production",
    icon: "",
    ownLimit: 20,
    bankGain: 5,
    onOwnTurn: true,
    onOponentsTurn: true,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const appleOrchard: IDiceCitiesCard = {
    cardId: "f4e6dfc0-7d0a-430b-b207-6ec7dafb7e6b",
    title: "Apple Orchard",
    cost: 3,
    rollNumber: [10],
    text: "Get 3 coins from the bank, on anyone's turn.",
    art: "apple-orchard.png",
    type: "farm",
    icon: "",
    ownLimit: 20,
    bankGain: 3,
    onOwnTurn: true,
    onOponentsTurn: true,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const cheeseFactory: IDiceCitiesCard = {
    cardId: "5c5ffacd-be5c-4581-aca9-54344aab183c",
    title: "Cheese Factory",
    cost: 5,
    rollNumber: [7],
    text: "If this is your turn, get 3 coins from the bank for each Pasture establishment that you own",
    art: "cheese-factory.png",
    type: "factory",
    icon: "",
    ownLimit: 20,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: {
        type: ["pasture"],
        amountPerType: 3
    }
}

const furnitureFactory: IDiceCitiesCard = {
    cardId: "3bc8d1dd-a387-4e48-89bf-923e0bcfdb04",
    title: "Furniture Factory",
    cost: 3,
    rollNumber: [8],
    text: "If this is your turn, get 3 coins from the bank for each Production establishment that you own",
    art: "furniture-factory.png",
    type: "factory",
    icon: "",
    ownLimit: 20,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: {
        type: ["production"],
        amountPerType: 3
    }
}

const fruitAndVegetableMarket: IDiceCitiesCard = {
    cardId: "f8dd441e-5bed-444f-9659-b025d769af92",
    title: "Fruit and Vegetable Market",
    cost: 2,
    rollNumber: [11.12],
    text: "If this is your turn, get 2 coins from the bank for each Farm establishment that you own",
    art: "fruit-market.png",
    type: "market",
    icon: "",
    ownLimit: 20,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: {
        type: ["farm"],
        amountPerType: 2
    }
}

const stadium: IDiceCitiesCard = {
    cardId: "bfc9001e-bddf-40c0-a61b-1ecd2d70cbfe",
    title: "Stadium",
    cost: 6,
    rollNumber: [6],
    text: "Get 2 coins from all players, on your turn only.",
    art: "stadium.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 2,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const tvStation: IDiceCitiesCard = {
    cardId: "9a7c01d1-8513-4b69-af68-f0e04d57cbfe",
    title: "TV Station",
    cost: 7,
    rollNumber: [6],
    text: "If this is your turn, take 5 coins from any one player.",
    art: "tv-station.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 5,
    tradeCards: false,
    gainMultiplier: null
}

const businessCenter: IDiceCitiesCard = {
    cardId: "a08ebbbe-21af-43bf-b92e-892559213e6d",
    title: "Business Center",
    cost: 8,
    rollNumber: [6],
    text: "If this is your turn, trade one non-Landmark establishment with another player.",
    art: "business-center.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: true,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: true,
    gainMultiplier: null
}

const trainStation: IDiceCitiesCard = {
    cardId: "5ca38fd7-eef0-4155-b5bb-8ff07ff5305a",
    title: "Train Station",
    cost: 4,
    rollNumber: [],
    text: "You may roll 1 or 2 dice.",
    art: "station.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: false,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const shoppingMall: IDiceCitiesCard = {
    cardId: "8a5ca6e4-f987-4273-b1eb-e1cc9e855c10",
    title: "Shopping Mall",
    cost: 10,
    rollNumber: [],
    text: "Earn +1 coin from your own dining and store establishments.",
    art: "shopping-mall.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: false,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const amusementPark: IDiceCitiesCard = {
    cardId: "a16f6202-ad15-41b9-a3f6-d5302acc033f",
    title: "Amusement Park",
    cost: 16,
    rollNumber: [],
    text: "If you roll matching dice, take another turn after this one.",
    art: "amusement-park.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: false,
    onOponentsTurn: false,
    stealRollerGain: 0,
    stealAllGain: 0,
    stealChosenGain: 0,
    tradeCards: false,
    gainMultiplier: null
}

const radioTower: IDiceCitiesCard = {
    cardId: "a8df8c37-e3b0-45d4-acc2-09815a151c04",
    title: "Radio Tower",
    cost: 22,
    rollNumber: [],
    text: "Once every turn, you can choose to re-roll your dice.",
    art: "radio-tower.png",
    type: "landmark",
    icon: "",
    ownLimit: 1,
    bankGain: 0,
    onOwnTurn: false,
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
    "f8962796-e8f1-4d2e-a6ae-cf16b4b111aa": familyRestaurant,
    "a64cea71-c38d-46cb-8574-8e9e70403ae6": convenienceStore,
    "0973e5a9-33dc-4cbc-9894-49ab6d0d81a5": forest,
    "0d467870-047b-4ab7-9ff4-73329432374b": mine,
    "f4e6dfc0-7d0a-430b-b207-6ec7dafb7e6b": appleOrchard,
    "5c5ffacd-be5c-4581-aca9-54344aab183c": cheeseFactory,
    "3bc8d1dd-a387-4e48-89bf-923e0bcfdb04": furnitureFactory,
    "f8dd441e-5bed-444f-9659-b025d769af92": fruitAndVegetableMarket,
    "bfc9001e-bddf-40c0-a61b-1ecd2d70cbfe": stadium,
    "9a7c01d1-8513-4b69-af68-f0e04d57cbfe": tvStation,
    "a08ebbbe-21af-43bf-b92e-892559213e6d": businessCenter,
    "5ca38fd7-eef0-4155-b5bb-8ff07ff5305a": trainStation,
    "8a5ca6e4-f987-4273-b1eb-e1cc9e855c10": shoppingMall,
    "a16f6202-ad15-41b9-a3f6-d5302acc033f": amusementPark,
    "a8df8c37-e3b0-45d4-acc2-09815a151c04": radioTower
}

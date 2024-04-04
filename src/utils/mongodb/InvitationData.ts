export interface UserIdAcceptance {
    userId: string,
    inviteAccepted: boolean
}

export interface InvitationData {
    inviteId: `${string}-${string}-${string}-${string}-${string}`,
    senderId: string,
    userIdList: UserIdAcceptance[],
    turnTimer: string,
    timestamp: string
}

export interface InvitationRequest {
    userList: string[],
    turnTimer: string
}

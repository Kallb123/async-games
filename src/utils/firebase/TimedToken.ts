export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** What we can tell about the device a push token was registered from. */
export interface DeviceInfo {
    type: DeviceType;
    /** e.g. "iPhone", "Windows", "Android". Absent when the user agent is unrecognised. */
    os?: string;
    /** e.g. "Safari", "Chrome". Absent when the user agent is unrecognised. */
    browser?: string;
}

interface TimedToken {
    token: string;
    /** ISO timestamp of when this device first registered for push. */
    timestamp: string;
    /** ISO timestamp of the most recent registration refresh from this device. */
    lastSeen?: string;
    /** Device this token was last registered from. Absent on tokens stored
     *  before device tracking existed. */
    device?: DeviceInfo;
}

/** A registered device as shown to its owner — never includes the raw FCM token. */
export interface RegisteredDevice {
    /** Stable, non-secret handle used to delete this device. */
    id: string;
    /** Human label, e.g. "iPhone · Safari". */
    name: string;
    type: DeviceType;
    registeredAt: string;
    lastSeenAt: string;
}

export default TimedToken;

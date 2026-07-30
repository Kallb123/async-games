import { useSyncExternalStore } from "react";

const supported = () => typeof window !== "undefined" && "Notification" in window;

// Nothing to subscribe to: the browser fires no event for a permission change,
// and the one place that asks for permission reloads the page afterwards. So the
// value is read once per mount and stays put, exactly as before.
const subscribe = () => () => {};

const getSnapshot = () => supported() && Notification.permission === "granted";

// The server can't know what the browser granted, so it renders "not granted"
// and the real answer arrives on hydration.
const getServerSnapshot = () => false;

// Whether this browser has granted notification permission.
//
// Reading `Notification.permission` during render would break hydration, and
// copying it into state from an effect is a synchronous setState in an effect
// body (react-hooks/set-state-in-effect). It's a browser-owned value, so it's
// read as the external store it is.
export function useNotificationPermission(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

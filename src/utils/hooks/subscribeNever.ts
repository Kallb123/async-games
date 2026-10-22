/**
 * The `subscribe` for a `useSyncExternalStore` whose value never changes under a
 * mounted component: one read on the server and one in the browser is all it
 * takes (the time before hydration, a cookie, whether the HTML came from the
 * server).
 */
export const subscribeNever = () => () => {};

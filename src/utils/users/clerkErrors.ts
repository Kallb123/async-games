// The first Clerk error worth showing, in the player's own words — falls back
// to something generic for whatever isn't a Clerk-shaped rejection (a network
// error, say). Duck-typed rather than importing an error class to narrow this:
// Clerk's frontend and Backend API errors carry `errors` in the same shape, and
// that's the only part read here — so one helper serves both the routes that
// write with the backend client and the screens that write with the frontend
// one ("That username is taken." comes back this way).
export function clerkErrorMessage(error: unknown, fallback: string): string {
    const errors = (error as { errors?: { longMessage?: string; message?: string }[] } | null)?.errors;
    const first = errors?.[0];
    return first?.longMessage || first?.message || fallback;
}

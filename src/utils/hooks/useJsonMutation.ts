'use client'

import { useRef, useState } from "react";

import { REQUEST_TIMEOUT_MS } from "./fetchWithSessionRetry";
import { useSessionRefresh } from "./useAuthGuard";

/** Shared guarded JSON POST state for small screens that update their loaded view in place. */
export function useJsonMutation<T>(endpoint: string, fallbackMessage: string) {
    const [isPending, setIsPending] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const submittingRef = useRef(false);
    const refreshSession = useSessionRefresh();

    const submit = async (body: unknown): Promise<T | null> => {
        if (submittingRef.current) return null;
        submittingRef.current = true;
        setIsPending(true);
        setMessage(null);
        try {
            const request = () => fetch(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            let response = await request();
            if (response.status === 401) {
                await refreshSession();
                response = await request();
            }
            const result = await response.json().catch(() => null) as (T & { error?: string }) | null;
            if (!response.ok || !result) throw new Error(result?.error ?? fallbackMessage);
            return result;
        } catch (error) {
            console.error(`POST ${endpoint} failed`, error);
            setMessage(error instanceof Error && error.message ? error.message : fallbackMessage);
            return null;
        } finally {
            submittingRef.current = false;
            setIsPending(false);
        }
    };

    return { submit, isPending, message };
}

'use client'

import { useToast } from "@/components/ToastContext";
import ListSection from "@/components/ui/ListSection";
import { RegisteredDevice } from "@/utils/firebase/TimedToken";
import { deviceGlyph, deviceIdForToken, STALE_DEVICE_DAYS } from "@/utils/firebase/deviceInfo";
import { formatRelativeTime } from "@/utils/ui/time";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useEffect, useState } from "react";

/**
 * The signed-in user's push-registered devices, with a remove action.
 * `currentToken` (from `useFcmToken`) is only used to badge the row for the
 * device you're on right now.
 */
export default function NotificationDeviceList({ currentToken }: { currentToken?: string }) {
    const { showToast } = useToast();
    const { data, isLoading, isRefreshing, refresh } = useRefreshableData<{ devices: RegisteredDevice[] }>('/api/notificationtoken');
    const [removingId, setRemovingId] = useState<string | null>(null);
    const currentId = currentToken ? deviceIdForToken(currentToken) : undefined;
    const devices = data?.devices ?? [];

    // Registering this device's token adds a row, so re-read once it arrives.
    useEffect(() => {
        if (currentToken) {
            refresh();
        }
    }, [currentToken, refresh]);

    const removeDevice = async (device: RegisteredDevice) => {
        if (removingId) return;
        if (!window.confirm(`Stop sending notifications to ${device.name}?`)) return;
        setRemovingId(device.id);
        try {
            const response = await fetch('/api/notificationtoken', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: device.id })
            });
            if (!response.ok) throw new Error('Failed to remove device');
            await refresh();
            showToast('Device removed.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to remove that device.', 'danger');
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <ListSection
            label="Your devices"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            hasItems={devices.length > 0}
            hint={<>
                A removed device stops getting notifications until you next open Async Games on it.
                Devices you haven&apos;t used for {STALE_DEVICE_DAYS} days are forgotten automatically.
            </>}
        >
            {devices.map((device) => (
                <div key={device.id} className="ag-list-row">
                    <span className="ag-icon-box" aria-hidden>{deviceGlyph(device.type)}</span>
                    <div className="ag-list-row-main">
                        <div className="ag-list-row-title">
                            {device.name}
                            {device.id === currentId && <span className="ag-tag">This device</span>}
                        </div>
                        <div className="ag-list-row-sub">
                            Added {formatRelativeTime(device.registeredAt)} · last active {formatRelativeTime(device.lastSeenAt)}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ag-link-muted"
                        onClick={() => removeDevice(device)}
                        disabled={removingId !== null}
                    >
                        {removingId === device.id ? 'Removing…' : 'Remove'}
                    </button>
                </div>
            ))}
        </ListSection>
    );
}

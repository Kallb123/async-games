'use client'

import { useToast } from "@/components/ToastContext";
import ListSection from "@/components/ui/ListSection";
import { RegisteredDevice } from "@/utils/firebase/TimedToken";
import { deviceGlyph, deviceIdForToken, STALE_DEVICE_DAYS } from "@/utils/firebase/deviceInfo";
import { formatRelativeTime } from "@/utils/ui/time";
import { useEffect, useState } from "react";

/**
 * The signed-in user's push-registered devices, with a remove action.
 * `currentToken` (from `useFcmToken`) is only used to badge the row for the
 * device you're on right now.
 */
export default function NotificationDeviceList({ currentToken }: { currentToken?: string }) {
    const { showToast } = useToast();
    const [devices, setDevices] = useState<RegisteredDevice[] | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const currentId = currentToken ? deviceIdForToken(currentToken) : undefined;

    useEffect(() => {
        fetch('/api/notificationtoken')
            .then(response => response.json())
            .then(data => setDevices(data.devices ?? []))
            .catch(error => {
                console.error('Failed to load notification devices', error);
                setDevices([]);
            });
    }, [currentToken]);

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
            const data = await response.json();
            setDevices(data.devices ?? []);
            showToast('Device removed.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to remove that device.', 'danger');
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <ListSection label="Your devices" isLoading={devices === null} hasItems={(devices?.length ?? 0) > 0}>
            <div className="ag-list">
                {devices?.map((device) => (
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
            </div>
            <p className="ag-hint">
                A removed device stops getting notifications until you next open Async Games on it.
                Devices you haven&apos;t used for {STALE_DEVICE_DAYS} days are forgotten automatically.
            </p>
        </ListSection>
    );
}

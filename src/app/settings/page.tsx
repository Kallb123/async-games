'use client'

import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import DevTools from "@/components/DevTools";
import NotificationDeviceList from "@/components/NotificationDeviceList";
import { NotificationChannel, NOTIFICATION_CHANNELS } from "@/utils/firebase/notificationPreferences";
import useFcmToken from "@/utils/hooks/useFcmToken";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import packageJson from "@/../package.json";

interface NotificationPreferencesState {
    enabled: boolean;
    channels: Record<NotificationChannel, boolean>;
}

export default function Settings() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { isAuthorised } = useAuthGuard();
    const { showToast } = useToast();
    const { fcmToken } = useFcmToken();

    const [prefs, setPrefs] = useState<NotificationPreferencesState | null>(null);
    const [isSavingPrefs, setIsSavingPrefs] = useState(false);
    const [hasPrefPermission, setHasPrefPermission] = useState(false);

    useEffect(() => {
        if (isAuthorised) {
            refreshPreferences();
        }
    }, [isAuthorised]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setHasPrefPermission(Notification.permission === 'granted');
        }
    }, []);

    const refreshPreferences = () => {
        fetch('/api/notificationpreferences')
            .then(response => response.json())
            .then(data => {
                if (data && data.preferences) {
                    setPrefs(data.preferences);
                }
            })
            .catch(error => console.error('Failed to load notification preferences', error));
    }

    const enableNotifications = () => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            Notification.requestPermission().then(() => window.location.reload());
        }
    };

    const updatePreferences = async (patch: { enabled?: boolean; channels?: Partial<Record<NotificationChannel, boolean>> }) => {
        if (!prefs || isSavingPrefs) return;
        setIsSavingPrefs(true);
        const next: NotificationPreferencesState = {
            enabled: patch.enabled !== undefined ? patch.enabled : prefs.enabled,
            channels: { ...prefs.channels, ...(patch.channels ?? {}) }
        };
        setPrefs(next);
        try {
            const response = await fetch('/api/notificationpreferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next)
            });
            if (!response.ok) throw new Error('Failed to save preferences');
            const data = await response.json();
            if (data.preferences) {
                setPrefs(data.preferences);
            }
        } catch (error) {
            console.error(error);
            showToast('Failed to save notification preferences.', 'danger');
            refreshPreferences();
        } finally {
            setIsSavingPrefs(false);
        }
    };

    const toggleMaster = () => {
        if (!hasPrefPermission) {
            enableNotifications();
            return;
        }
        updatePreferences({ enabled: !prefs?.enabled });
    };

    const toggleChannel = (channel: NotificationChannel) => {
        if (!prefs) return;
        updatePreferences({ channels: { [channel]: !prefs.channels[channel] } });
    };

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <a href="/profile" className="ag-back" aria-label="Back to profile">←</a>
                    <span className="ag-wordmark">Settings</span>
                </div>
            </div>

            {/* Notifications */}
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Notifications</h2>
                </div>

                {!hasPrefPermission && (
                    <div className="ag-cta" style={{ background: "oklch(0.35 0.04 45)", color: "var(--ag-on-dark)" }}>
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">Push notifications</div>
                            <div className="ag-cta-sub">Enable push so we can nudge you when it&apos;s your move.</div>
                        </div>
                        <button type="button" className="ag-btn ag-btn--light" onClick={enableNotifications}>Enable</button>
                    </div>
                )}

                {hasPrefPermission && (
                    <div className="ag-list" aria-describedby={prefs && !prefs.enabled ? "notifications-paused-hint" : undefined}>
                        <OptionToggleRow
                            title="All notifications"
                            description="Pause everything, or choose per channel below"
                            on={prefs?.enabled ?? false}
                            onToggle={toggleMaster}
                            disabled={isSavingPrefs}
                            ariaLabel="Toggle all notifications"
                        />
                    </div>
                )}

                {hasPrefPermission && prefs && !prefs.enabled && (
                    <p id="notifications-paused-hint" className="ag-disabled-hint">Notifications are paused. Channel settings will take effect again once you turn notifications back on.</p>
                )}

                {hasPrefPermission && prefs?.enabled && (
                    <div className="ag-list" style={{ marginTop: 12 }}>
                        {NOTIFICATION_CHANNELS.map((channel) => (
                            <OptionToggleRow
                                key={channel.key}
                                title={channel.label}
                                description={channel.description}
                                on={prefs.channels[channel.key]}
                                onToggle={() => toggleChannel(channel.key)}
                                disabled={isSavingPrefs}
                                ariaLabel={`Toggle ${channel.label} notifications`}
                            />
                        ))}
                    </div>
                )}
            </div>

            <NotificationDeviceList currentToken={fcmToken} />

            <div className="ag-footer">
                <DevTools />
                <div style={{ fontSize: '0.875rem', color: 'var(--ag-text-muted)', textAlign: 'center', marginTop: '1rem' }}>
                    v{packageJson.version}
                </div>
            </div>

            <FcmTokenComp />
        </main>
    );
}

'use client'

import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import BackLink from "@/components/ui/BackLink";
import LegalLinks from "@/components/ui/LegalLinks";
import DevTools from "@/components/DevTools";
import NotificationDeviceList from "@/components/NotificationDeviceList";
import InstallOffer from "@/components/ui/InstallOffer";
import NotificationOffer from "@/components/ui/NotificationOffer";
import { NotificationChannel, NOTIFICATION_CHANNELS } from "@/utils/firebase/notificationPreferences";
import { requestNotificationPermission, useNotificationPermission } from "@/utils/hooks/useNotificationPermission";
import useFcmToken from "@/utils/hooks/useFcmToken";
import { useInstallPrompt } from "@/utils/hooks/useInstallPrompt";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
    const installMethod = useInstallPrompt();

    const [prefs, setPrefs] = useState<NotificationPreferencesState | null>(null);
    const [isSavingPrefs, setIsSavingPrefs] = useState(false);
    // Shared with the bottom banner, so granting from either updates both.
    const permission = useNotificationPermission();
    const hasPrefPermission = permission === 'granted';

    const refreshPreferences = useCallback(() => {
        fetch('/api/notificationpreferences')
            .then(response => response.json())
            .then(data => {
                if (data && data.preferences) {
                    setPrefs(data.preferences);
                }
            })
            .catch(error => console.error('Failed to load notification preferences', error));
    }, []);

    useEffect(() => {
        if (isAuthorised) {
            refreshPreferences();
        }
    }, [isAuthorised, refreshPreferences]);

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
            requestNotificationPermission();
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
                    <BackLink href="/profile" label="Back to profile" />
                    <span className="ag-wordmark">Settings</span>
                </div>
            </div>

            {/* Notifications */}
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Notifications</h2>
                </div>

                {/* The same offer the bottom banner makes, for anyone who
                    dismissed it. Hidden in a browser that cannot receive push. */}
                {(permission === 'default' || permission === 'denied') && (
                    <NotificationOffer permission={permission} />
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

            {/* The same offer the bottom banner makes, for anyone who dismissed
                it. Hidden once the app is installed, or in a browser that
                cannot install it. */}
            {installMethod !== 'none' && (
                <div className="ag-section">
                    <div className="ag-section-head">
                        <h2 className="ag-section-label">App</h2>
                    </div>
                    <InstallOffer method={installMethod} />
                </div>
            )}

            <div className="ag-footer">
                <DevTools />
                <LegalLinks />
                <div style={{ fontSize: '0.875rem', color: 'var(--ag-text-muted)', textAlign: 'center', marginTop: '0.75rem' }}>
                    v{packageJson.version}
                </div>
            </div>

            <FcmTokenComp />
        </main>
    );
}

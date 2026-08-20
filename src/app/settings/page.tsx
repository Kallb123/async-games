'use client'

import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import BackLink from "@/components/ui/BackLink";
import DevTools from "@/components/DevTools";
import NotificationDeviceList from "@/components/NotificationDeviceList";
import InstallOffer from "@/components/ui/InstallOffer";
import { NotificationChannel, NOTIFICATION_CHANNELS } from "@/utils/firebase/notificationPreferences";
import { pushSupported } from "@/utils/firebase/pushSupport";
import useFcmToken from "@/utils/hooks/useFcmToken";
import { useInstallPrompt } from "@/utils/hooks/useInstallPrompt";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import packageJson from "@/../package.json";

// Whether this browser granted notification permission. Reading it during
// render would break hydration and copying it into state from an effect is a
// synchronous setState in an effect body (react-hooks/set-state-in-effect), so
// it's read as the browser-owned value it is. Nothing to subscribe to: the
// browser fires no event for a permission change, and `enableNotifications`
// below reloads the page after asking.
const subscribePermission = () => () => {};
const getPermission = () => pushSupported() && Notification.permission === 'granted';
const getServerPermission = () => false;

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
    const hasPrefPermission = useSyncExternalStore(subscribePermission, getPermission, getServerPermission);

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

    const enableNotifications = () => {
        if (pushSupported()) {
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
                    <BackLink href="/profile" label="Back to profile" />
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
                <div style={{ fontSize: '0.875rem', color: 'var(--ag-text-muted)', textAlign: 'center', marginTop: '1rem' }}>
                    v{packageJson.version}
                </div>
            </div>

            <FcmTokenComp />
        </main>
    );
}

'use client'

import { FcmTokenComp } from "@/components/FirebaseForeground";
import ActionButton from "@/components/ui/ActionButton";
import { useToast } from "@/components/ToastContext";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import BackLink from "@/components/ui/BackLink";
import Section from "@/components/ui/Section";
import LegalLinks from "@/components/ui/LegalLinks";
import DevTools from "@/components/DevTools";
import NotificationDeviceList from "@/components/NotificationDeviceList";
import InstallOffer from "@/components/ui/InstallOffer";
import NotificationOffer from "@/components/ui/NotificationOffer";
import ClaimAccountForm from "@/components/ClaimAccountForm";
import { isGuest } from "@/utils/ui/players";
import { NotificationChannel, NOTIFICATION_CHANNELS } from "@/utils/firebase/notificationPreferences";
import { requestNotificationPermission, useNotificationPermission } from "@/utils/hooks/useNotificationPermission";
import useFcmToken from "@/utils/hooks/useFcmToken";
import { useInstallPrompt } from "@/utils/hooks/useInstallPrompt";
import { useAppVersion } from "@/utils/hooks/useAppVersion";
import { useHydrated } from "@/utils/hooks/useNow";
import { formatBuildTime } from "@/utils/ui/time";
import { BUILD_TIME } from "@/utils/buildInfo";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import packageJson from "@/../package.json";

interface NotificationPreferencesState {
    enabled: boolean;
    channels: Record<NotificationChannel, boolean>;
}

export default function Settings() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isAuthorised } = useAuthGuard();
    const { signOut } = useClerk();
    const router = useRouter();
    const { showToast } = useToast();
    const { fcmToken } = useFcmToken();
    const installMethod = useInstallPrompt();
    // Native shell only — the version of the wrapper, which is not the version
    // of the site it is showing.
    const appVersion = useAppVersion();
    // Local time, so only the browser can format it — nothing to show until it has.
    const hydrated = useHydrated();

    const [prefs, setPrefs] = useState<NotificationPreferencesState | null>(null);
    const [isSavingPrefs, setIsSavingPrefs] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    // Shared with the bottom banner, so granting from either updates both.
    const permission = useNotificationPermission();
    const hasPrefPermission = permission === 'granted';
    // First load only. Preferences default to everything on, so the channel
    // rows are shown loading rather than withheld — the list that lands is
    // almost always the one the placeholders promised.
    const isLoadingPrefs = hasPrefPermission && !prefs;

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

    const deleteAccount = async () => {
        if (isDeletingAccount) return;
        if (!window.confirm("Delete your account? Your games, invites, results and friend connections go with it — including for the people you played — and this can't be undone.")) return;
        setIsDeletingAccount(true);
        try {
            const response = await fetch('/api/user/delete', { method: 'POST' });
            if (!response.ok) throw new Error('Failed to delete account');
            // The account is gone and Clerk has already revoked the session, so
            // a failure signing out just means the local copy was stale.
            await signOut().catch(() => {});
            router.push('/');
        } catch (error) {
            console.error('Failed to delete account', error);
            showToast('Failed to delete your account. Please try again.', 'danger');
            setIsDeletingAccount(false);
        }
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
            <Section label="Notifications">
                {/* The same offer the bottom banner makes, for anyone who
                    dismissed it. Hidden in a browser that cannot receive push. */}
                {(permission === 'default' || permission === 'denied') && (
                    <NotificationOffer permission={permission} />
                )}

                {/* Said out loud rather than left blank: this section used to
                    render nothing at all here, so a player whose browser can't
                    do push saw an empty "Notifications" heading and no reason
                    for it. */}
                {permission === 'unsupported' && (
                    <div className="ag-callout">
                        This browser can&apos;t receive notifications. Open Async Games in
                        Chrome, Edge or Safari — or install it to your home screen — and
                        the settings will appear here.
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
                            loading={isLoadingPrefs}
                            ariaLabel="Toggle all notifications"
                        />
                    </div>
                )}

                {hasPrefPermission && prefs && !prefs.enabled && (
                    <p id="notifications-paused-hint" className="ag-disabled-hint">Notifications are paused. Channel settings will take effect again once you turn notifications back on.</p>
                )}

                {hasPrefPermission && (!prefs || prefs.enabled) && (
                    <div className="ag-list" style={{ marginTop: 12 }}>
                        {NOTIFICATION_CHANNELS.map((channel) => (
                            <OptionToggleRow
                                key={channel.key}
                                title={channel.label}
                                description={channel.description}
                                on={prefs?.channels[channel.key] ?? false}
                                onToggle={() => toggleChannel(channel.key)}
                                disabled={isSavingPrefs}
                                loading={isLoadingPrefs}
                                ariaLabel={`Toggle ${channel.label} notifications`}
                            />
                        ))}
                    </div>
                )}
            </Section>

            <NotificationDeviceList currentToken={fcmToken} />

            {/* The same offer the bottom banner makes, for anyone who dismissed
                it. Hidden once the app is installed, or in a browser that
                cannot install it. */}
            {installMethod !== 'none' && (
                <Section label="App">
                    <InstallOffer method={installMethod} />
                </Section>
            )}

            {/* A guest playing under a Clerk user they haven't claimed yet
                (docs/account-less-play.md step 16) — the id never changes,
                so adding an email and password is all "keeping" this account
                takes. The bottom banner links here once they've taken their
                first turn; this is the one place the form itself lives. */}
            {user && isGuest(user) && (
                <Section label="Save your account">
                    <div className="ag-callout" style={{ marginBottom: 12 }}>
                        You&apos;re playing as a guest. Add an email and password and
                        everything you&apos;ve played — games, results, turn history —
                        stays yours, under the same account.
                    </div>
                    <ClaimAccountForm />
                </Section>
            )}

            {/* Account */}
            <Section label="Account">
                <div className="ag-stack">
                    <div className="ag-callout">
                        Deleting your account is permanent. Your games — finished and in
                        progress — invitations, results, reactions and friend connections
                        are removed for everyone in them, along with your sign-in details
                        and every device you registered for notifications.
                    </div>
                    <ActionButton
                        className="ag-btn ag-btn--danger ag-btn--block"
                        pending={isDeletingAccount}
                        pendingLabel="Deleting your account…"
                        onClick={deleteAccount}
                    >
                        Delete account
                    </ActionButton>
                </div>
            </Section>

            <div className="ag-footer">
                <DevTools />
                <LegalLinks />
                <div className="ag-hint ag-hint--center">
                    v{packageJson.version}{hydrated && BUILD_TIME && ` · built ${formatBuildTime(BUILD_TIME)}`}
                    {/* The installed app's own version, which moves on its own
                        release schedule — see `useAppVersion`. Nothing in a
                        browser. */}
                    {appVersion && ` · app v${appVersion.version} (${appVersion.build})`}
                </div>
            </div>

            <FcmTokenComp />
        </main>
    );
}

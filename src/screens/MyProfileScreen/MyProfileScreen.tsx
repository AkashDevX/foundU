import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { createAccountScreenStyles, myProfileScreenStyles } from '../../styles/styles';
import { getDisplayProfilePhotoUri, loadAccountProfile } from '../../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../../services/accountProfileApi';
import { getSessionAuthenticated } from '../../services/authSessionStorage';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { colors, spacing } from '../../theme/theme';
import { FullScreenLoader } from '../../components/FullScreenLoader';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';

function display(v: string | undefined | null): string {
  if (v == null || String(v).trim() === '') return '—';
  return String(v);
}

function formatSex(v: string | undefined): string {
  if (!v) return '—';
  if (v === 'male') return 'Male';
  if (v === 'female') return 'Female';
  return v;
}

function ProfileRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  const mp = myProfileScreenStyles;
  const muted = value === '—';
  return (
    <View style={[mp.row, isLast && mp.rowLast]}>
      <Text style={mp.rowLabel}>{label}</Text>
      <Text style={muted ? mp.rowValueMuted : mp.rowValue}>{value}</Text>
    </View>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  children: React.ReactNode;
}) {
  const mp = myProfileScreenStyles;
  return (
    <View style={mp.sectionCard}>
      <View style={mp.sectionCardHeader}>
        <View style={mp.sectionIconWrap}>
          <Feather name={icon} size={18} color="#0056D2" />
        </View>
        <Text style={mp.sectionCardTitle}>{title}</Text>
      </View>
      <View style={mp.sectionCardBody}>{children}</View>
    </View>
  );
}

export function MyProfileScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = createAccountScreenStyles;
  const mp = myProfileScreenStyles;
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);

  const refresh = useCallback(() => {
    void (async () => {
      const first = isFirstLoadRef.current;
      if (first) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const signedIn = await getSessionAuthenticated();
        setSessionAuthenticated(signedIn);
        if (!signedIn) {
          setProfile({});
          setSyncError(null);
          return;
        }
        const api = await refreshAndCacheAccountProfileFromApi();
        if (api.ok) {
          setProfile(api.profile);
          setSyncError(null);
        } else {
          setSyncError(api.message);
          setProfile(await loadAccountProfile());
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        isFirstLoadRef.current = false;
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={[{ flex: 1, backgroundColor: '#E8ECF1' }, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.topBar, { backgroundColor: colors.white }]}>
        <View style={styles.topBarSide}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color="#0056D2" />
          </TouchableOpacity>
        </View>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          My profile
        </Text>
        <View style={styles.topBarSideRight} />
      </View>

      {loading || !profile ? (
        <FullScreenLoader variant="light" message="Loading your profile…" />
      ) : (
        <ScrollView
          style={mp.scrollOuter}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: Math.max(insets.bottom, spacing.xxl) + 32,
          }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={['#0056D2']}
              tintColor="#0056D2"
            />
          }
        >
          {sessionAuthenticated && syncError ? (
            <View style={mp.syncBanner}>
              <Feather name="alert-triangle" size={18} color="#D97706" style={{ marginTop: 1 }} />
              <Text style={mp.syncBannerText}>
                Could not load the latest profile from the server. Showing saved details. Pull down to retry.
                {'\n\n'}
                {syncError}
              </Text>
            </View>
          ) : null}
          <View style={mp.heroCard}>
            <View style={mp.heroAvatarOuter}>
              <View style={mp.heroAvatar}>
                <ProfilePhotoAvatar
                  photoUri={getDisplayProfilePhotoUri(profile)}
                  size={94}
                  iconSize={42}
                  iconColor="#1D4ED8"
                />
              </View>
            </View>
            <Text style={mp.heroName}>{display(profile.fullLegalName)}</Text>
            <Text style={mp.heroMeta}>
              {[display(profile.email), display(profile.phone)].filter((x) => x !== '—').join(' · ') || '—'}
            </Text>
            <View style={mp.heroBadge}>
              <Feather
                name={sessionAuthenticated ? (syncError ? 'info' : 'check-circle') : 'info'}
                size={16}
                color={sessionAuthenticated ? (syncError ? '#6B7280' : '#059669') : '#6B7280'}
              />
              <Text style={mp.heroBadgeText}>
                {sessionAuthenticated
                  ? syncError
                    ? 'Saved on this device'
                    : 'Synced from workplace'
                  : 'Sign in to load your profile'}
              </Text>
            </View>
          </View>

          <SectionCard icon="briefcase" title="Organization">
            <ProfileRow label="Company" value={display(profile.companyName)} isLast />
          </SectionCard>

          <SectionCard icon="user" title="Personal profile">
            <ProfileRow label="Date of birth" value={display(profile.dateOfBirth)} />
            <ProfileRow label="Sex" value={formatSex(profile.sex)} />
            <ProfileRow label="Marital status" value={display(profile.maritalStatus)} />
            <ProfileRow label="Address" value={display(profile.address)} />
            <ProfileRow label="Emergency contact" value={display(profile.emergencyContactName)} />
            <ProfileRow label="Emergency phone" value={display(profile.emergencyContactPhone)} />
            <ProfileRow label="Relationship" value={display(profile.emergencyContactRelationship)} isLast />
          </SectionCard>

          <SectionCard icon="shield" title="Work eligibility">
            <ProfileRow label="Visa status" value={display(profile.visaStatus)} />
            <ProfileRow label="Unrestricted work rights (AU)" value={display(profile.unrestrictedWorkRights)} />
            <ProfileRow label="Visa expiry" value={display(profile.visaExpiry)} />
            <ProfileRow label="Hours per week" value={display(profile.hoursPerWeek)} />
            <ProfileRow label="Weekly availability" value={display(profile.weeklyAvailabilitySummary)} />
            <ProfileRow label="ID documents" value={display(profile.idDocumentsSummary)} isLast />
          </SectionCard>

          <SectionCard icon="award" title="Qualifications">
            <ProfileRow label="Police check uploaded" value={display(profile.policeCheckUploaded)} />
            <ProfileRow label="Police check expiry" value={display(profile.policeCheckExpiry)} />
            <ProfileRow label="Fit to work uploaded" value={display(profile.fitToWorkUploaded)} />
            <ProfileRow label="Fit to work expiry" value={display(profile.fitToWorkExpiry)} />
            <ProfileRow label="Licences" value={display(profile.licencesSummary)} />
            <ProfileRow label="Insurance" value={display(profile.insurancesSummary)} isLast />
          </SectionCard>

          <SectionCard icon="credit-card" title="Employment & pay">
            <ProfileRow label="Bank name" value={display(profile.bankName)} />
            <ProfileRow label="Account name" value={display(profile.bankAccountName)} />
            <ProfileRow label="BSB / branch code" value={display(profile.bankBranchCode)} />
            <ProfileRow label="Account number" value={display(profile.bankAccountNumber)} />
            <ProfileRow label="Travel to work" value={display(profile.modeOfTransport)} />
            <ProfileRow label="Vehicle registration" value={display(profile.vehicleRegistration)} />
            <ProfileRow label="Vehicle registration expiry" value={display(profile.vehicleExpiry)} />
            <ProfileRow label="Vehicle insurance uploaded" value={display(profile.vehicleInsuranceUploaded)} isLast />
          </SectionCard>
        </ScrollView>
      )}
    </View>
  );
}

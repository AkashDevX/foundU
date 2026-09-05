import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { dashboardStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri } from '../../services/accountProfileStorage';
import { useHeaderProfileSnapshot } from '../../hooks/useHeaderProfileSnapshot';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { fetchConversations, fetchMessagingPolicy, acceptMessagingPolicy } from '../../services/messagingApi';
import type { MessagingConversation } from '../../types/messaging';
import { MessagingPolicyCard } from './MessagingPolicyCard';

type ChatScreenProps = {
  isTabActive?: boolean;
};

const AVATAR_TONES = ['#003D7A', '#0052A2', '#0F766E', '#7C3AED', '#B45309', '#BE185D'] as const;

function previewText(c: MessagingConversation): string {
  if (c.block_status === 'blocked_by_me') return 'You blocked this chat';
  if (c.block_status === 'blocked_me') return 'You’ve been blocked';
  const last = c.last_message;
  if (!last) return 'No messages yet — say hello';
  if (last.message_type === 'image') return `${last.sender_display_name}: Photo`;
  if (last.message_type === 'file') return `${last.sender_display_name}: File`;
  if (last.message_type === 'system') return last.body || 'Group updated';
  const body = (last.body || '').trim();
  return body ? `${last.sender_display_name}: ${body}` : `${last.sender_display_name}: sent a message`;
}

function initialsFromTitle(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function toneForId(id: number): string {
  return AVATAR_TONES[Math.abs(id) % AVATAR_TONES.length];
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ChatScreen({ isTabActive = true }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const headerProfile = useHeaderProfileSnapshot();
  const headerStyles = dashboardStyles;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyContent, setPolicyContent] = useState('');
  const [policyVersion, setPolicyVersion] = useState(1);
  const [policyUpdatedOn, setPolicyUpdatedOn] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [acceptingPolicy, setAcceptingPolicy] = useState(false);

  const loadInFlightRef = useRef(false);

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyError(null);
    const res = await fetchMessagingPolicy();
    if (!res.ok) {
      setPolicyError(res.message);
      setPolicyAccepted(false);
      setPolicyLoading(false);
      return;
    }
    setPolicyAccepted(Boolean(res.data.accepted));
    setPolicyContent(res.data.content || '');
    setPolicyVersion(res.data.version || 1);
    setPolicyUpdatedOn(res.data.last_updated_on || null);
    setPolicyLoading(false);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchConversations();
      if (!res.ok) {
        setError(res.message);
        if (!isRefresh) setConversations([]);
      } else {
        setConversations(res.data.conversations || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadInFlightRef.current = false;
    }
  }, []);

  const onAcceptPolicy = useCallback(async () => {
    setAcceptingPolicy(true);
    setPolicyError(null);
    const res = await acceptMessagingPolicy();
    setAcceptingPolicy(false);
    if (!res.ok) {
      setPolicyError(res.message || 'Could not accept the policy.');
      return;
    }
    setPolicyAccepted(true);
    void load(false);
  }, [load]);

  useEffect(() => {
    if (isTabActive) {
      void loadPolicy();
      void load(false);
    }
  }, [isTabActive, load, loadPolicy]);

  useEffect(() => {
    if (!isTabActive || !policyAccepted) return;
    const id = setInterval(() => {
      void load(true);
    }, 20_000);
    return () => clearInterval(id);
  }, [isTabActive, load, policyAccepted]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={headerStyles.header}>
        <TouchableOpacity
          style={headerStyles.profileAvatarWrap}
          onPress={() => navigation.navigate('MyProfile' as never)}
          activeOpacity={0.75}
          accessibilityLabel="Open my profile"
        >
          <View style={headerStyles.profileAvatar}>
            <ProfilePhotoAvatar
              photoUri={getDisplayProfilePhotoUri(headerProfile)}
              size={44}
              iconSize={24}
              iconColor={colors.primary}
            />
          </View>
        </TouchableOpacity>
        <Text style={headerStyles.headerTitle}>Messages</Text>
        {policyAccepted ? (
          <TouchableOpacity
            style={headerStyles.bellBtn}
            activeOpacity={0.7}
            onPress={openLogoutSweetAlert}
            accessibilityLabel="Log out"
          >
            <Feather name="log-out" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={headerStyles.bellBtn}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ChatHelp' as never)}
            accessibilityLabel="Help"
          >
            <Feather name="help-circle" size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {policyLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingHint}>Loading messaging terms…</Text>
        </View>
      ) : !policyAccepted ? (
        <ScrollView
          style={styles.policyScroll}
          contentContainerStyle={{
            paddingTop: spacing.lg,
            paddingBottom: floatingTabBarClearance(insets.bottom) + 24,
            paddingHorizontal: spacing.lg,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <MessagingPolicyCard
            content={policyContent}
            version={policyVersion}
            lastUpdatedOn={policyUpdatedOn}
            accepting={acceptingPolicy}
            error={policyError}
            onAccept={() => void onAcceptPolicy()}
          />
        </ScrollView>
      ) : loading && conversations.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingHint}>Loading messages…</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: spacing.lg,
            paddingBottom: floatingTabBarClearance(insets.bottom) + 16,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadPolicy();
                void load(true);
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionTile}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NewChat' as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(0,61,122,0.1)' }]}>
                  <Feather name="edit-3" size={18} color={colors.primary} />
                </View>
                <Text style={styles.actionLabel}>New chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionTile}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NewGroup' as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(15,118,110,0.12)' }]}>
                  <Feather name="users" size={18} color="#0F766E" />
                </View>
                <Text style={styles.actionLabel}>New group</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionTile}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('BlockedUsers' as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(185,28,28,0.1)' }]}>
                  <Feather name="slash" size={18} color="#B91C1C" />
                </View>
                <Text style={styles.actionLabel}>Blocked</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionTile}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('ChatHelp' as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(124,58,237,0.1)' }]}>
                  <Feather name="help-circle" size={18} color="#7C3AED" />
                </View>
                <Text style={styles.actionLabel}>Help</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {error ? 'Couldn’t load messages' : 'No conversations yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {error
                  ? 'Pull down to try again, or start a new chat when you are back online.'
                  : 'Start a direct message or create a group with your team.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyCta}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NewChat' as never)}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const unread = (item.unread_count || 0) > 0;
            const isGroup = item.type === 'group';
            const isAdmin =
              !isGroup &&
              item.participants?.some((p) => p.type === 'company_admin');
            return (
              <TouchableOpacity
                style={[styles.convCard, unread && styles.convCardUnread]}
                activeOpacity={0.88}
                onPress={() =>
                  navigation.navigate({
                    name: 'ConversationThread',
                    params: { conversationId: item.id, title: item.title },
                  } as never)
                }
              >
                <View style={[styles.avatar, { backgroundColor: toneForId(item.id) }]}>
                  {isGroup ? (
                    <Feather name="users" size={20} color="#FFFFFF" />
                  ) : isAdmin ? (
                    <Feather name="shield" size={20} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.avatarInitials}>{initialsFromTitle(item.title)}</Text>
                  )}
                </View>
                <View style={styles.convBody}>
                  <View style={styles.convTop}>
                    <Text
                      style={[styles.convTitle, unread && styles.convTitleUnread]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.convTime, unread && styles.convTimeUnread]}>
                      {formatRelativeTime(item.last_message_at || item.last_message?.created_at)}
                    </Text>
                  </View>
                  <View style={styles.convBottom}>
                    <Text
                      style={[styles.convPreview, unread && styles.convPreviewUnread]}
                      numberOfLines={1}
                    >
                      {previewText(item)}
                    </Text>
                    {unread ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.unread_count > 99 ? '99+' : item.unread_count}
                        </Text>
                      </View>
                    ) : (
                      <Feather name="chevron-right" size={16} color="#CBD5E1" />
                    )}
                  </View>
                  <View style={styles.chipRow}>
                    <View style={[styles.typeChip, isGroup ? styles.typeChipGroup : styles.typeChipDirect]}>
                      <Text style={[styles.typeChipText, isGroup ? styles.typeChipTextGroup : styles.typeChipTextDirect]}>
                        {isGroup ? 'Group' : isAdmin ? 'Admin' : 'Direct'}
                      </Text>
                    </View>
                    {item.block_status === 'blocked_by_me' || item.block_status === 'blocked_me' ? (
                      <View style={styles.blockedChip}>
                        <Text style={styles.blockedChipText}>Blocked</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F2F5' },
  policyScroll: { flex: 1 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingHint: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text.secondary,
  },
  actionsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  actionTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.text.primary,
    textAlign: 'center',
  },
  convCard: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  convCardUnread: {
    borderColor: 'rgba(0,61,122,0.18)',
    backgroundColor: '#F8FBFF',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  convBody: { flex: 1, minWidth: 0 },
  convTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  convTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  convTitleUnread: {
    fontFamily: fontFamily.bold,
  },
  convTime: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  convTimeUnread: {
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
  },
  convBottom: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  convPreview: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  convPreviewUnread: {
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: 6,
    flexWrap: 'wrap',
  },
  typeChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  typeChipDirect: { backgroundColor: '#EFF6FF' },
  typeChipGroup: { backgroundColor: '#ECFDF5' },
  typeChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  typeChipTextDirect: { color: colors.primary },
  typeChipTextGroup: { color: '#0F766E' },
  blockedChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  blockedChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: '#B91C1C',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: fontFamily.bold,
    fontSize: 11,
  },
  emptyCard: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(0,61,122,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptyBody: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  emptyCtaText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});

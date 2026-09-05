import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import type { MessagingBlock } from '../../types/messaging';
import { fetchBlocks, unblockEmployee } from '../../services/messagingApi';

export function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState(false);
  const [blocks, setBlocks] = useState<MessagingBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<MessagingBlock | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchBlocks();
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setBlocks(res.data.blocks || []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const closeSheet = () => {
    if (unblocking) return;
    setPending(null);
  };

  const confirmUnblock = async () => {
    if (!pending) return;
    setUnblocking(true);
    setActionError(null);
    const res = await unblockEmployee(pending.employee_id);
    setUnblocking(false);
    if (!res.ok) {
      setPending(null);
      setActionError(res.message);
      return;
    }
    setPending(null);
    void load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked users</Text>
        <View style={styles.headerBtn} />
      </View>
      {actionError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{actionError}</Text>
          <TouchableOpacity onPress={() => setActionError(null)} hitSlop={8}>
            <Feather name="x" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.center} onPress={() => void load()} activeOpacity={0.7}>
          <Text style={styles.errorTitle}>Couldn’t load blocked users</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => String(item.employee_id)}
          contentContainerStyle={{ padding: spacing.xxl, flexGrow: 1 }}
          ListEmptyComponent={
            <Text style={styles.empty}>You have not blocked anyone.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.display_name || '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.sub}>Blocked contact</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => setPending(item)}
                activeOpacity={0.85}
              >
                <Text style={styles.unblock}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        visible={pending != null}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetIconWrap}>
              <Feather name="user-check" size={22} color={colors.primary} />
            </View>
            <Text style={styles.sheetTitle}>Unblock this person?</Text>
            <Text style={styles.sheetSubtitle}>
              {pending
                ? `You’ll be able to message ${pending.display_name} again in your existing chat.`
                : ''}
            </Text>
            <View style={styles.sheetConfirmRow}>
              <TouchableOpacity
                style={styles.sheetSecondaryBtn}
                onPress={closeSheet}
                disabled={unblocking}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetPrimaryBtn}
                onPress={() => void confirmUnblock()}
                disabled={unblocking}
                activeOpacity={0.85}
              >
                {unblocking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sheetPrimaryText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  headerBtn: { padding: 10, minWidth: 44, alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.primary,
  },
  banner: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.12)',
  },
  bannerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#991B1B',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: 6,
  },
  errorTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  errorRetry: {
    marginTop: 4,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  empty: {
    marginTop: 40,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    color: colors.text.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#B91C1C',
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text.primary },
  sub: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  unblockBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,61,122,0.08)',
  },
  unblock: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.primary },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xxl,
    paddingTop: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    marginBottom: 14,
  },
  sheetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0,61,122,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
  },
  sheetConfirmRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  sheetSecondaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  sheetPrimaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    minHeight: 48,
  },
  sheetPrimaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});

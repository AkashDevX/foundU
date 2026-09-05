import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import type { MessagingDirectoryItem } from '../../types/messaging';
import { fetchMessagingDirectory, openDirectConversation } from '../../services/messagingApi';

export function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MessagingDirectoryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDirectory = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMessagingDirectory();
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setItems(res.data.items || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadDirectory();
  }, []);

  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.display_name.toLowerCase().includes(q) ||
      (item.subtitle || '').toLowerCase().includes(q)
    );
  });

  const open = async (item: MessagingDirectoryItem) => {
    const key = `${item.type}-${item.id}`;
    setBusyId(key);
    setActionError(null);
    const res = await openDirectConversation(item.type, item.id);
    setBusyId(null);
    if (!res.ok) {
      setActionError(res.message);
      return;
    }
    navigation.navigate({
      name: 'ConversationThread',
      params: {
        conversationId: res.data.conversation.id,
        title: res.data.conversation.title || item.display_name,
      },
    } as never);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New chat</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search people…"
          placeholderTextColor="#94A3B8"
          autoCorrect={false}
        />
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
        <TouchableOpacity style={styles.center} onPress={() => void loadDirectory()} activeOpacity={0.7}>
          <Text style={styles.errorTitle}>Couldn’t load directory</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={{ padding: spacing.xxl, paddingTop: spacing.sm }}
          ListEmptyComponent={
            <Text style={styles.empty}>No matches. Try a different name.</Text>
          }
          renderItem={({ item }) => {
            const key = `${item.type}-${item.id}`;
            const isAdmin = item.type === 'company_admin';
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => void open(item)}
                disabled={busyId === key}
              >
                <View style={[styles.avatar, isAdmin ? styles.avatarAdmin : styles.avatarPerson]}>
                  <Feather name={isAdmin ? 'shield' : 'user'} size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                {busyId === key ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Feather name="message-circle" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  searchWrap: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: 12,
  },
  banner: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
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
    textAlign: 'center',
    marginTop: 40,
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
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPerson: { backgroundColor: colors.primary },
  avatarAdmin: { backgroundColor: '#0F766E' },
  name: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text.primary },
  sub: { marginTop: 2, fontFamily: fontFamily.regular, fontSize: 12, color: colors.text.secondary },
});

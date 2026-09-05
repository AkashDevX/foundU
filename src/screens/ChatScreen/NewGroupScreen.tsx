import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Switch,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import type { MessagingDirectoryItem } from '../../types/messaging';
import { createGroupConversation, fetchMessagingDirectory } from '../../services/messagingApi';

export function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<MessagingDirectoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDirectory = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMessagingDirectory();
    if (!res.ok) {
      setError(res.message);
      setLoading(false);
      return;
    }
    setEmployees((res.data.items || []).filter((i) => i.type === 'employee'));
    setLoading(false);
  };

  useEffect(() => {
    void loadDirectory();
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const create = async () => {
    const memberIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    if (!title.trim()) {
      setFormError('Enter a group title.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await createGroupConversation(title.trim(), memberIds, includeAdmin);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    navigation.navigate({
      name: 'ConversationThread',
      params: {
        conversationId: res.data.conversation.id,
        title: res.data.conversation.title,
      },
    } as never);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New group</Text>
        <TouchableOpacity onPress={() => void create()} style={styles.headerBtn} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.createText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (formError) setFormError(null);
          }}
          placeholder="Group title"
          placeholderTextColor="#94A3B8"
        />
        <View style={styles.adminRow}>
          <Text style={styles.adminLabel}>Include Organization Admin</Text>
          <Switch value={includeAdmin} onValueChange={setIncludeAdmin} />
        </View>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.center} onPress={() => void loadDirectory()} activeOpacity={0.7}>
          <Text style={styles.errorTitle}>Couldn’t load members</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingBottom: 24 }}
          ListHeaderComponent={<Text style={styles.section}>Members</Text>}
          renderItem={({ item }) => {
            const on = !!selected[item.id];
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item.id)}>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Feather name="check" size={14} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  {item.subtitle ? <Text style={styles.sub}>{item.subtitle}</Text> : null}
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
  root: { flex: 1, backgroundColor: '#F5F6F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: { padding: 10, minWidth: 64, alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.primary,
  },
  createText: { fontFamily: fontFamily.bold, color: colors.primary, fontSize: 15 },
  form: { padding: spacing.xxl, gap: 12, backgroundColor: colors.white },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
  },
  adminRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adminLabel: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text.primary },
  formError: {
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
  section: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  name: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text.primary },
  sub: { marginTop: 2, fontFamily: fontFamily.regular, fontSize: 12, color: colors.text.secondary },
});

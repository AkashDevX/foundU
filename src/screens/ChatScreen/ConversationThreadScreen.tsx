import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  NativeModules,
  TurboModuleRegistry,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { SweetAlert } from '../../components/SweetAlert';
import type {
  MessagingConversation,
  MessagingMessage,
  PendingAttachment,
} from '../../types/messaging';
import {
  blockEmployee,
  fetchMessages,
  fetchMessagingPolicy,
  acceptMessagingPolicy,
  reportConversation,
  reportMessage,
  sendMessage,
  unblockEmployee,
} from '../../services/messagingApi';
import { setActiveChatConversationId } from '../../services/chatPush';
import { ChatAttachmentBubble } from './ChatMessageAttachment';
import { MessagingPolicyCard } from './MessagingPolicyCard';
import { ReportReasonSheetBody } from './ReportReasonSheet';

type SheetMode =
  | 'menu'
  | 'attach'
  | 'blockConfirm'
  | 'unblockConfirm'
  | 'reportMessage'
  | 'reportUser'
  | null;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const SUPPRESSED_BLOCK_SYSTEM_BODIES = new Set([
  'Messaging is paused because of a block.',
  'Messaging is available again.',
  'You blocked this conversation. Messaging is paused until someone unblocks.',
]);

function visibleMessages(list: MessagingMessage[]): MessagingMessage[] {
  return list.filter((m) => {
    if (m.message_type !== 'system') return true;
    return !SUPPRESSED_BLOCK_SYSTEM_BODIES.has((m.body || '').trim());
  });
}

function guessMimeFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  return null;
}

type RouteParams = {
  conversationId: number;
  title?: string;
};

function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function conversationSubtitle(conversation: MessagingConversation | null): string {
  if (!conversation) return 'Conversation';
  if (conversation.block_status === 'blocked_by_me') return 'You blocked this chat';
  if (conversation.block_status === 'blocked_me') return 'You’ve been blocked';
  if (conversation.type === 'group') {
    const count = conversation.participants?.length || 0;
    return `${count} member${count === 1 ? '' : 's'}`;
  }
  if (conversation.participants?.some((p) => p.type === 'company_admin')) {
    return 'Organization Admin';
  }
  return 'Direct message';
}

export function ConversationThreadScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;
  const conversationId = params.conversationId;

  const [conversation, setConversation] = useState<MessagingConversation | null>(null);
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccessVisible, setReportSuccessVisible] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<number | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyContent, setPolicyContent] = useState('');
  const [policyVersion, setPolicyVersion] = useState(1);
  const [policyUpdatedOn, setPolicyUpdatedOn] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [acceptingPolicy, setAcceptingPolicy] = useState(false);
  const listRef = useRef<FlatList>(null);
  const lastIdRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const sendErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (conversationId) {
      setActiveChatConversationId(conversationId);
    }
    return () => {
      setActiveChatConversationId(null);
    };
  }, [conversationId]);

  const scrollToLatest = useCallback((animated = false) => {
    const scroll = () => {
      listRef.current?.scrollToEnd({ animated });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 50);
    setTimeout(scroll, 150);
  }, []);

  const showTransient = useCallback((message: string) => {
    setStatusHint(message);
    if (sendErrorTimerRef.current) clearTimeout(sendErrorTimerRef.current);
    sendErrorTimerRef.current = setTimeout(() => setStatusHint(null), 2800);
  }, []);

  const title = conversation?.title || params.title || 'Chat';
  const peerEmployeeId = conversation?.peer_employee_id ?? null;
  const blockStatus = conversation?.block_status || 'none';
  const isBlocked = blockStatus === 'blocked_by_me' || blockStatus === 'blocked_me';
  const canSendMessages =
    policyAccepted && conversation?.can_send !== false && !isBlocked;
  const canBlock =
    conversation?.type === 'direct' && peerEmployeeId != null && blockStatus === 'none';
  const canUnblock =
    conversation?.type === 'direct' && peerEmployeeId != null && blockStatus === 'blocked_by_me';
  const isGroup = conversation?.type === 'group';
  const blockBannerText =
    blockStatus === 'blocked_by_me'
      ? 'You blocked this person. You can’t send or receive messages here.'
      : blockStatus === 'blocked_me'
        ? 'You’ve been blocked. You can’t send messages in this chat.'
        : null;

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
  }, []);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const load = useCallback(
    async (afterId?: number) => {
      if (!conversationId) return;
      try {
        const res = await fetchMessages(
          conversationId,
          afterId,
          afterId == null ? { limit: 30 } : undefined,
        );
        if (!res.ok) {
          if (!afterId) {
            setLoadError(res.message);
            setLoading(false);
          }
          return;
        }
        setLoadError(null);
        setConversation(res.data.conversation);
        if (afterId) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of visibleMessages(res.data.messages || [])) {
              if (!ids.has(m.id)) merged.push(m);
            }
            if (merged.length > prev.length) {
              shouldStickToBottomRef.current = true;
            }
            return merged;
          });
        } else {
          setMessages(visibleMessages(res.data.messages || []));
          shouldStickToBottomRef.current = true;
        }
        const maxId = (res.data.messages || []).reduce(
          (max, m) => Math.max(max, m.id),
          afterId || 0,
        );
        if (maxId > 0) lastIdRef.current = maxId;
        setLoading(false);
      } catch {
        if (!afterId) {
          setLoadError('Connection issue. Tap to retry.');
          setLoading(false);
        }
      }
    },
    [conversationId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastIdRef.current != null) {
        void load(lastIdRef.current);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (loading || messages.length === 0 || !shouldStickToBottomRef.current) return;
    scrollToLatest(false);
  }, [loading, messages, scrollToLatest]);

  useEffect(() => {
    return () => {
      if (sendErrorTimerRef.current) clearTimeout(sendErrorTimerRef.current);
    };
  }, []);

  const pickImage = () => {
    setSheetMode(null);
    if (!ImagePicker.launchImageLibrary) {
      setSendError('Photo picker unavailable on this build.');
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }, (res) => {
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      setAttachment({
        uri: asset.uri,
        name: asset.fileName || 'image.jpg',
        type: asset.type || 'image/jpeg',
        size: asset.fileSize,
      });
      setSendError(null);
    });
  };

  const pickFile = async () => {
    setSheetMode(null);
    try {
      // Avoid importing the picker until the TurboModule is linked (else getConstants crash).
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        setSendError('Document picker needs a full app rebuild. Photos still work.');
        return;
      }

      // Lazy-load so opening chat does not crash before a native rebuild links the picker.
      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy, isErrorWithCode, errorCodes } = DocumentPicker;

      const [file] = await pick({
        allowMultiSelection: false,
        type: [
          types.pdf,
          types.doc,
          types.docx,
          types.xls,
          types.xlsx,
          types.plainText,
          types.images,
        ],
      });
      const name = (file.name || 'file').trim() || 'file';
      const mime = (file.type || guessMimeFromName(name) || '').toLowerCase();
      if (!mime || !ALLOWED_ATTACHMENT_MIMES.has(mime)) {
        setSendError('File type not allowed. Use images, PDF, Word, Excel, or plain text.');
        return;
      }
      if (file.size != null && file.size > MAX_ATTACHMENT_BYTES) {
        setSendError('Attachments must be 10MB or smaller.');
        return;
      }

      let uri = file.uri;
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: name }],
        destination: 'cachesDirectory',
      });
      if (local.status === 'success' && local.localUri) {
        uri = local.localUri;
      }

      setAttachment({
        uri,
        name,
        type: mime,
        size: file.size ?? undefined,
      });
      setSendError(null);
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        // native module missing
      }
      const message =
        err instanceof Error && /null|getConstants|native module/i.test(err.message)
          ? 'Document picker needs a full app rebuild. Photos still work.'
          : 'Could not pick that file. Try again.';
      setSendError(message);
    }
  };

  const closeSheet = () => {
    if (blocking || reporting) return;
    setSheetMode(null);
    setReportTargetMessageId(null);
  };

  const onAttachPress = () => {
    if (!canSendMessages) return;
    setSheetMode('attach');
  };

  const onSend = async () => {
    const text = draft.trim();
    if (!canSendMessages || (!text && !attachment)) return;
    setSending(true);
    setSendError(null);
    const res = await sendMessage(conversationId, text, attachment);
    setSending(false);
    if (!res.ok) {
      setSendError(res.message || 'Couldn’t send. Try again.');
      return;
    }
    setDraft('');
    setAttachment(null);
    shouldStickToBottomRef.current = true;
    setMessages((prev) => [...prev, { ...res.data.message, is_mine: true }]);
    lastIdRef.current = res.data.message.id;
    scrollToLatest(true);
  };

  const onMore = () => setSheetMode('menu');

  const confirmBlock = async () => {
    if (peerEmployeeId == null) return;
    setBlocking(true);
    const res = await blockEmployee(peerEmployeeId);
    setBlocking(false);
    setSheetMode(null);
    if (!res.ok) {
      showTransient(res.message || 'Couldn’t block user.');
      return;
    }
    shouldStickToBottomRef.current = true;
    await load();
  };

  const confirmUnblock = async () => {
    if (peerEmployeeId == null) return;
    setBlocking(true);
    const res = await unblockEmployee(peerEmployeeId);
    setBlocking(false);
    setSheetMode(null);
    if (!res.ok) {
      showTransient(res.message || 'Couldn’t unblock user.');
      return;
    }
    shouldStickToBottomRef.current = true;
    await load();
  };

  const openReportMessage = (messageId: number) => {
    setReportTargetMessageId(messageId);
    setReportError(null);
    setSheetMode('reportMessage');
  };

  const submitReport = async (reason: string) => {
    setReporting(true);
    setReportError(null);
    try {
      const res =
        sheetMode === 'reportUser'
          ? await reportConversation(conversationId, reason)
          : reportTargetMessageId != null
            ? await reportMessage(reportTargetMessageId, reason)
            : { ok: false as const, message: 'Nothing to report.' };
      if (!res.ok) {
        setReportError(res.message || 'Couldn’t submit report.');
        return;
      }
      setSheetMode(null);
      setReportTargetMessageId(null);
      setReportError(null);
      setReportSuccessVisible(true);
    } finally {
      setReporting(false);
    }
  };

  const canSend = canSendMessages && !sending && (!!draft.trim() || !!attachment);
  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    void load();
  };

  const sheetTitle =
    sheetMode === 'attach'
      ? 'Attach'
      : sheetMode === 'blockConfirm'
        ? 'Block this person?'
        : sheetMode === 'unblockConfirm'
          ? 'Unblock this person?'
          : sheetMode === 'reportMessage' || sheetMode === 'reportUser'
            ? 'Report'
            : 'Conversation';
  const sheetSubtitle =
    sheetMode === 'attach'
      ? 'Add a photo to your message'
      : sheetMode === 'blockConfirm'
        ? 'The chat stays in your inbox, but neither of you can send messages until you unblock.'
        : sheetMode === 'unblockConfirm'
          ? 'You’ll be able to message each other again in this chat.'
          : sheetMode === 'reportMessage' || sheetMode === 'reportUser'
            ? 'Help keep workplace messaging safe'
            : title;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerIconBtn}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, isGroup ? styles.headerAvatarGroup : styles.headerAvatarDirect]}>
          <Feather name={isGroup ? 'users' : 'user'} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {conversationSubtitle(conversation)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onMore}
          style={styles.headerIconBtn}
          accessibilityLabel="More options"
        >
          <Feather name="more-vertical" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {policyLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !policyAccepted ? (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
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
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : loadError ? (
        <TouchableOpacity style={styles.center} onPress={retryLoad} activeOpacity={0.7}>
          <Feather name="wifi-off" size={28} color={colors.text.secondary} />
          <Text style={styles.errorTitle}>Couldn’t load messages</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            shouldStickToBottomRef.current = distanceFromBottom < 80;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (shouldStickToBottomRef.current) {
              scrollToLatest(false);
            }
          }}
          onLayout={() => {
            if (!loading && messages.length > 0 && shouldStickToBottomRef.current) {
              scrollToLatest(false);
            }
          }}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadTitle}>No messages yet</Text>
              <Text style={styles.emptyThreadBody}>Send the first message to get the conversation started.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = !!item.is_mine;
            const isSystem = item.message_type === 'system';
            if (isSystem) {
              return (
                <View style={styles.systemWrap}>
                  <View style={styles.systemPill}>
                    <Text style={styles.systemText}>{item.body}</Text>
                  </View>
                </View>
              );
            }
            return (
              <Pressable
                style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}
                onLongPress={
                  !mine
                    ? () => openReportMessage(item.id)
                    : undefined
                }
                delayLongPress={350}
              >
                {!mine ? (
                  <View style={styles.peerDot}>
                    <Text style={styles.peerDotText}>
                      {(item.sender_display_name || '?').trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {!mine ? <Text style={styles.sender}>{item.sender_display_name}</Text> : null}
                  {item.body ? (
                    <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                  ) : null}
                  {item.attachment ? (
                    <ChatAttachmentBubble
                      attachment={item.attachment}
                      messageType={item.message_type}
                      mine={mine}
                      onError={(message) => setSendError(message)}
                      onStatus={showTransient}
                    />
                  ) : null}
                  <Text style={[styles.time, mine && styles.timeMine]}>
                    {formatMessageTime(item.created_at)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {attachment ? (
        <View style={styles.attachPreview}>
          <View style={styles.attachPreviewIcon}>
            <Feather
              name={(attachment.type || '').startsWith('image/') ? 'image' : 'file-text'}
              size={16}
              color={colors.primary}
            />
          </View>
          <Text style={styles.attachPreviewText} numberOfLines={1}>
            {attachment.name}
          </Text>
          <TouchableOpacity onPress={() => setAttachment(null)} hitSlop={8}>
            <Feather name="x" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {sendError || statusHint ? (
        <View style={[styles.inlineBanner, sendError ? styles.inlineBannerError : styles.inlineBannerHint]}>
          <Text
            style={[styles.inlineBannerText, sendError ? styles.inlineBannerTextError : styles.inlineBannerTextHint]}
            numberOfLines={2}
          >
            {sendError || statusHint}
          </Text>
          {sendError ? (
            <TouchableOpacity onPress={() => setSendError(null)} hitSlop={8}>
              <Feather name="x" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {blockBannerText ? (
        <View style={styles.blockedBanner}>
          <View style={styles.blockedBannerIcon}>
            <Feather name="slash" size={16} color="#B91C1C" />
          </View>
          <Text style={styles.blockedBannerText}>{blockBannerText}</Text>
        </View>
      ) : null}

      {canSendMessages ? (
        <View style={[styles.composerShell, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composer}>
            <TouchableOpacity
              onPress={onAttachPress}
              style={styles.composerIcon}
              accessibilityLabel="Attach"
            >
              <Feather name="plus-circle" size={26} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message…"
              placeholderTextColor="#94A3B8"
              multiline
            />
            <TouchableOpacity
              onPress={() => void onSend()}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              accessibilityLabel="Send"
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      )}

      <Modal
        visible={sheetMode != null}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            {sheetMode === 'reportMessage' || sheetMode === 'reportUser' ? null : (
              <>
                <Text style={styles.sheetTitle}>{sheetTitle}</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={3}>
                  {sheetSubtitle}
                </Text>
              </>
            )}

            {sheetMode === 'menu' ? (
              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.sheetRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    setReportError(null);
                    setSheetMode('reportUser');
                  }}
                >
                  <View style={[styles.sheetIconWrap, styles.sheetIconDanger]}>
                    <Feather name="flag" size={18} color="#B91C1C" />
                  </View>
                  <View style={styles.sheetRowText}>
                    <Text style={[styles.sheetRowTitle, styles.sheetRowTitleDanger]}>
                      Report conversation
                    </Text>
                    <Text style={styles.sheetRowBody}>
                      Flag the latest message from the other person for admin review
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>
                {canBlock ? (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    activeOpacity={0.85}
                    onPress={() => setSheetMode('blockConfirm')}
                  >
                    <View style={[styles.sheetIconWrap, styles.sheetIconDanger]}>
                      <Feather name="slash" size={18} color="#B91C1C" />
                    </View>
                    <View style={styles.sheetRowText}>
                      <Text style={[styles.sheetRowTitle, styles.sheetRowTitleDanger]}>Block user</Text>
                      <Text style={styles.sheetRowBody}>
                        Keep the chat, but pause messaging between you
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
                {canUnblock ? (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    activeOpacity={0.85}
                    onPress={() => setSheetMode('unblockConfirm')}
                  >
                    <View style={[styles.sheetIconWrap, styles.sheetIconPrimary]}>
                      <Feather name="user-check" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.sheetRowText}>
                      <Text style={styles.sheetRowTitle}>Unblock user</Text>
                      <Text style={styles.sheetRowBody}>Allow messaging again in this chat</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
                <View style={styles.sheetHint}>
                  <Feather name="info" size={14} color={colors.text.secondary} />
                  <Text style={styles.sheetHintText}>
                    Tip: long-press any message from someone else to report that message.
                  </Text>
                </View>
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeSheet} activeOpacity={0.85}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {sheetMode === 'attach' ? (
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.sheetRow} activeOpacity={0.85} onPress={pickImage}>
                  <View style={[styles.sheetIconWrap, styles.sheetIconPrimary]}>
                    <Feather name="image" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.sheetRowText}>
                    <Text style={styles.sheetRowTitle}>Photo / image</Text>
                    <Text style={styles.sheetRowBody}>Choose from your library</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetRow}
                  activeOpacity={0.85}
                  onPress={() => void pickFile()}
                >
                  <View style={[styles.sheetIconWrap, styles.sheetIconPrimary]}>
                    <Feather name="file-text" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.sheetRowText}>
                    <Text style={styles.sheetRowTitle}>Document / file</Text>
                    <Text style={styles.sheetRowBody}>PDF, Word, Excel, or text (max 10MB)</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeSheet} activeOpacity={0.85}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {sheetMode === 'blockConfirm' || sheetMode === 'unblockConfirm' ? (
              <View style={styles.sheetActions}>
                <View style={styles.sheetConfirmRow}>
                  <TouchableOpacity
                    style={styles.sheetSecondaryBtn}
                    onPress={() => setSheetMode('menu')}
                    disabled={blocking}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.sheetSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={
                      sheetMode === 'blockConfirm' ? styles.sheetDangerBtn : styles.sheetPrimaryBtn
                    }
                    onPress={() =>
                      void (sheetMode === 'blockConfirm' ? confirmBlock() : confirmUnblock())
                    }
                    disabled={blocking}
                    activeOpacity={0.85}
                  >
                    {blocking ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text
                        style={
                          sheetMode === 'blockConfirm'
                            ? styles.sheetDangerText
                            : styles.sheetPrimaryText
                        }
                      >
                        {sheetMode === 'blockConfirm' ? 'Block' : 'Unblock'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {sheetMode === 'reportMessage' || sheetMode === 'reportUser' ? (
              <ReportReasonSheetBody
                title={
                  sheetMode === 'reportUser' ? 'Report this conversation' : 'Report this message'
                }
                subtitle={
                  sheetMode === 'reportUser'
                    ? 'We’ll flag the latest message from the other person for your organisation admin.'
                    : 'Choose a reason. Admins can review and take action.'
                }
                submitting={reporting}
                errorMessage={reportError}
                onCancel={() => {
                  if (reporting) return;
                  setReportError(null);
                  setSheetMode('menu');
                  setReportTargetMessageId(null);
                }}
                onSubmit={(reason) => void submitReport(reason)}
              />
            ) : null}
          </View>
        </View>
      </Modal>

      <SweetAlert
        visible={reportSuccessVisible}
        variant="success"
        title="Report sent"
        message="Thanks — your organisation admin can review this in Messages and take action if needed."
        confirmText="Got it"
        cancelText="Cancel"
        hideCancel
        onClose={() => setReportSuccessVisible(false)}
        onConfirm={() => setReportSuccessVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarDirect: { backgroundColor: colors.primary },
  headerAvatarGroup: { backgroundColor: '#0F766E' },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: 8,
  },
  errorTitle: {
    marginTop: 8,
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
    lineHeight: 19,
  },
  errorRetry: {
    marginTop: 4,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  inlineBannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: 'rgba(185,28,28,0.12)',
  },
  inlineBannerHint: {
    backgroundColor: '#F1F5F9',
    borderColor: 'rgba(15,23,42,0.08)',
  },
  inlineBannerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  inlineBannerTextError: { color: '#991B1B' },
  inlineBannerTextHint: { color: colors.text.primary },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyThread: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyThreadTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
  },
  emptyThreadBody: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  systemWrap: { alignItems: 'center', marginVertical: spacing.sm },
  systemPill: {
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '90%',
  },
  systemText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    gap: 8,
  },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  peerDot: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerDotText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sender: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
    marginBottom: 4,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text.primary,
  },
  bodyMine: { color: '#FFFFFF' },
  time: {
    marginTop: 6,
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.text.secondary,
  },
  timeMine: { color: 'rgba(255,255,255,0.72)' },
  attachPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#E8F1FB',
    borderWidth: 1,
    borderColor: 'rgba(0,61,122,0.12)',
  },
  attachPreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachPreviewText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text.primary,
  },
  composerShell: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    backgroundColor: '#F8FAFC',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
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
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
  },
  sheetActions: {
    gap: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIconPrimary: {
    backgroundColor: 'rgba(0,61,122,0.1)',
  },
  sheetIconDanger: {
    backgroundColor: '#FEE2E2',
  },
  sheetRowText: {
    flex: 1,
    minWidth: 0,
  },
  sheetRowTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  sheetRowTitleDanger: {
    color: '#B91C1C',
  },
  sheetRowBody: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  sheetEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  sheetEmptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  sheetHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetHintText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  sheetCancelBtn: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  sheetCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
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
  sheetDangerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    minHeight: 48,
  },
  sheetDangerText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
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
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.12)',
  },
  blockedBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  blockedBannerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: '#991B1B',
  },
});

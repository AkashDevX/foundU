import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ListRenderItemInfo,
  Keyboard,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { dashboardStyles, chatStyles } from '../../styles/styles';
import { colors, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri } from '../../services/accountProfileStorage';
import { useHeaderProfileSnapshot } from '../../hooks/useHeaderProfileSnapshot';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { CHAT_FAQS, findFaqAnswer, type ChatFaq } from './chatFaqs';

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sentAt: number;
};

type ChatScreenProps = {
  isTabActive?: boolean;
};

const ASSISTANT_ACCENT = '#004C99';

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      "Hi — I'm your CruLynk assistant. Tap any FAQ below and I'll answer right away, or type your own question.",
    sentAt: Date.now() - 1000 * 60 * 4,
  },
];

const FALLBACK_REPLY =
  "I don't have a specific answer for that yet. Try one of the FAQ buttons below — they cover safety, clock-in, shifts, tasks, and more.";

let messageId = 0;
function nextId(): string {
  messageId += 1;
  return `m-${Date.now()}-${messageId}`;
}

function formatMessageTime(sentAt: number): string {
  const d = new Date(sentAt);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.35)).current;
  const dot2 = useRef(new Animated.Value(0.35)).current;
  const dot3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.35, duration: 320, useNativeDriver: true }),
        ]),
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 120);
    const a3 = pulse(dot3, 240);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const styles = chatStyles;
  return (
    <View style={styles.typingRow}>
      <View style={styles.assistantAvatarSmall}>
        <Feather name="cpu" size={14} color={ASSISTANT_ACCENT} />
      </View>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((opacity, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity }]} />
        ))}
      </View>
    </View>
  );
}

type FaqQuickBarProps = {
  onSelect: (faq: ChatFaq) => void;
  disabled: boolean;
};

function FaqQuickBar({ onSelect, disabled }: FaqQuickBarProps) {
  const styles = chatStyles;
  return (
    <View style={styles.faqQuickBar}>
      <Text style={styles.faqQuickBarLabel}>FAQs — tap for an instant answer</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.faqQuickScroll}
        keyboardShouldPersistTaps="handled"
      >
        {CHAT_FAQS.map((faq) => (
          <TouchableOpacity
            key={faq.id}
            style={styles.faqQuickChip}
            onPress={() => onSelect(faq)}
            activeOpacity={0.75}
            disabled={disabled}
          >
            <Feather name={faq.icon} size={14} color={ASSISTANT_ACCENT} />
            <Text style={styles.faqQuickChipText}>{faq.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function ChatScreen({ isTabActive = true }: ChatScreenProps) {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerProfile = useHeaderProfileSnapshot();
  const headerStyles = dashboardStyles;
  const styles = chatStyles;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const tabBarReserve = floatingTabBarClearance(insets.bottom);
  const scrollPendingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToLatest = useCallback((animated = true) => {
    scrollPendingRef.current = true;
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      listRef.current.scrollToEnd({ animated });
      scrollPendingRef.current = false;
    });
  }, []);

  const onScrollToIndexFailed = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    if (!isTabActive) return;
    const t = setTimeout(() => scrollToLatest(false), 80);
    return () => clearTimeout(t);
  }, [isTabActive, scrollToLatest]);

  useEffect(() => {
    scrollToLatest(true);
  }, [messages.length, isTyping, scrollToLatest]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => scrollToLatest(true),
    );
    return () => showSub.remove();
  }, [scrollToLatest]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    },
    [],
  );

  const appendExchange = useCallback((userText: string, assistantText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || isTyping) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text: trimmed, sentAt: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const replyDelay = 500 + Math.min(trimmed.length * 6, 500);
    typingTimerRef.current = setTimeout(() => {
      const botMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        text: assistantText,
        sentAt: Date.now(),
      };
      setIsTyping(false);
      setMessages((prev) => [...prev, botMsg]);
      typingTimerRef.current = null;
    }, replyDelay);
  }, [isTyping]);

  const onSend = useCallback(() => {
    const t = inputText.trim();
    if (!t || isTyping) return;
    setInputText('');
    appendExchange(t, findFaqAnswer(t) ?? FALLBACK_REPLY);
  }, [inputText, isTyping, appendExchange]);

  const onFaqSelect = useCallback(
    (faq: ChatFaq) => {
      appendExchange(faq.question, faq.answer);
    },
    [appendExchange],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ChatMessage>) => {
      const isUser = item.role === 'user';
      const showDate =
        index === 0 ||
        new Date(item.sentAt).toDateString() !== new Date(messages[index - 1]?.sentAt ?? 0).toDateString();

      return (
        <View>
          {showDate ? (
            <View style={styles.datePillWrap}>
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>
                  {new Date(item.sentAt).toDateString() === new Date().toDateString()
                    ? 'Today'
                    : new Date(item.sentAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
            {!isUser ? (
              <View style={styles.assistantAvatarSmall}>
                <Feather name="cpu" size={14} color={ASSISTANT_ACCENT} />
              </View>
            ) : null}
            <View style={styles.messageContentCol}>
              <View style={isUser ? styles.bubbleUser : styles.bubbleAssistant}>
                <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{item.text}</Text>
              </View>
              <Text style={[styles.bubbleMeta, isUser && styles.bubbleMetaUser]}>
                {formatMessageTime(item.sentAt)}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [styles, messages],
  );

  const listHeader = (
    <View style={styles.listHeaderWrap}>
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Feather name="message-circle" size={22} color={ASSISTANT_ACCENT} />
        </View>
        <Text style={styles.heroTitle}>Worksite assistant</Text>
        <Text style={styles.heroSubtitle}>
          Choose a FAQ below for an instant answer about safety, shifts, tasks, and more.
        </Text>
        <View style={styles.heroStatusRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.heroStatusText}>Ready to help</Text>
        </View>
      </View>

      <Text style={styles.faqSectionLabel}>Popular questions</Text>
      <View style={styles.faqGrid}>
        {CHAT_FAQS.slice(0, 6).map((faq) => (
          <TouchableOpacity
            key={faq.id}
            style={styles.faqChip}
            onPress={() => onFaqSelect(faq)}
            activeOpacity={0.85}
            disabled={isTyping}
          >
            <View style={styles.faqChipIconWrap}>
              <Feather name={faq.icon} size={16} color={ASSISTANT_ACCENT} />
            </View>
            <Text style={styles.faqChipText} numberOfLines={2}>
              {faq.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const listFooter = (
    <View style={styles.listFooterWrap}>
      {isTyping ? <TypingIndicator /> : null}
      <View style={{ height: spacing.md }} />
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[headerStyles.header, styles.chatHeader]}>
        <View style={styles.headerSideSlot}>
          <TouchableOpacity
            style={headerStyles.profileAvatarWrap}
            onPress={() => navigation.navigate('MyProfile')}
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
        </View>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            Assistant
          </Text>
          <View style={styles.headerSubtitleRow}>
            <View style={styles.onlineDotSmall} />
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Online · Site support
            </Text>
          </View>
        </View>
        <View style={styles.headerSideSlot}>
          <TouchableOpacity
            style={headerStyles.bellBtn}
            activeOpacity={0.7}
            onPress={openLogoutSweetAlert}
            accessibilityLabel="Log out"
          >
            <Feather name="log-out" size={24} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.chatBody}>
          <FlatList
            ref={listRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => {
              if (scrollPendingRef.current || isTyping || messages.length > SEED_MESSAGES.length) {
                scrollToLatest(false);
              }
            }}
            onScrollToIndexFailed={onScrollToIndexFailed}
          />

          <View style={[styles.composerDock, { paddingBottom: tabBarReserve }]}>
            <FaqQuickBar onSelect={onFaqSelect} disabled={isTyping} />
            <View style={styles.composerRow}>
              <View style={styles.inputShell}>
                <Feather name="edit-3" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputField}
                  placeholder="Ask about safety, shifts, tasks…"
                  placeholderTextColor="#9CA3AF"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={2000}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  editable={!isTyping}
                  onFocus={() => scrollToLatest(true)}
                />
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, (!inputText.trim() || isTyping) && styles.sendBtnDisabled]}
                onPress={onSend}
                disabled={!inputText.trim() || isTyping}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Feather name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

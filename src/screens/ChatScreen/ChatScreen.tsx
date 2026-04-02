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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { dashboardStyles, chatStyles } from '../../styles/styles';
import { colors } from '../../theme/theme';

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const WELCOME_ID = 'welcome';
const ASSISTANT_ACCENT = '#004C99';

const WELCOME_MESSAGE: ChatMessage = {
  id: WELCOME_ID,
  role: 'assistant',
  text:
    "Hi — I'm your Workforce assistant. I’ll help with FAQs, site safety basics, and how to use this app. Ask anything below, or tap a quick topic. (Smart AI replies will plug in here in a future update.)",
};

const PLACEHOLDER_ASSISTANT_REPLY =
  'Thanks for your message. Full AI-powered answers are not connected yet — this screen is the chat UI only. Your questions will go to the assistant once it is enabled.';

const FAQ_CHIPS: { id: string; label: string; userPrompt: string; assistantReply: string }[] = [
  {
    id: 'faq-safety',
    label: 'Site safety',
    userPrompt: 'What should I know about site safety?',
    assistantReply:
      'General site safety: follow your site induction, wear required PPE, report hazards immediately, and use designated walkways. Your supervisor can give location-specific rules.',
  },
  {
    id: 'faq-clock',
    label: 'Clock in / out',
    userPrompt: 'How do I clock in and out?',
    assistantReply:
      'Use the Dashboard clock button when you are on site. Your employer may require you to be in a geo-fenced zone — check with your manager if clock-in fails.',
  },
  {
    id: 'faq-tasks',
    label: 'Site tasks',
    userPrompt: 'Where do I see my site tasks?',
    assistantReply:
      'Open the Tasks tab. It lists worksite actions like induction, equipment checks, and hazard reporting — not general HR or rostering.',
  },
  {
    id: 'faq-report',
    label: 'Report an issue',
    userPrompt: 'How do I report a problem on site?',
    assistantReply:
      'Use Tasks or follow your site’s reporting process. For emergencies, use your site’s emergency procedures first — this app is not a replacement for emergency services.',
  },
];

let messageId = 0;
function nextId(): string {
  messageId += 1;
  return `m-${Date.now()}-${messageId}`;
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerStyles = dashboardStyles;
  const styles = chatStyles;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  /** Floating tab bar: ~72px pill + padding + labels; sits at max(insets,20) from bottom */
  const tabBarReserve = Math.max(insets.bottom, 20) + 104;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const appendExchange = useCallback((userText: string, assistantText: string) => {
    const userMsg: ChatMessage = { id: nextId(), role: 'user', text: userText.trim() };
    const botMsg: ChatMessage = { id: nextId(), role: 'assistant', text: assistantText };
    setMessages((prev) => [...prev, userMsg, botMsg]);
  }, []);

  const onSend = useCallback(() => {
    const t = inputText.trim();
    if (!t) return;
    setInputText('');
    appendExchange(t, PLACEHOLDER_ASSISTANT_REPLY);
  }, [inputText, appendExchange]);

  const onFaqChip = useCallback(
    (chip: (typeof FAQ_CHIPS)[number]) => {
      appendExchange(chip.userPrompt, chip.assistantReply);
    },
    [appendExchange],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => {
      const isUser = item.role === 'user';
      return (
        <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
          {isUser ? (
            <View style={styles.bubbleUser}>
              <Text style={styles.bubbleTextUser}>{item.text}</Text>
            </View>
          ) : (
            <View style={styles.bubbleAssistant}>
              <Text style={styles.bubbleTextAssistant}>{item.text}</Text>
            </View>
          )}
        </View>
      );
    },
    [styles],
  );

  const listHeader = (
    <View style={styles.listHeaderWrap}>
      <View style={styles.assistantBadge}>
        <Feather name="zap" size={16} color={ASSISTANT_ACCENT} />
        <Text style={styles.assistantBadgeText}>AI assistant · FAQs</Text>
      </View>
      <View style={styles.placeholderBanner}>
        <Text style={styles.placeholderBannerText}>
          You are using the chat layout only. Real AI / FAQ automation will be wired in later — messages
          below use sample replies for now.
        </Text>
      </View>
      <Text style={styles.faqSectionLabel}>Quick topics</Text>
      <View style={styles.faqGrid}>
        {FAQ_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={styles.faqChip}
            onPress={() => onFaqChip(chip)}
            activeOpacity={0.85}
          >
            <Text style={styles.faqChipText}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={headerStyles.header}>
        <View style={headerStyles.profileAvatarWrap}>
          <View style={headerStyles.profileAvatar}>
            <Feather name="message-circle" size={22} color={colors.primary} />
          </View>
        </View>
        <Text style={headerStyles.headerTitle}>Assistant</Text>
        <TouchableOpacity style={headerStyles.bellBtn} activeOpacity={0.7}>
          <Feather name="help-circle" size={24} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
       keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
        />

        <View style={[styles.inputBar, { paddingBottom: tabBarReserve }]}>
          <TextInput
            style={styles.inputField}
            placeholder="Ask a question…"
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={!inputText.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Feather name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

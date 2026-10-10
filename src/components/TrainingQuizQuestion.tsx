import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { trainingQuestionMediaUrl } from '../services/trainingApi';
import { colors, fontFamily, spacing } from '../theme/theme';
import type { TrainingQuestion, TrainingQuizDraft } from '../types/training';
import { TrainingSlideImage } from './TrainingSlideImage';
import { TrainingVideoPlayer } from './TrainingVideoPlayer';

type Props = {
  question: TrainingQuestion;
  draft?: TrainingQuizDraft;
  onChange?: (draft: TrainingQuizDraft) => void;
  reveal?: boolean;
};

export function TrainingQuizQuestion({ question, draft, onChange, reveal = false }: Props) {
  const written =
    question.question_type === 'short_answer' ||
    question.question_type === 'fill_blank' ||
    (question.question_type === 'scenario' && question.options.length === 0);
  const multiple = question.allow_multiple || question.question_type === 'multiple_answer';

  return (
    <View>
      {question.prompt ? <Text style={styles.prompt}>{question.prompt}</Text> : null}
      <Text style={reveal ? styles.questionText : styles.questionTextSolo}>{question.question_text}</Text>
      <Text style={styles.points}>
        {question.points} point{question.points === 1 ? '' : 's'}
        {question.question_type === 'multiple_answer' || multiple ? ' · select every correct answer' : ''}
      </Text>
      {question.has_media && question.media_kind === 'image' ? (
        <View style={styles.media}>
          <TrainingSlideImage url={trainingQuestionMediaUrl(question.id, question.media_version)} />
        </View>
      ) : null}
      {question.has_media && question.media_kind === 'video' ? (
        <View style={styles.media}>
          <TrainingVideoPlayer mediaUrl={trainingQuestionMediaUrl(question.id, question.media_version)} label="Play question video" />
        </View>
      ) : null}

      {written ? (
        reveal ? (
          <Text style={styles.answerText}>{question.response_text?.trim() || 'No answer'}</Text>
        ) : (
          <TextInput
            value={draft?.text ?? ''}
            onChangeText={(text) => onChange?.({ text })}
            placeholder={question.question_type === 'fill_blank' ? 'Type the missing word' : 'Type your answer'}
            placeholderTextColor={colors.text.secondary}
            style={styles.input}
            multiline
          />
        )
      ) : null}

      {question.question_type === 'ordering' ? (
        <OrderingList question={question} draft={draft} onChange={onChange} reveal={reveal} />
      ) : null}

      {question.question_type === 'matching' ? (
        <MatchingList question={question} draft={draft} onChange={onChange} reveal={reveal} />
      ) : null}

      {!written && question.question_type !== 'ordering' && question.question_type !== 'matching' ? (
        <View style={styles.optionsWrap}>
          {question.options.map((option, index) => {
            const selected = reveal
              ? multiple
                ? (question.selected_option_ids ?? []).includes(option.id) || question.selected_option_id === option.id
                : question.selected_option_id === option.id
              : multiple
                ? (draft?.optionIds ?? []).includes(option.id)
                : draft?.optionId === option.id;
            const letter = String.fromCharCode(65 + index);
            const correct = reveal && option.is_correct === true;
            return (
              <Pressable
                key={option.id}
                disabled={reveal}
                style={[
                  styles.optionRow,
                  selected && styles.optionSelected,
                  correct && styles.optionCorrect,
                  reveal && selected && !correct && styles.optionWrong,
                ]}
                onPress={() => {
                  if (multiple) {
                    const current = draft?.optionIds ?? [];
                    const optionIds = current.includes(option.id)
                      ? current.filter((id) => id !== option.id)
                      : [...current, option.id];
                    onChange?.({ optionIds });
                    return;
                  }
                  onChange?.({ optionId: option.id });
                }}
              >
                <View style={[styles.letter, (selected || correct) && styles.letterSelected]}>
                  <Text style={[styles.letterText, (selected || correct) && styles.letterTextSelected]}>{letter}</Text>
                </View>
                <Text style={[styles.optionText, (selected || correct) && styles.optionTextSelected]}>
                  {reveal && correct ? '✓ ' : reveal && selected && !correct ? '✗ ' : ''}
                  {option.option_text}
                </Text>
                {selected && !reveal ? <Feather name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {reveal ? <ReviewNote question={question} /> : null}
    </View>
  );
}

function ReviewNote({ question }: { question: TrainingQuestion }) {
  const pending = question.review_status === 'pending';
  const label = pending ? 'Waiting for review' : question.is_correct ? 'Correct' : question.response_text || question.selected_option_id || (question.selected_option_ids ?? []).length || (question.response_order ?? []).length || (question.response_matches ?? []).length ? 'Incorrect' : 'Skipped';
  return (
    <View>
      <Text style={[styles.flag, pending ? styles.flagPending : question.is_correct ? styles.flagOk : styles.flagBad]}>
        {label}
        {question.points_awarded != null && !pending ? ` · ${question.points_awarded}/${question.points}` : ''}
      </Text>
      {question.explanation ? <Text style={styles.feedback}>{question.explanation}</Text> : null}
    </View>
  );
}

function OrderingList({
  question,
  draft,
  onChange,
  reveal,
}: {
  question: TrainingQuestion;
  draft?: TrainingQuizDraft;
  onChange?: (draft: TrainingQuizDraft) => void;
  reveal: boolean;
}) {
  const ids = reveal
    ? question.response_order ?? []
    : draft?.order?.length
      ? draft.order
      : question.options.map((option) => option.id);
  const byId = new Map(question.options.map((option) => [option.id, option]));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...ids];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    next[index] = next[target]!;
    next[target] = current!;
    onChange?.({ order: next });
  };

  return (
    <View style={styles.optionsWrap}>
      {ids.map((id, index) => {
        const option = byId.get(id);
        if (!option) return null;
        return (
          <View key={id} style={styles.optionRow}>
            <Text style={styles.orderIndex}>{index + 1}</Text>
            <Text style={styles.optionText}>{option.option_text}</Text>
            {!reveal ? (
              <View style={styles.orderButtons}>
                <Pressable onPress={() => move(index, -1)} hitSlop={8} accessibilityLabel="Move up">
                  <Feather name="chevron-up" size={18} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => move(index, 1)} hitSlop={8} accessibilityLabel="Move down">
                  <Feather name="chevron-down" size={18} color={colors.primary} />
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      {reveal && (question.correct_option_ids ?? []).length > 0 ? (
        <Text style={styles.feedback}>
          Correct order:{' '}
          {(question.correct_option_ids ?? [])
            .map((id) => byId.get(id)?.option_text)
            .filter((text): text is string => Boolean(text))
            .join(' → ')}
        </Text>
      ) : null}
    </View>
  );
}

function MatchCombo({
  value,
  choices,
  onSelect,
}: {
  value: string;
  choices: string[];
  onSelect: (choice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const listMax = Math.max(240, Math.round(windowHeight * 0.5));

  return (
    <>
      <Pressable style={styles.combo} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={[styles.comboText, value === '' && styles.comboPlaceholder]}>
          {value === '' ? 'Choose a match' : value}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.comboOverlay}>
          <Pressable style={styles.comboBackdrop} onPress={() => setOpen(false)} accessibilityLabel="Close matches" />
          <View
            style={[
              styles.comboSheet,
              {
                maxHeight: Math.round(windowHeight * 0.75),
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <Text style={styles.comboTitle}>Choose a match</Text>
            <ScrollView
              style={[styles.comboList, { maxHeight: listMax }]}
              contentContainerStyle={styles.comboListContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              removeClippedSubviews={false}
              showsVerticalScrollIndicator
            >
              {choices.map((choice) => {
                const selected = value === choice;
                return (
                  <Pressable
                    key={choice}
                    style={[styles.comboOption, selected && styles.optionSelected]}
                    onPress={() => {
                      onSelect(choice);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionText}>{choice}</Text>
                    {selected ? <Feather name="check" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function MatchingList({
  question,
  draft,
  onChange,
  reveal,
}: {
  question: TrainingQuestion;
  draft?: TrainingQuizDraft;
  onChange?: (draft: TrainingQuizDraft) => void;
  reveal: boolean;
}) {
  const choices = Array.isArray(question.match_choices) ? question.match_choices : [];
  return (
    <View style={styles.optionsWrap}>
      {question.options.map((option) => {
        const given = reveal
          ? question.response_matches?.find((pair) => pair.option_id === option.id)?.match_text ?? ''
          : draft?.matches?.[option.id] ?? '';
        return (
          <View key={option.id} style={styles.matchBlock}>
            <Text style={styles.matchLeft}>{option.option_text}</Text>
            {reveal ? (
              <Text style={styles.answerText}>
                {given || 'No match'}
                {option.match_text ? ` · correct: ${option.match_text}` : ''}
              </Text>
            ) : (
              <MatchCombo
                value={given}
                choices={choices.filter((choice) => {
                  if (choice === given) return true;
                  return !question.options.some(
                    (other) => other.id !== option.id && (draft?.matches?.[other.id] ?? '') === choice,
                  );
                })}
                onSelect={(choice) => onChange?.({ matches: { ...(draft?.matches ?? {}), [option.id]: choice } })}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  questionTextSolo: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    color: colors.text.primary,
    lineHeight: 28,
  },
  questionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  points: {
    marginTop: 6,
    marginBottom: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  media: { marginBottom: spacing.md },
  optionsWrap: { gap: spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: '#E8F1FB',
    borderColor: colors.primary,
  },
  optionCorrect: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  optionWrong: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  letter: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterSelected: { backgroundColor: colors.primary },
  letterText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  letterTextSelected: { color: '#FFFFFF' },
  optionText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 15, color: colors.text.primary },
  optionTextSelected: { fontFamily: fontFamily.semiBold },
  input: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.text.primary,
    textAlignVertical: 'top',
  },
  answerText: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  flag: { marginTop: spacing.md, fontFamily: fontFamily.semiBold, fontSize: 13 },
  flagOk: { color: '#047857' },
  flagBad: { color: '#B91C1C' },
  flagPending: { color: '#B45309' },
  feedback: { marginTop: 6, fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  orderIndex: { width: 24, fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary },
  orderButtons: { gap: 2 },
  matchBlock: { gap: 8 },
  matchLeft: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text.primary },
  combo: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  comboText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 15, color: colors.text.primary },
  comboPlaceholder: { color: colors.text.secondary },
  comboOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 29, 61, 0.45)',
  },
  comboBackdrop: { flex: 1 },
  comboSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    gap: spacing.sm,
  },
  comboTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.text.primary, marginBottom: 4 },
  comboList: { flexGrow: 0, flexShrink: 1 },
  comboListContent: { gap: 8, paddingBottom: 8 },
  comboOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});

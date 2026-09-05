import type { ComponentProps } from 'react';
import Feather from 'react-native-vector-icons/Feather';

export type ChatFaq = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  question: string;
  answer: string;
  keywords: string[];
};

const FALLBACK_ICON: ComponentProps<typeof Feather>['name'] = 'help-circle';

/** Map API FAQ payload into the shape used by Chat Help UI. */
export function normalizeChatFaq(raw: {
  id: number | string;
  label?: string;
  icon?: string;
  question?: string;
  answer?: string;
  keywords?: string[];
}): ChatFaq {
  const iconName = (raw.icon || FALLBACK_ICON) as ComponentProps<typeof Feather>['name'];
  return {
    id: String(raw.id),
    label: (raw.label || '').trim() || 'FAQ',
    icon: iconName,
    question: (raw.question || '').trim(),
    answer: (raw.answer || '').trim(),
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
      : [],
  };
}

export function findFaqAnswer(faqs: ChatFaq[], userText: string): string | null {
  const normalized = userText.toLowerCase().trim();
  if (!normalized || faqs.length === 0) return null;

  for (const faq of faqs) {
    if (normalized === faq.question.toLowerCase()) return faq.answer;
    if (normalized === faq.label.toLowerCase()) return faq.answer;
  }

  let best: ChatFaq | null = null;
  let bestScore = 0;

  for (const faq of faqs) {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (normalized.includes(keyword.toLowerCase())) score += keyword.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }

  return bestScore >= 4 && best ? best.answer : null;
}

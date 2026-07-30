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

export const CHAT_FAQS: ChatFaq[] = [
  {
    id: 'faq-safety',
    label: 'Site safety',
    icon: 'shield',
    question: 'What should I know about site safety?',
    answer:
      'Always complete your site induction before starting work. Wear the PPE required for your role, stay on designated walkways, and never enter restricted zones without authorization. Report hazards, near-misses, and injuries to your supervisor immediately — don’t wait until end of shift.',
    keywords: ['safety', 'ppe', 'hazard', 'induction', 'protective'],
  },
  {
    id: 'faq-clock',
    label: 'Clock in / out',
    icon: 'clock',
    question: 'How do I clock in and out?',
    answer:
      'Go to the Dashboard tab and tap the clock button when you arrive on site. You must clock out when you leave. If clock-in fails, you may be outside the geo-fence — move closer to the worksite boundary or speak to your supervisor.',
    keywords: ['clock', 'clock in', 'clock out', 'time clock', 'punch'],
  },
  {
    id: 'faq-shifts',
    label: 'My shifts',
    icon: 'calendar',
    question: 'Where can I see my upcoming shifts?',
    answer:
      'Open the Shifts tab to view your roster, start/end times, and location details. Pull down to refresh if your schedule was recently updated by your employer.',
    keywords: ['shift', 'roster', 'schedule', 'upcoming', 'calendar'],
  },
  {
    id: 'faq-tasks',
    label: 'Site tasks',
    icon: 'clipboard',
    question: 'Where do I see my site tasks?',
    answer:
      'Open the Tasks tab. You will find worksite actions such as induction checklists, equipment inspections, toolbox talks, and hazard reporting. Mark tasks complete once finished — your supervisor can track progress from the office.',
    keywords: ['task', 'checklist', 'todo', 'assignment', 'inspection'],
  },
  {
    id: 'faq-geofence',
    label: 'Geo-fence',
    icon: 'map-pin',
    question: 'Why was I clocked out automatically?',
    answer:
      'CruLynk monitors your location while you are clocked in. If you leave the worksite geo-fence, the app may alert you or auto clock-out depending on your employer’s settings. Stay within the site boundary while on the clock, or clock out before leaving.',
    keywords: ['geo', 'geofence', 'location', 'auto clock', 'clocked out', 'boundary'],
  },
  {
    id: 'faq-profile',
    label: 'My profile',
    icon: 'user',
    question: 'How do I update my profile?',
    answer:
      'Tap your profile photo in the top-left corner of any tab to open My Profile. From there you can update your contact details, photo, and qualifications. Some fields may require admin approval before they appear on site records.',
    keywords: ['profile', 'photo', 'details', 'account', 'qualification'],
  },
  {
    id: 'faq-report',
    label: 'Report issue',
    icon: 'alert-circle',
    question: 'How do I report a problem on site?',
    answer:
      'For non-emergencies, use the Tasks tab or your site’s reporting process to log the issue. For emergencies, follow your site’s emergency procedures and call the appropriate services first — CruLynk is not a replacement for emergency response.',
    keywords: ['report', 'issue', 'problem', 'incident', 'emergency'],
  },
  {
    id: 'faq-breaks',
    label: 'Breaks',
    icon: 'coffee',
    question: 'Do I need to clock out for breaks?',
    answer:
      'This depends on your employer’s policy. Some sites require you to stay clocked in for paid breaks; others ask you to clock out for unpaid meal breaks. Check with your supervisor or site rules if you are unsure.',
    keywords: ['break', 'lunch', 'meal', 'rest'],
  },
];

export function findFaqAnswer(userText: string): string | null {
  const normalized = userText.toLowerCase().trim();
  if (!normalized) return null;

  for (const faq of CHAT_FAQS) {
    if (normalized === faq.question.toLowerCase()) return faq.answer;
    if (normalized === faq.label.toLowerCase()) return faq.answer;
  }

  let best: ChatFaq | null = null;
  let bestScore = 0;

  for (const faq of CHAT_FAQS) {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (normalized.includes(keyword.toLowerCase())) score += keyword.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }

  return bestScore >= 4 ? best!.answer : null;
}

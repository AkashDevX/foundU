export type MessagingPeerType = 'employee' | 'company_admin';

export type MessagingDirectoryItem = {
  type: MessagingPeerType;
  id: number;
  public_id: string | null;
  display_name: string;
  subtitle: string | null;
};

export type MessagingAttachmentMeta = {
  id: number;
  name: string | null;
  mime: string | null;
  size: number | null;
};

export type MessagingMessage = {
  id: number;
  conversation_id: number;
  sender_type: MessagingPeerType | string;
  sender_id: number;
  sender_display_name: string;
  body: string | null;
  message_type: 'text' | 'image' | 'file' | 'system' | string;
  attachment: MessagingAttachmentMeta | null;
  created_at: string | null;
  deleted?: boolean;
  is_mine?: boolean;
};

export type MessagingConversation = {
  id: number;
  type: 'direct' | 'group' | string;
  title: string;
  participants: Array<{
    type: MessagingPeerType | string;
    id: number;
    display_name: string;
  }>;
  peer_employee_id?: number | null;
  /** Present for employee DMs when a block exists either way. */
  block_status?: 'none' | 'blocked_by_me' | 'blocked_me' | string;
  can_send?: boolean;
  last_message: {
    id: number;
    body: string | null;
    message_type: string;
    sender_display_name: string;
    created_at: string | null;
  } | null;
  last_message_at: string | null;
  unread_count: number;
};

export type MessagingBlock = {
  employee_id: number;
  public_id: string | null;
  display_name: string;
  blocked_at: string | null;
};

export type PendingAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

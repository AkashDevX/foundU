import { API_BASE_URL } from '../config/api';
import type {
  MessagingBlock,
  MessagingConversation,
  MessagingDirectoryItem,
  MessagingMessage,
  MessagingPeerType,
  PendingAttachment,
} from '../types/messaging';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';
import { Linking, Platform, NativeModules, TurboModuleRegistry } from 'react-native';

type ApiFail = { ok: false; message: string };
type ApiOk<T> = { ok: true; data: T };

async function resolveCompanySlug(): Promise<string | null> {
  let slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuthHeaders(
  json = true,
): Promise<{ ok: true; headers: Record<string, string> } | ApiFail> {
  const token = await getAuthToken();
  if (!token || token.trim() === '') {
    return { ok: false, message: 'Not signed in.' };
  }
  const slug = await resolveCompanySlug();
  if (!slug) {
    return {
      ok: false,
      message: 'Organization context missing. Sign out and sign in again.',
    };
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Company-Slug': slug,
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return { ok: true, headers };
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    if (obj.errors && typeof obj.errors === 'object') {
      const first = Object.values(obj.errors as Record<string, unknown>)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
      if (typeof first === 'string') return first;
    }
  }
  return fallback;
}

async function getJson<T>(
  path: string,
  fallback: string,
): Promise<ApiOk<T> | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: auth.headers,
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, fallback) };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, message: 'Network error. Check your connection.' };
  }
}

async function postJson<T>(
  path: string,
  body: unknown,
  fallback: string,
  fetchOptions?: { timeoutMs?: number; retries?: number; retryDelayMs?: number },
): Promise<ApiOk<T> | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify(body),
      },
      fetchOptions,
    );
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, fallback) };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, message: 'Network error. Check your connection.' };
  }
}

export async function fetchMessagingDirectory(): Promise<
  ApiOk<{ items: MessagingDirectoryItem[] }> | ApiFail
> {
  return getJson('/api/v1/messaging/directory', 'Could not load directory.');
}

let conversationsInFlight: Promise<
  ApiOk<{ conversations: MessagingConversation[] }> | ApiFail
> | null = null;

export async function fetchConversations(): Promise<
  ApiOk<{ conversations: MessagingConversation[] }> | ApiFail
> {
  if (conversationsInFlight) {
    return conversationsInFlight;
  }
  conversationsInFlight = getJson<{ conversations: MessagingConversation[] }>(
    '/api/v1/messaging/conversations',
    'Could not load conversations.',
  ).finally(() => {
    conversationsInFlight = null;
  });
  return conversationsInFlight;
}

export async function openDirectConversation(
  peerType: MessagingPeerType,
  peerId: number,
): Promise<ApiOk<{ conversation: MessagingConversation }> | ApiFail> {
  return postJson(
    '/api/v1/messaging/conversations/direct',
    { peer_type: peerType, peer_id: peerId },
    'Could not open conversation.',
  );
}

export async function createGroupConversation(
  title: string,
  memberIds: number[],
  includeAdmin: boolean,
): Promise<ApiOk<{ conversation: MessagingConversation }> | ApiFail> {
  return postJson(
    '/api/v1/messaging/conversations/groups',
    { title, member_ids: memberIds, include_admin: includeAdmin },
    'Could not create group.',
  );
}

export async function fetchMessages(
  conversationId: number,
  afterId?: number,
  options?: { limit?: number },
): Promise<
  ApiOk<{ conversation: MessagingConversation; messages: MessagingMessage[] }> | ApiFail
> {
  const params = new URLSearchParams();
  if (afterId != null) params.set('after_id', String(afterId));
  if (options?.limit != null) params.set('limit', String(options.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages${qs}`,
      {
        method: 'GET',
        headers: auth.headers,
      },
      { timeoutMs: 25_000, retries: 2, retryDelayMs: 800 },
    );
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, 'Could not load messages.') };
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('messages' in (parsed as Record<string, unknown>))
    ) {
      return { ok: false, message: 'Could not load messages. Invalid server response.' };
    }
    return {
      ok: true,
      data: parsed as { conversation: MessagingConversation; messages: MessagingMessage[] },
    };
  } catch (error) {
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Taking longer than usual. Tap to retry.'
        : 'Connection issue. Tap to retry.';
    return { ok: false, message: msg };
  }
}

export async function sendMessage(
  conversationId: number,
  body: string,
  attachment?: PendingAttachment | null,
): Promise<ApiOk<{ message: MessagingMessage }> | ApiFail> {
  const auth = await tenantAuthHeaders(false);
  if (!auth.ok) return auth;

  try {
    let res: Response;
    if (attachment) {
      const form = new FormData();
      if (body.trim()) form.append('body', body.trim());
      form.append('attachment', {
        uri: attachment.uri,
        name: attachment.name,
        type: attachment.type || 'application/octet-stream',
      } as unknown as Blob);
      res = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: auth.headers,
          body: form,
        },
      );
    } else {
      const jsonAuth = await tenantAuthHeaders(true);
      if (!jsonAuth.ok) return jsonAuth;
      res = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: jsonAuth.headers,
          body: JSON.stringify({ body }),
        },
      );
    }
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, 'Could not send message.') };
    }
    return { ok: true, data: parsed as { message: MessagingMessage } };
  } catch {
    return { ok: false, message: 'Network error. Check your connection.' };
  }
}

export function attachmentDownloadUrl(messageId: number): string {
  return `${API_BASE_URL}/api/v1/messaging/attachments/${messageId}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('btoa is not available');
}

/**
 * Fetches a protected chat attachment and returns a data URI for display
 * (RN Image often ignores Authorization headers on Android).
 */
export async function fetchAttachmentAsDataUri(
  messageId: number,
): Promise<ApiOk<{ uri: string; mime: string }> | ApiFail> {
  const auth = await tenantAuthHeaders(false);
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(
      attachmentDownloadUrl(messageId),
      {
        method: 'GET',
        headers: {
          ...auth.headers,
          Accept: '*/*',
        },
      },
      { timeoutMs: 45_000, retries: 1, retryDelayMs: 600 },
    );
    if (!res.ok) {
      const raw = await res.text();
      const parsed = tryParseApiJson(raw);
      return { ok: false, message: errorMessage(parsed, 'Could not open attachment.') };
    }
    const mime = res.headers.get('content-type')?.split(';')?.[0]?.trim() || 'application/octet-stream';
    const ab = await res.arrayBuffer();
    const b64 = arrayBufferToBase64(ab);
    return { ok: true, data: { uri: `data:${mime};base64,${b64}`, mime } };
  } catch (error) {
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Attachment took too long to open. Try again.'
        : 'Could not open attachment. Check your connection.';
    return { ok: false, message: msg };
  }
}

/**
 * Authenticated request for a short-lived signed URL the system viewer can open.
 */
export async function fetchAttachmentOpenLink(
  messageId: number,
): Promise<ApiOk<{ url: string; name: string | null; mime: string | null }> | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/messaging/attachments/${messageId}/link`,
      {
        method: 'GET',
        headers: auth.headers,
      },
      { timeoutMs: 20_000, retries: 1, retryDelayMs: 500 },
    );
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, 'Could not open attachment.') };
    }
    const url =
      parsed && typeof parsed === 'object' && typeof (parsed as { url?: unknown }).url === 'string'
        ? (parsed as { url: string }).url
        : '';
    if (!url) {
      return { ok: false, message: 'Could not open attachment. Invalid server response.' };
    }
    return {
      ok: true,
      data: {
        url,
        name:
          parsed && typeof parsed === 'object' && typeof (parsed as { name?: unknown }).name === 'string'
            ? (parsed as { name: string }).name
            : null,
        mime:
          parsed && typeof parsed === 'object' && typeof (parsed as { mime?: unknown }).mime === 'string'
            ? (parsed as { mime: string }).mime
            : null,
      },
    };
  } catch {
    return { ok: false, message: 'Could not open attachment. Check your connection.' };
  }
}

function guessMimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
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
  return 'application/octet-stream';
}

function resolveAttachmentMime(fileName: string, mimeHint?: string | null): string {
  const hinted = (mimeHint || '').trim().toLowerCase();
  if (hinted) return hinted;
  return guessMimeFromFileName(fileName);
}

type BlobUtilModule = {
  fs: {
    dirs: { CacheDir?: string; DownloadDir?: string };
    exists: (path: string) => Promise<boolean>;
    unlink: (path: string) => Promise<void>;
    writeFile: (path: string, data: string | number[], encoding?: string) => Promise<void>;
  };
  MediaCollection?: {
    copyToMediaStore: (
      file: { name: string; parentFolder: string; mimeType: string },
      collection: 'Download' | 'Audio' | 'Image' | 'Video',
      path: string,
    ) => Promise<string>;
  };
  ios: { openDocument: (path: string) => void };
  android: {
    actionViewIntent: (path: string, mime: string, chooserTitle?: string | null) => Promise<void>;
    addCompleteDownload: (config: {
      title: string;
      description: string;
      mime: string;
      path: string;
      showNotification: boolean;
    }) => Promise<void>;
  };
};

function loadBlobUtil(): BlobUtilModule | null {
  const blobLinked =
    Boolean(NativeModules.ReactNativeBlobUtil) ||
    TurboModuleRegistry.get('ReactNativeBlobUtil') != null;
  if (!blobLinked) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-blob-util').default as BlobUtilModule;
    if (!mod?.fs?.dirs?.CacheDir || !mod.fs.writeFile || !mod.android?.actionViewIntent) {
      return null;
    }
    return mod;
  } catch {
    return null;
  }
}

function sanitizeAttachmentFileName(messageId: number, fileName: string, mime: string): string {
  let safeName = (fileName || `attachment-${messageId}`).replace(/[\\/:*?"<>|]/g, '_');
  if (mime === 'application/pdf' && !safeName.toLowerCase().endsWith('.pdf')) {
    safeName = `${safeName}.pdf`;
  }
  return safeName;
}

async function tryAndroidViewIntent(
  blob: BlobUtilModule,
  path: string,
  mime: string,
): Promise<boolean> {
  try {
    // Pass null chooser — Android's createChooser breaks FileProvider URI grants on many devices.
    await blob.android.actionViewIntent(path, mime, null);
    return true;
  } catch {
    return false;
  }
}

async function saveToDownloadsFolder(
  blob: BlobUtilModule,
  cachePath: string,
  safeName: string,
  mime: string,
): Promise<string | null> {
  if (!blob.MediaCollection?.copyToMediaStore) {
    return null;
  }
  try {
    const uri = await blob.MediaCollection.copyToMediaStore(
      { name: safeName, parentFolder: 'CruLynk', mimeType: mime },
      'Download',
      cachePath,
    );
    return uri?.trim() ? uri : null;
  } catch {
    return null;
  }
}

async function fetchAttachmentBytes(
  messageId: number,
  authHeaders: Record<string, string>,
): Promise<ApiOk<ArrayBuffer> | ApiFail> {
  try {
    const res = await fetchWithTimeout(
      attachmentDownloadUrl(messageId),
      {
        method: 'GET',
        headers: {
          Authorization: authHeaders.Authorization || '',
          'X-Company-Slug': authHeaders['X-Company-Slug'] || '',
          Accept: '*/*',
        },
      },
      { timeoutMs: 60_000, retries: 1, retryDelayMs: 600 },
    );
    if (!res.ok) {
      const raw = await res.text();
      const parsed = tryParseApiJson(raw);
      return { ok: false, message: errorMessage(parsed, 'Could not download this file.') };
    }
    return { ok: true, data: await res.arrayBuffer() };
  } catch {
    return { ok: false, message: 'Could not download this file. Check your connection.' };
  }
}

async function fetchSignedAttachmentBytes(
  messageId: number,
): Promise<ApiOk<ArrayBuffer> | ApiFail> {
  const link = await fetchAttachmentOpenLink(messageId);
  if (!link.ok) return link;

  try {
    const res = await fetchWithTimeout(
      link.data.url,
      {
        method: 'GET',
        headers: { Accept: '*/*' },
      },
      { timeoutMs: 60_000, retries: 1, retryDelayMs: 600 },
    );
    if (!res.ok) {
      return { ok: false, message: 'Could not download this file.' };
    }
    return { ok: true, data: await res.arrayBuffer() };
  } catch {
    return { ok: false, message: 'Could not download this file. Check your connection.' };
  }
}

async function downloadAttachmentToCache(
  blob: BlobUtilModule,
  messageId: number,
  fileName: string,
  mime: string,
  authHeaders: Record<string, string>,
): Promise<ApiOk<{ path: string; safeName: string }> | ApiFail> {
  const safeName = sanitizeAttachmentFileName(messageId, fileName, mime);

  const cacheDir = blob.fs.dirs.CacheDir;
  if (!cacheDir) {
    return { ok: false, message: 'Could not access device storage.' };
  }

  const path = `${cacheDir}/chat-att-${messageId}-${safeName}`;

  let bytes = await fetchAttachmentBytes(messageId, authHeaders);
  if (!bytes.ok) {
    bytes = await fetchSignedAttachmentBytes(messageId);
  }
  if (!bytes.ok) {
    return bytes;
  }
  if (bytes.data.byteLength < 1) {
    return { ok: false, message: 'Downloaded file appears empty.' };
  }

  try {
    if (await blob.fs.exists(path)) {
      await blob.fs.unlink(path);
    }

    try {
      const data = Array.from(new Uint8Array(bytes.data));
      await blob.fs.writeFile(path, data);
    } catch {
      const b64 = arrayBufferToBase64(bytes.data);
      await blob.fs.writeFile(path, b64, 'base64');
    }

    if (!(await blob.fs.exists(path))) {
      return { ok: false, message: 'Could not save this file on your device.' };
    }

    return { ok: true, data: { path, safeName } };
  } catch {
    return { ok: false, message: 'Could not save this file on your device.' };
  }
}

async function openLocalAttachment(
  blob: BlobUtilModule,
  path: string,
  safeName: string,
  mime: string,
  fileName: string,
): Promise<ApiOk<{ opened: true; savedToDownloads?: boolean }> | ApiFail> {
  if (Platform.OS === 'ios') {
    try {
      blob.ios.openDocument(path);
      return { ok: true, data: { opened: true } };
    } catch {
      return { ok: false, message: 'Could not open this file on your device.' };
    }
  }

  const openMimeCandidates =
    mime === 'application/pdf'
      ? ['application/pdf', 'application/octet-stream']
      : [mime, 'application/octet-stream'];

  for (const candidate of openMimeCandidates) {
    if (await tryAndroidViewIntent(blob, path, candidate)) {
      return { ok: true, data: { opened: true } };
    }
  }

  const downloadUri = await saveToDownloadsFolder(blob, path, safeName, mime);
  if (downloadUri) {
    for (const candidate of openMimeCandidates) {
      if (await tryAndroidViewIntent(blob, downloadUri, candidate)) {
        return { ok: true, data: { opened: true } };
      }
    }
    return {
      ok: true,
      data: { opened: true, savedToDownloads: true },
    };
  }

  try {
    await blob.android.addCompleteDownload({
      title: fileName || safeName,
      description: 'Chat attachment',
      mime,
      path,
      showNotification: true,
    });
    return { ok: true, data: { opened: true, savedToDownloads: true } };
  } catch {
    return {
      ok: false,
      message:
        'Could not open this PDF. Install a PDF viewer from the Play Store (e.g. Google PDF Viewer), then try again.',
    };
  }
}

/**
 * Downloads the attachment locally, then opens it with a system app chooser.
 * PDFs never open in the browser. If no viewer is installed, the file is saved to Downloads.
 */
export async function openAttachmentWithSystemViewer(
  messageId: number,
  fileName: string,
  mimeHint?: string | null,
): Promise<ApiOk<{ opened: true; savedToDownloads?: boolean }> | ApiFail> {
  const mime = resolveAttachmentMime(fileName || `file-${messageId}`, mimeHint);
  const isPdf = mime === 'application/pdf';

  const auth = await tenantAuthHeaders(false);
  if (!auth.ok) return auth;

  const blob = loadBlobUtil();
  if (blob) {
    const downloaded = await downloadAttachmentToCache(
      blob,
      messageId,
      fileName,
      mime,
      auth.headers,
    );
    if (!downloaded.ok) {
      return downloaded;
    }

    return openLocalAttachment(
      blob,
      downloaded.data.path,
      downloaded.data.safeName,
      mime,
      fileName || `file-${messageId}`,
    );
  }

  if (isPdf) {
    return {
      ok: false,
      message:
        'PDF viewer needs a one-time app rebuild to work on your device. Run: npx react-native run-android',
    };
  }

  // Last resort for non-PDF types when blob-util is not linked yet.
  const link = await fetchAttachmentOpenLink(messageId);
  if (!link.ok) return link;

  try {
    await Linking.openURL(link.data.url);
    return { ok: true, data: { opened: true } };
  } catch {
    return {
      ok: false,
      message: 'Could not open this file. Rebuild the app to use your device’s file viewers.',
    };
  }
}

export async function fetchBlocks(): Promise<ApiOk<{ blocks: MessagingBlock[] }> | ApiFail> {
  return getJson('/api/v1/messaging/blocks', 'Could not load blocked users.');
}

export async function fetchMessagingPolicy(): Promise<
  ApiOk<{
    content: string;
    version: number;
    last_updated_on: string | null;
    accepted: boolean;
  }> | ApiFail
> {
  return getJson('/api/v1/messaging/policy', 'Could not load messaging policy.');
}

export async function acceptMessagingPolicy(): Promise<
  ApiOk<{ accepted: boolean; policy_version: number; accepted_at: string | null }> | ApiFail
> {
  return postJson('/api/v1/messaging/policy/accept', {}, 'Could not accept messaging policy.');
}

export async function reportMessage(
  messageId: number,
  reason: string,
): Promise<ApiOk<{ reported: boolean; report_id: number }> | ApiFail> {
  return postJson(
    `/api/v1/messaging/messages/${messageId}/report`,
    { reason },
    'Could not submit report.',
    // Avoid long multi-retry hangs on a write that may already have succeeded.
    { timeoutMs: 20_000, retries: 0 },
  );
}

export async function reportConversation(
  conversationId: number,
  reason: string,
): Promise<ApiOk<{ reported: boolean; report_id: number; message_id?: number }> | ApiFail> {
  return postJson(
    `/api/v1/messaging/conversations/${conversationId}/report`,
    { reason },
    'Could not submit report.',
    { timeoutMs: 20_000, retries: 0 },
  );
}

export async function fetchChatFaqs(): Promise<
  ApiOk<{
    faqs: Array<{
      id: number;
      label: string;
      icon: string;
      question: string;
      answer: string;
      keywords: string[];
    }>;
  }> | ApiFail
> {
  return getJson('/api/v1/messaging/faqs', 'Could not load help FAQs.');
}

export async function blockEmployee(
  employeeId: number,
): Promise<ApiOk<{ blocked: boolean }> | ApiFail> {
  return postJson('/api/v1/messaging/blocks', { employee_id: employeeId }, 'Could not block user.');
}

export async function unblockEmployee(
  employeeId: number,
): Promise<ApiOk<{ blocked: boolean }> | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/messaging/blocks/${employeeId}`, {
      method: 'DELETE',
      headers: auth.headers,
    });
    const raw = await res.text();
    const parsed = tryParseApiJson(raw);
    if (!res.ok) {
      return { ok: false, message: errorMessage(parsed, 'Could not unblock user.') };
    }
    return { ok: true, data: parsed as { blocked: boolean } };
  } catch {
    return { ok: false, message: 'Network error. Check your connection.' };
  }
}

export async function authHeadersForDownload(): Promise<
  { ok: true; headers: Record<string, string> } | ApiFail
> {
  return tenantAuthHeaders(false);
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';
import { MessageCircle, Send, Trash2, Loader2, ImageIcon, Pin, PinOff, X, AtSign, Users, ChevronLeft, Plus, Lock, Hash, Settings, UserPlus, UserMinus, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { cn, normalizeForSearch } from '@/lib/utils';
import type { User } from '@shared/schema';
import { MANAGER_ROLES } from '@shared/schema';

/* ── Types ────────────────────────────────────────────────────────────── */

type Message = {
  id: number;
  senderId: number;
  senderName: string;
  content: string;
  photoUrl: string | null;
  createdAt: string;
  isDeleted: boolean;
  isPinned: boolean;
};

type DMMessage = {
  id: number;
  senderId: number;
  receiverId: number;
  senderName: string;
  content: string;
  photoUrl: string | null;
  createdAt: string;
  isRead: boolean;
};

type DMConversation = {
  userId: number;
  userName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type NameEntry = { id: number; name: string };

type Channel = {
  id: number;
  name: string;
  description: string | null;
  createdBy: number;
  isDefault: boolean;
  unreadCount: number;
};

type ChannelMember = { userId: number; userName: string };

/* ── Helpers ──────────────────────────────────────────────────────────── */

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1000;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Dün ' + format(d, 'HH:mm');
  return format(d, 'd MMM HH:mm', { locale: tr });
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];
function getAvatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

function renderWithMentions(content: string, currentUserName?: string) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      const mentionedName = part.slice(1);
      const isMe = currentUserName &&
        (mentionedName.toLowerCase() === currentUserName.toLowerCase());
      return (
        <span key={i} className={`font-semibold rounded px-0.5 ${isMe ? 'bg-yellow-200 text-yellow-900 dark:bg-yellow-700/60 dark:text-yellow-100' : 'text-primary'}`}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ── MessageBubble ────────────────────────────────────────────────────── */

function MessageBubble({
  msg, isOwn, showAvatar, showActions, onLightbox, onDelete, onPin, isAdmin, currentUserName,
}: {
  msg: { id: number; senderId: number; senderName: string; content: string; photoUrl: string | null; createdAt: string; isPinned?: boolean };
  isOwn: boolean;
  showAvatar: boolean;
  showActions?: boolean;
  onLightbox?: (src: string) => void;
  onDelete?: () => void;
  onPin?: () => void;
  isAdmin?: boolean;
  currentUserName?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-end gap-2 group ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${!showAvatar ? (isOwn ? 'pr-10' : 'pl-10') : ''}`}
    >
      {showAvatar ? (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(msg.senderId)}`}>
          {getInitials(msg.senderName || '?')}
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div className={`relative max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {showAvatar && !isOwn && (
          <span className="text-xs font-semibold text-muted-foreground ml-1">{msg.senderName}</span>
        )}
        {msg.isPinned && (
          <span className={`flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-0.5 ${isOwn ? 'justify-end mr-1' : 'ml-1'}`}>
            <Pin className="w-2.5 h-2.5" /> Sabitlenmiş
          </span>
        )}
        <div className={`relative rounded-2xl overflow-hidden ${isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'} ${msg.isPinned ? 'ring-1 ring-amber-400/60' : ''}`}>
          {msg.photoUrl && (
            <img
              src={msg.photoUrl}
              alt="Fotoğraf"
              className="max-w-[260px] max-h-[260px] object-cover cursor-pointer w-full"
              onClick={() => onLightbox?.(msg.photoUrl!)}
              data-testid={`img-chat-${msg.id}`}
            />
          )}
          {msg.content && (
            <div className="px-4 py-2.5 text-sm leading-relaxed">
              {renderWithMentions(msg.content, currentUserName)}
            </div>
          )}
          <span className={`block text-[10px] pb-1.5 px-4 ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
            {formatMsgTime(msg.createdAt)}
          </span>
        </div>
      </div>

      {showActions && isAdmin && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onPin && (
            <button onClick={onPin} className={`p-1 transition-colors ${msg.isPinned ? 'text-amber-500 hover:text-amber-700' : 'text-muted-foreground hover:text-amber-500'}`} title={msg.isPinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} data-testid={`button-pin-${msg.id}`}>
              {msg.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-1 hover:text-destructive text-muted-foreground transition-colors" title="Mesajı sil" data-testid={`button-delete-message-${msg.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ── MessageInput ─────────────────────────────────────────────────────── */

function MessageInput({
  onSend, isPending, nameList = [], placeholder,
}: {
  onSend: (content: string, photoUrl?: string) => void;
  isPending: boolean;
  nameList?: NameEntry[];
  placeholder?: string;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [showMention, setShowMention] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredUsers = nameList.filter(u =>
    normalizeForSearch(u.name).startsWith(normalizeForSearch(mentionQuery)) && u.name !== ''
  );

  useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);
    if (atMatch && nameList.length > 0) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
      setShowMention(true);
    } else {
      setShowMention(false);
    }
  };

  const insertMention = (name: string) => {
    const cursor = textareaRef.current?.selectionStart ?? message.length;
    const before = message.slice(0, mentionStart);
    const after = message.slice(cursor);
    const newMsg = before + '@' + name + ' ' + after;
    setMessage(newMsg);
    setShowMention(false);
    setTimeout(() => {
      const pos = mentionStart + name.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  };

  const handleSend = () => {
    if ((!message.trim() && !photoPreview) || isPending) return;
    onSend(message.trim(), photoPreview ?? undefined);
    setMessage('');
    setPhotoPreview(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMention && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredUsers.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredUsers.length) % filteredUsers.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredUsers[mentionIndex].name); return; }
      if (e.key === 'Escape') { setShowMention(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImage(file);
      setPhotoPreview(b64);
    } catch {
      toast({ title: 'Fotoğraf yüklenemedi', variant: 'destructive' });
    }
    e.target.value = '';
  };

  return (
    <div className="mt-3 relative">
      <AnimatePresence>
        {showMention && filteredUsers.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full mb-2 left-12 z-50 bg-popover border border-border/60 rounded-xl shadow-lg overflow-hidden min-w-[180px] max-w-xs"
          >
            <div className="px-3 py-1.5 border-b border-border/40 flex items-center gap-1.5">
              <AtSign className="w-3 h-3 text-primary" />
              <span className="text-[11px] text-muted-foreground font-medium">Kullanıcı etiketle</span>
            </div>
            {filteredUsers.map((u, i) => (
              <button
                key={u.id}
                data-testid={`button-mention-user-${u.id}`}
                onMouseDown={e => { e.preventDefault(); insertMention(u.name); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === mentionIndex ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(u.id)}`}>
                  {getInitials(u.name)}
                </div>
                {u.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {photoPreview && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-2 relative inline-flex">
            <div className="relative">
              <img src={photoPreview} alt="Önizleme" className="h-20 rounded-xl object-cover border border-border/50 shadow-sm" />
              <button
                onClick={() => setPhotoPreview(null)}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                data-testid="button-remove-photo-preview"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 items-end">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} data-testid="input-photo-upload" />
        <Button
          variant="outline" size="icon"
          className="h-[52px] w-[52px] rounded-2xl shrink-0 border-border/60"
          onClick={() => fileInputRef.current?.click()}
          title="Fotoğraf ekle"
          data-testid="button-attach-photo"
        >
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        </Button>
        <Textarea
          ref={textareaRef}
          placeholder={placeholder ?? 'Mesajınızı yazın...'}
          className="rounded-2xl resize-none min-h-[52px] max-h-[120px] flex-1 border-border/60 focus-visible:ring-primary/40 shadow-sm"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowMention(false), 150)}
          data-testid="input-chat-message"
        />
        <Button
          onClick={handleSend}
          disabled={(!message.trim() && !photoPreview) || isPending}
          className="h-[52px] px-5 rounded-2xl shadow-sm"
          data-testid="button-send-message"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

/* ── GeneralChat ──────────────────────────────────────────────────────── */

function GeneralChat({ user, nameList, channelId = null }: { user: User; nameList: NameEntry[]; channelId?: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const msgUrl = channelId != null ? `/api/chat/messages?channelId=${channelId}` : '/api/chat/messages';
  const msgQKey = channelId != null ? ['/api/chat/messages', channelId] : ['/api/chat/messages'];

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: msgQKey,
    queryFn: () => fetch(msgUrl, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: { content: string; photoUrl?: string }) =>
      apiRequest('POST', '/api/chat/messages', { ...body, channelId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: msgQKey });
      qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
      qc.invalidateQueries({ queryKey: ['/api/channels'] });
    },
    onError: () => toast({ title: 'Mesaj gönderilemedi', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/chat/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: msgQKey }),
    onError: () => toast({ title: 'Silinemedi', variant: 'destructive' }),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: boolean }) =>
      apiRequest('PATCH', `/api/chat/messages/${id}/pin`, { pin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: msgQKey }),
    onError: () => toast({ title: 'İşlem başarısız', variant: 'destructive' }),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest('POST', '/api/chat/read', { messageIds: ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
      qc.invalidateQueries({ queryKey: ['/api/channels'] });
    },
  });

  const markAllRead = useCallback(() => {
    if (!user || !messages.length) return;
    const unreadIds = messages.filter(m => m.senderId !== user.id).map(m => m.id);
    if (unreadIds.length > 0) markReadMutation.mutate(unreadIds);
  }, [messages, user]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevCountRef.current = messages.length;
    }
  }, [messages.length]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'instant' }); }, []);
  useEffect(() => { markAllRead(); }, [messages.length]);

  const currentUserName = user ? (user.displayName || user.username) : undefined;
  const isAdmin = user?.role === 'admin' || user?.role === 'ofis_calisan';
  const pinnedMessages = messages.filter(m => m.isPinned);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pinned messages */}
      <AnimatePresence>
        {pinnedMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-700/40 overflow-hidden"
          >
            <div className="px-4 py-2 flex items-center gap-2 border-b border-amber-200/60 dark:border-amber-700/40">
              <Pin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Sabitlenmiş Mesajlar ({pinnedMessages.length})
              </span>
            </div>
            <div className="divide-y divide-amber-200/40 dark:divide-amber-700/30 max-h-36 overflow-y-auto">
              {pinnedMessages.map(msg => (
                <div key={msg.id} className="px-4 py-2.5 flex items-start gap-3 group">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(msg.senderId)}`}>
                    {getInitials(msg.senderName || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{msg.senderName}</span>
                    {msg.content && <p className="text-xs text-amber-900/80 dark:text-amber-200/80 truncate">{msg.content}</p>}
                    {msg.photoUrl && (
                      <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Fotoğraf
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => pinMutation.mutate({ id: msg.id, pin: false })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-amber-700 text-amber-500 shrink-0"
                      title="Sabitlemeyi kaldır"
                      data-testid={`button-unpin-${msg.id}`}
                    >
                      <PinOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-card border border-border/50 shadow-sm p-4 space-y-3 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Yükleniyor...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
            <MessageCircle className="w-12 h-12 opacity-30" />
            <p className="text-sm">Henüz mesaj yok. İlk mesajı siz gönderin!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const isOwn = msg.senderId === user?.id;
              const prevMsg = messages[idx - 1];
              const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  showActions
                  onLightbox={setLightboxSrc}
                  onDelete={() => deleteMutation.mutate(msg.id)}
                  onPin={() => pinMutation.mutate({ id: msg.id, pin: !msg.isPinned })}
                  isAdmin={isAdmin}
                  currentUserName={currentUserName}
                />
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={(content, photoUrl) => sendMutation.mutate({ content, photoUrl })}
        isPending={sendMutation.isPending}
        nameList={nameList}
        placeholder="Mesajınızı yazın... @ ile etiketleyin"
      />
      <p className="text-xs text-muted-foreground text-center mt-2">
        İletişim Kanalıdır. @ ile kullanıcı etiketleyebilirsiniz.
      </p>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxSrc(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={lightboxSrc} alt="Tam görünüm"
              className="max-w-full max-h-full rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={() => setLightboxSrc(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── DMChat ───────────────────────────────────────────────────────────── */

function DMChat({ user, otherUserId, otherUserName, nameList, onDeleted }: { user: User; otherUserId: number; otherUserName: string; nameList: NameEntry[]; onDeleted?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const isManager = (MANAGER_ROLES as readonly string[]).includes(user.role);

  const { data: messages = [], isLoading } = useQuery<DMMessage[]>({
    queryKey: ['/api/dm', otherUserId],
    queryFn: () => fetch(`/api/dm/${otherUserId}`, { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: { content: string; photoUrl?: string }) =>
      apiRequest('POST', `/api/dm/${otherUserId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/dm', otherUserId] });
      qc.invalidateQueries({ queryKey: ['/api/dm/conversations'] });
      qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
    },
    onError: (err: any) => toast({ title: err?.message || 'Mesaj gönderilemedi', variant: 'destructive' }),
  });

  const deleteConvMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/dm/${otherUserId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/dm', otherUserId] });
      qc.invalidateQueries({ queryKey: ['/api/dm/conversations'] });
      qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
      toast({ title: 'Konuşma silindi' });
      onDeleted?.();
    },
    onError: () => toast({ title: 'Silinemedi', variant: 'destructive' }),
  });

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevCountRef.current = messages.length;
    }
  }, [messages.length]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'instant' }); }, [otherUserId]);

  useEffect(() => {
    if (messages.length > 0) {
      qc.invalidateQueries({ queryKey: ['/api/dm/conversations'] });
      qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
    }
  }, [messages.length]);

  const currentUserName = user ? (user.displayName || user.username) : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* DM header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${getAvatarColor(otherUserId)}`}>
          {getInitials(otherUserName)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{otherUserName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3" /> Özel mesajlaşma
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => {
              if (confirm(`${otherUserName} ile olan tüm DM konuşmasını silmek istediğinize emin misiniz?`)) {
                deleteConvMutation.mutate();
              }
            }}
            disabled={deleteConvMutation.isPending}
            className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            title="Konuşmayı sil"
            data-testid={`button-delete-dm-conv-${otherUserId}`}
          >
            {deleteConvMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-card border border-border/50 shadow-sm p-4 space-y-3 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Yükleniyor...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
            <MessageCircle className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">{otherUserName} ile konuşma başlat</p>
            <p className="text-xs opacity-70">Mesaj gönderince burada görünecek.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const isOwn = msg.senderId === user?.id;
              const prevMsg = messages[idx - 1];
              const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={{ ...msg, isPinned: false }}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  onLightbox={setLightboxSrc}
                  currentUserName={currentUserName}
                />
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={(content, photoUrl) => sendMutation.mutate({ content, photoUrl })}
        isPending={sendMutation.isPending}
        nameList={nameList}
        placeholder={`${otherUserName} ile mesajlaş... @ ile etiketleyin`}
      />

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxSrc(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={lightboxSrc} alt="Tam görünüm"
              className="max-w-full max-h-full rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              onClick={() => setLightboxSrc(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── NewDMModal ───────────────────────────────────────────────────────── */

function NewDMModal({
  nameList, currentUserId, onSelect, onClose,
}: {
  nameList: NameEntry[];
  currentUserId: number;
  onSelect: (user: NameEntry) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = nameList.filter(u =>
    u.id !== currentUserId && normalizeForSearch(u.name).includes(normalizeForSearch(search))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Yeni Direkt Mesaj
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors" data-testid="button-close-new-dm">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-border/50">
          <input
            autoFocus
            type="text"
            placeholder="Kullanıcı ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-muted/50 border border-border/60 rounded-xl outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-new-dm-search"
          />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Kullanıcı bulunamadı</div>
          ) : (
            filtered.map(u => (
              <button
                key={u.id}
                onClick={() => { onSelect(u); onClose(); }}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left"
                data-testid={`button-dm-select-user-${u.id}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(u.id)}`}>
                  {getInitials(u.name)}
                </div>
                <span className="text-sm font-medium">{u.name}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── ChannelManageModal ───────────────────────────────────────────────── */

function ChannelManageModal({
  channel, nameList, onClose, onSaved,
}: {
  channel: Channel | null;
  nameList: NameEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = channel !== null;
  const [name, setName] = useState(channel?.name ?? '');
  const [desc, setDesc] = useState(channel?.description ?? '');
  const [memberSearch, setMemberSearch] = useState('');
  const [tab, setTab] = useState<'info' | 'members'>('info');

  const { data: members = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: ['/api/channels', channel?.id, 'members'],
    queryFn: () => fetch(`/api/channels/${channel!.id}/members`, { credentials: 'include' }).then(r => r.json()),
    enabled: isEdit,
  });

  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? apiRequest('PATCH', `/api/channels/${channel!.id}`, { name, description: desc })
      : apiRequest('POST', '/api/channels', { name, description: desc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/channels'] });
      toast({ title: isEdit ? 'Kanal güncellendi' : 'Kanal oluşturuldu' });
      onSaved();
    },
    onError: () => toast({ title: 'Hata oluştu', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/channels/${channel!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/channels'] });
      toast({ title: 'Kanal silindi' });
      onClose();
    },
    onError: () => toast({ title: 'Silinemedi', variant: 'destructive' }),
  });

  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('POST', `/api/channels/${channel!.id}/members`, { userId }),
    onSuccess: () => { refetchMembers(); qc.invalidateQueries({ queryKey: ['/api/channels'] }); },
    onError: () => toast({ title: 'Eklenemedi', variant: 'destructive' }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('DELETE', `/api/channels/${channel!.id}/members/${userId}`),
    onSuccess: () => { refetchMembers(); qc.invalidateQueries({ queryKey: ['/api/channels'] }); },
    onError: () => toast({ title: 'Kaldırılamadı', variant: 'destructive' }),
  });

  const memberIds = new Set(members.map(m => m.userId));
  const filteredForAdd = nameList.filter(u =>
    !memberIds.has(u.id) && normalizeForSearch(u.name).includes(normalizeForSearch(memberSearch))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" />
            {isEdit ? 'Kanalı Düzenle' : 'Yeni Kanal Oluştur'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors" data-testid="button-close-channel-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs (only for edit) */}
        {isEdit && (
          <div className="flex border-b border-border/50">
            {(['info', 'members'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium transition-colors",
                  tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={`button-channel-tab-${t}`}
              >
                {t === 'info' ? 'Bilgi' : 'Üyeler'}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4">
          {tab === 'info' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Kanal Adı</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Örn: tasarım, pazarlama..."
                  className="w-full px-3 py-2 text-sm bg-muted/50 border border-border/60 rounded-xl outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-channel-name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Açıklama (isteğe bağlı)</label>
                <input
                  type="text"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Bu kanal hakkında kısa açıklama..."
                  className="w-full px-3 py-2 text-sm bg-muted/50 border border-border/60 rounded-xl outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-channel-description"
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="w-full rounded-xl"
                data-testid="button-save-channel"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isEdit ? 'Kaydet' : 'Oluştur'}
              </Button>
              {isEdit && (
                <Button
                  onClick={() => { if (confirm(`"${channel!.name}" kanalını silmek istediğinize emin misiniz?`)) deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  variant="destructive"
                  className="w-full rounded-xl"
                  data-testid="button-delete-channel"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Kanalı Sil
                </Button>
              )}
            </>
          )}

          {tab === 'members' && isEdit && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Mevcut Üyeler ({members.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Henüz üye yok</p>
                  ) : members.map(m => (
                    <div key={m.userId} className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${getAvatarColor(m.userId)}`}>
                          {getInitials(m.userName)}
                        </div>
                        <span className="text-sm font-medium">{m.userName}</span>
                      </div>
                      <button
                        onClick={() => removeMemberMutation.mutate(m.userId)}
                        disabled={removeMemberMutation.isPending}
                        className="p-1 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                        data-testid={`button-remove-member-${m.userId}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Üye Ekle</p>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Kullanıcı ara..."
                  className="w-full px-3 py-2 text-sm bg-muted/50 border border-border/60 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 mb-2"
                  data-testid="input-member-search"
                />
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {filteredForAdd.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Eklenecek kullanıcı yok</p>
                  ) : filteredForAdd.map(u => (
                    <button
                      key={u.id}
                      onClick={() => addMemberMutation.mutate(u.id)}
                      disabled={addMemberMutation.isPending}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-primary/5 hover:text-primary transition-colors text-left"
                      data-testid={`button-add-member-${u.id}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(u.id)}`}>
                        {getInitials(u.name)}
                      </div>
                      <span className="text-sm">{u.name}</span>
                      <UserPlus className="w-3.5 h-3.5 ml-auto opacity-50" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── ConversationSidebar ──────────────────────────────────────────────── */

function ConversationSidebar({
  activeView, activeChannelId, onSelectGeneral, onSelectDM, onSelectChannel,
  conversations, channels, nameList, userId, userRole, isLoading: convsLoading,
}: {
  activeView: 'general' | number;
  activeChannelId: number | null;
  onSelectGeneral: () => void;
  onSelectDM: (user: NameEntry) => void;
  onSelectChannel: (ch: Channel) => void;
  conversations: DMConversation[];
  channels: Channel[];
  nameList: NameEntry[];
  userId: number;
  userRole: string;
  isLoading: boolean;
}) {
  const [showNewDM, setShowNewDM] = useState(false);
  const [managingChannel, setManagingChannel] = useState<Channel | 'new' | null>(null);
  const isManager = (MANAGER_ROLES as readonly string[]).includes(userRole);

  return (
    <div className="flex flex-col h-full">
      {/* Channels header */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kanallar</span>
        {isManager && (
          <button
            onClick={() => setManagingChannel('new')}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Yeni Kanal"
            data-testid="button-new-channel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* General channel */}
      <button
        onClick={onSelectGeneral}
        data-testid="button-channel-general"
        className={cn(
          "mx-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
          activeView === 'general' && activeChannelId === null
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <MessageCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Genel</span>
      </button>

      {/* Custom channels */}
      {channels.map(ch => {
        const isActive = activeChannelId === ch.id;
        return (
          <div key={ch.id} className="mx-2 group relative">
            <button
              onClick={() => onSelectChannel(ch)}
              data-testid={`button-channel-${ch.id}`}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <Hash className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left truncate">{ch.name}</span>
              {ch.unreadCount > 0 && !isActive && (
                <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {ch.unreadCount > 99 ? '99+' : ch.unreadCount}
                </span>
              )}
            </button>
            {isManager && (
              <button
                onClick={e => { e.stopPropagation(); setManagingChannel(ch); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                title="Kanalı Düzenle"
                data-testid={`button-manage-channel-${ch.id}`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* DM header */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direkt Mesajlar</span>
        {userRole !== 'uretim_calisan' && (
          <button
            onClick={() => setShowNewDM(true)}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Yeni DM"
            data-testid="button-new-dm"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* DM conversation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {convsLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-muted-foreground">Henüz DM yok</p>
            {userRole !== 'uretim_calisan' && (
              <button
                onClick={() => setShowNewDM(true)}
                className="mt-2 text-xs text-primary hover:underline"
                data-testid="button-start-first-dm"
              >
                Konuşma başlat
              </button>
            )}
          </div>
        ) : (
          conversations.map(conv => {
            const isActive = activeView === conv.userId && activeChannelId === null;
            return (
              <button
                key={conv.userId}
                onClick={() => onSelectDM({ id: conv.userId, name: conv.userName })}
                data-testid={`button-dm-conv-${conv.userId}`}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left",
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(conv.userId)}`}>
                  {getInitials(conv.userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.userName}</p>
                  {conv.lastMessage && (
                    <p className="text-[11px] truncate opacity-70">{conv.lastMessage}</p>
                  )}
                </div>
                {conv.unreadCount > 0 && !isActive && (
                  <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {showNewDM && userRole !== 'uretim_calisan' && (
        <AnimatePresence>
          <NewDMModal
            nameList={nameList}
            currentUserId={userId}
            onSelect={onSelectDM}
            onClose={() => setShowNewDM(false)}
          />
        </AnimatePresence>
      )}

      {/* Channel management modal */}
      <AnimatePresence>
        {managingChannel !== null && (
          <ChannelManageModal
            channel={managingChannel === 'new' ? null : managingChannel}
            nameList={nameList}
            onClose={() => setManagingChannel(null)}
            onSaved={() => setManagingChannel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── ChatPage (main) ──────────────────────────────────────────────────── */

export default function ChatPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeView, setActiveView] = useState<'general' | number>('general');
  const [activeDMUser, setActiveDMUser] = useState<NameEntry | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [activeChannelName, setActiveChannelName] = useState<string>('');
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const { data: nameList = [] } = useQuery<NameEntry[]>({
    queryKey: ['/api/users/name-list'],
    queryFn: () => fetch('/api/users/name-list', { credentials: 'include' }).then(r => r.json()),
    staleTime: 60000,
  });

  const { data: conversations = [], isLoading: convsLoading } = useQuery<DMConversation[]>({
    queryKey: ['/api/dm/conversations'],
    queryFn: () => fetch('/api/dm/conversations', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['/api/channels'],
    queryFn: () => fetch('/api/channels', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 10000,
  });

  const handleSelectGeneral = () => {
    setActiveView('general');
    setActiveDMUser(null);
    setActiveChannelId(null);
    setActiveChannelName('');
    setMobileShowChat(true);
  };

  const handleSelectDM = (u: NameEntry) => {
    setActiveView(u.id);
    setActiveDMUser(u);
    setActiveChannelId(null);
    setActiveChannelName('');
    setMobileShowChat(true);
    qc.invalidateQueries({ queryKey: ['/api/dm', u.id] });
    qc.invalidateQueries({ queryKey: ['/api/dm/conversations'] });
    qc.invalidateQueries({ queryKey: ['/api/chat/unread-count'] });
  };

  const handleSelectChannel = (ch: Channel) => {
    setActiveChannelId(ch.id);
    setActiveChannelName(ch.name);
    setActiveView('general');
    setActiveDMUser(null);
    setMobileShowChat(true);
    qc.invalidateQueries({ queryKey: ['/api/channels'] });
  };

  const handleBack = () => {
    setMobileShowChat(false);
  };

  if (!user) return null;

  const mobilePanelTitle = activeChannelId !== null
    ? `#${activeChannelName}`
    : activeView === 'general'
    ? 'Genel Kanal'
    : activeDMUser?.name ?? '';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Page header — visible only when mobile sidebar is showing or on desktop */}
      <div className={cn("mb-4", mobileShowChat && "hidden md:block")}>
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <span className="bg-primary/10 text-primary p-2 rounded-xl">
            <MessageCircle className="w-7 h-7" />
          </span>
          İletişim Kanalı
        </h1>
        <p className="text-muted-foreground mt-1">Genel kanal, özel kanallar ve direkt mesajlaşma.</p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 gap-4">

        {/* ── LEFT sidebar: conversation list ── */}
        <div className={cn(
          "flex-col border border-border/50 rounded-2xl bg-card shadow-sm overflow-hidden",
          "md:w-56 md:flex-shrink-0",
          mobileShowChat ? "hidden md:flex md:flex-col" : "flex flex-col w-full"
        )}>
          <ConversationSidebar
            activeView={activeView}
            activeChannelId={activeChannelId}
            onSelectGeneral={handleSelectGeneral}
            onSelectDM={handleSelectDM}
            onSelectChannel={handleSelectChannel}
            conversations={conversations}
            channels={channels}
            nameList={nameList}
            userId={user.id}
            userRole={user.role}
            isLoading={convsLoading}
          />
        </div>

        {/* ── RIGHT: active chat panel ── */}
        <div className={cn(
          "flex flex-col flex-1 min-h-0 min-w-0",
          mobileShowChat ? "flex" : "hidden md:flex"
        )}>
          {/* Mobile back button + title */}
          <div className={cn("flex items-center gap-2 mb-3 md:hidden")}>
            <button
              onClick={handleBack}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
              data-testid="button-back-to-list"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold text-sm">{mobilePanelTitle}</span>
          </div>

          {activeChannelId !== null ? (
            <GeneralChat user={user} nameList={nameList} channelId={activeChannelId} />
          ) : activeView === 'general' ? (
            <GeneralChat user={user} nameList={nameList} />
          ) : activeDMUser ? (
            <DMChat user={user} otherUserId={activeDMUser.id} otherUserName={activeDMUser.name} nameList={nameList} onDeleted={handleSelectGeneral} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground gap-3">
              <MessageCircle className="w-12 h-12 opacity-20" />
              <p className="text-sm">Soldan bir kanal veya kullanıcı seçin.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

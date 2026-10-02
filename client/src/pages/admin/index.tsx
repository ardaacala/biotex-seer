import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRecords } from '@/hooks/use-records';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShieldAlert, Users, Database, Activity, Clock, CheckCircle2, Trash2, UserCog, Pencil, X, Check, MessageCircle, Shield, ShieldOff, LockOpen, MessageSquare, ChevronLeft, Eye, EyeOff, Key, Smartphone, ShieldCheck, Ban, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import type { User, BlockedIp } from '@shared/schema';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

type ChatMsg = { id: number; senderId: number; senderName: string; content: string; createdAt: string; isDeleted: boolean };

type DMConversation = { otherUserId: number; userName: string; lastMessage: string; lastMessageAt: string; unreadCount: number };
type DMMessage = { id: number; senderId: number; receiverId: number; senderName: string; content: string; photoUrl: string | null; createdAt: string; isRead: boolean };

function UserChatHistoryModal({ targetUser, onClose }: { targetUser: { id: number; name: string }; onClose: () => void }) {
  const [selectedConvUserId, setSelectedConvUserId] = useState<number | null>(null);
  const [selectedConvName, setSelectedConvName] = useState<string>('');

  const { data: conversations = [], isLoading: convsLoading } = useQuery<DMConversation[]>({
    queryKey: ['/api/admin/users', targetUser.id, 'dm-conversations'],
    queryFn: () => fetch(`/api/admin/users/${targetUser.id}/dm-conversations`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<DMMessage[]>({
    queryKey: ['/api/admin/dm', targetUser.id, selectedConvUserId],
    queryFn: () => fetch(`/api/admin/dm/${targetUser.id}/${selectedConvUserId}`, { credentials: 'include' }).then(r => r.json()),
    enabled: selectedConvUserId !== null,
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden rounded-2xl" data-testid="modal-chat-history">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold">
              {selectedConvUserId ? (
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
                  onClick={() => { setSelectedConvUserId(null); setSelectedConvName(''); }}
                  data-testid="button-back-conversations"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Geri
                </button>
              ) : (
                <span><span className="text-primary">{targetUser.name}</span> — DM Geçmişi</span>
              )}
            </DialogTitle>
          </div>
          {selectedConvUserId && (
            <p className="text-sm font-medium text-foreground mt-1">
              {targetUser.name} ↔ {selectedConvName}
            </p>
          )}
        </DialogHeader>

        <div className="h-[440px] overflow-y-auto">
          {!selectedConvUserId ? (
            /* Conversation list */
            convsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Yükleniyor...</div>
            ) : conversations.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Bu kullanıcının hiç DM konuşması yok.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {conversations.map(conv => (
                  <li key={conv.otherUserId}>
                    <button
                      className="w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors flex items-start justify-between gap-3"
                      onClick={() => { setSelectedConvUserId(conv.otherUserId); setSelectedConvName(conv.userName); }}
                      data-testid={`button-conv-${conv.otherUserId}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{conv.userName}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage || '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {conv.lastMessageAt ? format(new Date(conv.lastMessageAt), 'dd.MM.yy HH:mm', { locale: tr }) : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            /* Message thread */
            msgsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Yükleniyor...</div>
            ) : messages.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Mesaj bulunamadı.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-4">
                {messages.map(msg => {
                  const isByTarget = msg.senderId === targetUser.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isByTarget ? 'items-start' : 'items-end'}`} data-testid={`msg-${msg.id}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isByTarget ? 'bg-muted text-foreground rounded-tl-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}`}>
                        {msg.photoUrl && (
                          <img src={msg.photoUrl} alt="fotoğraf" loading="lazy" decoding="async" className="max-w-[200px] rounded-xl mb-1" />
                        )}
                        {msg.content && <p>{msg.content}</p>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {msg.senderName} · {format(new Date(msg.createdAt), 'dd.MM.yy HH:mm', { locale: tr })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminChatPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: messages = [], isLoading } = useQuery<ChatMsg[]>({
    queryKey: ['/api/chat/messages'],
    queryFn: () => fetch('/api/chat/messages', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/chat/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/chat/messages'] });
      toast({ title: 'Mesaj silindi' });
    },
    onError: () => toast({ title: 'Silinemedi', variant: 'destructive' }),
  });

  return (
    <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Sohbet Mesajları</h3>
          <Badge variant="outline">{messages.length} mesaj</Badge>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Henüz mesaj yok.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                <tr>
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">Gönderen</th>
                  <th className="px-6 py-4">Mesaj</th>
                  <th className="px-6 py-4">Tarih</th>
                  <th className="px-6 py-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[...messages].reverse().map(msg => (
                  <tr key={msg.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-msg-${msg.id}`}>
                    <td className="px-6 py-4 font-mono text-muted-foreground text-xs">#{msg.id}</td>
                    <td className="px-6 py-4 font-medium">{msg.senderName}</td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="truncate text-sm">{msg.content}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(msg.createdAt), 'dd.MM.yyyy HH:mm', { locale: tr })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(msg.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-msg-${msg.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function BlockedIpsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: blockedList = [], isLoading } = useQuery<BlockedIp[]>({
    queryKey: ['/api/admin/blocked-ips'],
    queryFn: () => fetch('/api/admin/blocked-ips', { credentials: 'include' }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const unblockMutation = useMutation({
    mutationFn: (ip: string) => apiRequest('DELETE', `/api/admin/blocked-ips/${encodeURIComponent(ip)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/admin/blocked-ips'] });
      toast({ title: 'IP engeli kaldırıldı' });
    },
    onError: () => toast({ title: 'İşlem başarısız', variant: 'destructive' }),
  });

  return (
    <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldOff className="w-5 h-5 text-destructive" />
          <h3 className="text-lg font-semibold">Engellenmiş Cihazlar</h3>
          <Badge variant={blockedList.length > 0 ? 'destructive' : 'outline'}>{blockedList.length} cihaz</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          5 kez hatalı şifre giren cihazlar bu listede görünür. Buradan engelini kaldırabilirsiniz.
        </p>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
        ) : blockedList.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30 text-green-500" />
            <p className="font-medium text-green-600 dark:text-green-400">Engellenmiş cihaz yok</p>
            <p className="text-xs mt-1">Sistem güvende.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                <tr>
                  <th className="px-6 py-4">IP Adresi</th>
                  <th className="px-6 py-4">Engel Sebebi</th>
                  <th className="px-6 py-4">Engelleme Tarihi</th>
                  <th className="px-6 py-4 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {blockedList.map(entry => (
                  <tr key={entry.id} data-testid={`row-blocked-${entry.id}`} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-destructive" data-testid={`text-blocked-ip-${entry.id}`}>
                      {entry.ip}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{entry.reason}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.blockedAt ? format(new Date(entry.blockedAt), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                        onClick={() => unblockMutation.mutate(entry.ip)}
                        disabled={unblockMutation.isPending}
                        data-testid={`button-unblock-${entry.id}`}
                      >
                        <LockOpen className="w-3.5 h-3.5" />
                        Engeli Kaldır
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}


function isOnline(lastSeenAt: string | Date | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

function formatLastSeen(lastSeenAt: string | Date | null | undefined): string {
  if (!lastSeenAt) return 'Hiç görülmedi';
  return formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true, locale: tr });
}

function formatLastLogout(lastLogoutAt: string | Date | null | undefined): string {
  if (!lastLogoutAt) return '-';
  return format(new Date(lastLogoutAt), 'dd.MM.yyyy HH:mm');
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  uretim_sefi: 'Üretim Şefi',
  uretim_calisan: 'Üretim Çalışanı',
  ofis_calisan: 'Ofis Çalışanı',
  aday: 'Aday Üye',
};

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  admin: 'default',
  uretim_sefi: 'secondary',
  uretim_calisan: 'outline',
  ofis_calisan: 'outline',
  aday: 'destructive',
};

function InlinePasswordEditor({ userId, currentPassword, isReadonly }: { userId: number; currentPassword: string; isReadonly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(currentPassword);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (password: string) => apiRequest('PUT', `/api/users/${userId}/password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: 'Şifre güncellendi' });
      setEditing(false);
    },
    onError: (e: any) => {
      toast({ title: 'Hata', description: e?.message ?? String(e), variant: 'destructive' });
    },
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type="text"
          className="h-7 text-xs rounded-lg w-40 font-mono"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && value.trim()) mutation.mutate(value.trim());
            if (e.key === 'Escape') { setEditing(false); setValue(currentPassword); }
          }}
          data-testid={`input-password-${userId}`}
        />
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
          disabled={!value.trim() || mutation.isPending}
          onClick={() => mutation.mutate(value.trim())}
          data-testid={`button-confirm-password-${userId}`}
        >
          {mutation.isPending ? <span className="text-[10px]">...</span> : <Check className="w-3 h-3" />}
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
          onClick={() => { setEditing(false); setValue(currentPassword); }}
          data-testid={`button-cancel-password-${userId}`}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="font-mono text-xs px-2 py-0.5 rounded bg-muted/50 select-all"
        data-testid={`text-password-${userId}`}
      >
        {revealed ? currentPassword : '•'.repeat(Math.min(currentPassword.length, 10) || 6)}
      </span>
      <Button
        size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setRevealed(v => !v)}
        title={revealed ? 'Gizle' : 'Göster'}
        data-testid={`button-toggle-password-${userId}`}
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </Button>
      {!isReadonly && (
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-700"
          onClick={() => { setValue(currentPassword); setEditing(true); }}
          title="Şifreyi düzenle"
          data-testid={`button-edit-password-${userId}`}
        >
          <Key className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

function InlineDisplayNameEditor({ userId, currentName }: { userId: number; currentName: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName ?? '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (displayName: string | null) =>
      apiRequest('PUT', `/api/users/${userId}/display-name`, { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/pending'] });
      toast({ title: "Ad güncellendi" });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Ad güncellenemedi", variant: "destructive" });
    },
  });

  const save = () => mutation.mutate(value.trim() || null);

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="h-7 text-sm rounded-lg w-40"
          placeholder="Ad Soyad..."
          maxLength={50}
          data-testid={`input-display-name-${userId}`}
        />
        <Button size="icon" variant="default" className="h-7 w-7 rounded-lg" onClick={save} disabled={mutation.isPending}>
          {mutation.isPending ? <span className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setEditing(false)}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1.5 group text-left"
      onClick={() => { setValue(currentName ?? ''); setEditing(true); }}
      data-testid={`button-edit-display-name-${userId}`}
    >
      <span className={currentName ? "font-medium text-sm" : "text-sm text-muted-foreground italic"}>
        {currentName || "Ad girilmemiş"}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
    </button>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const isReadonly = user?.role !== 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: records, isLoading: recordsLoading } = useRecords();

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
    refetchInterval: 30_000,
  });

  const { data: pendingUsers, isLoading: pendingLoading } = useQuery<User[]>({
    queryKey: ['/api/users/pending'],
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiRequest('PUT', `/api/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/pending'] });
      toast({ title: "Rol güncellendi" });
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Rol güncellenemedi", variant: "destructive" });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/pending'] });
      toast({ title: "Kullanıcı silindi" });
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Kullanıcı silinemedi", variant: "destructive" });
    },
  });

  const updateSevkiyatYetkisi = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      apiRequest('PUT', `/api/users/${id}/sevkiyat-yetkisi`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Sevkiyat yetkisi güncellendi" });
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Güncellenemedi", variant: "destructive" });
    },
  });

  const updateStokYetkisi = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      apiRequest('PUT', `/api/users/${id}/stok-yetkisi`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: "Stok yetkisi güncellendi" });
    },
    onError: (err: any) => {
      toast({ title: "Hata", description: err.message || "Güncellenemedi", variant: "destructive" });
    },
  });

  const pendingCount = pendingUsers?.length ?? 0;
  const [chatHistoryUser, setChatHistoryUser] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center gap-4 bg-gradient-to-r from-destructive/10 to-transparent p-6 rounded-3xl border border-destructive/20">
        <div className="bg-destructive text-destructive-foreground p-4 rounded-2xl shadow-lg shadow-destructive/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Yönetim Paneli</h1>
          <p className="text-muted-foreground font-medium">Sistem genel bakışı ve kullanıcı yönetimi.</p>
        </div>
      </div>
      {isReadonly && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Salt okunur erişim — yalnızca görüntüleme yetkisine sahipsiniz. Değişiklik yapamazsınız.</span>
        </div>
      )}

      {chatHistoryUser && (
        <UserChatHistoryModal targetUser={chatHistoryUser} onClose={() => setChatHistoryUser(null)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-card shadow-lg border-none">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Toplam Kullanıcı</p>
              <p className="text-3xl font-display font-bold">{users?.length || 0}</p>
            </div>
            <Users className="w-8 h-8 text-primary opacity-80" />
          </CardContent>
        </Card>
        <Card className="glass-card shadow-lg border-none">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Onay Bekleyen</p>
              <p className="text-3xl font-display font-bold text-amber-500">{pendingCount}</p>
            </div>
            <Clock className="w-8 h-8 text-amber-500 opacity-80" />
          </CardContent>
        </Card>
        <Card className="glass-card shadow-lg border-none">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Toplam Emir</p>
              <p className="text-3xl font-display font-bold">{records?.length || 0}</p>
            </div>
            <Database className="w-8 h-8 text-blue-500 opacity-80" />
          </CardContent>
        </Card>
        <Card className="glass-card shadow-lg border-none">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sistem Durumu</p>
              <p className="text-2xl font-display font-bold text-green-500">Aktif</p>
            </div>
            <Activity className="w-8 h-8 text-green-500 opacity-80" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl h-auto mb-6">
          <TabsTrigger value="pending" className="rounded-lg px-6 py-3 text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm relative" data-testid="tab-pending">
            <Clock className="w-4 h-4 mr-2" /> Onay Bekleyenler
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg px-6 py-3 text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-users">
            <UserCog className="w-4 h-4 mr-2" /> Kullanıcı Yönetimi
          </TabsTrigger>
          <TabsTrigger value="system" className="rounded-lg px-6 py-3 text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-system">
            <Database className="w-4 h-4 mr-2" /> Tüm Kayıtlar
          </TabsTrigger>
          <TabsTrigger value="messages" className="rounded-lg px-6 py-3 text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-messages">
            <MessageCircle className="w-4 h-4 mr-2" /> Sohbet Yönetimi
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-lg px-6 py-3 text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-security">
            <Shield className="w-4 h-4 mr-2" /> Güvenlik
          </TabsTrigger>
        </TabsList>

        {/* Onay Bekleyenler */}
        <TabsContent value="pending">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            {pendingLoading ? (
              <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
            ) : !pendingUsers || pendingUsers.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">Onay bekleyen kullanıcı yok.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                    <tr>
                      <th className="px-6 py-4">Kullanıcı</th>
                      <th className="px-6 py-4">Kayıt Tarihi</th>
                      {!isReadonly && <th className="px-6 py-4">Rol Ata</th>}
                      {!isReadonly && <th className="px-6 py-4 text-right">İşlemler</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pendingUsers.map((u) => (
                      <tr key={u.id} data-testid={`row-pending-${u.id}`} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold">{u.username}</p>
                          <p className="text-xs text-muted-foreground">#{u.id}</p>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {u.createdAt ? format(new Date(u.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                        </td>
                        {!isReadonly && (
                          <td className="px-6 py-4">
                            <Select
                              onValueChange={(role) => updateRole.mutate({ id: u.id, role })}
                              disabled={updateRole.isPending}
                            >
                              <SelectTrigger className="w-44 rounded-xl" data-testid={`select-role-${u.id}`}>
                                <SelectValue placeholder="Rol seç..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="uretim_calisan">Üretim Çalışanı</SelectItem>
                                <SelectItem value="ofis_calisan">Ofis Çalışanı</SelectItem>
                                <SelectItem value="uretim_sefi">Üretim Şefi</SelectItem>
                                <SelectItem value="admin">Yönetici</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        )}
                        {!isReadonly && (
                          <td className="px-6 py-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                              onClick={() => deleteUser.mutate(u.id)}
                              disabled={deleteUser.isPending}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Kullanıcı Yönetimi */}
        <TabsContent value="users">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-6 py-4">Kullanıcı Adı</th>
                    <th className="px-6 py-4">Durum</th>
                    <th className="px-6 py-4">Son Çıkış</th>
                    <th className="px-6 py-4">Görünür Ad</th>
                    <th className="px-6 py-4">Şifre</th>
                    <th className="px-6 py-4">Mevcut Rol</th>
                    <th className="px-4 py-4 text-center">Sevkiyat</th>
                    <th className="px-4 py-4 text-center">Stok</th>
                    <th className="px-4 py-4 text-center">Sohbet</th>
                    {!isReadonly && <th className="px-6 py-4 text-right">Sil</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {usersLoading ? (
                    <tr><td colSpan={isReadonly ? 7 : 8} className="p-6 text-center">Yükleniyor...</td></tr>
                  ) : users?.map((u) => {
                    const online = isOnline(u.lastSeenAt);
                    return (
                    <tr key={u.id} data-testid={`row-user-${u.id}`} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold">{u.username}</p>
                        <p className="text-xs text-muted-foreground">#{u.id}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2" data-testid={`status-user-${u.id}`}>
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-green-500 shadow-[0_0_6px_1px] shadow-green-400' : 'bg-muted-foreground/30'}`} />
                          {online ? (
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">Çevrim İçi</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{formatLastSeen(u.lastSeenAt)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground" data-testid={`logout-user-${u.id}`}>
                        {formatLastLogout(u.lastLogoutAt)}
                      </td>
                      <td className="px-6 py-4">
                        {isReadonly ? (
                          <span className={u.displayName ? "font-medium text-sm" : "text-sm text-muted-foreground italic"}>
                            {u.displayName || "Ad girilmemiş"}
                          </span>
                        ) : (
                          <InlineDisplayNameEditor userId={u.id} currentName={u.displayName ?? null} />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <InlinePasswordEditor userId={u.id} currentPassword={u.password ?? ''} isReadonly={isReadonly} />
                      </td>
                      <td className="px-6 py-4">
                        {!isReadonly && u.id !== user?.id ? (
                          <Select
                            defaultValue={u.role}
                            onValueChange={(role) => updateRole.mutate({ id: u.id, role })}
                            disabled={updateRole.isPending}
                          >
                            <SelectTrigger
                              className="w-auto h-auto border-0 shadow-none p-0 gap-1 focus:ring-0 focus:ring-offset-0 bg-transparent hover:bg-transparent"
                              data-testid={`select-change-role-${u.id}`}
                            >
                              <Badge variant={ROLE_VARIANT[u.role] ?? 'secondary'} className="rounded-md px-2 py-0.5 cursor-pointer" data-testid={`badge-role-${u.id}`}>
                                {ROLE_LABELS[u.role] ?? u.role}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="uretim_calisan">Üretim Çalışanı</SelectItem>
                              <SelectItem value="ofis_calisan">Ofis Çalışanı</SelectItem>
                              <SelectItem value="uretim_sefi">Üretim Şefi</SelectItem>
                              <SelectItem value="admin">Yönetici</SelectItem>
                              <SelectItem value="aday">Aday Üye</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge variant={ROLE_VARIANT[u.role] ?? 'secondary'} className="rounded-md px-2 py-0.5" data-testid={`badge-role-${u.id}`}>
                              {ROLE_LABELS[u.role] ?? u.role}
                            </Badge>
                            {u.id === user?.id && (
                              <span className="text-[10px] text-muted-foreground italic">Siz</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={!!u.sevkiyatYetkisi}
                          disabled={isReadonly}
                          onChange={e => updateSevkiyatYetkisi.mutate({ id: u.id, value: e.target.checked })}
                          className="w-4 h-4 rounded accent-primary cursor-pointer disabled:cursor-default"
                          data-testid={`checkbox-sevkiyat-${u.id}`}
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={!!u.stokYetkisi}
                          disabled={isReadonly || u.role === 'admin' || u.role === 'ofis_calisan'}
                          onChange={e => updateStokYetkisi.mutate({ id: u.id, value: e.target.checked })}
                          className="w-4 h-4 rounded accent-primary cursor-pointer disabled:cursor-default"
                          data-testid={`checkbox-stok-${u.id}`}
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl"
                          onClick={() => setChatHistoryUser({ id: u.id, name: u.displayName || u.username })}
                          title="Sohbet geçmişini gör"
                          data-testid={`button-chat-history-${u.id}`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </td>
                      {!isReadonly && (
                        <td className="px-6 py-4 text-right">
                          {u.id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                              onClick={() => deleteUser.mutate(u.id)}
                              disabled={deleteUser.isPending}
                              data-testid={`button-delete-${u.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Sohbet Yönetimi */}
        <TabsContent value="messages">
          <AdminChatPanel />
        </TabsContent>

        {/* Güvenlik — Engellenmiş IP'ler */}
        <TabsContent value="security" className="space-y-6">
          <BlockedIpsPanel />
        </TabsContent>

        {/* Tüm Kayıtlar */}
        <TabsContent value="system">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-6 py-4">Emir ID</th>
                    <th className="px-6 py-4">Başlık</th>
                    <th className="px-6 py-4">Durum</th>
                    <th className="px-6 py-4">Oluşturan</th>
                    <th className="px-6 py-4">Son Düzenleme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {recordsLoading ? (
                    <tr><td colSpan={5} className="p-6 text-center">Yükleniyor...</td></tr>
                  ) : (() => {
                    const userMap = new Map((users ?? []).map(u => [u.id, u.displayName || u.username]));
                    return records?.map((r) => (
                    <tr key={r.id} data-testid={`row-record-${r.id}`} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-mono text-muted-foreground">#{r.id}</td>
                      <td className="px-6 py-4 font-medium truncate max-w-[180px]">{r.title}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="capitalize">
                          {r.status === 'completed' ? 'Tamamlandı' : r.status === 'in_progress' ? 'Devam Ediyor' : 'Beklemede'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{userMap.get(r.createdBy) ?? `#${r.createdBy}`}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.createdAt ? format(new Date(r.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {r.lastUpdatedBy ? (
                          <>
                            <p className="font-medium">{userMap.get(r.lastUpdatedBy) ?? `#${r.lastUpdatedBy}`}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {r.updatedAt ? format(new Date(r.updatedAt), 'dd.MM.yyyy HH:mm') : '-'}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Düzenlenmedi</span>
                        )}
                      </td>
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

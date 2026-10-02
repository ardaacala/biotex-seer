import { useState, useEffect } from 'react';
import { normalizeForSearch, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOrderTitleLibrary, useCreateOrderTitle, useDeleteOrderTitle } from '@/hooks/use-order-title-library';
import { useAuth } from '@/hooks/use-auth';
import { Search, Plus, Loader2, BookMarked, Check, Tag, Trash2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onPick: (title: string, referenceId: string) => void;
  currentReferenceId: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  disabled?: boolean;
}

export function OrderTitleInput({
  value,
  onChange,
  onPick,
  currentReferenceId,
  placeholder = 'Sipariş Başlığı',
  className,
  testId = 'input-order-title',
  disabled = false,
}: Props) {
  const { user } = useAuth();
  const isManager = !!user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);
  const { data: library = [], isLoading } = useOrderTitleLibrary();
  const createMutation = useCreateOrderTitle();
  const deleteMutation = useDeleteOrderTitle();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  if (!isManager) {
    return (
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('h-12 rounded-xl', className)}
        disabled={disabled}
        data-testid={testId}
      />
    );
  }

  const filtered = library.filter(e => normalizeForSearch(e.title).includes(normalizeForSearch(search)));
  const trimmedSearch = search.trim();
  const trimmedTitle = value.trim();
  const trimmedRef = currentReferenceId.trim();
  const exactInLibrary = library.some(e => normalizeForSearch(e.title) === normalizeForSearch(trimmedTitle));
  const canQuickAdd = isManager && trimmedTitle.length > 0 && !exactInLibrary;

  const select = (entry: { title: string; referenceId: string | null }) => {
    onPick(entry.title, entry.referenceId ?? '');
    setOpen(false);
  };

  const quickAdd = async () => {
    if (!canQuickAdd) return;
    try {
      const created = await createMutation.mutateAsync({
        title: trimmedTitle,
        referenceId: trimmedRef || null,
      });
      if (created?.title) select(created);
    } catch {}
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm('Bu sipariş başlığı kütüphaneden silinsin mi?')) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch {}
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl flex-1"
        disabled={disabled}
        data-testid={testId}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl gap-1.5 px-3 shrink-0"
            disabled={disabled}
            data-testid={`${testId}-library-trigger`}
          >
            <BookMarked className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Kütüphane</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0 rounded-2xl overflow-hidden" align="end">
          <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Başlık ara..."
              className="h-8 rounded-lg border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
              data-testid={`${testId}-library-search`}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {trimmedSearch ? 'Eşleşen başlık yok.' : 'Kütüphane boş. Aşağıdan ekleyebilirsiniz.'}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map(e => {
                  const isSelected = e.title === value;
                  return (
                    <li key={e.id}>
                      <div className="group flex items-center hover:bg-muted/50 transition-colors">
                        <button
                          type="button"
                          onClick={() => select(e)}
                          className="flex-1 text-left px-3 py-2 flex items-start gap-2"
                          data-testid={`${testId}-library-option-${e.id}`}
                        >
                          <Tag className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.title}</p>
                            {e.referenceId && (
                              <p className="text-[11px] text-muted-foreground truncate font-mono">
                                Ref: {e.referenceId}
                              </p>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary shrink-0 mt-1" />}
                        </button>
                        <button
                          type="button"
                          onClick={(ev) => handleDelete(ev, e.id)}
                          className="p-2 mr-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition"
                          data-testid={`${testId}-library-delete-${e.id}`}
                          aria-label="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {canQuickAdd && (
            <div className="border-t p-2 bg-muted/10">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-start gap-2 text-primary hover:text-primary rounded-lg"
                onClick={quickAdd}
                disabled={createMutation.isPending}
                data-testid={`${testId}-library-quick-add`}
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span className="text-sm truncate">
                  "{trimmedTitle}"{trimmedRef ? ` + Ref: ${trimmedRef}` : ''} ekle
                </span>
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

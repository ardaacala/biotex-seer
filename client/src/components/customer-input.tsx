import { useState, useRef, useEffect } from 'react';
import { normalizeForSearch } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCustomerLibrary, useCreateCustomer } from '@/hooks/use-customer-library';
import { useAuth } from '@/hooks/use-auth';
import { Search, User, Plus, Loader2, BookUser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  disabled?: boolean;
}

export function CustomerInput({
  value,
  onChange,
  placeholder = 'Müşteri adı',
  className,
  testId = 'input-customer',
  disabled = false,
}: Props) {
  const { user } = useAuth();
  const isManager = !!user && ['admin', 'uretim_sefi', 'ofis_calisan'].includes(user.role);
  const { data: library = [], isLoading } = useCustomerLibrary();
  const createMutation = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const filtered = library.filter(c => normalizeForSearch(c.name).includes(normalizeForSearch(search)));
  const trimmedSearch = search.trim();
  const exactMatch = library.some(c => normalizeForSearch(c.name) === normalizeForSearch(trimmedSearch));
  const canQuickAdd = isManager && trimmedSearch.length > 0 && !exactMatch;

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const quickAdd = async () => {
    if (!canQuickAdd) return;
    try {
      const created = await createMutation.mutateAsync({ name: trimmedSearch });
      if (created?.name) select(created.name);
    } catch {}
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl flex-1"
        disabled={disabled}
        data-testid={testId}
        list={undefined}
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
            <BookUser className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Kütüphane</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 rounded-2xl overflow-hidden" align="end">
          <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Müşteri ara..."
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
                {trimmedSearch ? 'Eşleşen müşteri yok.' : 'Kütüphane boş. Yazıp ekleyebilirsiniz.'}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map(c => {
                  const isSelected = c.name === value;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => select(c.name)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-start gap-2 transition-colors"
                        data-testid={`${testId}-library-option-${c.id}`}
                      >
                        <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          {(c.phone || c.email) && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {[c.phone, c.email].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
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
                <span className="text-sm">"{trimmedSearch}" müşterisini ekle</span>
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, FlaskConical, User, Tag, Hash } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Sample } from '@shared/schema';

export default function SampleList() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const isManager = user?.role === 'admin' || user?.role === 'uretim_sefi' || user?.role === 'ofis_calisan';

  const { data: samples = [], isLoading } = useQuery<Sample[]>({
    queryKey: ['/api/samples', search],
    queryFn: () => fetch(`/api/samples${search ? `?search=${encodeURIComponent(search)}` : ''}`, { credentials: 'include' }).then(r => r.json()),
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <FlaskConical className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Numuneler</h1>
              <p className="text-xs text-muted-foreground">{samples.length} numune</p>
            </div>
          </div>
          {isManager && (
            <Link href="/numuneler/new">
              <Button className="rounded-xl gap-2" data-testid="button-new-sample">
                <Plus className="w-4 h-4" /> Yeni Numune
              </Button>
            </Link>
          )}
        </div>
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Numune adı, lot, müşteri..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
            data-testid="input-search-samples"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : samples.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground opacity-60">
            <FlaskConical className="w-16 h-16" />
            <p className="text-base">{search ? 'Arama sonucu bulunamadı.' : 'Henüz numune eklenmemiş.'}</p>
            {isManager && !search && (
              <Link href="/numuneler/new">
                <Button variant="outline" className="rounded-xl gap-2">
                  <Plus className="w-4 h-4" /> İlk Numuneyi Ekle
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {samples.map((sample, i) => (
              <motion.div
                key={sample.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/numuneler/${sample.id}`}>
                  <div
                    className="glass-card border border-border/40 rounded-2xl p-5 hover:shadow-lg hover:border-primary/30 transition-all duration-200 cursor-pointer group"
                    data-testid={`card-sample-${sample.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {sample.title}
                      </h3>
                      <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      {sample.customer && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{sample.customer}</span>
                        </div>
                      )}
                      {sample.lotNumber && (
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-xs">{sample.lotNumber}</span>
                        </div>
                      )}
                      {sample.referenceId && (
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-xs">{sample.referenceId}</span>
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground/60">
                      {new Date(sample.createdAt!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

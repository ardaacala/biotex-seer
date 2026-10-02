import { useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CustomerInput } from '@/components/customer-input';
import { ArrowLeft, FlaskConical, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import type { Sample } from '@shared/schema';

const formSchema = z.object({
  title: z.string().min(1, 'Numune adı zorunludur'),
  lotNumber: z.string().optional(),
  referenceId: z.string().optional(),
  customer: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function SampleForm() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? Number(params.id) : null;
  const isEdit = !!id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: existing } = useQuery<Sample>({
    queryKey: ['/api/samples', id],
    queryFn: () => fetch(`/api/samples/${id}`, { credentials: 'include' }).then(r => r.json()),
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', lotNumber: '', referenceId: '', customer: '', notes: '' },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        title: existing.title,
        lotNumber: existing.lotNumber ?? '',
        referenceId: existing.referenceId ?? '',
        customer: existing.customer ?? '',
        notes: existing.notes ?? '',
      });
    }
  }, [existing, form]);

  const create = useMutation({
    mutationFn: (data: FormValues) => apiRequest('POST', '/api/samples', data).then(r => r.json()),
    onSuccess: (s: Sample) => {
      qc.invalidateQueries({ queryKey: ['/api/samples'] });
      toast({ title: 'Numune oluşturuldu' });
      setLocation(`/numuneler/${s.id}`);
    },
    onError: () => toast({ title: 'Hata', description: 'Numune oluşturulamadı', variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: (data: FormValues) => apiRequest('PUT', `/api/samples/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/samples'] });
      qc.invalidateQueries({ queryKey: ['/api/samples', id] });
      toast({ title: 'Numune güncellendi' });
      setLocation(`/numuneler/${id}`);
    },
    onError: () => toast({ title: 'Hata', description: 'Numune güncellenemedi', variant: 'destructive' }),
  });

  const onSubmit = (data: FormValues) => {
    const clean = {
      title: data.title,
      lotNumber: data.lotNumber || null,
      referenceId: data.referenceId || null,
      customer: data.customer || null,
      notes: data.notes || null,
    };
    isEdit ? update.mutate(clean as any) : create.mutate(clean as any);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm flex items-center gap-3">
        <Link href={isEdit ? `/numuneler/${id}` : '/numuneler'}>
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-display font-bold">{isEdit ? 'Numune Düzenle' : 'Yeni Numune'}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-lg mx-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numune Adı *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Numune adı..." className="rounded-xl" data-testid="input-sample-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Müşteri</FormLabel>
                    <FormControl>
                      <CustomerInput
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Müşteri adı..."
                        testId="input-sample-customer"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lotNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lot Numarası</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Lot no..." className="rounded-xl font-mono" data-testid="input-sample-lot" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referenceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referans No</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ref no..." className="rounded-xl font-mono" data-testid="input-sample-ref" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notlar</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Numune hakkında notlar..." className="rounded-xl resize-none" rows={3} data-testid="input-sample-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-3 pt-2">
                <Link href={isEdit ? `/numuneler/${id}` : '/numuneler'} className="flex-1">
                  <Button type="button" variant="outline" className="w-full rounded-xl">İptal</Button>
                </Link>
                <Button type="submit" className="flex-1 rounded-xl" disabled={isPending} data-testid="button-save-sample">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Güncelle' : 'Oluştur')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

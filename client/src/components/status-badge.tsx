import { Badge } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const configs: Record<string, { label: string; classes: string }> = {
    pending: { 
      label: 'Beklemede', 
      classes: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' 
    },
    in_progress: { 
      label: 'Devam Ediyor', 
      classes: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' 
    },
    completed: { 
      label: 'Tamamlandı', 
      classes: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
    },
    waiting_product: {
      label: 'Ürün Bekleniyor',
      classes: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800'
    },
  };

  const config = configs[status] || { label: status, classes: 'bg-muted text-muted-foreground' };

  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-bold border",
      config.classes,
      className
    )}>
      {config.label}
    </span>
  );
}

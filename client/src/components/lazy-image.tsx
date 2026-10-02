import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  hasPhoto?: boolean;
  rootMargin?: string;
  onClick?: () => void;
  fallback?: React.ReactNode;
  placeholderIconClassName?: string;
  'data-testid'?: string;
}

/**
 * Lazy-loaded image:
 * - Only sets src when scrolled into the viewport (IntersectionObserver).
 * - If `hasPhoto` is false, renders the fallback (no network request).
 * - Native `loading="lazy"` is also enabled as an extra browser hint.
 */
export function LazyImage({
  src,
  alt = '',
  className = '',
  containerClassName = '',
  hasPhoto = true,
  rootMargin = '200px',
  onClick,
  fallback,
  placeholderIconClassName = 'w-10 h-10 text-muted-foreground/30',
  'data-testid': dataTestId,
}: LazyImageProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!hasPhoto) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasPhoto, rootMargin]);

  if (!hasPhoto) {
    return (
      <div ref={ref} className={containerClassName} onClick={onClick} data-testid={dataTestId}>
        {fallback ?? <ImageIcon className={placeholderIconClassName} />}
      </div>
    );
  }

  return (
    <div ref={ref} className={containerClassName} onClick={onClick} data-testid={dataTestId}>
      {!visible || (!loaded && !errored) ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {visible && !errored ? (
            <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin" />
          ) : (
            <ImageIcon className={placeholderIconClassName} />
          )}
        </div>
      ) : null}
      {visible && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={className}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s ease-in' }}
        />
      )}
    </div>
  );
}

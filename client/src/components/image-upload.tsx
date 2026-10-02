import { useState, useRef } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageUploadProps {
  value?: string | null;
  // onChange receives the full ~800px image and (when produced) a ~400px thumbnail
  // sized for retina mobile cards (renders crisp at ~200px CSS @2x DPR).
  onChange: (base64: string | null, thumbBase64?: string | null) => void;
}

function resizeToDataUrl(img: HTMLImageElement, maxSize: number, quality: number): string {
  let width = img.width;
  let height = img.height;
  if (width > height) {
    if (width > maxSize) {
      height *= maxSize / width;
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width *= maxSize / height;
      height = maxSize;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Produce both a full (~800px) image and a ~400px thumbnail for list cards.
    // Thumbnail size chosen to stay sharp on retina phones (cards render at
    // roughly 180–220px CSS, so 400px source covers @2x DPR cleanly) while
    // keeping bytes small (~25–35 KB vs ~80–150 KB for the full image).
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const fullUrl = resizeToDataUrl(img, 800, 0.7);
        const thumbUrl = resizeToDataUrl(img, 400, 0.78);
        onChange(fullUrl, thumbUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={inputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />

      <AnimatePresence mode="wait">
        {value ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-border group"
          >
            <img 
              src={value} 
              alt="Preview" 
              className="w-full h-64 object-cover object-center group-hover:scale-105 transition-transform duration-500" 
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <Button 
                type="button"
                variant="destructive" 
                size="icon" 
                className="rounded-full shadow-xl hover:scale-110 transition-transform"
                onClick={() => onChange(null, null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`
              w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 transition-all duration-300
              ${isDragging ? 'border-primary bg-primary/5' : 'border-border/60 bg-muted/20 hover:bg-muted/50'}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="flex gap-4">
              <Button 
                type="button" 
                variant="outline" 
                className="rounded-xl border-primary/20 hover:bg-primary/10 hover:text-primary text-primary"
                onClick={() => inputRef.current?.click()}
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photo
              </Button>
              <Button 
                type="button" 
                variant="secondary" 
                className="rounded-xl"
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.removeAttribute('capture');
                    inputRef.current.click();
                    inputRef.current.setAttribute('capture', 'environment');
                  }
                }}
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload
              </Button>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ImageIcon className="w-4 h-4 opacity-50" />
              Tap to capture or drag an image here
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

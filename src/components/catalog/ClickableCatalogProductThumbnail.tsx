import { useState } from 'react';
import { cn } from '@/lib/cn';
import { ProductImagePreviewOverlay } from '@/components/ui/ProductImagePreviewOverlay';

export type ClickableCatalogProductThumbnailProps = {
  src: string;
  name: string;
  sku: string;
  className?: string;
  overlayClassName?: string;
};

export function ClickableCatalogProductThumbnail({
  src,
  name,
  sku,
  className,
  overlayClassName,
}: ClickableCatalogProductThumbnailProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const title = `${sku} — ${name}`;

  return (
    <>
      <button
        type="button"
        className={cn(
          'focus-visible:ring-accent-600 cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2',
          className,
        )}
        aria-label={`View larger image of ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          setPreviewOpen(true);
        }}
      >
        <img src={src} alt="" className="h-full w-full rounded-[inherit] object-cover" />
      </button>
      <ProductImagePreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={src}
        title={title}
        overlayClassName={overlayClassName}
      />
    </>
  );
}

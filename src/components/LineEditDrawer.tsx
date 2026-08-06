import { useRef, useState, type SubmitEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/Input';
import { updateLine, uploadLineHeroImage, type LinePortfolio } from '@/lib/lines';

interface LineEditDrawerProps {
  line: LinePortfolio;
  onClose: () => void;
  onSaved: (line: LinePortfolio) => void;
}

export function LineEditDrawer({ line, onClose, onSaved }: LineEditDrawerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tagline, setTagline] = useState(line.tagline ?? '');
  const [description, setDescription] = useState(line.description ?? '');
  const [heroImageUrl, setHeroImageUrl] = useState(line.heroImageUrl ?? '');
  const [publicShowroomPath, setPublicShowroomPath] = useState(line.publicShowroomPath ?? '');
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await updateLine(line.code, {
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      heroImageUrl: heroImageUrl.trim() || null,
      publicShowroomPath: publicShowroomPath.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.line);
    onClose();
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setUploadBusy(true);
    setError(null);
    const result = await uploadLineHeroImage({ code: line.code, file });
    setUploadBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHeroImageUrl(result.line.heroImageUrl ?? '');
    onSaved(result.line);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="border-ink/15 bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-edit-title"
      >
        <div className="border-ink/10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p id="line-edit-title" className="font-heading text-xl leading-tight">
              Edit {line.name}
            </p>
            <p className="text-ink/60 m-0 mt-1 text-xs tracking-wide uppercase">Line portfolio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
            disabled={busy || uploadBusy}
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <form className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4" onSubmit={handleSave}>
          <div className="bg-surface border-ink/10 overflow-hidden rounded-lg border">
            {heroImageUrl ? (
              <img src={heroImageUrl} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="text-ink/45 flex h-40 items-center justify-center text-center text-xs">
                No hero image yet
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || uploadBusy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} strokeWidth={2.75} />
              <span>{uploadBusy ? 'Uploading…' : 'Upload image'}</span>
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                void handleUpload(file);
              }}
            />
          </div>

          <Field>
            <FieldLabel>Tagline</FieldLabel>
            <Input
              id="line-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Short subheading"
              disabled={busy}
            />
          </Field>

          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea
              id="line-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Portfolio blurb for landing and Line Sheet"
              disabled={busy}
            />
          </Field>

          <Field>
            <FieldLabel>Hero image URL</FieldLabel>
            <Input
              id="line-hero-url"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://… or clear to remove"
              disabled={busy}
            />
          </Field>

          <Field>
            <FieldLabel>Public showroom path</FieldLabel>
            <Input
              id="line-showroom-path"
              value={publicShowroomPath}
              onChange={(e) => setPublicShowroomPath(e.target.value)}
              placeholder="/old-guys-rule-wholesale"
              disabled={busy}
            />
          </Field>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="border-ink/10 mt-auto flex flex-col gap-2 border-t pt-4">
            <Button type="submit" variant="primary" disabled={busy || uploadBusy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy || uploadBusy}
            >
              Cancel
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LogCallModal } from '@/components/LogCallModal';

function ModalHarness({
  initialOpen = true,
  onClose = vi.fn(),
}: {
  initialOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [storeId, setStoreId] = useState<number | null>(1);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <LogCallModal
        open={open}
        storeId={storeId}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onStoreChange={setStoreId}
      />
    </div>
  );
}

describe('LogCallModal', () => {
  it('clears feedback checkboxes after cancel and reopen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    const checkbox = screen.getByRole('checkbox', { name: /Loves display rack/i });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /Loves display rack/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reopen/i }));
    expect(screen.getByRole('checkbox', { name: /Loves display rack/i })).not.toBeChecked();
  });
});

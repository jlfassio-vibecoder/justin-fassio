import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyableUrl, CopyUrlButton } from '@/components/ui/CopyUrlButton';

const copyTextToClipboardMock = vi.fn();

vi.mock('@/lib/copyTextToClipboard', () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboardMock(...args),
}));

describe('CopyUrlButton', () => {
  beforeEach(() => {
    copyTextToClipboardMock.mockReset();
    copyTextToClipboardMock.mockResolvedValue(true);
  });

  it('copies the URL and briefly shows Copied', async () => {
    const user = userEvent.setup();
    render(<CopyUrlButton url="https://nmscharters.com/" />);

    const button = screen.getByRole('button', { name: 'Copy URL' });
    await user.click(button);

    expect(copyTextToClipboardMock).toHaveBeenCalledWith('https://nmscharters.com/');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('uses a custom label for non-URL text', async () => {
    const user = userEvent.setup();
    render(<CopyUrlButton url="Newport Marina Store" label="Copy name" />);

    await user.click(screen.getByRole('button', { name: 'Copy name' }));
    expect(copyTextToClipboardMock).toHaveBeenCalledWith('Newport Marina Store');
  });

  it('renders nothing for blank URL', () => {
    const { container } = render(<CopyUrlButton url="  " />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CopyableUrl', () => {
  beforeEach(() => {
    copyTextToClipboardMock.mockReset();
    copyTextToClipboardMock.mockResolvedValue(true);
  });

  it('renders open link and copy control', async () => {
    const user = userEvent.setup();
    render(<CopyableUrl url="https://example.com/page">Open source</CopyableUrl>);

    const link = screen.getByRole('link', { name: 'Open source' });
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));
    expect(copyTextToClipboardMock).toHaveBeenCalledWith('https://example.com/page');
  });

  it('prefixes https for host-only href while copying the raw display string', () => {
    render(<CopyableUrl url="example.com" />);
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveTextContent('example.com');
  });
});

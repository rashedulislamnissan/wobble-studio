/**
 * "Save image": the current stage with an editorial caption, shared on phones (Web Share)
 * or downloaded on desktop. No server involved.
 */
export async function captureStage(
  stage: HTMLCanvasElement,
  grab: () => Promise<Blob | null>,
  title: string,
  ink: string,
): Promise<'shared' | 'downloaded' | 'failed'> {
  const shot = await grab();
  if (!shot) return 'failed';
  const bmp = await createImageBitmap(shot);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0);
  // Caption in the site's voice: italic serif title, small tracked wordmark.
  const s = c.height / 900;
  g.fillStyle = ink;
  g.font = `italic 500 ${Math.round(64 * s)}px "Cormorant Garamond", Georgia, serif`;
  g.textBaseline = 'alphabetic';
  g.fillText(title, 40 * s, c.height - 64 * s);
  g.font = `600 ${Math.round(14 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
  g.letterSpacing = `${2.2 * s}px`;
  g.globalAlpha = 0.7;
  g.fillText('WOBBLE STUDIO', 42 * s, c.height - 34 * s);
  g.globalAlpha = 1;

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) return 'failed';
  const name = `wobble-studio-${title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Wobble Studio' });
      return 'shared';
    } catch {
      /* cancelled: fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  void stage;
  return 'downloaded';
}

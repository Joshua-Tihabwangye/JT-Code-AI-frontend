/** A small JPEG of the page for the dashboards home, painted from what is already on screen:
 *  tile boxes in theme colours, every chart's own canvas, and KPI/title text. No extra library. */
export function captureThumbnail(grid: HTMLElement, width = 480): string | null {
  const bounds = grid.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const scale = width / bounds.width;
  const height = Math.min(Math.round(bounds.height * scale), Math.round(width * 0.75));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const host = grid.closest('.dash-canvas') ?? grid;
  const styles = getComputedStyle(host);
  context.fillStyle = styles.backgroundColor || '#f4f6fa';
  context.fillRect(0, 0, width, height);
  for (const tile of grid.querySelectorAll<HTMLElement>('.dash-tile-inner')) {
    const rect = tile.getBoundingClientRect();
    const x = (rect.left - bounds.left) * scale;
    const y = (rect.top - bounds.top) * scale;
    if (y > height) continue;
    const tileStyle = getComputedStyle(tile);
    context.fillStyle = tileStyle.backgroundColor || '#ffffff';
    const kpi = tile.querySelector<HTMLElement>('.dash-kpi');
    if (kpi) {
      const kpiStyle = getComputedStyle(kpi);
      if (kpiStyle.backgroundImage.startsWith('linear-gradient') || kpiStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') context.fillStyle = kpiStyle.backgroundColor;
    }
    roundRect(context, x, y, rect.width * scale, rect.height * scale, 4);
    context.fill();
    for (const chart of tile.querySelectorAll<HTMLCanvasElement>('canvas')) {
      const area = chart.getBoundingClientRect();
      try {
        context.drawImage(chart, (area.left - bounds.left) * scale, (area.top - bounds.top) * scale, area.width * scale, area.height * scale);
      } catch {
        // A tainted canvas is skipped; the tile box still shows.
      }
    }
    const value = tile.querySelector<HTMLElement>('.dash-kpi-value');
    if (value) {
      context.fillStyle = getComputedStyle(value).color;
      context.font = `700 ${Math.max(10, rect.height * scale * 0.32)}px sans-serif`;
      context.fillText(value.textContent ?? '', x + 6, y + rect.height * scale * 0.68);
    }
    const title = tile.querySelector<HTMLElement>('.dash-tile-title');
    if (title && !value) {
      context.fillStyle = getComputedStyle(title).color;
      context.font = '600 8px sans-serif';
      context.fillText((title.textContent ?? '').slice(0, 40), x + 5, y + 10);
    }
  }
  return canvas.toDataURL('image/jpeg', 0.72);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

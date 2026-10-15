/** A faithful PNG of a dashboard page for PDF and PNG exports, painted in the browser: the page is
 *  cloned with its computed styles inlined, every chart canvas replaced by its image, and the
 *  result drawn through an SVG ``foreignObject``. No library, nothing leaves the page. */
export async function capturePage(element: HTMLElement, scale = 2): Promise<string> {
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(element.scrollHeight || bounds.height);
  const clone = element.cloneNode(true) as HTMLElement;
  inlineStyles(element, clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xml}</div></foreignObject></svg>`;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot paint the page.');
  context.scale(scale, scale);
  context.fillStyle = getComputedStyle(element).backgroundColor || '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function inlineStyles(source: Element, target: Element) {
  if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
    // Charts are canvases: their pixels, not their (empty) clone.
    const image = document.createElement('img');
    try {
      image.src = source.toDataURL('image/png');
    } catch {
      return;
    }
    image.setAttribute('style', copyStyle(source));
    image.style.width = `${source.getBoundingClientRect().width}px`;
    image.style.height = `${source.getBoundingClientRect().height}px`;
    target.replaceWith(image);
    return;
  }
  if (target instanceof HTMLElement || target instanceof SVGElement) target.setAttribute('style', copyStyle(source));
  // Controls show their live values.
  if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) target.setAttribute('value', source.value);
  if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
    const option = target.options[source.selectedIndex];
    option?.setAttribute('selected', 'selected');
  }
  const sources = Array.from(source.children);
  const targets = Array.from(target.children);
  sources.forEach((child, index) => {
    const twin = targets[index];
    if (twin) inlineStyles(child, twin);
  });
}

function copyStyle(element: Element): string {
  const computed = getComputedStyle(element);
  let css = '';
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed[index]!;
    css += `${name}:${computed.getPropertyValue(name)};`;
  }
  return css;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The page could not be painted.'));
    image.src = source;
  });
}

/** Waits until every tile on the page has drawn (or failed), up to ``timeout`` ms. */
export function whenDrawn(root: ParentNode, pageId: string, timeout = 60_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const canvas = root.querySelector(`[data-testid="dashboard-canvas"][data-page="${pageId}"]`);
      const loading = canvas?.querySelector('.dash-tile[data-status="loading"]');
      const updating = root.querySelector('[data-updating="true"]');
      if (canvas && !loading && !updating) {
        // One more frame so charts finish their animation.
        setTimeout(resolve, 700);
        return;
      }
      if (Date.now() - started > timeout) reject(new Error('The page took too long to draw.'));
      else setTimeout(check, 200);
    };
    check();
  });
}

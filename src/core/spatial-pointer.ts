export interface Point {
  x: number;
  y: number;
}
/** Inverse planar homography. Unlike a bounding rect this preserves perspective and rotation. */
export function unprojectQuad(
  p: Point,
  quad: readonly Point[],
  width: number,
  height: number,
): Point {
  const [a, b, c, d] = quad as [Point, Point, Point, Point];
  const dx1 = b.x - c.x,
    dx2 = d.x - c.x,
    dx3 = a.x - b.x + c.x - d.x,
    dy1 = b.y - c.y,
    dy2 = d.y - c.y,
    dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0,
    h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-8 && Math.abs(det) > 1e-8) {
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const A = b.x - a.x + g * b.x,
    B = d.x - a.x + h * d.x,
    C = a.x,
    D = b.y - a.y + g * b.y,
    E = d.y - a.y + h * d.y,
    F = a.y;
  const u = A - p.x * g,
    v = B - p.x * h,
    x = p.x - C,
    y = p.y - F,
    r = D - p.y * g,
    s = E - p.y * h,
    den = u * s - v * r;
  if (Math.abs(den) < 1e-8) return { x: 0, y: 0 };
  return {
    x: ((x * s - v * y) / den) * width,
    y: ((u * y - x * r) / den) * height,
  };
}
export function screenToElement(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): Point {
  const frame = element.closest<HTMLElement>("[data-horizon-window]");
  const probes = frame?.querySelectorAll<HTMLElement>(
    ":scope > [data-plane-corner]",
  );
  if (frame && probes?.length === 4) {
    const quad = [...probes].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    const p = unprojectQuad(
      { x: clientX, y: clientY },
      quad,
      frame.clientWidth,
      frame.clientHeight,
    );
    let x = 0,
      y = 0,
      node: HTMLElement | null = element;
    while (node && node !== frame) {
      x += node.offsetLeft - node.scrollLeft;
      y += node.offsetTop - node.scrollTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x: p.x - x, y: p.y - y };
  }
  const r = element.getBoundingClientRect();
  return {
    x: ((clientX - r.left) * element.offsetWidth) / Math.max(1, r.width),
    y: ((clientY - r.top) * element.offsetHeight) / Math.max(1, r.height),
  };
}

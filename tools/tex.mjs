export function paperSvg(bg, line, alpha) {
  let p = "";
  for (let i = 0; i <= 540; i += 45) p += `M${i} 0V540M0 ${i}H540`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.42 0 0 0 0 0.38 0 0 0 ${alpha} 0'/></filter><rect width='540' height='540' fill='${bg}'/><path d='${p}' stroke='${line}' stroke-width='1.2' fill='none'/><rect width='540' height='540' filter='url(#n)'/></svg>`;
}

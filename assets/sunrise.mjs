/** Same measurements as the app's SunriseMark. Units are the sun's radius. */
export const SUNRISE = {
  widthR: 3.8,
  heightR: 2.5,
  sunY: 2.14,
  rayIn: 1.23,
  rayW: 0.14,
  step: 24,
  count: 15,
  arcHalf: 1.876,
  arcEndY: 0.29,
  arcTopCtrl: -0.638,
  arcBottomCtrl: -0.29,
  gap: 0.125,
};

export const BRAND = {
  sunDeep: "#DC513C",
  sun: "#FC7953",
  sunLight: "#FDBD87",
  rayInner: "#FEC798",
  rayOuter: "#F86A49",
  horizon: "#262C34",
  glow: "253,189,135",
};

export function rayLength(deg) {
  const a = Math.abs(deg);
  return 0.52 + 0.315 * Math.exp(-((a / 15) ** 2)) + 0.09 * Math.exp(-(((a - 50) / 12) ** 2));
}

export function rayAlpha(deg) {
  return Math.min(1, Math.max(0, (90 - Math.abs(deg)) / 12));
}

export function metrics(width) {
  const R = width / SUNRISE.widthR;
  return { R, width, height: R * SUNRISE.heightR, cx: width / 2, cy: R * SUNRISE.sunY };
}

function wrapDeg(index, phase) {
  let d = (index * SUNRISE.step + phase) % 360;
  if (d < 0) d += 360;
  if (d >= 180) d -= 360;
  return d;
}

export function rayGeometry(m, deg) {
  const rad = (deg * Math.PI) / 180;
  const r0 = (SUNRISE.rayIn + SUNRISE.rayW / 2) * m.R;
  const r1 = (SUNRISE.rayIn + rayLength(deg) - SUNRISE.rayW / 2) * m.R;
  return {
    x1: m.cx + Math.sin(rad) * r0,
    y1: m.cy - Math.cos(rad) * r0,
    x2: m.cx + Math.sin(rad) * r1,
    y2: m.cy - Math.cos(rad) * r1,
    stroke: SUNRISE.rayW * m.R,
    opacity: rayAlpha(deg),
  };
}

function quad(x0, y0, cx, cy, x1, y1) {
  return `Q ${n(cx)} ${n(cy)} ${n(x1)} ${n(y1)}`;
}

function n(value) {
  return Number(value.toFixed(2));
}

export function sunriseSvg(width, { phase = 0, glow = false, id = "sun", horizon = BRAND.horizon } = {}) {
  const m = metrics(width);
  const { R, cx, cy } = m;
  const endX = SUNRISE.arcHalf * R;
  const yEnd = cy + SUNRISE.arcEndY * R;
  const yTop = cy + SUNRISE.arcTopCtrl * R;
  const yBot = cy + SUNRISE.arcBottomCtrl * R;
  const clipY = cy + (SUNRISE.arcEndY - SUNRISE.gap) * R;
  const clipCtrl = cy + (SUNRISE.arcTopCtrl - SUNRISE.gap) * R;
  const left = cx - endX;
  const right = cx + endX;

  const rays = Array.from({ length: SUNRISE.count }, (_, index) => {
    const deg = wrapDeg(index, phase);
    const ray = rayGeometry(m, deg);
    return `<linearGradient id="${id}-ray-${index}" gradientUnits="userSpaceOnUse" x1="${n(ray.x1)}" y1="${n(ray.y1)}" x2="${n(ray.x2)}" y2="${n(ray.y2)}">
      <stop offset="0" stop-color="${BRAND.rayInner}"/>
      <stop offset="1" stop-color="${BRAND.rayOuter}"/>
    </linearGradient>
    <line data-ray="${index}" x1="${n(ray.x1)}" y1="${n(ray.y1)}" x2="${n(ray.x2)}" y2="${n(ray.y2)}" stroke="url(#${id}-ray-${index})" stroke-width="${n(ray.stroke)}" stroke-linecap="round" opacity="${ray.opacity.toFixed(3)}"/>`;
  }).join("");

  const glowMarkup = glow
    ? `<g clip-path="url(#${id}-clip)"><circle class="sunrise-glow" cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 1.7)}" fill="url(#${id}-glow)"/></g>`
    : "";

  return `<svg class="sunrise" viewBox="0 0 ${n(m.width)} ${n(m.height)}" width="${n(m.width)}" height="${n(m.height)}" role="img" aria-hidden="true">
  <defs>
    <clipPath id="${id}-clip">
      <path d="M0 0 H${n(m.width)} L${n(right)} ${n(clipY)} ${quad(right, clipY, cx, clipCtrl, left, clipY)} Z"/>
    </clipPath>
    <linearGradient id="${id}-sun" x1="${n(cx - 0.85 * R)}" y1="${n(cy + 0.1 * R)}" x2="${n(cx + 0.75 * R)}" y2="${n(cy - 0.95 * R)}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.sunDeep}"/>
      <stop offset="0.5" stop-color="${BRAND.sun}"/>
      <stop offset="1" stop-color="${BRAND.sunLight}"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="${n(cx)}" cy="${n(cy)}" r="${n(R * 1.7)}" gradientUnits="userSpaceOnUse">
      <stop offset="0.5" stop-color="rgba(${BRAND.glow},0.9)"/>
      <stop offset="0.75" stop-color="rgba(${BRAND.glow},0.3)"/>
      <stop offset="1" stop-color="rgba(${BRAND.glow},0)"/>
    </radialGradient>
  </defs>
  ${glowMarkup}
  ${rays}
  <g clip-path="url(#${id}-clip)">
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="url(#${id}-sun)"/>
  </g>
  <path fill="${horizon}" d="M${n(left)} ${n(yEnd)} ${quad(left, yEnd, cx, yTop, right, yEnd)} ${quad(right, yEnd, cx, yBot, left, yEnd)} Z"/>
</svg>`;
}

const STEP_MS = 1200;
const START_DELAY = 250;

export function mountSunrise(root) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  const width = Number(root.dataset.width || 380);
  let phase = 0;
  let last = 0;
  let started = 0;
  root.innerHTML = sunriseSvg(width, { phase, glow: true, id: root.dataset.sunId || "hero-sun" });
  const lines = [...root.querySelectorAll("line")];
  const grads = lines.map((line) => root.querySelector(`#${line.getAttribute("stroke").slice(5, -1)}`));
  let frameId = 0;
  let running = false;

  const frame = (now) => {
    frameId = 0;
    if (!running) return;
    if (!started) started = now;
    if (!last) last = now;
    const elapsed = now - started;
    if (elapsed > START_DELAY) {
      const dt = now - last;
      phase = (phase + (dt / STEP_MS) * SUNRISE.step) % 360;
      const m = metrics(width);
      lines.forEach((line, index) => {
        const ray = rayGeometry(m, wrapDeg(index, phase));
        const attrs = { x1: n(ray.x1), y1: n(ray.y1), x2: n(ray.x2), y2: n(ray.y2) };
        for (const [key, value] of Object.entries(attrs)) {
          line.setAttribute(key, value);
          grads[index].setAttribute(key, value);
        }
        line.setAttribute("opacity", ray.opacity.toFixed(3));
      });
    }
    last = now;
    if (running) frameId = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    frameId = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    last = 0;
  };

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) start();
    else stop();
  });
  observer.observe(root);
}

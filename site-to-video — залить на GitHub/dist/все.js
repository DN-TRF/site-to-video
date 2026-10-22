/* site-to-video · все стили · MIT · github.com/DN-TRF/site-to-video */
// site-to-video — ролик 1080×1920 про сайт. Страница пишет только данные (const САЙТ = {…}) и подключает этот файл.
(function разметка() {
  const css = `
  html,body{margin:0;min-height:100%;background:#0b0c0e;color:#eef1f4;font:15px/1.4 -apple-system,system-ui,sans-serif}
  .sv{display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px}
  .sv canvas{height:min(74vh,900px);max-width:calc(100vw - 32px);aspect-ratio:9/16;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);background:#000}
  .sv .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
  .sv button{font:600 16px/1 inherit;padding:14px 22px;border-radius:14px;border:0;cursor:pointer;background:#fff;color:#000}
  .sv #rec{background:#6EC1F0}
  .sv button:disabled{opacity:.45;cursor:default}
  .sv input[type=range]{width:min(420px,90vw)}
  .sv #st{font-size:14px;opacity:.75;min-height:18px;text-align:center}
  .sv .фото{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:720px}
  .sv .фото label{display:flex;flex-direction:column;align-items:center;gap:4px;width:96px;font-size:11.5px;cursor:pointer;opacity:.85}
  .sv .фото img,.sv .фото .нет{width:72px;height:72px;object-fit:contain;border-radius:10px;background:repeating-conic-gradient(#202328 0 25%,#16181b 0 50%) 0 0/12px 12px}
  .sv .фото span{color:#6EC1F0}
  .sv .фото input{display:none}
  .sv .подсказка{font-size:12.5px;opacity:.55;text-align:center;max-width:520px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.className = 'sv';
  box.innerHTML = `<canvas id="c" width="1080" height="1920"></canvas>
    <input id="bar" type="range" min="0" max="1000" value="0">
    <div class="row"><button id="play">▶ Смотреть</button><button id="rec">⬇ Скачать видео</button></div>
    <div id="st"></div><div class="фото" id="фото"></div>
    <div class="подсказка">Нажми на товар, чтобы заменить фото. Красивее всего PNG без фона: на айфоне зажми товар на фото → «Скопировать объект».</div>`;
  document.body.appendChild(box);
  if (typeof САЙТ !== 'undefined' && САЙТ.бренд) document.title = САЙТ.бренд + ' — видео';
})();

// ЯДРО: холст 1080×1920, время, сглаживания, текст, плеер, экспорт mp4.
// Кадр = чистая функция времени: стиль задаёт window.КАДР = (t) => {...}. Никаких таймеров и CSS-анимаций.
const W = 1080, H = 1920, FPS = 60;
let DUR = 15;
const c = document.getElementById('c'), x = c.getContext('2d');

// — время —
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const mix = (a, b, p) => a + (b - a) * p;
const E = {
  out: p => 1 - Math.pow(1 - p, 3),
  out5: p => 1 - Math.pow(1 - p, 5),
  expo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  inOut: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  in: p => p * p * p,
  back: p => { const s = 1.5; return 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2); },
};
// пружина от момента t0: 0 → 1 с затухающим колебанием
const spring = (t, t0, f = 2.2, d = 7) => { const s = t - t0; return s <= 0 ? 0 : 1 - Math.exp(-d * s) * Math.cos(f * 2 * Math.PI * s); };
// плавный шум (детерминированный)
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const noise = (seed, t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return mix(hash(seed * 57 + i), hash(seed * 57 + i + 1), u) * 2 - 1; };

// — цвет —
const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
const mixColor = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(mix(v, B[i], p))).join(',')})`; };

// — рисование —
function rr(X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
function shadow(blur = 40, color = 'rgba(0,0,0,.35)', oy = blur / 3) { x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetY = oy; }
function noShadow() { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; }
// текст: o = {size, weight, color, align, font, track (px между буквами), alpha, blur, base}
function T(s, X, Y, o = {}) {
  const size = o.size || 60, a = o.alpha ?? 1;
  if (a <= 0) return 0;
  x.save(); x.globalAlpha *= a;
  if (o.blur > .3) x.filter = `blur(${o.blur}px)`;
  x.font = `${o.weight || 800} ${size}px ${o.font || FONT}`;
  x.fillStyle = o.color || '#fff'; x.textBaseline = o.base || 'middle';
  x.letterSpacing = (o.track || 0) + 'px';
  x.textAlign = o.align || 'center';
  x.fillText(s, X, Y);
  const w = x.measureText(s).width;
  x.restore(); return w;
}
function textW(s, size, weight = 800, track = 0, font) { x.save(); x.font = `${weight} ${size}px ${font || FONT}`; x.letterSpacing = track + 'px'; const w = x.measureText(s).width; x.restore(); return w; }
// кегль, чтобы строка влезла в ширину
function fit(s, maxW, size, weight = 800, track = 0) { const w = textW(s, size, weight, track); return w > maxW ? size * maxW / w : size; }
// число с пробелами: 10000 → «10 000»
const num = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// — плеер —
let FONT = '"Helvetica Neue",Helvetica,Arial,sans-serif';
const ui = { play: document.getElementById('play'), rec: document.getElementById('rec'), st: document.getElementById('st'), bar: document.getElementById('bar') };
function draw(t) { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); window.КАДР(clamp(t, 0, DUR)); x.restore(); if (ui.bar) ui.bar.value = t / DUR * 1000; }
window.seek = draw;
let playing = false;
function play() {
  if (playing) return; playing = true; ui.play.textContent = '■ Стоп';
  const t0 = performance.now();
  (function loop() {
    if (!playing) return;
    const t = (performance.now() - t0) / 1000; draw(t);
    if (t < DUR) requestAnimationFrame(loop); else stop();
  })();
}
function stop() { playing = false; ui.play.textContent = '▶ Смотреть'; }
ui.play.onclick = () => playing ? stop() : play();
if (ui.bar) ui.bar.oninput = () => { stop(); draw(ui.bar.value / 1000 * DUR); };

// — экспорт: кадр за кадром через WebCodecs (ровные 60 к/с на любом устройстве), запасной путь MediaRecorder —
function save(blob, ext) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(window.ИМЯ || 'video')}.${ext}`; document.body.appendChild(a); a.click(); a.remove(); }
async function exportWebCodecs() {
  const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm');
  const cfg = { codec: 'avc1.640033', width: W, height: H, bitrate: 16e6, framerate: FPS };
  if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error('h264 нет');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (ch, m) => muxer.addVideoChunk(ch, m), error: e => { throw e; } });
  enc.configure(cfg);
  const N = Math.round(DUR * FPS);
  for (let i = 0; i < N; i++) {
    draw(i / FPS);
    const f = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: i % 120 === 0 }); f.close();
    if (enc.encodeQueueSize > 8) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
    if (i % 15 === 0) { ui.st.textContent = `Собираю видео… ${Math.round(i / N * 100)}%`; await new Promise(r => setTimeout(r)); }
  }
  await enc.flush(); muxer.finalize();
  save(new Blob([muxer.target.buffer], { type: 'video/mp4' }), 'mp4');
}
function exportRecorder() {
  return new Promise((res, rej) => {
    const types = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = window.MediaRecorder && types.find(m => MediaRecorder.isTypeSupported(m));
    if (!type) return rej(new Error('Браузер не умеет записывать видео. Открой в Chrome или Safari.'));
    const rec = new MediaRecorder(c.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 16e6 });
    const ch = []; rec.ondataavailable = e => e.data.size && ch.push(e.data);
    rec.onstop = () => { save(new Blob(ch, { type }), type.includes('mp4') ? 'mp4' : 'webm'); res(); };
    ui.st.textContent = 'Пишу видео в реальном времени… не переключай вкладку';
    rec.start(); const t0 = performance.now();
    (function loop() { const t = (performance.now() - t0) / 1000; draw(t); if (t < DUR) requestAnimationFrame(loop); else setTimeout(() => rec.stop(), 150); })();
  });
}
ui.rec.onclick = async () => {
  stop(); ui.rec.disabled = ui.play.disabled = true;
  try { await exportWebCodecs(); ui.st.textContent = 'Готово ✓ видео скачано'; }
  catch (e) { try { await exportRecorder(); ui.st.textContent = 'Готово ✓ видео скачано'; } catch (e2) { ui.st.textContent = e2.message; } }
  ui.rec.disabled = ui.play.disabled = false; draw(0);
};
// — фото товаров: настоящие PNG/WebP без фона. Кодом рисуется только интерфейс —
const ФОТО = {};
function фото(src) {
  if (!src) return null;
  let im = ФОТО[src];
  if (!im) { im = new Image(); im.crossOrigin = 'anonymous'; im.src = src; ФОТО[src] = im; }
  return im.complete && im.naturalWidth ? im : null;
}
// рисует фото товара в (0,0): ширина = s·p.ширина (по умолчанию 2.25), по высоте центр — p.якорь (0…1, по умолчанию .5)
function предметФото(x, t, p, s = 300) {
  const im = фото(p && p.фото);
  if (!im) { // фото нет — плитка с буквой бренда вместо пустоты
    const C = (typeof САЙТ !== 'undefined' && САЙТ.цвета) || {}, a = C.акцент || '#6EC1F0', w = s * 1.7;
    x.save(); shadow(s * .2, 'rgba(0,0,0,.35)', s * .05);
    const g = x.createLinearGradient(-w / 2, -w / 2, w / 2, w / 2); g.addColorStop(0, mixColor(a, '#ffffff', .25)); g.addColorStop(1, mixColor(a, '#000000', .25));
    rr(-w / 2, -w / 2, w, w, w * .24); x.fillStyle = g; x.fill(); noShadow();
    T(((САЙТ && САЙТ.бренд) || '•').trim().charAt(0).toUpperCase(), 0, w * .03, { size: w * .56, weight: 800, color: '#ffffff' });
    x.restore(); return;
  }
  const w = s * (p.ширина || 2.25), h = w * im.naturalHeight / im.naturalWidth;
  x.drawImage(im, -w / 2, -h * (p.якорь ?? .5), w, h);
}
function загрузитьФото() {
  const srcs = new Set();
  (САЙТ.товары || []).forEach(т => т && т.палитра && т.палитра.фото && srcs.add(т.палитра.фото));
  if (САЙТ.фото) srcs.add(САЙТ.фото);
  return Promise.all([...srcs].map(src => { фото(src); const im = ФОТО[src]; return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}); }));
}
function старт() { Promise.all([document.fonts.ready, загрузитьФото()]).then(() => { window.ГОТОВО = true; draw(0); }); }

const СТИЛИ_ФН = {
  apple() {
// СТИЛЬ «Apple-презентация»: launch-видео в духе keynote.
// Воздух, герой-предмет в луче света на зеркальном полу, огромная типографика, строки проявляются маской снизу вверх.
// Сцены: хук 0–2,3 → герой выходит из темноты 2,1–5,3 (+ заголовок) → перекраска по товарам шторкой света 5,3–9,6 →
// пролёт камеры к цифрам 9,6–12,3 → бренд, призыв, кнопка, домен 12,2–15.
// Все слова, цвета и цифры — из САЙТ. Кадр = чистая функция времени.
window.ИМЯ = 'apple';
DUR = 15;
FONT = САЙТ.шрифт || FONT;
(() => {
  const S = САЙТ, C = S.цвета || {};

  // ——— цвет ———
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b); return toHex(A.map((v, i) => mix(v, B[i], p))); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };

  const BG0 = isHex(C.фон) ? C.фон : null;
  const dark = S.тема ? !/светл/i.test(S.тема) : !(BG0 && lum(BG0) > .4);
  const BG = BG0 || (dark ? '#000000' : '#f5f5f7');
  const TX = isHex(C.текст) ? C.текст : (dark ? '#f5f5f7' : '#1d1d1f');
  const GR = isHex(C.серый) ? C.серый : mixHex(TX, BG, .45);
  const AC = isHex(C.акцент) ? C.акцент : TX;
  // акцент как текст: подтягиваем к основному цвету, пока не станет читаемым на фоне
  let ACT = AC; for (let k = 1; k <= 10 && contrast(ACT, BG) < 3.2; k++) ACT = mixHex(AC, TX, k * .1);
  let GRT = GR; for (let k = 1; k <= 10 && contrast(GRT, BG) < 4.2; k++) GRT = mixHex(GR, TX, k * .1);
  const onAC = contrast('#ffffff', AC) >= contrast('#111111', AC) ? '#ffffff' : '#111111';
  const DIM = mixHex(TX, BG, dark ? .14 : .2);         // текст в тени (до блика)
  const REFA = dark ? .34 : .2;                        // сила отражения в полу

  // ——— данные ———
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(s => s == null ? '' : String(s).trim()).filter(Boolean);
  const head = arr(S.заголовок);
  const hook = arr(S.хук).length ? arr(S.хук) : head;
  const accIdx = Number.isInteger(S.акцентСтрока) ? S.акцентСтрока : head.length - 1;
  const goods = (S.товары || []).filter(g => g && (g.имя || g.цена)).slice(0, 6);
  const stats = (S.цифры || []).filter(d => d && isFinite(+d.число)).slice(0, 3);
  const perks = arr(S.преимущества).slice(0, 3);
  const cta = arr(S.призыв).length ? arr(S.призыв) : arr(S.кнопка || S.бренд);
  const brand = S.бренд || '', tail = S.хвостЛого || '', domain = S.домен || '', sub = S.подзаголовок || '';
  const pals = goods.map(g => g.палитра && typeof g.палитра === 'object' ? g.палитра : undefined);
  const hasPal = pals.some(Boolean);
  const P0 = pals[0];
  const palHex = p => p ? Object.values(p).filter(isHex) : [];
  const tint = i => { const p = pals[i]; if (p) { for (const k of ['акцент', 'циферблат', 'корпус']) if (isHex(p[k])) return p[k]; const v = palHex(p); if (v.length) return v[0]; } return AC; };
  const swatch = i => { const p = pals[i], v = palHex(p); if (!v.length) return [AC, AC];
    return [isHex(p.корпус) ? p.корпус : v[0], isHex(p.циферблат) ? p.циферблат : v[Math.min(2, v.length - 1)]]; };

  // ——— текст ———
  function wrap(s, maxW, size, weight) {
    const lines = []; let cur = '';
    for (const w of String(s).split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (cur && textW(t, size, weight) > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  function wrapFit(s, maxW, size, weight, maxLines) {
    let sz = size, L = [];
    for (let i = 0; i < 14; i++) { L = wrap(s, maxW, sz, weight); if (L.length <= maxLines && L.every(l => textW(l, sz, weight) <= maxW)) break; sz *= .93; }
    return { lines: L, size: sz };
  }
  // строка под маской: pin 0→1 выезжает снизу из-под своей «щели», pout 0→1 уходит вверх
  function mline(s, X, Y, o, pin = 1, pout = 0) {
    if (!s || pin <= 0 || pout >= 1) return 0;
    const size = o.size, wt = o.weight || 700, tr = o.track || 0, w = textW(s, size, wt, tr);
    const al = o.align || 'center', x0 = al === 'left' ? X : al === 'right' ? X - w : X - w / 2;
    const dy = (1 - pin) * size * 1.3 - pout * size * 1.3;
    x.save(); x.beginPath(); x.rect(x0 - size, Y - size * .66, w + size * 2, size * 1.32); x.clip();
    let col = o.color || TX;
    if (o.grad) { const g = x.createLinearGradient(x0, Y + dy - size * .5, x0 + w, Y + dy + size * .5); o.grad.forEach((cc, i) => g.addColorStop(i / (o.grad.length - 1), cc)); col = g; }
    if (o.sheen != null) {  // полоса света по буквам
      const L = x0 - 500, R = x0 + w + 500, c0 = clamp(o.sheen), g = x.createLinearGradient(L, 0, R, 0), base = o.base || DIM;
      g.addColorStop(0, base); g.addColorStop(clamp(c0 - .16), base); g.addColorStop(c0, o.bright || TX); g.addColorStop(clamp(c0 + .16), base); g.addColorStop(1, base);
      col = g;
    }
    T(s, X, Y + dy, { size, weight: wt, track: tr, align: al, color: col, alpha: (o.alpha ?? 1) * clamp(pin * 1.6) * clamp((1 - pout) * 1.6) });
    x.restore(); return w;
  }

  // ——— герой-предмет: габарит меряем один раз по пикселям (любой САЙТ.предмет) ———
  function thing(t, p, s) {
    if (typeof S.предмет === 'function') { S.предмет(x, t, p, s); return; }
    // запасной предмет: стеклянная плитка с буквой бренда
    const g = x.createLinearGradient(-s, -s, s, s); g.addColorStop(0, mixHex(AC, '#ffffff', .35)); g.addColorStop(1, mixHex(AC, '#000000', .35));
    x.save(); shadow(s * .3, 'rgba(0,0,0,.45)', s * .08); rr(-s, -s, s * 2, s * 2, s * .42); x.fillStyle = g; x.fill(); x.restore();
    T((brand || '•').slice(0, 1), 0, s * .04, { size: s * 1.1, weight: 800, color: onAC });
  }
  let EXT = null, UNI = null, L0 = null;
  const EXTS = new Map();                 // габарит каждого товара: у фото разные пропорции, свой «пол» под отражение
  const ext = p => EXTS.get(p) || EXT;
  function measure(p) {
    const M = 120;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.translate(540, 960); thing(0, p, M); x.restore();
    const d = x.getImageData(0, 0, W, H).data; let l = W, r = 0, tp = H, b = 0;
    for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 50) { if (xx < l) l = xx; if (xx > r) r = xx; if (yy < tp) tp = yy; if (yy > b) b = yy; }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    return r > l ? { l: (l - 540) / M, r: (r - 540) / M, t: (tp - 960) / M, b: (b - 960) / M } : { l: -1, r: 1, t: -1, b: 1 };
  }
  function init() {
    EXT = measure(P0); EXTS.set(P0, EXT);
    pals.forEach(p => { if (!EXTS.has(p)) EXTS.set(p, measure(p)); });
    // общий габарит всех товаров (у фото разные пропорции) — по нему сцена перекраски, чтобы никто не вылез на подписи
    const all = [...EXTS.values()]; UNI = { l: Math.min(...all.map(e => e.l)), r: Math.max(...all.map(e => e.r)), t: Math.min(...all.map(e => e.t)), b: Math.max(...all.map(e => e.b)) };
    // кегли — один раз
    const hs = Math.min(170, ...hook.map(s => fit(s, 860, 170, 700, -3)));
    const ts = Math.min(100, ...head.map(s => fit(s, 860, 100, 700, -2)));
    const ns = Math.min(175, ...stats.map(d => fit(num(+d.число) + (d.плюс || ''), 840, 175, 700, -3.5)));
    const cs = Math.min(150, ...cta.map(s => fit(s, 860, 150, 700, -3)));
    L0 = { hs, ts, ns, cs, sub: sub ? wrapFit(sub, 840, 40, 500, 2) : null,
      perks: perks.map(p => wrapFit(p, 840 / perks.length - 40, 40, 500, 3)) };
  }
  const place = (cy, Ht, Wt, X = EXT) => { const s = Math.min(Ht / (X.b - X.t), Wt / (X.r - X.l)); return { s, ox: 540 - (X.l + X.r) / 2 * s, oy: cy - (X.t + X.b) / 2 * s }; };

  // ——— тайминг перекраски ———
  const N = Math.max(1, goods.length), C0 = 5.85, DK = N > 1 ? Math.min(1, 2.85 / (N - 1)) : 0, WIPE = .66;
  const tk = k => C0 + k * DK;
  function colorAt(t) { let k = 0; for (let i = 1; i < N; i++) if (t >= tk(i)) k = i; return { k, wp: k ? prog(t, tk(k), tk(k) + WIPE) : 1 }; }
  const PAN = 1380, pan = t => PAN * E.inOut(prog(t, 9.6, 10.45));
  // второй пролёт камеры: цифры уходят вверх, герой финала поднимается снизу — без пустого кадра
  const PAN2 = 1380, pan2 = t => PAN2 * E.inOut(prog(t, 11.45, 12.4));

  // ——— состояние героя по времени ———
  function objState(t) {
    if (t >= 1.6 && t < 10.5) {
      const p1 = E.inOut(prog(t, 3.5, 4.45)), p2 = E.inOut(prog(t, 5.2, 6.1));
      const rise = E.expo(prog(t, 1.65, 3.5));
      const pA = place(mix(930, 1080, p1), mix(1130, 840, p1), mix(760, 680, p1)), pB = place(848, 905, 660, UNI);
      const pl = { s: mix(pA.s, pB.s, p2), ox: mix(pA.ox, pB.ox, p2), oy: mix(pA.oy, pB.oy, p2) + (1 - rise) * 700 - pan(t) };
      const { k, wp } = colorAt(t), we = E.inOut(wp);
      let sx = mix(.42, 1, E.out5(prog(t, 1.7, 4.0)));
      sx *= 1 - .05 * Math.sin(Math.PI * prog(t, 4.35, 5.5));            // медленный поворот туда-обратно
      if (k && wp < 1) sx *= 1 - .1 * Math.sin(Math.PI * wp);            // при смене цвета чуть «отворачивается»
      const sheen = k && wp < 1 ? we : t < 4.6 ? prog(t, 2.6, 4.5) : prog(t, 4.5, 5.6);
      return { ...pl, t, sx, skew: (1 - sx) * .2, palA: pals[Math.max(0, k - 1)], palB: pals[k], wipe: k && hasPal ? we : 1,
        light: E.out(prog(t, 1.7, 3.1)), sheen, sheenA: k && wp < 1 ? .2 : .26, tint: k ? mixHex(tint(k - 1), tint(k), we) : tint(0) };
    }
    if (t >= 11.45) {
      const settle = E.out5(prog(t, 12.1, 13.6));
      const pl = place(630 + PAN2 - pan2(t) + (1 - settle) * 40, 590, 560);
      let sx = mix(.8, 1, E.out5(prog(t, 11.6, 13.4))) * (1 - .03 * Math.sin(Math.PI * prog(t, 14.0, 15.6)));
      return { ...pl, t, sx, skew: (1 - sx) * .2, palA: P0, palB: P0, wipe: 1, light: mix(.45, 1, E.out(prog(t, 11.7, 12.7))),
        sheen: prog(t, 12.5, 14.3), sheenA: .26, tint: tint(0) };
    }
    return null;
  }
  const box = o => { const s = o.s, A = ext(o.palA), Bq = ext(o.palB), k = o.wipe, w = (EXT.r - EXT.l) * s * o.sx;
    const top = o.oy + mix(A.t, Bq.t, k) * s, floor = o.oy + mix(A.b, Bq.b, k) * s;
    return { s, top, floor, h: floor - top, w, cx: o.ox + (EXT.l + EXT.r) / 2 * s * o.sx }; };

  // герой + отражение рисуются ПЕРВЫМИ на пустой холст, фон потом подкладывается снизу (destination-over)
  function group(o) {
    const B = box(o), refLen = B.h * .26, s = o.s;
    const edge = (y, F, mir) => { const yy = mir ? 2 * F - y : y; return mix(B.cx - B.w / 2 - 160, B.cx + B.w / 2 + 160, o.wipe) + (yy - (B.top + B.h / 2)) * .32; };
    const one = (p, mir, F) => {
      x.save();
      if (mir) { x.translate(o.ox, F); x.scale(1, -1); x.translate(0, o.oy - F); } else x.translate(o.ox, o.oy);
      x.transform(o.sx, o.skew, 0, 1, 0, 0); thing(o.t, p, s); x.restore();
    };
    // шторка: старое фото справа от кромки, новое слева
    const clipSide = (side, y0, y1, F, mir) => {
      x.beginPath();
      if (!side) x.rect(-300, y0, W + 600, y1 - y0);
      else { const e0 = edge(y0, F, mir), e1 = edge(y1, F, mir);
        if (side === 'A') { x.moveTo(e0, y0); x.lineTo(W + 300, y0); x.lineTo(W + 300, y1); x.lineTo(e1, y1); }
        else { x.moveTo(-300, y0); x.lineTo(e0, y0); x.lineTo(e1, y1); x.lineTo(-300, y1); } x.closePath(); }
      x.clip();
    };
    const wiping = o.wipe < 1 && o.palA !== o.palB;
    const layers = wiping ? [[o.palA, 'A'], [o.palB, 'B']] : [[o.wipe >= 1 ? o.palB : o.palA, null]];
    for (const [p, side] of layers) {
      const F = o.oy + ext(p).b * s;
      // отражение по альфе фото: зеркало относительно его нижнего края, затухание градиентом
      x.save(); clipSide(side, F, F + refLen, F, true);
      one(p, true, F);
      x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(0, F, 0, F + refLen);
      g.addColorStop(0, `rgba(0,0,0,${REFA})`); g.addColorStop(.55, `rgba(0,0,0,${REFA * .25})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(-300, F, W + 600, refLen);
      x.restore();
      // само фото
      x.save(); if (side) clipSide(side, B.top - 400, F + 4, F, false); one(p, false, F); x.restore();
    }
    // свет поверх предмета (source-atop: только по его пикселям)
    x.save(); x.globalCompositeOperation = 'source-atop';
    const L = B.cx - B.w / 2 - 200, R = B.cx + B.w / 2 + 200, T0 = B.top - 200, H0 = B.h + refLen + 400;
    if (o.sheen > 0 && o.sheen < 1) {
      const c0 = mix(L - 200, R + 200, E.inOut(o.sheen)), a = o.sheenA * Math.sin(Math.PI * o.sheen);
      const sg = x.createLinearGradient(c0 - 170, B.top, c0 + 170, B.top + 160);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${a})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sg; x.fillRect(L - 400, T0, R - L + 800, H0);
    }
    if (o.wipe > 0 && o.wipe < 1) {  // световая кромка шторки
      const yM = B.top + B.h / 2, e = edge(yM, B.floor, false), a = .6 * Math.sin(Math.PI * o.wipe);
      x.save(); x.translate(e, yM); x.transform(1, 0, .32, 1, 0, 0);
      const eg = x.createLinearGradient(-60, 0, 60, 0); eg.addColorStop(0, 'rgba(255,255,255,0)'); eg.addColorStop(.5, `rgba(255,255,255,${a})`); eg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = eg; x.fillRect(-60, -B.h, 120, B.h * 2 + refLen); x.restore();
    }
    if (o.light < 1) {  // выход из темноты (на светлой теме — из света): свет падает сверху
      const dg = x.createLinearGradient(0, B.top, 0, B.floor + refLen), l = o.light;
      dg.addColorStop(0, rgba(BG, clamp(1 - l * 1.7))); dg.addColorStop(.5, rgba(BG, clamp(1.15 - l * 1.45))); dg.addColorStop(1, rgba(BG, clamp(1.3 - l * 1.3)));
      x.fillStyle = dg; x.fillRect(L - 400, T0, R - L + 800, H0);
    }
    x.restore();
  }

  // ——— подложка (рисуется под уже нарисованным, ближнее первым) ———
  function under(o, t) {
    const b = beamI(t);
    if (o) {
      const B = box(o);
      // контактная тень
      x.save(); x.translate(B.cx, B.floor); x.scale(1, .09);
      let g = x.createRadialGradient(0, 0, 0, 0, 0, B.w * .62);
      g.addColorStop(0, `rgba(0,0,0,${dark ? .75 : .26})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(-B.w, -B.w, B.w * 2, B.w * 2); x.restore();
      // ореол цвета товара за предметом
      const hr = B.h * .62;
      g = x.createRadialGradient(B.cx, B.top + B.h * .45, 0, B.cx, B.top + B.h * .45, hr);
      const ha = (dark ? .24 : .16) * o.light; for (let i = 0; i <= 8; i++) { const k = i / 8; g.addColorStop(k, rgba(o.tint, ha * Math.pow(1 - k, 2.2))); }
      x.fillStyle = g; x.fillRect(B.cx - hr, B.top + B.h * .45 - hr, hr * 2, hr * 2);
      // пятно света на полу
      x.save(); x.translate(B.cx, B.floor + 6); x.scale(1, .13);
      g = x.createRadialGradient(0, 0, 0, 0, 0, B.w * 1.5);
      g.addColorStop(0, dark ? `rgba(255,255,255,${.1 * b})` : `rgba(255,255,255,${.85 * b})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-B.w * 1.6, -B.w * 1.6, B.w * 3.2, B.w * 3.2); x.restore();
    }
    giant(t);
    // луч сверху: вытянутый мягкий эллипс
    if (b > 0) {
      x.save(); x.translate(540, -160); x.scale(1, 3.1);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 470);
      const c0 = dark ? '#ffffff' : '#ffffff', a0 = dark ? .13 : .95;
      g.addColorStop(0, rgba(c0, a0 * b)); g.addColorStop(.6, rgba(c0, a0 * .35 * b)); g.addColorStop(1, rgba(c0, 0));
      x.fillStyle = g; x.fillRect(-600, -10, 1200, 700); x.restore();
    }
    // виньетка и фон
    const vg = x.createRadialGradient(540, 880, 0, 540, 880, 1300);
    const va = dark ? .55 : .07; [[0, 0], [.35, 0], [.55, .18], [.75, .5], [1, 1]].forEach(([o, k]) => vg.addColorStop(o, `rgba(0,0,0,${(va * k).toFixed(3)})`));
    x.fillStyle = vg; x.fillRect(-200, -200, W + 400, H + 400);
    x.fillStyle = BG; x.fillRect(-200, -200, W + 400, H + 400);
  }
  const beamI = t => clamp(E.inOut(prog(t, 1.35, 2.7)) - .65 * E.inOut(prog(t, 9.6, 10.4)) + .65 * E.inOut(prog(t, 11.6, 12.5)));

  // огромное слово-бренд за героем (только в момент его выхода)
  function giant(t) {
    if (t < 2.0 || t > 4.0 || !brand) return;
    const sz = fit(brand, 1000, 300, 800, -6), pin = E.out5(prog(t, 2.05, 3.15)), a = 1 - E.inOut(prog(t, 3.25, 3.85));
    mline(brand, 540, 560, { size: sz, weight: 800, track: -6, color: mixHex(BG, TX, dark ? .1 : .07), alpha: a }, pin, 0);
  }

  // ——— сцены переднего плана ———
  function hookScene(t) {
    if (t > 2.6 || !hook.length) return;
    const n = hook.length, sz = L0.hs, cy = 900, lh = sz * mix(1.1, 1.03, E.out(prog(t, 0, 1.5)));
    const hz = 1 + .075 * E.inOut(prog(t, 0, 2.4));
    x.save(); x.translate(540, cy); x.scale(hz, hz); x.translate(-540, -cy);
    const tr = -3;  // letterSpacing в canvas шагает целыми px — не анимируем
    const y0 = cy - (n - 1) * lh / 2;
    if (brand) {
      const ey = y0 - sz * .5 - 78, out = E.inOut(prog(t, 1.4, 1.9));
      const bw = textW(brand, 34, 600, 7), tw = tail ? textW(tail, 34, 600, 7) : 0;
      mline(brand, 540 - tw / 2, ey, { size: 34, weight: 600, track: 7, color: GRT }, 1, out);
      if (tail) mline(tail, 540 + bw / 2 + 2, ey, { size: 34, weight: 600, track: 7, color: ACT }, 1, out);
    }
    hook.forEach((s, i) => {
      const last = n > 1 && i === n - 1, out = E.inOut(prog(t, 1.5 + i * .07, 2.05 + i * .07));
      const o = { size: sz, weight: 700, track: tr };
      if (last) o.grad = [ACT, mixHex(ACT, TX, .3)];
      else { o.sheen = mix(-.2, 1.2, E.inOut(prog(t, .15 + i * .12, 1.55 + i * .12))); }
      mline(s, 540, y0 + i * lh, o, 1, out);
    });
    x.restore();
  }

  function heroTitle(t) {
    if (t < 3.6 || t > 5.9 || !head.length) return;
    const sz = L0.ts, lh = sz * 1.07, y0 = 330 + sz * .5;
    head.forEach((s, i) => {
      const pin = E.out5(prog(t, 3.8 + i * .1, 4.6 + i * .1)), out = E.inOut(prog(t, 5.1 + i * .06, 5.6 + i * .06));
      const o = { size: sz, weight: 700, track: -sz * .02 };
      if (i === accIdx && head.length > 1) o.grad = [ACT, mixHex(ACT, TX, .3)];
      mline(s, 540, y0 + i * lh, o, pin, out);
    });
  }

  function colorsUI(t, o) {
    if (t < 5.6 || t > 10.5) return;
    x.save(); x.translate(0, -pan(t));
    // подзаголовок сверху
    if (L0.sub) L0.sub.lines.forEach((s, i) => mline(s, 540, 318 + i * L0.sub.size * 1.3,
      { size: L0.sub.size, weight: 500, color: GRT }, E.out5(prog(t, 5.8 + i * .08, 6.55 + i * .08)), 0));
    const { k } = colorAt(t), enter = E.out5(prog(t, 5.9, 6.65));
    const nameY = 1332, priceY = 1404, swY = 1462;
    const label = (i, pin, pout) => {
      const g = goods[i]; if (!g) return;
      if (g.имя) mline(g.имя, 540, nameY, { size: fit(g.имя, 860, 80, 700, -1.5), weight: 700, track: -1.5 }, pin, pout);
      if (g.цена) mline(g.цена, 540, priceY, { size: fit(g.цена, 760, 46, 500), weight: 500, color: GRT }, clamp(pin * 1.15 - .15), pout);
    };
    if (k === 0) label(0, enter, 0);
    else {
      const a = tk(k);
      if (t < a + .5) label(k - 1, 1, E.inOut(prog(t, a, a + .42)));
      label(k, E.out5(prog(t, a + .24, a + .9)), 0);
    }
    // свотчи (или точки-страницы, если палитр нет)
    if (N > 1) {
      const gap = hasPal ? 98 : 44, x0 = 540 - (N - 1) * gap / 2;
      const { wp } = colorAt(t), act = k ? mix(k - 1, k, E.inOut(wp)) : 0;
      for (let i = 0; i < N; i++) {
        const p = E.out5(prog(t, 6.05 + i * .06, 6.6 + i * .06)); if (p <= 0) continue;
        const X = x0 + i * gap;
        if (hasPal) {
          const [c1, c2] = swatch(i), r = 28 * p;
          const g = x.createLinearGradient(X - r, swY - r, X + r, swY + r); g.addColorStop(0, mixHex(c1, '#ffffff', .25)); g.addColorStop(.5, c1); g.addColorStop(.5, c2); g.addColorStop(1, mixHex(c2, '#000000', .2));
          x.beginPath(); x.arc(X, swY, r, 0, 7); x.fillStyle = g; x.fill();
          x.lineWidth = 1.5; x.strokeStyle = rgba(TX, .18); x.stroke();
        } else {
          const near = clamp(1 - Math.abs(act - i));
          rr(X - 8 - near * 14, swY - 8, 16 + near * 28, 16, 8); x.fillStyle = rgba(TX, (.25 + .75 * near) * p); x.fill();
        }
      }
      if (hasPal) {
        const ap = E.out5(prog(t, 6.3, 6.9));
        x.beginPath(); x.arc(x0 + act * gap, swY, 39, 0, 7); x.lineWidth = 3; x.strokeStyle = rgba(TX, .9 * ap); x.stroke();
      }
    }
    x.restore();
  }

  function statsScene(t) {
    if (t < 9.55 || t > 12.45 || (!stats.length && !perks.length)) return;
    const off = PAN - pan(t) - pan2(t);
    x.save(); x.translate(0, off);
    const n = stats.length, rowH = n >= 3 ? 282 : 320, top = n >= 3 ? 300 : 380, line = rgba(TX, dark ? .2 : .16);
    const hair = (y, i) => {
      const a = E.inOut(prog(t, 9.7 + i * .1, 10.6 + i * .1)), b = E.inOut(prog(t, 12.0 + i * .06, 12.4 + i * .06));
      if (a > b) { x.fillStyle = line; x.fillRect(120 + 840 * b, y, 840 * (a - b), 2); }
    };
    stats.forEach((d, i) => {
      const ly = top + i * rowH; hair(ly, i);
      const pin = E.out5(prog(t, 9.8 + i * .12, 10.55 + i * .12)), out = E.inOut(prog(t, 11.95 + i * .07, 12.35 + i * .07));
      const v = +d.число * E.out5(prog(t, 9.85 + i * .12, 11.05 + i * .12)), sz = L0.ns, ny = ly + 30 + sz * .5;
      const w = mline(num(v), 120, ny, { size: sz, weight: 700, track: -sz * .02, align: 'left' }, pin, out);
      if (d.плюс) mline(d.плюс, 120 + w + 4, ny, { size: sz, weight: 600, align: 'left', grad: [ACT, mixHex(ACT, TX, .3)] }, pin, out);
      if (d.подпись) mline(d.подпись, 124, ny + sz * .5 + 36, { size: fit(d.подпись, 840, 46, 500), weight: 500, color: GRT, align: 'left' },
        E.out5(prog(t, 9.9 + i * .12, 10.65 + i * .12)), out);
    });
    if (n) hair(top + n * rowH, n);
    // преимущества: сетка в 3 колонки с тонкими вертикальными линиями
    if (perks.length) {
      const m = perks.length, cw = 840 / m, py = top + n * rowH + (n ? 72 : 0);
      perks.forEach((p, j) => {
        const cx = 120 + cw * (j + .5), pin = E.out5(prog(t, 10.2 + j * .1, 10.9 + j * .1)), out = E.inOut(prog(t, 12.0 + j * .06, 12.4 + j * .06));
        const vis = Math.min(pin, 1 - out);
        if (j) { const h = 210 * E.inOut(prog(t, 10.15 + j * .1, 10.85 + j * .1)) * (1 - out); x.fillStyle = line; x.fillRect(120 + cw * j - 1, py, 2, h); }
        x.beginPath(); x.arc(cx, py + 16, 6 * vis, 0, 7); x.fillStyle = ACT; x.fill();
        const L = L0.perks[j];
        L.lines.forEach((s, q) => mline(s, cx, py + 66 + q * L.size * 1.25, { size: L.size, weight: 500, color: TX }, clamp(pin * 1.2 - q * .1), out));
      });
    }
    x.restore();
  }

  function ctaScene(t) {
    if (t < 12.0) return;
    const cs = L0.cs, n = cta.length, total = (n - 1) * cs * 1.04 + cs * .5 + 105 + 100;
    const y0 = Math.min(1015, 1450 - total);
    if (brand) {
      const pin = E.out5(prog(t, 12.15, 12.85)), bw = textW(brand, 36, 600, 7), tw = tail ? textW(tail, 36, 600, 7) : 0;
      mline(brand, 540 - tw / 2, 282, { size: 36, weight: 600, track: 7, color: TX }, pin, 0);
      if (tail) mline(tail, 540 + bw / 2 + 2, 282, { size: 36, weight: 600, track: 7, color: ACT }, pin, 0);
    }
    let ly = y0;
    cta.forEach((s, i) => {
      ly = y0 + i * cs * 1.04;
      const o = { size: cs, weight: 700, track: -cs * .022 };
      if (n > 1 && i === n - 1) o.grad = [ACT, mixHex(ACT, TX, .3)];
      mline(s, 540, ly, o, E.out5(prog(t, 12.25 + i * .1, 13.05 + i * .1)), 0);
    });
    const btn = S.кнопка, py = ly + cs * .5 + 105;
    if (btn) {
      const p = E.out5(prog(t, 12.7, 13.35)), fs = fit(btn, 640, 40, 600), bw = textW(btn, fs, 600) + 112, bh = 92;
      x.save(); x.globalAlpha = p; x.translate(540, py); x.scale(mix(.94, 1, p), mix(.94, 1, p));
      if (dark) shadow(40, rgba(AC, .35), 0); else shadow(30, 'rgba(0,0,0,.12)', 8);
      rr(-bw / 2, -bh / 2, bw, bh, bh / 2); x.fillStyle = AC; x.fill(); noShadow();
      // мягкий блик, пробегает один раз
      const sp = prog(t, 13.4, 14.4);
      if (sp > 0 && sp < 1) { x.save(); rr(-bw / 2, -bh / 2, bw, bh, bh / 2); x.clip(); const c0 = mix(-bw, bw, sp);
        const g = x.createLinearGradient(c0 - 90, 0, c0 + 90, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(-bw, -bh, bw * 2, bh * 2); x.restore(); }
      T(btn, 0, 2, { size: fs, weight: 600, color: onAC });
      x.restore();
    }
    if (domain) mline(domain, 540, btn ? py + 102 : py, { size: fit(domain, 760, 40, 500, 1), weight: 500, track: 1, color: GRT }, E.out5(prog(t, 12.9, 13.6)), 0);
  }

  window.КАДР = t => {
    if (!EXT) init();
    // камера: медленный общий наезд + еле заметный дрейф
    const z = 1 + .03 * t / DUR, dx = noise(11, t * .22) * 5, dy = noise(12, t * .22) * 4;
    x.save(); x.translate(540 + dx, 900 + dy); x.scale(z, z); x.translate(-540, -900);
    const o = objState(t);
    if (o) group(o);
    x.save(); x.globalCompositeOperation = 'destination-over'; under(o, t); x.restore();
    hookScene(t); heroTitle(t); colorsUI(t, o); statsScene(t); ctaScene(t);
    x.restore();
  };
})();

  },
  steklo() {
// «Стекло-3Д»: интерфейс сайта разобран на стеклянные панели, они висят в 3D, камера летит сквозь них.
// Свой маленький 3D-движок: камера (x,y,z, рыск, тангаж, крен), перспектива, панели-прямоугольники
// с поворотом, точное перспективное очертание (по спроецированным точкам, с отсечением у камеры),
// контент на панели через локальную аффинную матрицу, сортировка по глубине,
// матовое стекло = уменьшенный снимок того, что уже нарисовано сзади (без ctx.filter, работает в Safari).
window.ИМЯ = 'steklo';
DUR = 15;
FONT = САЙТ.шрифт || FONT;
(() => {
  const S = САЙТ, C = S.цвета || {};
  const arr = v => Array.isArray(v) ? v.filter(s => s != null && s !== '').map(String) : (v ? [String(v)] : []);
  const up = s => S.капс ? String(s).toUpperCase() : String(s);
  const LIGHT = /свет|light/i.test(S.тема || '');

  // ——— цвета ———
  const toHex = c => { if (c[0] === '#') return c; const m = c.match(/\d+/g).map(Number); return '#' + m.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); };
  const mixH = (a, b, p) => toHex(mixColor(a, b, p));
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const BG = toHex(C.фон || (LIGHT ? '#f4f4f2' : '#070707'));
  const TX = toHex(C.текст || (LIGHT ? '#111111' : '#ffffff'));
  const CARD = toHex(C.карта || mixH(BG, TX, .08));
  const ACC = toHex(C.акцент || '#4da3ff');
  const GLASS = LIGHT ? mixH(CARD, '#ffffff', .5) : mixH(CARD, TX, .05);       // средний тон стекла
  let GR = toHex(C.серый || mixH(TX, BG, .45));
  for (let i = 1; i <= 6 && contrast(GR, GLASS) < 3.6; i++) GR = mixH(C.серый || GR, TX, i * .12);
  let ACT = ACC;                                                                  // акцент для текста
  for (let i = 1; i <= 9 && contrast(ACT, GLASS) < 3.2; i++) ACT = mixH(ACC, LIGHT ? '#000000' : '#ffffff', i * .09);
  const ON_ACC = contrast(ACC, '#111111') >= contrast(ACC, '#ffffff') ? '#111111' : '#ffffff';
  const ACC_GLOW = LIGHT ? ACC : mixH(ACC, '#ffffff', .1);
  const ACC2 = LIGHT ? mixH(ACC, '#ffffff', .45) : mixH(ACC, TX, .55);                                              // второй тон для огней

  // ——— данные сайта ———
  const HOOK = (arr(S.хук).length ? arr(S.хук) : arr(S.заголовок)).map(up).slice(0, 4);
  const TITLE = arr(S.заголовок).map(up).slice(0, 4);
  const ACC_LINE = Math.min(S.акцентСтрока ?? TITLE.length - 1, TITLE.length - 1);
  const SUB = S.подзаголовок ? String(S.подзаголовок) : '';
  const BTN = S.кнопка ? String(S.кнопка) : '';
  const NUMS = (S.цифры || []).slice(0, 3);
  // запасные ходы: нет товаров — одна карточка с предметом; нет шагов — шагами становятся преимущества
  const GOODS = (S.товары || []).length ? S.товары.slice(0, 4) : [{ имя: S.бренд || '', цена: S.домен || '' }];
  const STEPS = (arr(S.шаги).length ? arr(S.шаги) : arr(S.преимущества)).slice(0, 5);
  const PROS = arr(S.шаги).length ? arr(S.преимущества).slice(0, 3) : [];
  const CTA = (arr(S.призыв).length ? arr(S.призыв) : arr(BTN)).map(up).slice(0, 3);
  const DOMAIN = S.домен ? String(S.домен) : '';
  const BRAND = S.бренд ? String(S.бренд) : '', TAIL = S.хвостЛого ? String(S.хвостЛого) : '';
  const OBJ = (pal, t, s) => { try { x.save(); S.предмет(x, t, pal, s); } finally { x.restore(); } };

  // ——— утилиты текста ———
  function wrap(s, maxW, size, weight, maxLines) {
    let sz = size;
    for (let k = 0; k < 12; k++) {
      const words = String(s).split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const tryS = cur ? cur + ' ' + w : w; if (textW(tryS, sz, weight) <= maxW || !cur) cur = tryS; else { lines.push(cur); cur = w; } }
      if (cur) lines.push(cur);
      const widest = Math.max(...lines.map(l => textW(l, sz, weight)));
      if (lines.length <= maxLines && widest <= maxW) return { lines, size: sz };
      sz *= .92;
    }
    return { lines: [String(s)], size: fit(String(s), maxW, sz, weight) };
  }
  // строки заголовка: если строка не лезет крупно, переносим её на две (акцентная остаётся акцентной)
  function rows(src, maxW, size, weight, minSize, accIdx, track = 0) {
    let sz = Math.min(size, ...src.map(l => fit(l, maxW, size, weight, track)));
    if (sz >= minSize || !src.length) return { rows: src.map((s, i) => ({ s, acc: i === accIdx })), size: sz };
    const g = Math.min(...src.map(l => wrap(l, maxW, size, weight, 2).size));
    const out = []; src.forEach((l, i) => wrap(l, maxW, g, weight, 2).lines.forEach(s => out.push({ s, acc: i === accIdx })));
    return { rows: out, size: Math.min(g, ...out.map(r => fit(r.s, maxW, g, weight, track))) };
  }
  // одна строка, если влезает не мельче minOne; иначе перенос до maxLines; не влезло и мелко — многоточие
  function smart(s, maxW, size, weight, maxLines, minOne, minSize) {
    s = String(s); const one = fit(s, maxW, size, weight);
    if (one >= minOne) return { lines: [s], size: one };
    const w = wrap(s, maxW, size, weight, maxLines);
    if (w.size >= minSize && w.lines.length <= maxLines) return w;
    const words = s.split(/\s+/), lines = []; let cur = '';
    for (const wd of words) { const tr = cur ? cur + ' ' + wd : wd; if (textW(tr, minSize, weight) <= maxW || !cur) cur = tr; else { lines.push(cur); cur = wd; } }
    lines.push(cur);
    const out = lines.slice(0, maxLines);
    if (lines.length > maxLines) { let l = out[maxLines - 1] + '…'; while (l.length > 2 && textW(l, minSize, weight) > maxW) l = l.slice(0, -2).trimEnd() + '…'; out[maxLines - 1] = l; }
    return { lines: out, size: Math.min(minSize, ...out.map(l => fit(l, maxW, minSize, weight))) };
  }
  const sm = (a, b, v) => { const p = clamp((v - a) / (b - a)); return p * p * (3 - 2 * p); };

  // ——— служебные холсты (рисуются кодом один раз) ———
  const mk = (w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
  function sprite(col, kind) {
    const k = mk(256, 256), g = k.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    if (kind === 'disc') { gr.addColorStop(0, rgba(col, .42)); gr.addColorStop(.7, rgba(col, .5)); gr.addColorStop(.86, rgba(col, .62)); gr.addColorStop(.97, rgba(col, 0)); gr.addColorStop(1, rgba(col, 0)); }
    else { gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(.2, rgba(col, .6)); gr.addColorStop(.5, rgba(col, .18)); gr.addColorStop(1, rgba(col, 0)); }
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return k;
  }
  const SP = { glow: sprite(ACC_GLOW, 'glow'), disc: sprite(ACC_GLOW, 'disc'), disc2: sprite(ACC2, 'disc'), glow2: sprite(LIGHT ? '#ffffff' : ACC2, 'glow'), dark: sprite(LIGHT ? mixH(BG, '#000000', .5) : '#000000', 'glow') };
  const FR1 = mk(280, 490), FR2 = mk(80, 130), FR3 = mk(280, 490);
  const f1 = FR1.getContext('2d'), f2 = FR2.getContext('2d'), f3 = FR3.getContext('2d');
  [f1, f2, f3].forEach(g => { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; });

  // ——— 3D: камера и проекция ———
  const FL = 1100, CX = 540, CY = 900, NEAR = 30;
  let K;
  function setCam(c) { c.cy = Math.cos(c.yaw); c.sy = Math.sin(c.yaw); c.cp = Math.cos(c.pitch); c.sp = Math.sin(c.pitch); c.cr = Math.cos(c.roll); c.sr = Math.sin(c.roll); K = c; }
  const rot3 = (dx, dy, dz) => { const X = dx * K.cy - dz * K.sy, Z1 = dx * K.sy + dz * K.cy; return [X, dy * K.cp - Z1 * K.sp, dy * K.sp + Z1 * K.cp]; };
  const cam3 = p => rot3(p[0] - K.x, p[1] - K.y, p[2] - K.z);
  function scr(q) { const s = FL / q[2], X = q[0] * s, Y = q[1] * s; return [CX + X * K.cr - Y * K.sr, CY + X * K.sr + Y * K.cr, s]; }

  // ключи камеры: t, x, y, z, рыск, тангаж, крен, [сила касательной]
  const P0 = [1300, 0, 2700];                          // центр витрины товаров
  const nG = GOODS.length;
  const cardPos = nG === 1 ? [[0, 0, 0]] : nG === 2 ? [[-200, 0, -40], [200, 0, 80]] : nG === 3 ? [[-200, -275, -40], [200, -275, 80], [0, 275, 40]] : [[-200, -275, -40], [200, -275, 80], [-200, 275, 60], [200, 275, -60]];
  const dv = cardPos[Math.min(1, nG - 1)] || [200, -275, 80];
  const DIVE = [P0[0] + dv[0], P0[1] + dv[1], P0[2] + dv[2]]; // карточка, сквозь которую летим
  const QY = DIVE[1], QZ = 4380;                       // цифры
  const SY = 975, SZ = 4500;                           // шаги
  const orbit = th => [P0[0] - 1120 * Math.sin(th), 0, P0[2] - 1120 * Math.cos(th)];
  const o1 = orbit(.5), o2 = orbit(.24);
  const KEYS = [
    [0.0, 0, 0, -1040, .03, 0, 0, 1],
    [1.25, 0, 0, -1110, 0, 0, 0, .6],
    [2.15, 170, -90, -1480, .08, .04, .012, 1],
    [3.1, 0, 0, 170, 0, 0, 0, .12],
    [4.3, 0, 0, 230, 0, 0, 0, .5],
    [5.25, o1[0], 0, o1[2], .5, 0, -.02, 1],
    [5.8, o2[0], 0, o2[2], .24, 0, -.01, 1],
    [6.3, P0[0], 0, P0[2] - 1120, 0, 0, 0, .15],
    [7.5, P0[0], 0, P0[2] - 1060, 0, 0, 0, .4],
    [8.05, DIVE[0], DIVE[1], DIVE[2], 0, 0, .0, 1],
    [8.5, DIVE[0], QY, QZ - 1120, 0, 0, 0, .2],
    [9.6, DIVE[0], QY, QZ - 1070, 0, 0, 0, .5],
    [10.2, DIVE[0], SY, SZ - 1120, 0, .0, 0, .2],
    [11.35, DIVE[0], SY, SZ - 1070, 0, 0, 0, .6],
    [12.5, DIVE[0] - 30, SY - 40, SZ - 1090, .025, 0, 0, .3],
    [15.0, DIVE[0] + 40, SY - 30, SZ - 990, -.03, 0, 0, 0],
  ];
  function camAt(t) {
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const A = KEYS[i], B = KEYS[i + 1], dt = B[0] - A[0], s = clamp((t - A[0]) / dt);
    const tan = (j, ch) => { if (j <= 0 || j >= KEYS.length - 1) return 0; const a = KEYS[j - 1], b = KEYS[j + 1]; return (b[ch] - a[ch]) / (b[0] - a[0]) * KEYS[j][7]; };
    const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
    const v = ch => h00 * A[ch] + h10 * dt * tan(i, ch) + h01 * B[ch] + h11 * dt * tan(i + 1, ch);
    // «дыхание» камеры: никогда не стоит мёртво
    return { x: v(1) + noise(11, t * .45) * 9, y: v(2) + noise(12, t * .4) * 7, z: v(3), yaw: v(4) + noise(13, t * .35) * .006, pitch: v(5) + noise(14, t * .3) * .005, roll: v(6) + noise(15, t * .3) * .004 };
  }

  // ——— панели ———
  function basis(ry = 0, rx = 0, rz = 0) {
    const R = v => {
      let [a, b, c] = v; const cz = Math.cos(rz), sz = Math.sin(rz); [a, b] = [a * cz - b * sz, a * sz + b * cz];
      const cx = Math.cos(rx), sx = Math.sin(rx); [b, c] = [b * cx - c * sx, b * sx + c * cx];
      const cy = Math.cos(ry), sy = Math.sin(ry); [a, c] = [a * cy + c * sy, -a * sy + c * cy];
      return [a, b, c];
    };
    return { ex: R([1, 0, 0]), ey: R([0, 1, 0]), n: R([0, 0, 1]) };
  }
  const W3 = (p, u, v, lift = 0) => [p.c[0] + p.ex[0] * u + p.ey[0] * v - p.n[0] * lift, p.c[1] + p.ex[1] * u + p.ey[1] * v - p.n[1] * lift, p.c[2] + p.ex[2] * u + p.ey[2] * v - p.n[2] * lift];
  // аффинная матрица в точке (u,v) панели: дальше рисуем в пикселях панели
  function at(p, u, v, lift = 0) {
    const w0 = W3(p, u, v, lift), q = cam3(w0); if (q[2] < NEAR * 3) return 0;
    const s0 = scr(q), su = scr(cam3([w0[0] + p.ex[0], w0[1] + p.ex[1], w0[2] + p.ex[2]])), sv = scr(cam3([w0[0] + p.ey[0], w0[1] + p.ey[1], w0[2] + p.ey[2]]));
    x.setTransform(su[0] - s0[0], su[1] - s0[1], sv[0] - s0[0], sv[1] - s0[1], s0[0], s0[1]);
    return s0[2];
  }
  function rrPoly(w, h, r, seg = 6) {
    r = Math.min(r, w / 2, h / 2); const pts = [];
    const cs = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
    for (const [a, b, a0] of cs) for (let i = 0; i <= seg; i++) { const an = a0 + i / seg * Math.PI / 2; pts.push([a + Math.cos(an) * r, b + Math.sin(an) * r]); }
    return pts;
  }
  function clipNear(P) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
      if (ai) out.push(a);
      if (ai !== bi) { const k = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]); }
    }
    return out;
  }
  // матовое стекло: снимок нарисованного сзади → уменьшить в 16 раз → увеличить обратно в два шага
  function frostGrab(bx, by, bw, bh) {
    const w1 = Math.max(2, Math.ceil(bw / 4)), h1 = Math.max(2, Math.ceil(bh / 4)), w2 = Math.max(2, Math.ceil(bw / 16)), h2 = Math.max(2, Math.ceil(bh / 16));
    f1.drawImage(x.canvas, bx, by, bw, bh, 0, 0, w1, h1);
    f2.drawImage(FR1, 0, 0, w1, h1, 0, 0, w2, h2);
    f3.drawImage(FR2, .5, .5, w2 - 1, h2 - 1, 0, 0, w1, h1);
    return () => x.drawImage(FR3, 0, 0, w1, h1, bx, by, bw, bh);
  }

  function drawPanel(p, t) {
    let A = p.a;
    if (p.fadeNear) A *= sm(p.fadeNear[0], p.fadeNear[1], cam3(p.c)[2]);   // осколок у самой камеры тает, а не заслоняет кадр
    if (A <= .003) return;
    const poly = rrPoly(p.w, p.h, p.r ?? 34);
    const cp = clipNear(poly.map(([u, v]) => cam3(W3(p, u, v))));
    if (cp.length < 3) return;
    const sp = cp.map(scr);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of sp) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    if (x1 < -40 || y1 < -40 || x0 > W + 40 || y0 > H + 40) return;
    const bx = Math.max(0, Math.floor(x0) - 2), by = Math.max(0, Math.floor(y0) - 2), bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by;
    if (bw < 2 || bh < 2) return;
    const path = () => { x.beginPath(); sp.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); };
    const cq = cam3(p.c), sc = FL / Math.max(cq[2], NEAR), nC = rot3(p.n[0], p.n[1], p.n[2]);
    const facing = (nC[0] * cq[0] + nC[1] * cq[1] + nC[2] * cq[2]) / Math.hypot(...cq);   // 1 = лицом к камере
    const big = Math.max(p.w, p.h) * sc;
    // панель, в которую влетает камера, становится рамой: стекло тает, остаётся светящаяся кромка
    const hollow = p.hollow ? sm(1.75, 2.7, sc) : 0, GA = A * (1 - hollow);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = GA;
    // цветная подсветка сзади
    if (p.glow !== 0 && cq[2] > NEAR * 4) {
      const c0 = scr(cq), g = big * 1.5 * (p.glowK || 1);
      x.globalAlpha = GA * (LIGHT ? .22 : .3) * (p.glow ?? 1);
      if (!LIGHT) x.globalCompositeOperation = 'lighter';
      x.drawImage(SP.glow, c0[0] - g / 2, c0[1] - g / 2 + big * .08, g, g);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = GA;
    }
    const useFrost = bw * bh > 30000 && p.frost !== false && GA > .02;
    const put = useFrost ? frostGrab(bx, by, bw, bh) : null;
    // тень (рисуем непрозрачную форму с тенью, стекло ляжет поверх)
    if (useFrost) {
      x.save(); shadow(Math.min(56, 40 * sc), LIGHT ? 'rgba(20,30,40,.16)' : 'rgba(0,0,0,.5)', Math.min(40, 22 * sc)); path(); x.fillStyle = GLASS; x.fill(); x.restore();
    }
    x.save(); path(); x.clip();
    if (put) put();
    // тонировка: светлее сверху, темнее снизу
    const lt = scr(cam3(W3(p, 0, -p.h / 2))), lb = scr(cam3(W3(p, 0, p.h / 2)));
    const okL = cam3(W3(p, 0, -p.h / 2))[2] > NEAR && cam3(W3(p, 0, p.h / 2))[2] > NEAR;
    const tg = okL ? x.createLinearGradient(lt[0], lt[1], lb[0], lb[1]) : x.createLinearGradient(0, by, 0, by + bh);
    if (LIGHT) { tg.addColorStop(0, rgba('#ffffff', .62)); tg.addColorStop(1, rgba(CARD, .48)); }
    else { tg.addColorStop(0, rgba(mixH(CARD, TX, .14), .5)); tg.addColorStop(1, rgba(CARD, .42)); }
    x.fillStyle = tg; x.fillRect(bx, by, bw, bh);
    if (!useFrost) { x.fillStyle = rgba(GLASS, .55); x.fillRect(bx, by, bw, bh); }
    // блик: полоса, которая бежит по стеклу, когда панель поворачивается
    const gl = (p.glint ?? 0) + nC[0] * 1.8 + nC[1] * .9;
    if (at(p, 0, 0)) {
      const u = (gl % 2.4 + 2.4) % 2.4 * p.w - p.w * 1.2;
      const g = x.createLinearGradient(u - 160, -p.h / 2, u + 160, p.h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${LIGHT ? .35 : .09})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      // внутренний градиент: свет сверху-слева
      const g2 = x.createLinearGradient(-p.w / 2, -p.h / 2, p.w * .1, p.h * .3);
      g2.addColorStop(0, `rgba(255,255,255,${LIGHT ? .3 : .07})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g2; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
    x.restore();
    // кромка
    path(); x.lineWidth = Math.max(1, 1.2 * Math.min(sc, 2)); x.strokeStyle = LIGHT ? rgba('#0b1520', .1) : rgba(TX, .13); x.stroke();
    const allNear = cp.length === poly.length;
    if (allNear) {
      const n = poly.length / 4, rim = [...sp.slice(3 * n), ...sp.slice(0, n)];
      const rg = x.createLinearGradient(rim[0][0], rim[0][1], rim[rim.length - 1][0], rim[rim.length - 1][1]);
      rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(.25, `rgba(255,255,255,${LIGHT ? .95 : .55})`); rg.addColorStop(.6, `rgba(255,255,255,${LIGHT ? 1 : .7})`); rg.addColorStop(1, 'rgba(255,255,255,.04)');
      x.beginPath(); rim.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]));
      x.lineWidth = Math.max(1, 1.8 * Math.min(sc, 2)); x.strokeStyle = rg; x.stroke();
    }
    x.restore();
    if (hollow > .01) {  // рама: акцентная кромка со свечением, сквозь неё видно следующую сцену
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = A * hollow;
      path(); x.lineJoin = 'round';
      if (!LIGHT) shadow(40, rgba(ACC, .8), 0); else shadow(26, rgba(ACC, .5), 0);
      x.lineWidth = Math.min(14, 2.4 * sc); x.strokeStyle = ACC; x.stroke(); noShadow();
      x.lineWidth = Math.min(4, .7 * sc); x.strokeStyle = rgba('#ffffff', LIGHT ? .9 : .7); x.stroke();
      x.restore();
    }
    // содержимое
    const ca = A * (p.ca ?? 1) * sm(.18, .45, facing) * (1 - sm(p.hollow ? 1.55 : 1.7, p.hollow ? 2.3 : 3.2, sc));
    if (p.draw && ca > .01 && sc > .12) {
      x.save(); x.globalAlpha = ca; path(); x.clip();
      p.draw(p, t, sc); x.restore();
    }
  }

  // предмет сайта, висящий в пространстве (повёрнут к камере, слегка по рыску)
  function drawObj(o, t) {
    if (o.a <= .01) return;
    const cq = cam3(o.c); if (cq[2] < NEAR * 4) return;
    const fa = o.a * sm(300, 720, cq[2]); if (fa <= .01) return;   // камера пролетает рядом — фото тает, а не лезет в кадр огромным
    const c0 = scr(cq), sc = c0[2];
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    const g = o.s * 5.2 * sc;
    x.globalAlpha = fa * (LIGHT ? .45 : .55); if (!LIGHT) x.globalCompositeOperation = 'lighter';
    x.drawImage(SP.glow, c0[0] - g / 2, c0[1] - g / 2, g, g);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = fa;
    if (at(o, 0, 0)) OBJ(o.pal, t, o.s);
    x.restore();
  }

  // ——— сцена: строим панели ———
  const items = [];
  const panel = (o) => { const p = Object.assign({ a: 1, r: 34, ca: 1 }, o); items.push(p); return p; };
  const lerp3 = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
  const pose = (p, c, ry = 0, rx = 0, rz = 0) => { p.c = c; Object.assign(p, basis(ry, rx, rz)); };

  // общие мелочи рисования в координатах панели
  const dotRow = (X, Y) => { [0, 1, 2].forEach(i => { x.beginPath(); x.arc(X + i * 30, Y, 8, 0, 7); x.fillStyle = i === 0 ? rgba(ACC, .9) : rgba(TX, .22); x.fill(); }); };
  function logo(X, Y, size, align = 'center', alpha = 1) {
    const w1 = textW(BRAND, size, 900), w2 = TAIL ? textW(TAIL, size, 900) : 0, tot = w1 + w2;
    const sx = align === 'center' ? X - tot / 2 : align === 'right' ? X - tot : X;
    T(BRAND, sx, Y, { size, weight: 900, color: TX, align: 'left', alpha });
    if (TAIL) T(TAIL, sx + w1, Y, { size, weight: 900, color: ACT, align: 'left', alpha });
  }
  function arrow(X, Y, s, col) { x.save(); x.strokeStyle = col; x.lineWidth = s * .14; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(X - s * .4, Y); x.lineTo(X + s * .4, Y); x.moveTo(X + s * .05, Y - s * .36); x.lineTo(X + s * .42, Y); x.lineTo(X + s * .05, Y + s * .36); x.stroke(); x.restore(); }
  function pill(X, Y, label, size, opt = {}) {
    const tw = textW(label, size, 800), aw = opt.arrow ? size * 1.3 : 0, w = tw + aw + size * 1.6, h = size * 2.1;
    const L = opt.align === 'left' ? X : X - w / 2;
    x.save(); if (!LIGHT) shadow(30, rgba(ACC, .45), 6); else shadow(24, 'rgba(0,0,0,.15)', 8);
    rr(L, Y - h / 2, w, h, h / 2); x.fillStyle = ACC; x.fill(); x.restore();
    const g = x.createLinearGradient(0, Y - h / 2, 0, Y + h / 2); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(.5, 'rgba(255,255,255,0)');
    rr(L, Y - h / 2, w, h, h / 2); x.fillStyle = g; x.fill();
    T(label, L + size * .8, Y + size * .03, { size, weight: 800, color: ON_ACC, align: 'left' });
    if (opt.arrow) arrow(L + size * .8 + tw + size * .75, Y, size * .8, ON_ACC);
    return w;
  }

  // 1) ХУК: стеклянная плита
  const hookW = 820;
  const HK = rows(HOOK, 700, 124, 900, 84, HOOK.length - 1, -1), hookSize = HK.size;
  const hookLH = hookSize * 1.08, hookH = Math.max(640, HK.rows.length * hookLH + 330);
  const hook = panel({ w: hookW, h: hookH, r: 48, glowK: 1.1,
    draw(p, t, sc) {
      if (at(p, -hookW / 2 + 56, -hookH / 2 + 62)) dotRow(0, 0);
      if (BRAND && at(p, hookW / 2 - 56, -hookH / 2 + 62)) logo(0, 2, 30, 'right');
      if (at(p, 0, 0)) { x.fillStyle = rgba(TX, .1); x.fillRect(-hookW / 2 + 56, -hookH / 2 + 110, hookW - 112, 1.5); }
      const top = -HK.rows.length * hookLH / 2 + hookLH / 2 + 10;
      HK.rows.forEach(({ s: l, acc }, i) => {
        const k = E.out5(prog(t, -.35 + i * .06, 1.2 + i * .12));
        const lift = (1 - k) * (80 + i * 30);
        if (!at(p, 0, top + i * hookLH, lift)) return;
        const last = acc, under = i === HK.rows.length - 1;
        T(l, 0, 0, { size: hookSize, weight: 900, color: last ? ACT : TX, track: -1 });
        if (under) { const lw = textW(l, hookSize, 900, -1), u = E.expo(prog(t, .35, 1.2)); x.fillStyle = ACC; rr(-lw / 2, hookSize * .58, lw * u, 9, 4.5); x.fill(); }
      });
      if (at(p, 0, hookH / 2 - 70)) {
        if (DOMAIN) T(DOMAIN, -hookW / 2 + 56, 0, { size: 30, weight: 600, color: GR, align: 'left' });
        x.beginPath(); x.arc(hookW / 2 - 90, 0, 32, 0, 7); x.fillStyle = ACC; x.fill(); arrow(hookW / 2 - 90, 0, 26, ON_ACC);
      }
    } });

  // 2) ГЕРОЙ: предмет в пространстве + стеклянная hero-панель
  const heroW = 860, TT = rows(TITLE, heroW - 120, 92, 900, 74, ACC_LINE, -1), tSize = TT.size;
  const subW = SUB ? wrap(SUB, heroW - 140, 34, 500, 3) : { lines: [], size: 34 };
  const heroH = 64 + TT.rows.length * tSize * 1.06 + (SUB ? 26 + subW.lines.length * subW.size * 1.3 : 0) + (BTN ? 40 + 92 : 0) + 64;
  const HERO_C = [0, 0, 1300];
  HERO_C[1] = 1460 - heroH / 2 - CY - 20;                      // нижний край панели ≈ 1440 px на экране
  const watch = { s: 228, pal: GOODS[0] && GOODS[0].палитра, a: 1, c: [0, 0, 0] };
  const hero = panel({ w: heroW, h: heroH, r: 44, fadeNear: [330, 760],
    draw(p, t, sc) {
      let y = -heroH / 2 + 64;
      TT.rows.forEach(({ s: l, acc }, i) => {
        const k = E.out5(prog(t, 2.55 + i * .1, 3.4 + i * .1));
        if (at(p, -heroW / 2 + 60, y + tSize * .53 + (1 - k) * 40, (1 - k) * 60)) T(l, 0, 0, { size: tSize, weight: 900, color: acc ? ACT : TX, align: 'left', track: -1, alpha: k });
        y += tSize * 1.06;
      });
      if (SUB) { y += 26; const k = E.out5(prog(t, 2.9, 3.6)); subW.lines.forEach(l => { if (at(p, -heroW / 2 + 62, y + subW.size * .6)) T(l, 0, 0, { size: subW.size, weight: 500, color: GR, align: 'left', alpha: k }); y += subW.size * 1.3; }); }
      if (BTN) { y += 40; const k = E.out5(prog(t, 3.0, 3.8)); if (at(p, -heroW / 2 + 60, y + 46, (1 - k) * 80)) { x.globalAlpha *= k; pill(0, 0, BTN, 38, { align: 'left', arrow: true }); } }
    } });

  // 3) ТОВАРЫ: карточки на разной глубине
  const cardW = 380, cardH = 520;
  const NAMES = GOODS.map(g => { const n = up(g.имя || ''); return fit(n, 320, 40, 800) >= 33 ? { lines: [n], size: fit(n, 320, 40, 800) } : smart(n, 320, 34, 800, 2, 99, 26); });
  const cards = GOODS.map((g, i) => panel({ w: cardW, h: cardH, r: 36, glow: .8, hollow: true,
    draw(p, t, sc) {
      if (at(p, 0, -80)) {
        x.save(); rr(-160, -150, 320, 300, 26); x.clip();
        const bg = x.createRadialGradient(0, -10, 10, 0, 0, 230); bg.addColorStop(0, rgba(ACC, LIGHT ? .3 : .26)); bg.addColorStop(1, rgba(LIGHT ? '#ffffff' : BG, LIGHT ? .3 : .55));
        x.fillStyle = bg; x.fillRect(-160, -150, 320, 300);
        x.translate(0, 6 + Math.sin(t * 1.3 + i) * 4); x.rotate(Math.sin(t * .8 + i * 1.7) * .06);
        OBJ(g.палитра, t + i * 3, 90);
        x.restore();
        rr(-160, -150, 320, 300, 26); x.lineWidth = 1.2; x.strokeStyle = rgba(TX, .1); x.stroke();
      }
      const nm = NAMES[i], two = nm.lines.length > 1, ny = two ? 104 : 132;
      nm.lines.forEach((l, j) => { if (at(p, -160, ny + j * nm.size * 1.08)) T(l, 0, 0, { size: nm.size, weight: 800, color: TX, align: 'left' }); });
      if (g.цена && at(p, -160, two ? ny + nm.size * 1.08 + 50 : 190)) T(String(g.цена), 0, 0, { size: fit(String(g.цена), 230, 36, 700), weight: 700, color: ACT, align: 'left' });
      if (at(p, 132, 190)) { x.beginPath(); x.arc(0, 0, 28, 0, 7); x.strokeStyle = rgba(ACC, .9); x.lineWidth = 3; x.stroke(); x.beginPath(); x.moveTo(-11, 0); x.lineTo(11, 0); x.moveTo(0, -11); x.lineTo(0, 11); x.strokeStyle = ACT; x.lineCap = 'round'; x.stroke(); }
    } }));

  // 4) ЦИФРЫ: виджет со счётчиком и графиком + фишки
  const N0 = NUMS[0], statW = 860, statH = 560;
  const chartPts = Array.from({ length: 13 }, (_, i) => { const k = i / 12; return 1 - (.12 + .7 * Math.pow(k, 1.35) + (hash(i * 3.1 + 7) - .5) * .14 * (1 - k * .6)); });
  const fmt = (n, k) => num((n.число || 0) * k) + (n.плюс || '');
  const stat = N0 ? panel({ w: statW, h: statH, r: 44,
    draw(p, t, sc) {
      const k = E.out5(prog(t, 7.85, 9.4));
      if (at(p, -statW / 2 + 60, -statH / 2 + 66)) {
        const pulse = .5 + .5 * Math.sin(t * 6);
        x.beginPath(); x.arc(10, 0, 9, 0, 7); x.fillStyle = ACC; x.fill();
        x.beginPath(); x.arc(10, 0, 9 + pulse * 10, 0, 7); x.strokeStyle = rgba(ACC, .5 * (1 - pulse)); x.lineWidth = 3; x.stroke();
        const lab = up(N0.подпись || ''); T(lab, 36, 1, { size: fit(lab, statW - 180, 32, 600), weight: 600, color: GR, align: 'left' });
      }
      if (at(p, -statW / 2 + 56, -statH / 2 + 180)) {
        const full = fmt(N0, 1), sz = fit(full, statW - 120, 150, 900, -3);
        const main = num((N0.число || 0) * k);
        const mw = T(main, 0, 0, { size: sz, weight: 900, color: TX, align: 'left', track: -3 });
        if (N0.плюс) T(N0.плюс, mw + 4, 0, { size: sz, weight: 900, color: ACT, align: 'left' });
      }
      if (at(p, 0, 120)) {
        const L = -statW / 2 + 60, R = statW / 2 - 60, T0 = -60, B0 = 140;
        x.strokeStyle = rgba(TX, .07); x.lineWidth = 1.5;
        for (let i = 0; i <= 3; i++) { const yy = mix(T0, B0, i / 3); x.beginPath(); x.moveTo(L, yy); x.lineTo(R, yy); x.stroke(); }
        const dk = E.inOut(prog(t, 8.0, 9.5)), n = chartPts.length - 1, upto = dk * n;
        const P = i => [mix(L, R, i / n), mix(T0, B0, chartPts[i])];
        const pts = []; for (let i = 0; i <= Math.floor(upto); i++) pts.push(P(i));
        if (upto < n) { const i = Math.floor(upto), f = upto - i, a = P(i), b = P(i + 1); pts.push([mix(a[0], b[0], f), mix(a[1], b[1], f)]); }
        if (pts.length > 1) {
          const ar = x.createLinearGradient(0, T0, 0, B0); ar.addColorStop(0, rgba(ACC, LIGHT ? .3 : .32)); ar.addColorStop(1, rgba(ACC, 0));
          x.beginPath(); x.moveTo(pts[0][0], B0); pts.forEach(q => x.lineTo(q[0], q[1])); x.lineTo(pts[pts.length - 1][0], B0); x.closePath(); x.fillStyle = ar; x.fill();
          x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]));
          x.strokeStyle = ACC; x.lineWidth = 6; x.lineJoin = 'round'; x.lineCap = 'round'; x.save(); shadow(18, rgba(ACC, .6), 0); x.stroke(); x.restore();
          const e = pts[pts.length - 1]; x.beginPath(); x.arc(e[0], e[1], 11, 0, 7); x.fillStyle = TX; x.fill(); x.beginPath(); x.arc(e[0], e[1], 11, 0, 7); x.lineWidth = 5; x.strokeStyle = ACC; x.stroke();
        }
      }
    } }) : null;
  const chips = NUMS.slice(1).map((n, j) => panel({ w: NUMS.length === 2 ? 600 : 410, h: 240, r: 36, glow: .7,
    draw(p, t, sc) {
      const k = E.out5(prog(t, 8.0 + j * .15, 9.5 + j * .15));
      const full = fmt(n, 1), sz = fit(full, p.w - 80, 86, 900, -2);
      if (at(p, -p.w / 2 + 40, -40)) { const mw = T(num((n.число || 0) * k), 0, 0, { size: sz, weight: 900, color: TX, align: 'left', track: -2 }); if (n.плюс) T(n.плюс, mw + 3, 0, { size: sz, weight: 900, color: ACT, align: 'left' }); }
      const lab = wrap(n.подпись || '', p.w - 80, 30, 600, 2);
      lab.lines.forEach((l, i) => { if (at(p, -p.w / 2 + 40, 40 + i * lab.size * 1.25 - (lab.lines.length - 1) * lab.size * .2)) T(l, 0, 0, { size: lab.size, weight: 600, color: GR, align: 'left' }); });
    } }));

  // 5) ШАГИ
  const stepW = 860, rowH = STEPS.length > 4 ? 100 : 112;
  const STW0 = STEPS.map(s => smart(up(s), stepW - 230, 40, 700, 2, 32, 28)), stSz = Math.min(...STW0.map(w => w.size), 40);
  const STW = STEPS.map(s => smart(up(s), stepW - 230, stSz, 700, 2, stSz, stSz));
  // преимущества: пилюли, переносим по строкам
  const PSZ = 30, PROW = [];
  PROS.forEach((s, i) => { const w = Math.min(textW(s, PSZ, 600) + 52, 760); const row = PROW[PROW.length - 1];
    if (row && row.w + 14 + w <= 760) { row.items.push({ s, w, i }); row.w += 14 + w; } else PROW.push({ items: [{ s, w, i }], w }); });
  const prosH = PROW.length ? 40 + PROW.length * 76 : 0;
  const stepH = 70 + STEPS.length * rowH + prosH + 50;
  const steps = STEPS.length ? panel({ w: stepW, h: stepH, r: 44,
    draw(p, t, sc) {
      let y = -stepH / 2 + 70 + rowH / 2;
      STEPS.forEach((s, i) => {
        const k = E.out5(prog(t, 9.75 + i * .16, 10.6 + i * .16)), on = prog(t, 10.2 + i * .22, 10.45 + i * .22);
        if (at(p, -stepW / 2 + 92, y, (1 - k) * 60)) {
          x.globalAlpha *= .3 + .7 * k;
          x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fillStyle = rgba(ACC, on * (LIGHT ? .9 : 1)); x.fill();
          x.lineWidth = 3; x.strokeStyle = rgba(ACC, .9); x.stroke();
          T(String(i + 1), 0, 2, { size: 34, weight: 800, color: on > .5 ? ON_ACC : ACT });
          const st = STW[i]; st.lines.forEach((l, j) => T(l, 64, 2 + (j - (st.lines.length - 1) / 2) * st.size * 1.15, { size: st.size, weight: 700, color: TX, align: 'left' }));
        }
        if (i < STEPS.length - 1 && at(p, 0, y + rowH / 2)) { x.fillStyle = rgba(TX, .08); x.fillRect(-stepW / 2 + 156, 0, stepW - 216, 1.5); }
        y += rowH;
      });
      if (PROS.length) PROW.forEach((row, r) => {
        if (!at(p, 0, stepH / 2 - 50 - prosH + 40 + r * 76)) return;
        let X = -row.w / 2;
        row.items.forEach(({ s, w, i }) => { const kk = E.out5(prog(t, 10.5 + i * .12, 11.2 + i * .12)); x.save(); x.globalAlpha *= kk; rr(X, -30, w, 60, 30); x.fillStyle = rgba(ACC, LIGHT ? .14 : .12); x.fill(); x.strokeStyle = rgba(ACC, .5); x.lineWidth = 1.5; x.stroke(); T(s, X + w / 2, 1, { size: PSZ, weight: 600, color: TX }); x.restore(); X += w + 14; });
      });
    } }) : null;

  // 6) ПРИЗЫВ
  const ctaW = 860, CT = rows(CTA, ctaW - 120, 150, 900, 110, CTA.length > 1 ? CTA.length - 1 : -1, -2), ctaSize = CT.size;
  const ctaH = 90 + (BRAND ? 70 : 0) + CT.rows.length * ctaSize * 1.02 + (DOMAIN ? 70 + 100 : 0) + 70;
  const cta = panel({ w: ctaW, h: ctaH, r: 52, glowK: 1.15,
    draw(p, t, sc) {
      let y = -ctaH / 2 + 90;
      if (BRAND) { if (at(p, 0, y)) logo(0, 0, 40, 'center'); y += 70; }
      CT.rows.forEach(({ s: l, acc }, i) => {
        const k = E.out5(prog(t, 11.75 + i * .1, 12.55 + i * .1));
        if (at(p, 0, y + ctaSize * .5 + (1 - k) * 30, (1 - k) * 90)) T(l, 0, 0, { size: ctaSize, weight: 900, color: acc ? ACT : TX, track: -2 });
        y += ctaSize * 1.02;
      });
      if (DOMAIN) {
        y += 70;
        const k = E.out5(prog(t, 12.1, 12.85)), pulse = Math.max(0, Math.sin((t - 13.2) * 2.6)) * prog(t, 13.2, 13.5);
        if (at(p, 0, y + 40, (1 - k) * 70)) { x.globalAlpha *= k; const s = 1 + pulse * .03; x.scale(s, s); pill(0, 0, DOMAIN, fit(DOMAIN, ctaW - 300, 46, 800), { arrow: true }); }
      }
    } });

  // 7) рой: мелкие стеклянные осколки интерфейса (без текста, годятся под любой сайт)
  const SH = [
    [-560, -620, 700, 230, 120, .3, 0], [560, 640, 650, 260, 110, -.25, 1], [-640, 520, 1150, 220, 220, .2, 2], [600, -700, 1500, 300, 120, -.3, 3],
    [-520, -760, 2300, 240, 150, .35, 1], [2150, -520, 2300, 260, 260, -.4, 2], [2200, 640, 3000, 300, 120, -.2, 0], [380, 760, 2900, 240, 130, .3, 3],
    [2250, -900, 4100, 280, 120, -.3, 1], [700, 300, 4300, 240, 240, .4, 2], [2350, 1300, 4800, 300, 130, -.35, 0], [650, 1500, 5000, 260, 120, .3, 3],
  ];
  const shards = SH.map(([sx, sy, sz, w, h, ry, kind], i) => panel({ w, h, r: 26, glow: .45, base: [sx, sy, sz], ry0: ry, fadeNear: [160, 520],
    draw(p, t) { SHDRAW(p, kind, w, h, i, t); } }));
  function SHDRAW(p, kind, w, h, i, t) {
      if (!at(p, 0, 0)) return;
      const ph = t * .6 + i;
      if (kind === 0) { rr(-w / 2 + 30, -22, 92, 44, 22); x.fillStyle = rgba(ACC, .85); x.fill(); x.beginPath(); x.arc(-w / 2 + 30 + 70 - 48 * (.5 + .5 * Math.sin(ph)) * 0, 0, 17, 0, 7); x.fillStyle = '#fff'; x.fill(); x.fillStyle = rgba(TX, .18); rr(-w / 2 + 140, -9, w - 180, 18, 9); x.fill(); }
      if (kind === 1) { x.beginPath(); x.arc(-w / 2 + 52, 0, 26, 0, 7); x.fillStyle = rgba(ACC, .7); x.fill(); x.fillStyle = rgba(TX, .22); rr(-w / 2 + 96, -20, w - 140, 14, 7); x.fill(); x.fillStyle = rgba(TX, .12); rr(-w / 2 + 96, 6, (w - 140) * .6, 14, 7); x.fill(); }
      if (kind === 2) { for (let j = 0; j < 5; j++) { const hh = (h - 70) * (.3 + .7 * (.5 + .5 * Math.sin(ph * 1.3 + j * 1.1))); rr(-w / 2 + 34 + j * (w - 68) / 5, h / 2 - 34 - hh, (w - 68) / 5 - 14, hh, 8); x.fillStyle = j === 3 ? ACC : rgba(TX, .2); x.fill(); } }
      if (kind === 3) { x.strokeStyle = ACC; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); for (let j = 0; j <= 20; j++) { const X = -w / 2 + 30 + j * (w - 60) / 20, Y = Math.sin(j * .55 + ph) * (h * .22) - j * 1.2; j ? x.lineTo(X, Y) : x.moveTo(X, Y); } x.stroke(); }
  }

  // 7б) рой у хука: плотная туча осколков слетается к 1–2 с, камера пролетает сквозь неё к герою
  const SW = Array.from({ length: 30 }, (_, i) => {
    const h1 = hash(i * 1.73 + .31), h2 = hash(i * 3.11 + .77), h3 = hash(i * 5.37 + .13), h4 = hash(i * 7.9 + .55);
    const th = i * 2.39996 + h1 * .6, r = mix(430, 1050, h2);
    const w = Math.round(mix(150, 310, h3)), hh = Math.round(mix(80, 190, h4));
    const kind = w / hh < 1.45 ? 2 : w > 230 ? (i % 2 ? 0 : 3) : (i % 3 ? 1 : 3);
    return { base: [70 + Math.cos(th) * r, -40 + Math.sin(th) * r * 1.3, mix(-700, 380, hash(i * 2.17 + .9))], dir: [Math.cos(th), Math.sin(th)], w, h: hh, kind, ry: (h1 - .5) * .9, rx: (h2 - .5) * .5, d: h3 };
  });
  const swarm = SW.map((q, i) => panel({ w: q.w, h: q.h, r: Math.min(26, q.h * .22), glow: .5, fadeNear: [150, 480], q, frost: q.w * q.h > 40000 ? undefined : false,
    draw: (p, t) => SHDRAW(p, q.kind, q.w, q.h, i + 20, t) }));
  // ——— огни боке в пространстве ———
  const BOKEH = Array.from({ length: 46 }, (_, i) => ({ p: [mix(-1700, 3300, hash(i + .1)), mix(-1500, 2700, hash(i + .37)), mix(-700, 7200, hash(i + .71))], r: mix(26, 90, hash(i + .9)), k: hash(i + .5) < .62 ? 'disc' : 'disc2', tw: i }));
  const BGC = mk(136, 240), bgx = BGC.getContext('2d');
  function drawBG(t) {
    // мягкий фон рисуется в маленький холст и растягивается: дёшево и само размыто
    const k = 136 / W, g = bgx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    g.fillStyle = BG; g.fillRect(0, 0, 136, 240);
    const lg = g.createLinearGradient(0, 0, 0, 240);
    lg.addColorStop(0, rgba(mixH(BG, LIGHT ? '#ffffff' : TX, LIGHT ? .5 : .035), 1)); lg.addColorStop(.55, rgba(BG, 0)); lg.addColorStop(1, rgba(mixH(BG, ACC, LIGHT ? .1 : .05), 1));
    g.fillStyle = lg; g.fillRect(0, 0, 136, 240);
    // далёкие пятна: медленный параллакс от рыска и смещения камеры
    const px = -K.yaw * 900 - K.x * .05, py = -K.y * .05 - K.pitch * 600;
    const blobs = [[820, 380, 1000, ACC, LIGHT ? .2 : .11], [180, 1500, 1100, ACC2, LIGHT ? .14 : .07], [560, 900, 1400, ACC, LIGHT ? .05 : .025]];
    for (const [bx, by, r, col, a] of blobs) {
      const X = (((bx + px) % 1600 + 1600) % 1600 - 260) * k, Y = (by + py + Math.sin(t * .3 + bx) * 30) * k, R = r * k;
      const gg = g.createRadialGradient(X, Y, 0, X, Y, R); gg.addColorStop(0, rgba(col, a)); gg.addColorStop(1, rgba(col, 0));
      g.fillStyle = gg; g.fillRect(0, 0, 136, 240);
    }
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low';
    x.drawImage(BGC, 0, 0, W, H);
    if (!LIGHT) x.globalCompositeOperation = 'lighter';
    for (const b of BOKEH) {
      const q = cam3(b.p); if (q[2] < 120) continue;
      const s = scr(q), R = b.r * s[2] * 2.4; if (R < 3) continue;
      if (s[0] < -R || s[0] > W + R || s[1] < -R || s[1] > H + R) continue;
      const near = sm(120, 700, q[2]), far = 1 - sm(3500, 7500, q[2]) * .6;
      x.globalAlpha = (LIGHT ? .55 : .5) * near * far * (.7 + .3 * noise(b.tw, t * .7));
      x.drawImage(SP[b.k], s[0] - R / 2, s[1] - R / 2, R, R);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  // ——— позы во времени ———
  const STACK = [DIVE[0], SY - 10, SZ + 60];
  const slot = k => [STACK[0], STACK[1] - k * 44, STACK[2] + k * 95];
  const gatherList = [steps, stat, ...chips].filter(Boolean);
  items.forEach(p => p.gk = gatherList.indexOf(p));
  function layout(t) {
    // хук: плита, потом наклон в перспективу и уход в сторону
    const tilt = E.inOut(prog(t, 1.1, 2.3)), away = E.inOut(prog(t, 1.9, 3.0));
    pose(hook, [mix(0, -110, tilt) - away * 620, mix(0, 40, tilt), mix(0, 120, tilt)], mix(0, -.62, tilt) - away * .5, mix(0, .14, tilt), mix(0, -.03, tilt));
    hook.a = 1 - prog(t, 3.0, 3.4);
    // герой
    const hk = E.out5(prog(t, 1.8, 3.2));
    pose(hero, [HERO_C[0], HERO_C[1] + (1 - hk) * 120, HERO_C[2] + (1 - hk) * 260], (1 - hk) * .35, (1 - hk) * -.12);
    hero.a = prog(t, 1.2, 1.7) * (1 - prog(t, 5.4, 5.9));
    const wy = HERO_C[1] - heroH / 2 - 250;
    watch.c = [mix(-40, 0, hk) + Math.sin(t * .9) * 10, wy + (1 - hk) * 80 + Math.sin(t * 1.4) * 9, HERO_C[2] + 260];
    Object.assign(watch, basis(Math.sin(t * .8) * .16 + (1 - hk) * .6, Math.sin(t * .6) * .05, Math.sin(t * .7) * .04));
    watch.a = prog(t, 1.3, 2.0) * (1 - prog(t, 5.3, 5.8));
    // карточки (слегка повёрнуты к камере дуги, к стоп-кадру выравниваются)
    const fr = E.inOut(prog(t, 5.2, 6.5));
    cards.forEach((p, i) => {
      const o = cardPos[i], ap = E.out5(prog(t, 4.6 + i * .12, 6.0 + i * .12));
      const g = p.gk >= 0 ? E.inOut(prog(t, 11.3 + p.gk * .06, 12.45 + p.gk * .06)) : 0;
      const base = [P0[0] + o[0], P0[1] + o[1] + (1 - ap) * 160, P0[2] + o[2] + (1 - ap) * 300];
      const ry0 = mix(.38, 0, fr) + Math.sin(t * .7 + i) * .025, rx0 = Math.sin(t * .6 + i * 2) * .02;
      if (g > 0) { pose(p, lerp3(base, slot(p.gk + 1), g), ry0 + Math.sin(g * Math.PI) * .5, rx0); p.w = mix(cardW, ctaW, g); p.h = mix(cardH, ctaH, g); }
      else { pose(p, base, ry0, rx0); p.w = cardW; p.h = cardH; }
      p.ca = 1 - prog(t, 11.1, 11.4);
      p.a = ap * (g > 0 ? 1 : 1);
      p.glint = t * .05;
    });
    // цифры
    const sk = E.out5(prog(t, 7.6, 8.9));
    if (stat) {
      const base = [DIVE[0], QY - 180 - heroH * 0, QZ + (1 - sk) * 200];
      const g = E.inOut(prog(t, 11.3 + stat.gk * .06, 12.45 + stat.gk * .06));
      pose(stat, lerp3(base, slot(stat.gk + 1), g), Math.sin(t * .6) * .03 + Math.sin(g * Math.PI) * -.4, Math.sin(t * .5) * .02 + (1 - sk) * .2);
      stat.w = mix(statW, ctaW, g); stat.h = mix(statH, ctaH, g); stat.ca = prog(t, 7.2, 7.9) * (1 - prog(t, 11.8, 12.1)); stat.a = prog(t, 2, 2.6);
    }
    chips.forEach((p, j) => {
      const g = E.inOut(prog(t, 11.3 + p.gk * .06, 12.45 + p.gk * .06));
      const n = chips.length, base = [DIVE[0] + (n === 1 ? 0 : (j ? 215 : -215)), QY + 262 + (1 - sk) * 80, QZ - 60 + j * 70 + (1 - sk) * 260];
      pose(p, lerp3(base, slot(p.gk + 1), g), (j ? -.06 : .06) + Math.sin(t * .7 + j) * .03 + Math.sin(g * Math.PI) * (j ? .6 : -.6), Math.sin(t * .5 + j) * .02);
      p.w = mix(n === 1 ? 600 : 410, ctaW, g); p.h = mix(240, ctaH, g); p.ca = prog(t, 7.2, 7.9) * (1 - prog(t, 11.8, 12.1)); p.a = prog(t, 2, 2.6);
    });
    if (steps) {
      const k = E.out5(prog(t, 9.4, 10.5)), g = E.inOut(prog(t, 11.35, 12.4));
      pose(steps, lerp3([DIVE[0], SY + (1 - k) * 60, SZ + (1 - k) * 220], slot(1), g), Math.sin(t * .5) * .025 + (1 - k) * -.25, (1 - k) * -.12);
      steps.w = mix(stepW, ctaW, g); steps.h = mix(stepH, ctaH, g); steps.ca = prog(t, 7.9, 8.5) * (1 - prog(t, 11.75, 12.05)); steps.a = prog(t, 3, 3.6);
    }
    // призыв: поднимается снизу ребром и разворачивается лицом
    const ck = E.out5(prog(t, 11.45, 12.45));
    pose(cta, lerp3([STACK[0], STACK[1] + 700, STACK[2] - 300], slot(0), ck), Math.sin(t * .45) * .02 * ck, mix(-1.25, 0, ck) + Math.sin(t * .5) * .015 * ck);
    cta.a = prog(t, 11.4, 11.65); cta.glint = mix(-.6, .6, E.inOut(prog(t, 12.6, 14.2)));
    // осколки
    swarm.forEach((p, i) => {
      const q = p.q, k = E.out5(prog(t, .75 + q.d * .55, 1.95 + q.d * .55)), fly = (1 - k) * 1100;
      pose(p, [q.base[0] + q.dir[0] * fly + Math.sin(t * .6 + i) * 22, q.base[1] + q.dir[1] * fly * 1.2 + Math.cos(t * .5 + i * 2) * 20, q.base[2] - (1 - k) * 500],
        q.ry + (1 - k) * 1.4 * (i % 2 ? 1 : -1) + Math.sin(t * .4 + i) * .1, q.rx + Math.sin(t * .33 + i) * .08, (1 - k) * .5 * (i % 3 - 1));
      p.a = .9 * k * (1 - prog(t, 2.95, 3.45));
    });
    shards.forEach((p, i) => { pose(p, [p.base[0] + Math.sin(t * .5 + i) * 30, p.base[1] + Math.cos(t * .4 + i * 2) * 26, p.base[2]], p.ry0 + Math.sin(t * .35 + i) * .12, Math.sin(t * .3 + i) * .1); p.a = .85 * (1 - prog(t, 11.2, 11.8) * (i > 7 ? 1 : 0)); });
  }

  window.КАДР = t => {
    setCam(camAt(t));
    layout(t);
    drawBG(t);
    const list = [...items.filter(p => p.a > .003 && p.c), ...(watch.a > .01 ? [watch] : [])].map(p => ({ p, z: cam3(p.c)[2] }));
    list.sort((a, b) => b.z - a.z);
    for (const { p } of list) { if (p === watch) drawObj(p, t); else drawPanel(p, t); }
  };
})();

  },
  kinetika() {
// КИНЕТИКА: жирная кинетическая типографика под бит 120 BPM (доля = 0,5 с).
// Полноэкранные плашки бренда меняются шторками, слова на всю ширину (840 px), удары масштабом
// без пружины (expo/out5, перелёт ≤ 3 %), бегущие строки-маркизы. Все тексты и цвета из САЙТ.
window.ИМЯ = 'kinetika';
FONT = САЙТ.шрифт || FONT;
(() => {
  const C = САЙТ.цвета, B = .5, CX = 540, CY = 880, MW = 840, TOP = 300;
  const U = s => САЙТ.капс === false ? String(s) : String(s).toUpperCase();

  // — контраст: какой цвет бренда читается на фоне —
  const lin = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const lum = h => { const [r, g, b] = hex2rgb(h).map(lin); return .2126 * r + .7152 * g + .0722 * b; };
  const con = (a, b) => { const A = lum(a), Q = lum(b); return (Math.max(A, Q) + .05) / (Math.min(A, Q) + .05); };
  const ink = bg => { let best = C.текст, k = 0; for (const c of [C.текст, C.фон]) { const q = con(bg, c); if (q > k) { k = q; best = c; } } return k < 3 ? (lum(bg) > .3 ? '#000000' : '#ffffff') : best; };
  const hi = bg => con(bg, C.акцент) >= 2.8 ? C.акцент : ink(bg);
  const third = (a, b) => [C.акцент, C.текст, C.фон, C.карта].find(c => c !== a && c !== b && con(c, a) > 1.25 && con(c, b) > 1.25) || C.акцент;

  // — текст: замеры с кэшем, центр по высоте заглавной —
  const MC = new Map(), TR = -.03;
  function met(s, z, wt = 900, tr = 0) {
    const k = s + '|' + z.toFixed(2) + '|' + wt + '|' + tr.toFixed(2); let m = MC.get(k);
    if (!m) { x.save(); x.font = `${wt} ${z}px ${FONT}`; x.letterSpacing = tr + 'px'; const q = x.measureText(s); m = { w: q.width, a: q.actualBoundingBoxAscent, d: q.actualBoundingBoxDescent }; x.restore(); MC.set(k, m); }
    return m;
  }
  const capH = (z, wt = 900) => met('H', z, wt).a;
  const tw = (s, z, wt = 900, trk = TR) => met(s, z, wt, trk * z).w;
  function fitS(s, maxW, cap, wt = 900, trk = TR) { let z = cap; for (let i = 0; i < 3; i++) { const w = tw(s, z, wt, trk); if (w <= maxW) break; z *= maxW / w * .996; } return z; }
  function TX(s, X, Y, z, o = {}) {
    const wt = o.wt || 900, tr = (o.tr ?? TR) * z, al = o.align || 'center', a = o.alpha ?? 1;
    if (a <= 0 || !s) return;
    x.save(); x.globalAlpha *= a;
    x.font = `${wt} ${z}px ${FONT}`; x.letterSpacing = tr + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = al;
    const by = Y + capH(z, wt) / 2, X2 = al === 'center' ? X - tr / 2 : al === 'right' ? X - tr : X;
    if (o.stroke) { x.lineWidth = o.stroke; x.lineJoin = 'round'; x.strokeStyle = o.color; x.strokeText(s, X2, by); }
    else { x.fillStyle = o.color || C.текст; x.fillText(s, X2, by); }
    x.restore();
  }
  // строка на всю ширину; длинную бьём на две, если так кегль заметно крупнее
  const LC = new Map();
  function lay(str, maxW, cap, minOne, wt = 900, trk = TR) {
    const k = str + '|' + maxW + '|' + cap + '|' + wt; if (LC.has(k)) return LC.get(k);
    const one = fitS(str, maxW, cap, wt, trk); let res = [{ s: str, z: one }];
    const ws = str.split(' ');
    if (ws.length > 1 && one < minOne) {
      let best = 0, cand;
      for (let i = 1; i < ws.length; i++) { const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' '), za = fitS(a, maxW, cap, wt, trk), zb = fitS(b, maxW, cap, wt, trk), m = Math.min(za, zb); if (m > best) { best = m; cand = [{ s: a, z: za }, { s: b, z: zb }]; } }
      if (best > one * 1.15) res = cand;
    }
    LC.set(k, res); return res;
  }
  const gapOf = (a, b) => .2 * Math.min(a.z, b.z);
  const stackH = ls => ls.reduce((h, l, i) => h + capH(l.z) + (i ? gapOf(l, ls[i - 1]) : 0), 0);
  function stackYs(ls, cy) { let y = cy - stackH(ls) / 2; return ls.map((l, i) => { if (i) y += gapOf(l, ls[i - 1]); const h = capH(l.z), c = y + h / 2; y += h; return c; }); }

  // — движение —
  function punch(lt, from = 1.22, d = .32) { // удар: резко садится, недолёт 2 % и мягко к 1, без колебаний
    if (lt <= 0) return from;
    if (lt < d) return mix(from, .98, E.out5(lt / d));
    return mix(.98, 1, E.inOut(clamp((lt - d) / .24)));
  }
  const sc = (s, px = CX, py = CY) => { x.translate(px, py); x.scale(s, s); x.translate(-px, -py); };
  function cam(t, seed, amp = 1) { const dx = noise(seed, t * .5) * 8 * amp, dy = noise(seed + 3, t * .45) * 8 * amp, r = noise(seed + 7, t * .35) * .004 * amp; x.translate(CX + dx, CY + dy); x.rotate(r); x.translate(-CX, -CY); }
  const bstep = t => { const q = t / B, i = Math.floor(q); return i + E.out5(clamp((q - i) / .55)); }; // шаг на каждую долю
  const bg = c => { x.fillStyle = c; x.fillRect(-500, -500, W + 1000, H + 1000); };
  const sideX = d => d === 'L' ? -1 : d === 'R' ? 1 : 0, sideY = d => d === 'T' ? -1 : d === 'B' ? 1 : 0;

  // бегущая строка: str повторяется, off — сдвиг в px
  function marquee(str, y, ang, z, off, o = {}) {
    const wt = o.wt || 900, tr = (o.tr ?? TR) * z, unit = str + (o.sep ?? '   •   ');
    const w = met(unit, z, wt, tr).w; if (w < 2) return;
    x.save(); x.translate(CX, y); x.rotate(ang);
    if (o.band) { x.fillStyle = o.band; x.fillRect(-1400, -o.bh / 2, 2800, o.bh); }
    x.globalAlpha *= o.alpha ?? 1;
    x.font = `${wt} ${z}px ${FONT}`; x.letterSpacing = tr + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    const by = capH(z, wt) / 2; let s = -1300 - (((off % w) + w) % w);
    if (o.stroke) { x.lineWidth = o.stroke; x.strokeStyle = o.color; x.lineJoin = 'round'; } else x.fillStyle = o.color;
    while (s < 1300) { o.stroke ? x.strokeText(unit, s, by) : x.fillText(unit, s, by); s += w; }
    x.restore();
  }
  function logo(X, Y, z, col, al = 'center', alpha = 1) {
    const a = U(САЙТ.бренд || ''), b = САЙТ.хвостЛого || '', wa = tw(a, z, 900, .06), wb = b ? tw(b, z, 900, .06) : 0;
    const x0 = al === 'center' ? X - (wa + wb) / 2 : al === 'left' ? X : X - wa - wb;
    TX(a, x0, Y, z, { color: col, align: 'left', tr: .06, alpha });
    if (b) TX(b, x0 + wa, Y, z, { color: col, align: 'left', tr: .06, alpha: alpha * .45 });
  }
  // верхняя строка: лого слева, номер справа
  function topBar(col, i, n, lt) {
    const a = E.out5(clamp((lt - .05) / .3));
    logo(120, TOP - 32, 32, col, 'left', a);
    if (n > 1) TX(`${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, 960, TOP - 32, 28, { color: col, align: 'right', wt: 700, tr: .08, alpha: a * .7 });
  }

  // — шторки: область, которую уже закрыла новая плашка (p 0..1), край со скосом —
  const K = 170;
  function region(dir, p) {
    x.beginPath();
    if (dir === 'L' || dir === 'R') {
      const e = mix(-K / 2 - 60, W + K / 2 + 60, p), f = X => dir === 'L' ? X : W - X;
      x.moveTo(f(-60), -60); x.lineTo(f(e + K / 2), -60); x.lineTo(f(e - K / 2), H + 60); x.lineTo(f(-60), H + 60);
    } else if (dir === 'T' || dir === 'B') {
      const e = mix(-K / 2 - 60, H + K / 2 + 60, p), f = Y => dir === 'T' ? Y : H - Y;
      x.moveTo(-60, f(-60)); x.lineTo(W + 60, f(-60)); x.lineTo(W + 60, f(e - K / 2)); x.lineTo(-60, f(e + K / 2));
    } else { // S: двери сверху и снизу
      const e = mix(-K / 2 - 30, H / 2 + K / 2 + 40, p);
      x.moveTo(-60, -60); x.lineTo(W + 60, -60); x.lineTo(W + 60, e - K / 2); x.lineTo(-60, e + K / 2); x.closePath();
      x.moveTo(-60, H - e + K / 2); x.lineTo(W + 60, H - e - K / 2); x.lineTo(W + 60, H + 60); x.lineTo(-60, H + 60);
    }
    x.closePath();
  }
  function pushOld(dir, p) { const d = 170 * p; if (dir === 'S') sc(1 - .05 * p); else x.translate(-sideX(dir) * d, -sideY(dir) * d); }

  // ===== ДАННЫЕ → СЦЕНЫ =====
  const hookSrc = (САЙТ.хук && САЙТ.хук.length ? САЙТ.хук : (САЙТ.заголовок || [САЙТ.бренд])).map(U);
  const STICK = new Set(['для', 'без', 'под', 'над', 'про', 'при', 'или', 'что', 'как', 'and', 'the', 'for', 'with']);
  const words = (() => {
    const out = []; let buf = '';
    for (const w of hookSrc.join(' ').split(/\s+/).filter(Boolean)) { buf = buf ? buf + ' ' + w : w; const core = w.replace(/[^\p{L}\p{N}]/gu, ''); if (core.length > 2 && !(core === w && STICK.has(core.toLowerCase()))) { out.push(buf); buf = ''; } }
    if (buf) out.length ? out[out.length - 1] += ' ' + buf : out.push(buf);
    while (out.length > 5) { let bi = 0, bl = 1e9; for (let i = 0; i < out.length - 1; i++) { const l = out[i].length + out[i + 1].length; if (l < bl) { bl = l; bi = i; } } out.splice(bi, 2, out[bi] + ' ' + out[bi + 1]); }
    return out;
  })();
  const titles = (САЙТ.заголовок && САЙТ.заголовок.length ? САЙТ.заголовок : [САЙТ.бренд]).map(U);
  const accIdx = Number.isInteger(САЙТ.акцентСтрока) && САЙТ.акцентСтрока < titles.length ? САЙТ.акцентСтрока : -1;
  const goods = (САЙТ.товары || []).slice(0, 8), np = goods.length, bp = np <= 2 ? 3 : np <= 4 ? 2 : 1;
  const nums = (САЙТ.цифры || []).slice(0, 3), nn = nums.length, bn = nn <= 2 ? 3 : 2;
  const Lp = np * bp, Ln = nn * bn, Hb = clamp(17 - Lp - Ln, 3, 6);
  const total = 5 + 3 + Hb + Lp + Ln + 5, ctaB = 5 + Math.max(0, 28 - total);
  DUR = (total - 5 + ctaB) * B;
  const goodsLine = np ? goods.map(g => U(g.имя)).join('   •   ') : U(САЙТ.бренд || '');
  const perks = [...(САЙТ.преимущества || []), ...(САЙТ.шаги || [])].map(U);

  const S = [];
  // ——— ХУК: слово на долю, каждое на весь экран, плашка меняется шторкой ———
  const hookBg = [C.акцент, C.текст, C.фон], hookDir = ['L', 'R', 'T', 'L', 'B'];
  words.forEach((w, k) => {
    const bgc = hookBg[k % 3], col = ink(bgc), prev = k ? hookBg[(k - 1) % 3] : null;
    S.push({ t0: k * B, dir: k ? hookDir[k % 5] : null, band: k ? third(prev, bgc) : null, draw: lt => {
      bg(bgc);
      const ls = lay(w, MW, 400, 230), ys = stackYs(ls, CY);
      x.save(); cam(lt + k * 2.3, 11 + k);
      // эхо: то же слово контуром, огромное, медленно едет
      x.save(); sc(2.3 + lt * .05); TX(ls[0].s, CX + 160 - lt * 70, CY, ls[0].z, { color: col, stroke: 1.4, alpha: .13 }); x.restore();
      const e = k ? E.out5(clamp(lt / .34)) : 1, d = hookDir[k % 5];
      x.translate(sideX(d) * (1 - e) * 200, sideY(d) * (1 - e) * 200);
      sc((k ? punch(lt) : 1) * (1 + lt * .025));
      ls.forEach((l, i) => TX(l.s, CX, ys[i], l.z, { color: col }));
      x.restore();
      logo(CX, TOP, 38, col, 'center', .95);
      // доли: точки внизу
      const n = words.length + (words.length < 5 ? 1 : 0);
      for (let i = 0; i < n; i++) { x.beginPath(); x.arc(CX + (i - (n - 1) / 2) * 30, 1430, i === k ? 7 : 4.5, 0, 7); x.fillStyle = rgba(col.startsWith('#') ? col : '#ffffff', i === k ? .95 : .3); x.fill(); }
    } });
  });
  // если слов меньше пяти — на свободную долю вся фраза плакатом
  if (words.length < 5) {
    const k = words.length, last = hookBg[(k - 1) % 3], bgc = last === C.текст ? C.акцент : C.текст, col = ink(bgc);
    const accBg = bgc === C.акцент ? C.фон : C.акцент, accCol = ink(accBg);
    S.push({ t0: k * B, dir: 'B', band: third(last, bgc), draw: lt => {
      bg(bgc);
      const ls = hookSrc.map((s, i) => ({ s, z: fitS(s, i === hookSrc.length - 1 ? MW - 64 : MW, 300) }));
      const hs = ls.map((l, i) => capH(l.z) + (i === ls.length - 1 ? capH(l.z) * .7 : 0));
      let y = CY - (hs.reduce((a, b) => a + b, 0) + 24 * (ls.length - 1)) / 2;
      x.save(); cam(lt, 21); sc(1 + lt * .03);
      ls.forEach((l, i) => {
        const h = hs[i], cy = y + h / 2, q = E.out5(clamp((lt - i * .06) / .34)); y += h + 24;
        x.save(); x.beginPath(); x.rect(0, cy - h / 2 - 6, W, h + 12); x.clip();
        const oy = (1 - q) * h * 1.3;
        if (i === ls.length - 1) { const pw = tw(l.s, l.z) + 64; rr(CX - pw / 2, cy - h / 2 + oy, pw, h, 6); x.fillStyle = accBg; x.fill(); TX(l.s, CX, cy + oy, l.z, { color: accCol }); }
        else TX(l.s, CX, cy + oy, l.z, { color: col });
        x.restore();
      });
      x.restore();
      logo(CX, TOP, 38, col, 'center', .95);
    } });
  }

  // ряды заголовка: мелкую строку ломаем на два крупных ряда, пока стопка не выше 560 px
  let TRS = null;
  function titleRows() {
    if (TRS) return TRS;
    const PX = 34, mw = i => i === accIdx ? MW - 2 * PX : MW, cp = i => i === accIdx ? 230 : 260;
    const hOf = rs => rs.reduce((h, r) => h + capH(r.z) * (r.acc ? 1.7 : 1), 0) + 26 * (rs.length - 1);
    let rows = titles.map((t0, i) => [{ s: t0, z: fitS(t0, mw(i), cp(i)), src: i, sub: 0, acc: i === accIdx }]);
    const order = titles.map((_, i) => i).sort((a, b) => rows[a][0].z - rows[b][0].z);
    for (const i of order) {
      if (rows[i][0].z >= 140) continue;
      const sp = lay(titles[i], mw(i), cp(i), 140);
      if (sp.length < 2) continue;
      const cand = rows.map((r, j) => j === i ? sp.map((q, k) => ({ ...q, src: i, sub: k, acc: i === accIdx })) : r);
      if (hOf(cand.flat()) <= 560) rows = cand;
    }
    return TRS = rows.flat();
  }
  // ——— ЗАГОЛОВОК + ПРЕДМЕТ: строки въезжают с разных сторон, на долю — удар предмета между ними ———
  const tTitle = 5 * B, tc = 3 * B, tstep = titles.length <= 3 ? B : B / 2;
  {
    const bgc = C.фон, col = ink(bgc), acBg = C.акцент, acCol = ink(acBg), PX = 34, GAP = 26;
    const prevBg = words.length < 5 ? (hookBg[(words.length - 1) % 3] === C.текст ? C.акцент : C.текст) : hookBg[4 % 3];
    S.push({ t0: tTitle, dir: 'T', band: third(prevBg, bgc), draw: lt => {
      bg(bgc);
      const R = titleRows();
      const L = R.length, hh0 = R.map(r => capH(r.z) * (r.acc ? 1.7 : 1)), tot0 = hh0.reduce((a, b) => a + b, 0) + GAP * (L - 1);
      const kz = Math.min(1, 760 / tot0), Z = R.map(r => r.z * kz), hh = hh0.map(h => h * kz);
      const tot = hh.reduce((a, b) => a + b, 0) + GAP * (L - 1);
      let yy = CY - tot / 2; const ys = hh.map(h => { const c = yy + h / 2; yy += h + GAP; return c; });
      const mSrc = titles.length === 1 ? 1 : accIdx > 0 ? accIdx : 1, m = Math.max(1, R.filter(r => r.src < mSrc).length);
      const topStart = ys[0] - hh[0] / 2, topEnd = ys[m - 1] + hh[m - 1] / 2;
      const botStart = m < L ? ys[m] - hh[m] / 2 : 1470, botEnd = m < L ? ys[L - 1] + hh[L - 1] / 2 : 1470;
      const sp = E.out5(clamp((lt - tc) / .42));
      const dT = (TOP + 10 - topStart) * sp, dB = (1470 - botEnd) * sp;
      const OY = ((topEnd + TOP + 10 - topStart) + (botStart + 1470 - botEnd)) / 2;
      const gapH = (botStart + 1470 - botEnd) - (topEnd + TOP + 10 - topStart), s = clamp(gapH * .28, 150, 220), BY = (botStart + 1470 - botEnd) - 120;
      x.save(); cam(lt, 31);
      // маркизы с именами товаров: открываются кругом от точки удара
      if (lt > tc) {
        const r = mix(0, 1900, E.out5(clamp((lt - tc) / .75)));
        x.save(); x.beginPath(); x.arc(CX, OY, r, 0, 7); x.clip();
        for (let j = 0; j < 7; j++) {
          const y = 210 + j * 210, dirm = j % 2 ? 1 : -1;
          marquee(goodsLine, y, -.14, 150, dirm * (lt * 90 + bstep(lt) * 120) + j * 377, { color: col, stroke: 1.6, alpha: .16 });
        }
        x.restore();
        // кольцо удара
        const rq = clamp((lt - tc) / .6);
        if (rq < 1) { x.beginPath(); x.arc(CX, OY, mix(s * .9, s * 3.4, E.out5(rq)), 0, 7); x.lineWidth = mix(18, 1, rq); x.strokeStyle = rgba(hi(bgc), 1 - rq); x.stroke(); }
      }
      // подзаголовок лентой через кадр
      if (САЙТ.подзаголовок && lt > tc + B) {
        const q = E.out5(clamp((lt - tc - B) / .4));
        x.save(); x.translate(CX, BY); x.rotate(-.1); x.beginPath(); x.rect(-700, -60, 1400 * q, 120); x.clip(); x.rotate(.1); x.translate(-CX, -(BY));
        marquee(U(САЙТ.подзаголовок), BY, -.1, 40, lt * 160, { band: C.текст, bh: 84, color: ink(C.текст), wt: 800, tr: .02 });
        x.restore();
      }
      // строки поверх предмета: предмет зажат между верхней и нижней группой, буквы не перекрываются
      const line = i => {
        const r = R[i], ti = r.src * tstep + r.sub * .07, q = clamp((lt - ti) / .42); if (q <= 0) return;
        const e = E.out5(q), side = (r.src === titles.length - 1 && titles.length >= 3) ? 'B' : (r.src % 2 ? 'R' : 'L');
        const ox = sideX(side) * (1 - e) * 1100, oy = sideY(side) * (1 - e) * 700, y = ys[i] + (i < m ? dT : dB) + oy, s0 = r.s;
        if (r.acc) {
          const pw = tw(s0, Z[i]) + 2 * PX, ph = hh[i], wq = E.out5(clamp((lt - ti) / .3));
          const x0 = side === 'R' ? CX + pw / 2 - pw * wq : CX - pw / 2;
          x.save(); if (lt > tc) { shadow(40, 'rgba(0,0,0,.35)', 14); }
          rr(x0, y - ph / 2, pw * wq, ph, 6); x.fillStyle = acBg; x.fill(); x.restore();
          x.save(); rr(x0, y - ph / 2, pw * wq, ph, 6); x.clip();
          x.save(); sc(punch(lt - ti - .06, 1.15), CX, y); TX(s0, CX + ox * .3, y, Z[i], { color: acCol }); x.restore();
          x.restore();
        } else { x.save(); sc(punch(lt - ti, 1.12), CX + ox, y); TX(s0, CX + ox, y, Z[i], { color: col }); x.restore(); }
      };
      // предмет врезается: влетает сверху с поворотом, садится в наклон; на каждой доле доворот
      if (lt >= tc) {
        const p = clamp((lt - tc) / .34), y = mix(-700, OY, E.expo(p));
        let rot = mix(-1.1, -.42, E.out5(p));
        for (let j = 1; j < 6; j++) rot += (j % 2 ? .08 : -.08) * E.out5(clamp((lt - tc - j * B) / .28));
        const k = (lt - tc < .34 ? mix(1.3, .975, E.out5(p)) : mix(.975, 1, E.inOut(clamp((lt - tc - .34) / .25)))) * (1 + Math.max(0, lt - tc) * .02);
        x.save(); x.translate(CX + noise(41, lt * .4) * 6, y + noise(42, lt * .4) * 6); x.rotate(rot); x.scale(k, k);
        САЙТ.предмет(x, lt + 2.5, undefined, s); x.restore();
      }
      for (let i = 0; i < L; i++) line(i);
      x.restore();
    } });
  }

  // ——— ТОВАРЫ: карусель по биту — предмет в своей палитре, огромное имя, цена ударом ———
  let t = tTitle + (3 + Hb) * B;
  const prodSeq = [C.текст, C.акцент, C.фон];
  let prevBg = C.фон;
  // фото товара рисуем в свой буфер: так его хвосты (браслет, ремень) мягко гаснут к имени и цене, а не лезут под текст
  const PB = document.createElement('canvas'); PB.width = W; PB.height = H; const pb = PB.getContext('2d');
  const toHex = s => '#' + (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
  goods.forEach((g, i) => {
    const pal = g.палитра, hasPal = pal && pal.циферблат;
    // карточка в цвете товара; слишком тёмный циферблат (почти как фон) подсвечиваем его акцентом
    const dark = hasPal && lum(pal.циферблат) < .03, glowC = hasPal ? toHex(mixColor(pal.циферблат, pal.акцент || C.акцент, dark ? .42 : .3)) : null;
    const bgc = hasPal ? (dark ? toHex(mixColor(pal.циферблат, pal.акцент || C.акцент, .1)) : pal.циферблат) : prodSeq[i % 3], col = ink(bgc);
    const dir = i % 2 ? 'L' : 'R', band = pal && pal.акцент ? pal.акцент : third(prevBg, bgc), dur = bp * B;
    const pt = bp > 1 ? B : .14;
    prevBg = bgc;
    // раскладка: имя сверху, цена снизу, предмет в просвете между ними
    const ls = lay(U(g.имя), MW, 250, 170), nameBot = 345 + stackH(ls);
    const pz = g.цена ? fitS(String(g.цена), 600, 96) : 0, priceTop = g.цена ? 1420 - (capH(pz) + 56) / 2 - 8 : 1500;
    const IY = (nameBot + priceTop) / 2 + 12;
    S.push({ t0: t, dir, band, draw: lt => {
      bg(bgc);
      x.save(); cam(lt + i * 1.7, 51 + i);
      if (glowC) { const rg = x.createRadialGradient(CX, IY, 40, CX, IY, 640); rg.addColorStop(0, glowC); rg.addColorStop(1, rgba(bgc, 0)); x.fillStyle = rg; x.fillRect(-100, IY - 700, W + 200, 1400); }
      // фон: имя бегущей строкой контуром
      marquee(U(g.имя), IY, -.12, 230, (dir === 'R' ? 1 : -1) * (lt * 110 + bstep(lt) * 80) + i * 211, { color: col, stroke: 1.5, alpha: .14 });
      // предмет: влетает с поворотом, на каждой доле чуть доворачивается
      const p = clamp((lt - .04) / .44), tilt = i % 2 ? .1 : -.1;
      let rot = mix(sideX(dir) * .9, tilt, E.out5(p));
      for (let j = 1; j < bp; j++) rot += -tilt * .45 * E.out5(clamp((lt - j * B) / .26));
      const ss = 222, k = lt < .44 ? mix(1.12, .975, E.out5(p)) : mix(.975, 1, E.inOut(clamp((lt - .44) / .24)));
      const m = x.getTransform();
      pb.setTransform(1, 0, 0, 1, 0, 0); pb.clearRect(0, 0, W, H); pb.setTransform(m);
      pb.save(); pb.translate(CX + sideX(dir) * (1 - E.expo(p)) * 900, IY + noise(60 + i, lt * .5) * 6); pb.rotate(rot); pb.scale(k, k);
      // мягкая тень по альфе фото
      pb.shadowColor = 'rgba(0,0,0,.45)'; pb.shadowBlur = 50; pb.shadowOffsetY = 24;
      САЙТ.предмет(pb, lt + i, pal ? pal : undefined, ss); pb.restore();
      const fg = pb.createLinearGradient(0, nameBot + 6, 0, priceTop - 6);
      const span = priceTop - nameBot - 12, f1 = clamp(90 / span, 0, .45), f2 = clamp(120 / span, 0, .45);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(f1, 'rgba(0,0,0,1)'); fg.addColorStop(1 - f2, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      pb.globalCompositeOperation = 'destination-in'; pb.fillStyle = fg; pb.fillRect(-500, -500, W + 1000, H + 1000); pb.globalCompositeOperation = 'source-over';
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(PB, 0, 0); x.restore();
      // имя: огромное, въезжает со стороны шторки
      const ny = 345 + stackH(ls) / 2, ys = stackYs(ls, ny), e = E.out5(clamp(lt / .4));
      x.save(); x.translate(sideX(dir) * (1 - e) * 500, 0); sc(punch(lt, 1.14), CX, ny);
      ls.forEach((l, j) => TX(l.s, CX, ys[j], l.z, { color: col })); x.restore();
      x.restore();
      // цена: плашка-удар на вторую долю
      if (g.цена && lt > pt) {
        const lq = lt - pt, z = fitS(String(g.цена), 600, 96), pw = tw(String(g.цена), z) + 72, ph = capH(z) + 56;
        const pb = C.акцент === bgc ? C.фон : C.акцент, pc = ink(pb), wq = E.out5(clamp(lq / .26));
        x.save(); x.translate(CX, 1420); x.rotate(-.035); sc(punch(lq, 1.2), 0, 0);
        rr(-pw / 2, -ph / 2, pw * wq, ph, 8); x.fillStyle = pb; x.fill();
        x.save(); rr(-pw / 2, -ph / 2, pw * wq, ph, 8); x.clip(); TX(String(g.цена), 0, 0, z, { color: pc }); x.restore();
        x.restore();
      }
      topBar(col, i, np, lt);
    } });
    t += dur;
  });

  // ——— ЦИФРЫ: гигантский счётчик-барабан на всю ширину, подпись мелко ———
  const numSeq = [C.акцент, C.фон, C.текст];
  nums.forEach((n, j) => {
    const bgc = numSeq[(3 - nn + j) % 3], col = ink(bgc), nc = bgc === C.фон ? hi(bgc) : col;
    const fin = num(n.число), plus = n.плюс || '', full = fin + plus;
    S.push({ t0: t, dir: j ? 'B' : (np % 2 ? 'L' : 'R'), band: third(prevBg, bgc), draw: lt => {
      bg(bgc);
      x.save(); cam(lt + j * 3.1, 71 + j); sc(1 + lt * .02, CX, 900);
      const z = fitS(full, MW, full.length <= 3 ? 560 : 400), ch = capH(z), pitch = ch * 1.5, tr = TR * z, cy = 900;
      const chars = [...full], ws = chars.map(c => met(c, z, 900, tr).w), tot = ws.reduce((a, b) => a + b, 0);
      // эхо: число огромным контуром, едет медленно
      x.save(); sc(2.2, CX, cy); TX(full, CX + 120 - lt * 60, cy, z, { color: nc.startsWith('#') ? nc : col, stroke: 1.3, alpha: .1 * E.out5(clamp(lt / .4)) }); x.restore();
      x.font = `900 ${z}px ${FONT}`; x.letterSpacing = tr + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.fillStyle = nc;
      let X = CX - tot / 2 - tr / 2;
      const D = chars.filter(c => /\d/.test(c)).length, T1 = 1.0, T0 = .14; let di = 0;
      x.font = `900 ${z}px ${FONT}`; x.letterSpacing = tr + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.fillStyle = nc;
      // барабан трогается после шторки и разгоняется плавно (smoothstep), без мельтешения в первые кадры
      const sst = q => q * q * (3 - 2 * q), val = (f, r, ts, tt) => (f + 10 * r) * sst(clamp((tt - T0 - ts) / (T1 - T0 - ts)));
      chars.forEach((c, i) => {
        if (/\d/.test(c)) {
          const f = +c, r = di === 0 && D > 1 ? 0 : 1, ts = .04 * di, v = val(f, r, ts, lt), b0 = Math.floor(v + 1e-6), fr = v - b0;
          x.save(); x.beginPath(); x.rect(X - 8, cy - pitch / 2, ws[i] + 16, pitch); x.clip();
          if (!(di === 0 && D > 1 && b0 === 0)) x.fillText(String(b0 % 10), X, cy + ch / 2 - fr * pitch); // старший ноль не рисуем: цифра вкатывается из пустоты
          if (fr > 1e-4) x.fillText(String((b0 + 1) % 10), X, cy + ch / 2 + (1 - fr) * pitch);
          // края барабана гаснут в цвет фона
          for (const sgn of [-1, 1]) { const y0 = cy + sgn * pitch / 2, y1 = cy + sgn * ch * .5, g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(bgc, 1)); g.addColorStop(1, rgba(bgc, 0)); x.fillStyle = g; x.fillRect(X - 8, Math.min(y0, y1), ws[i] + 16, Math.abs(y1 - y0)); }
          x.fillStyle = nc;
          x.restore(); di++;
        } else if (c !== ' ') {
          const isPlus = i >= fin.length, lq = lt - (isPlus ? T1 - .05 : 0);
          if (lq > 0) { x.save(); x.globalAlpha = clamp(lq / .06); sc(isPlus ? punch(lq, 1.5) : 1, X + ws[i] / 2, cy); x.fillText(c, X, cy + ch / 2); x.restore(); }
        }
        X += ws[i];
      });
      // подпись маленькая, выезжает из-под маски
      const cap = U(n.подпись || ''), cl = lay(cap, MW, 50, 40, 700, .1), q = E.out5(clamp((lt - .2) / .35));
      let cyy = cy + pitch / 2 + 60;
      cl.forEach(l => { const hz = capH(l.z, 700);
        x.save(); x.beginPath(); x.rect(0, cyy - hz, W, hz * 2); x.clip();
        TX(l.s, CX, cyy + (1 - q) * hz * 1.6, l.z, { color: col, wt: 700, tr: .1 }); x.restore(); cyy += hz * 1.9; });
      // линия хода счёта
      const lw = MW * E.out5(clamp(lt / T1));
      x.fillStyle = rgba(nc.startsWith('#') ? nc : '#ffffff', .9); x.fillRect(CX - lw / 2, cy - pitch / 2 - 24, lw, 6);
      x.restore();
      topBar(col, j, nn, lt);
    } });
    prevBg = bgc; t += bn * B;
  });

  // ——— ФИНАЛ: призыв огромным текстом, домен плашкой, держится до конца ———
  {
    const bgc = C.акцент, col = ink(bgc), dBg = col, dCol = con(col, C.акцент) >= 2.8 ? C.акцент : ink(col);
    const calls = (САЙТ.призыв && САЙТ.призыв.length ? САЙТ.призыв : [САЙТ.кнопка || САЙТ.бренд]).map(U);
    S.push({ t0: t, dir: 'S', band: third(prevBg, bgc) === bgc ? C.фон : third(prevBg, bgc), draw: lt => {
      bg(bgc);
      x.save(); cam(lt, 91, .8);
      // фон: преимущества и шаги бегущими строками
      if (perks.length) for (let j = 0; j < 8; j++) {
        const str = perks.filter((_, i) => i % 2 === j % 2).join('   •   ') || perks.join('   •   ');
        marquee(str, 170 + j * 205, -.14, 110, (j % 2 ? 1 : -1) * (lt * 70 + bstep(lt) * 60) + j * 290, { color: col, stroke: 1.4, alpha: .15 });
      }
      x.restore();
      x.save(); cam(lt, 93, .6); sc(1 + lt * .012, CX, 820);
      const ls = calls.map(s => ({ s, z: fitS(s, MW, 300) })), ys = stackYs(ls, 800);
      ls.forEach((l, i) => {
        const ti = i * B, q = clamp((lt - ti) / .4); if (q <= 0) return;
        const e = E.out5(q), sd = i % 2 ? 1 : -1, h = capH(l.z);
        x.save(); x.beginPath(); x.rect(0, ys[i] - h / 2 - 14, W, h + 28); x.clip();
        x.translate(sd * (1 - e) * 900, 0); sc(punch(lt - ti, 1.16), CX, ys[i]);
        TX(l.s, CX, ys[i], l.z, { color: col }); x.restore();
      });
      // домен в плашке
      const dt = calls.length * B, lq = lt - dt;
      if (lq > 0 && САЙТ.домен) {
        const dz = fitS(САЙТ.домен, 640, 92, 800, 0), pw = tw(САЙТ.домен, dz, 800, 0) + 90, ph = capH(dz, 800) + 64;
        const py = ys[ys.length - 1] + capH(ls[ls.length - 1].z) / 2 + 120 + ph / 2, wq = E.out5(clamp(lq / .3));
        x.save(); x.translate(CX, py); sc(punch(lq, 1.25), 0, 0);
        rr(-pw / 2, -ph / 2, pw * wq, ph, ph / 2); x.fillStyle = dBg; x.fill();
        x.save(); rr(-pw / 2, -ph / 2, pw * wq, ph, ph / 2); x.clip(); TX(САЙТ.домен, 0, 0, dz, { color: dCol, wt: 800, tr: 0 }); x.restore();
        x.restore();
      }
      x.restore();
      logo(CX, TOP, 40, col, 'center', E.out5(clamp(lt / .4)));
    } });
  }

  // ===== КАДР =====
  const WD = .37;
  window.КАДР = tt => {
    let k = 0; for (let i = 0; i < S.length; i++) if (S[i].t0 <= tt) k = i;
    const s = S[k], lt = tt - s.t0;
    if (k > 0 && s.dir && lt < WD) {
      const pv = S[k - 1], pp = E.out5(clamp((lt - .03) / .32)), pb = Math.min(1, pp + (1 - pp) * .13 * E.out(clamp(lt / .06)));
      x.save(); pushOld(s.dir, pp); pv.draw(tt - pv.t0); x.restore();
      x.save(); region(s.dir, pb); x.clip(); bg(s.band || C.акцент); x.restore();
      x.save(); region(s.dir, pp); x.clip(); s.draw(lt); x.restore();
    } else s.draw(lt);
  };
})();

  },
  neon() {
// СТИЛЬ «Неон-HUD»: интерфейс из sci-fi фильма. Всегда тёмный фон, свечение = акцент бренда.
// Линии рисуются, строки печатаются, предмет проявляется сканирующим лучом из каркаса.
// Сквозная связка сцен: уголки прицела живут весь ролик и переезжают от хука к предмету,
// к выноскам, к карусели, к цифрам, а в финале дорастают до полной рамки призыва.
window.ИМЯ = 'neon';
DUR = 15;
FONT = САЙТ.шрифт || FONT;

(() => {
  const S = САЙТ, C = S.цвета || {};
  const MONO = 'Menlo,"SF Mono","Roboto Mono",Consolas,"Liberation Mono",monospace';
  const U = s => (S.капс ? String(s).toUpperCase() : String(s));

  // ── цвета: фон всегда тёмный, неон из акцента (тёмный акцент высветляем) ──
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
  const toHex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mixH = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b); return toHex(A.map((v, i) => mix(v, B[i], p))); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const toHsl = h => { const [r, g, b] = hex2rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l]; const s2 = d / (1 - Math.abs(2 * l - 1)); let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [hh * 60 < 0 ? hh * 60 + 360 : hh * 60, s2, l]; };
  const fromHsl = (hh, s2, l) => { const k = n => (n + hh / 30) % 12, a = s2 * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return toHex([f(0), f(8), f(4)].map(v => v * 255)); };
  let N = isHex(C.акцент) ? C.акцент : '#5ce1ff';
  if (lum(N) < .3) { const [hh, s2, l] = toHsl(N); N = fromHsl(hh, s2 > .12 ? Math.max(s2, .85) : s2, Math.max(l, .6)); }
  for (let i = 0; i < 8 && lum(N) < .3; i++) N = mixH(N, '#ffffff', .15);
  const DARK = S.тема !== 'светлая';
  const BG = (DARK && isHex(C.фон) && lum(C.фон) < .02) ? C.фон : mixH(N, '#020306', .94);
  const BG2 = mixH(BG, N, .07);
  const TX = (DARK && isHex(C.текст) && lum(C.текст) > .7) ? C.текст : '#f2f5f7';
  const DIM = mixH(TX, BG, .4), FAINT = mixH(TX, BG, .72);

  // ── данные ──
  const HOOK0 = (S.хук && S.хук.length ? S.хук : (S.заголовок || [S.бренд || ''])).map(U);
  const HEAD = (S.заголовок || []).map(U), HACC = S.акцентСтрока ?? HEAD.length - 1;
  const CALL = ((S.преимущества && S.преимущества.length ? S.преимущества : S.шаги) || []).slice(0, 4).map(U);
  const PRODS = (S.товары || []).slice(0, 5);
  const NUMS = (S.цифры || []).slice(0, 4);
  const CTA = (S.призыв && S.призыв.length ? S.призыв : [S.кнопка || S.бренд || '']).map(U);
  const DOMAIN = S.домен || '';
  const BRAND = U((S.бренд || '') + (S.хвостЛого || ''));

  // ── мелкие помощники рисования ──
  const glow = (b, col = N, a = .7) => { x.shadowColor = rgba(col, a); x.shadowBlur = b; x.shadowOffsetX = 0; x.shadowOffsetY = 0; };
  const unglow = () => { x.shadowColor = 'transparent'; x.shadowBlur = 0; };
  const mono = (s, X, Y, o = {}) => T(s, X, Y, { font: MONO, weight: 700, size: 22, color: DIM, align: 'left', track: 1, ...o });
  // ломаная, нарисованная на долю p своей длины; возвращает конец
  function poly(pts, p) {
    let L = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
    let rest = clamp(p) * L; x.moveTo(pts[0][0], pts[0][1]); let end = pts[0];
    for (let i = 1; i < pts.length && rest > 0; i++) {
      const k = Math.min(1, rest / (seg[i - 1] || 1)); end = [mix(pts[i - 1][0], pts[i][0], k), mix(pts[i - 1][1], pts[i][1], k)];
      x.lineTo(end[0], end[1]); rest -= seg[i - 1];
    }
    return end;
  }
  // неоновая линия: широкий мягкий ореол + яркая сердцевина (без shadowBlur)
  function neonStroke(build, lw = 3, a = 1, col = N) {
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); build(); x.strokeStyle = rgba(col, .16 * a); x.lineWidth = lw * 5; x.stroke();
    x.beginPath(); build(); x.strokeStyle = rgba(col, .35 * a); x.lineWidth = lw * 2.2; x.stroke();
    x.beginPath(); build(); x.strokeStyle = rgba(mixH(col, '#ffffff', .35), a); x.lineWidth = lw; x.stroke();
    x.restore();
  }
  // печать строки слева направо от X; p = доля символов
  function typeL(s, X, Y, p, o) {
    const n = s.length, k = clamp(p) * n, i = Math.floor(k), shown = s.slice(0, i);
    if (shown) T(shown, X, Y, { ...o, align: 'left' });
    const w = shown ? textW(shown, o.size, o.weight || 800, o.track || 0, o.font) : 0;
    if (i < n && k - i > 0) T(s[i], X + w, Y, { ...o, align: 'left', color: N, alpha: (o.alpha ?? 1) * (k - i) });
    return w + (i < n ? (k - i) * textW(s[i], o.size, o.weight || 800, o.track || 0, o.font) : 0);
  }
  function wrap(s, maxW, size, weight, font, maxLines = 2) {
    const words = String(s).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (textW(t2, size, weight, 0, font) <= maxW || !cur) cur = t2; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { const head = lines.slice(0, maxLines - 1); head.push(lines.slice(maxLines - 1).join(' ')); return head; }
    return lines;
  }
  // перенос с ужатием: не больше maxLines строк, каждая не шире maxW
  function wrapFit(s, maxW, size, weight, font, maxLines = 2, minSize = 22) {
    for (let sz = size; ; sz *= .94) {
      const ls = wrap(s, maxW, sz, weight, font, 99);
      if ((ls.length <= maxLines && ls.every(l => textW(l, sz, weight, 0, font) <= maxW)) || sz * .94 < minSize) {
        const out = ls.slice(0, maxLines);
        if (ls.length > maxLines) { let l = out[maxLines - 1] + ' ' + ls.slice(maxLines).join(' '); while (l.length > 1 && textW(l + '…', sz, weight, 0, font) > maxW) l = l.slice(0, -1); out[maxLines - 1] = l.trimEnd() + '…'; }
        return { lines: out, size: sz };
      }
    }
  }
  // контур строки (каркас текста) — только для ещё не напечатанной части, правее cut
  function ghostT(s, X, Y, size, a, cut = X) {
    if (a <= 0) return;
    x.save(); x.beginPath(); x.rect(cut, Y - size, W, size * 2); x.clip();
    x.font = `800 ${size}px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.letterSpacing = '0px';
    x.strokeStyle = rgba(N, a); x.lineWidth = Math.max(1.4, size / 70); x.strokeText(s, X, Y); x.restore();
  }
  const cursor = (X, Y, h, t, a = 1) => { x.save(); x.globalAlpha *= a * (.6 + .4 * Math.cos(t * 9)); glow(14); x.fillStyle = N; x.fillRect(X + 6, Y - h / 2, Math.max(5, h * .09), h); x.restore(); };

  // ── буферы предмета (offscreen-холсты; предмет рисуется на главном холсте и копируется) ──
  const mkC = () => { const k = document.createElement('canvas'); k.width = W; k.height = H; return [k, k.getContext('2d')]; };
  const [B0, b0] = mkC(), [B1, b1] = mkC(), [SIL, sil] = mkC(), [TIN, tin] = mkC(), [TRL, trl] = mkC(), [WIR, wir] = mkC();
  let IB = null; // габарит предмета в долях s
  function measure() {
    // габарит по первому товару (он же герой); буфер — по объединению всех товаров (у фото разная высота)
    const box = pal => {
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      x.translate(540, 960); try { S.предмет(x, 0, pal, 100); } catch (e) { }
      x.restore();
      const d = x.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 90) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
      return x1 > x0 ? { x0: (x0 - 540) / 100, x1: (x1 - 540) / 100, y0: (y0 - 960) / 100, y1: (y1 - 960) / 100 } : null;
    };
    const b = box(undefined) || { x0: -1, x1: 1, y0: -1, y1: 1 };
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; b.ch = Math.min(b.h, b.w * 1.2); b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2;
    // фото товара: точка (0,0) = «ядро» (якорь, циферблат), ядро почти квадратное — рамка и выноски цепляются за него, а не за середину ремня
    const p0 = PRODS[0] && PRODS[0].палитра;
    if (p0 && p0.фото) { b.cy = 0; b.ch = Math.min(b.h, b.w * 1.12); }
    b.u = { ...b };
    PRODS.forEach(pr => { const q = pr.палитра && box(pr.палитра); if (q) { b.u.x0 = Math.min(b.u.x0, q.x0); b.u.x1 = Math.max(b.u.x1, q.x1); b.u.y0 = Math.min(b.u.y0, q.y0); b.u.y1 = Math.max(b.u.y1, q.y1); } });
    IB = b;
  }
  // поставить предмет так, чтобы его «ядро» встало в коробку (X,Y,bw,bh)
  function place(X, Y, bw, bh) {
    const s = Math.min(bw / IB.w, bh / IB.ch);
    return { s, ox: X - IB.cx * s, oy: Y - IB.cy * s, X, Y, core: { x: X - IB.w * s / 2, y: Y - IB.ch * s / 2, w: IB.w * s, h: IB.ch * s } };
  }
  function region(P) {
    const m = P.s * .3 + 30;
    const UB = IB.u;
    const rx = Math.max(0, Math.floor(P.ox + UB.x0 * P.s - m)), ry = Math.max(0, Math.floor(P.oy + UB.y0 * P.s - m));
    const rx1 = Math.min(W, Math.ceil(P.ox + UB.x1 * P.s + m)), ry1 = Math.min(H, Math.ceil(P.oy + UB.y1 * P.s + m));
    return { x: rx, y: ry, w: Math.max(1, rx1 - rx), h: Math.max(1, ry1 - ry) };
  }
  const blit = (src, R, ctx = x, dx = 0, dy = 0) => ctx.drawImage(src, R.x, R.y, R.w, R.h, R.x + dx, R.y + dy, R.w, R.h);
  // нарисовать предмет в буфер (с мягким затуханием выше/ниже ядра — длинный ремешок уходит в темноту)
  function renderItem(Bk, bk, t, pal, P) {
    const R = region(P);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.translate(P.ox, P.oy); S.предмет(x, t, pal, P.s); x.restore();
    bk.clearRect(0, 0, W, H); blit(c, R, bk);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    return R;
  }
  // мягкое затухание выше/ниже ядра: длинный ремешок/хвост уходит в темноту
  function fadeMask(bk, R, P) {
    const ch = P.core.h, top = P.core.y + ch * .03, bot = P.core.y + ch * .97, F = ch * .14;
    const g = bk.createLinearGradient(0, top - F, 0, bot + F), span = bot - top + 2 * F;
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(F / span, 'rgba(0,0,0,1)'); g.addColorStop(1 - F / span, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    bk.globalCompositeOperation = 'destination-in'; bk.fillStyle = g; bk.fillRect(R.x, R.y, R.w, R.h); bk.globalCompositeOperation = 'source-over';
  }
  // каркас: тёмный силуэт с сеткой + неоновая заливка (для обводки и следа луча)
  function buildWire(Bk, R, P) {
    sil.clearRect(0, 0, W, H); blit(Bk, R, sil);
    sil.globalCompositeOperation = 'source-atop';
    sil.fillStyle = rgba(BG, .9); sil.fillRect(R.x, R.y, R.w, R.h);
    sil.beginPath(); const st = 18;
    for (let yy = Math.ceil(R.y / st) * st; yy < R.y + R.h; yy += st) { sil.moveTo(R.x, yy + .5); sil.lineTo(R.x + R.w, yy + .5); }
    for (let xx = Math.ceil(R.x / st) * st; xx < R.x + R.w; xx += st) { sil.moveTo(xx + .5, R.y); sil.lineTo(xx + .5, R.y + R.h); }
    sil.strokeStyle = rgba(N, .22); sil.lineWidth = 1; sil.stroke();
    sil.globalCompositeOperation = 'source-over';
    tin.clearRect(0, 0, W, H); blit(Bk, R, tin);
    tin.globalCompositeOperation = 'source-in'; tin.fillStyle = N; tin.fillRect(R.x, R.y, R.w, R.h); tin.globalCompositeOperation = 'source-over';
    // каркас целиком в своём буфере: ореол, обводка, силуэт — потом общее затухание
    wir.clearRect(0, 0, W, H);
    for (const [k, al] of [[1.05, .06], [1.025, .1]]) {
      wir.save(); wir.globalAlpha = al; wir.translate(P.X, P.Y); wir.scale(k, k); wir.translate(-P.X, -P.Y); blit(TIN, R, wir); wir.restore();
    }
    for (const [dx, dy] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) blit(TIN, R, wir, dx, dy);
    blit(SIL, R, wir);
    fadeMask(wir, R, P); fadeMask(tin, R, P);
  }
  function drawWire(R, a) {
    if (a <= 0) return;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = a; blit(WIR, R); x.restore();
  }
  // след луча по предмету: неоновая полоса, приклеенная к форме предмета
  function trail(R, pos, len, dir, axis, a) {
    trl.clearRect(0, 0, W, H); blit(TIN, R, trl);
    const g = axis === 'y' ? trl.createLinearGradient(0, pos - dir * len, 0, pos + dir * 6) : trl.createLinearGradient(pos - dir * len, 0, pos + dir * 6, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.6, 'rgba(0,0,0,.12)'); g.addColorStop(.9, 'rgba(0,0,0,.55)'); g.addColorStop(.96, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    trl.globalCompositeOperation = 'destination-in'; trl.fillStyle = g; trl.fillRect(R.x, R.y, R.w, R.h); trl.globalCompositeOperation = 'source-over';
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'lighter'; x.globalAlpha = a; blit(TRL, R); x.restore();
  }
  // сам луч: горизонтальный (axis y) или вертикальный (axis x), без shadowBlur
  function beam(pos, a, axis = 'y', from = 0, to = axis === 'y' ? W : H) {
    if (a <= 0) return;
    x.save(); x.globalCompositeOperation = 'lighter';
    const mid = (from + to) / 2, half = (to - from) / 2;
    const gl = axis === 'y' ? x.createLinearGradient(from, 0, to, 0) : x.createLinearGradient(0, from, 0, to);
    gl.addColorStop(0, rgba(N, 0)); gl.addColorStop(.5, rgba(N, a)); gl.addColorStop(1, rgba(N, 0));
    const band = (w, al) => { x.globalAlpha = al; x.fillStyle = gl; if (axis === 'y') x.fillRect(from, pos - w / 2, to - from, w); else x.fillRect(pos - w / 2, from, w, to - from); };
    band(46, .1); band(16, .22); band(5, .7);
    x.globalAlpha = a; x.fillStyle = rgba('#ffffff', .85);
    if (axis === 'y') x.fillRect(mid - half * .45, pos - 1, half * .9, 2); else x.fillRect(pos - 1, mid - half * .45, 2, half * .9);
    x.restore();
  }

  // ── фон: тёмное небо, сетка-пол к горизонту, крестики, линейки ──
  const HY = 1250;
  function background(t, cam, fa) {
    x.fillStyle = BG; x.fillRect(0, 0, W, H);
    const rg = x.createRadialGradient(540, HY, 0, 540, HY, 900);
    rg.addColorStop(0, rgba(BG2, 1)); rg.addColorStop(1, rgba(BG, 0));
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
    // крестики на «стене»
    x.save(); x.globalAlpha = .1 * fa + .03; x.strokeStyle = N; x.lineWidth = 1.5; x.beginPath();
    const ox = (cam.x * .5) % 120, oy = (cam.y * .5) % 120;
    for (let gx = 60; gx < W + 60; gx += 120) for (let gy = 60; gy < HY - 40; gy += 120) { const X = gx + ox, Y = gy + oy; x.moveTo(X - 5, Y); x.lineTo(X + 5, Y); x.moveTo(X, Y - 5); x.lineTo(X, Y + 5); }
    x.stroke(); x.restore();
    // пол
    const vp = 540 - cam.x * 3, Hc = 900, dN = Hc / (H - HY), dF = 5.2, g = .19, ph = (t * .42) % g;
    const fg = x.createLinearGradient(0, HY + Hc / dF, 0, H);
    fg.addColorStop(0, rgba(N, 0)); fg.addColorStop(.15, rgba(N, .14 * fa)); fg.addColorStop(1, rgba(N, .5 * fa));
    x.save(); x.strokeStyle = fg; x.lineWidth = 1.6; x.beginPath();
    for (let d = dN - ph + g; d < dF; d += g) { const y = HY + Hc / d; if (y > H) continue; x.moveTo(0, y); x.lineTo(W, y); }
    for (let i = -44; i <= 44; i++) { const X = i * g * 1.05 + cam.x * .004; const xa = vp + X * Hc / dF, xb = vp + X * Hc / dN; x.moveTo(xa, HY + Hc / dF); x.lineTo(xb, H); }
    x.stroke(); x.restore();
    // линия горизонта
    const hg = x.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, rgba(N, 0)); hg.addColorStop(.5, rgba(N, .3 * fa)); hg.addColorStop(1, rgba(N, 0));
    x.fillStyle = hg; x.fillRect(0, HY - 1, W, 2);
    const hb = x.createLinearGradient(0, HY - 140, 0, HY + 160);
    hb.addColorStop(0, rgba(N, 0)); hb.addColorStop(.55, rgba(N, .07 * fa)); hb.addColorStop(1, rgba(N, 0));
    x.fillStyle = hb; x.fillRect(0, HY - 140, W, 300);
    // затемнение краёв
    const vg = x.createRadialGradient(540, 900, 500, 540, 900, 1250);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
  }
  function rulers(t, a) {
    if (a <= 0) return;
    x.save(); x.globalAlpha = a; x.strokeStyle = rgba(N, .35); x.lineWidth = 1.5; x.beginPath();
    const off = (t * 26) % 24;
    for (let y = 330 + off; y < 1440; y += 24) { const k = Math.round((y - off - 330) / 24) % 5 === 0 ? 14 : 7; x.moveTo(54, y); x.lineTo(54 + k, y); x.moveTo(1026, y); x.lineTo(1026 - k, y); }
    x.stroke();
    x.fillStyle = rgba(N, .7); const my = 330 + (Math.sin(t * .8) * .5 + .5) * 1100; x.beginPath(); x.moveTo(78, my); x.lineTo(88, my - 6); x.lineTo(88, my + 6); x.fill();
    const my2 = 330 + (Math.cos(t * .6) * .5 + .5) * 1100; x.beginPath(); x.moveTo(1002, my2); x.lineTo(992, my2 - 6); x.lineTo(992, my2 + 6); x.fill();
    x.restore();
  }
  function topBar(t, a) {
    if (a <= 0) return;
    x.save(); x.globalAlpha = a;
    x.fillStyle = N; x.fillRect(120, 279, 12, 12);
    mono(BRAND, 146, 286, { size: 28, color: TX, track: 3 });
    const sec = Math.min(t, DUR), ss = Math.floor(sec), cs = Math.floor((sec - ss) * 100);
    mono(`T+00:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`, 960, 286, { size: 28, align: 'right', color: DIM });
    x.fillStyle = rgba(TX, .14); x.fillRect(120, 312, 840, 2);
    x.fillStyle = N; x.fillRect(120, 312, 840 * clamp(t / DUR), 2);
    x.beginPath(); for (let i = 0; i <= 20; i++) { const X = 120 + i * 42; x.rect(X, 316, 1.5, i % 5 ? 5 : 10); } x.fillStyle = rgba(TX, .25); x.fill();
    x.restore();
  }

  // ── уголки прицела ──
  function brackets(R, arm, a, tag, tagR, full = 0) {
    if (a <= 0) return;
    const L = Math.min(arm, R.w / 2, R.h / 2);
    const Lx = mix(L, R.w / 2, full), Ly = mix(L, R.h / 2, full);
    neonStroke(() => {
      const { x: X, y: Y, w, h } = R;
      x.moveTo(X, Y + Ly); x.lineTo(X, Y); x.lineTo(X + Lx, Y);
      x.moveTo(X + w - Lx, Y); x.lineTo(X + w, Y); x.lineTo(X + w, Y + Ly);
      x.moveTo(X + w, Y + h - Ly); x.lineTo(X + w, Y + h); x.lineTo(X + w - Lx, Y + h);
      x.moveTo(X + Lx, Y + h); x.lineTo(X, Y + h); x.lineTo(X, Y + h - Ly);
    }, 3.2, a);
    if (tag) mono(tag, R.x, R.y - 26, { size: 28, color: N, alpha: a * (1 - full) });
    if (tagR) mono(tagR, R.x + R.w, R.y - 26, { size: 28, color: DIM, align: 'right', alpha: a * (1 - full) });
  }
  const lerpR = (A, B, p) => ({ x: mix(A.x, B.x, p), y: mix(A.y, B.y, p), w: mix(A.w, B.w, p), h: mix(A.h, B.h, p) });
  const pad = (R, p) => ({ x: R.x - p, y: R.y - p, w: R.w + 2 * p, h: R.h + 2 * p });
  function keyed(keys, t, lerp) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [ta, A] = keys[i - 1], [tb, B] = keys[i]; return lerp(A, B, E.inOut(prog(t, ta, tb))); }
    return keys[keys.length - 1][1];
  }

  // ── раскладка (считается один раз после замера предмета) ──
  let L = null;
  function layout() {
    // хук
    // длинную строку хука делим по словам, чтобы кегль оставался крупным
    let HOOK = [];
    HOOK0.forEach((s, i) => {
      const acc = i === HOOK0.length - 1 && HOOK0.length > 1;
      if (fit(s, 740, 132) < 96 && s.includes(' ') && HOOK0.length < 4) {
        const ws = s.split(' '); let best = 1, bd = 1e9;
        for (let k = 1; k < ws.length; k++) { const d = Math.abs(textW(ws.slice(0, k).join(' '), 100) - textW(ws.slice(k).join(' '), 100)); if (d < bd) { bd = d; best = k; } }
        HOOK.push({ s: ws.slice(0, best).join(' '), acc }, { s: ws.slice(best).join(' '), acc });
      } else HOOK.push({ s, acc });
    });
    HOOK = HOOK.slice(0, 5);
    if (!HOOK.some(h => h.acc) && HOOK.length > 1) HOOK[HOOK.length - 1].acc = true;
    const hs = Math.min(132, ...HOOK.map(h => fit(h.s, 740, 132))), hlh = hs * 1.1;
    const hTop = 840 - HOOK.length * hlh / 2;
    const hook = HOOK.map((h, i) => { const w = textW(h.s, hs); return { s: h.s, acc: h.acc, w, X: 540 - w / 2, Y: hTop + hlh * (i + .5) }; });
    const hW = Math.max(...hook.map(h => h.w));
    const hPad = Math.min(56, (840 - hW) / 2), Rhook = { x: 540 - hW / 2 - hPad, y: hTop - 46, w: hW + 2 * hPad, h: HOOK.length * hlh + 92 };
    // заголовок
    const hds = Math.min(80, ...HEAD.map(s => fit(s, 820, 80))), hdl = hds * 1.08;
    const head = HEAD.map((s, i) => { const w = textW(s, hds); return { s, w, X: 540 - w / 2, Y: 392 + hdl * i }; });
    const headBot = HEAD.length ? 392 + hdl * (HEAD.length - .5) : 340;
    // предмет по сценам
    const scanTop = headBot + 120, scanBot = 1400;
    const Pscan = { X: 540, Y: (scanTop + scanBot) / 2, bw: 600, bh: scanBot - scanTop };
    const Pcall = { X: 340, Y: 960, bw: 420, bh: 720 };
    const Pcar = { X: 540, Y: 820, bw: 560, bh: 600 };
    // цифры
    const n = Math.max(1, NUMS.length), ph = Math.min(300, 960 / n), nTop = 900 - n * ph / 2;
    const nums = NUMS.map((d, i) => {
      const s = num(d.число) + (d.плюс || '');
      return { d, Y: nTop + ph * (i + .5), r: ph * .3, size: Math.min(124, fit(s, 480, 124)) };
    });
    const Rnum = { x: 150, y: nTop - 10, w: 780, h: n * ph + 20 };
    // финал
    const cs = Math.min(140, ...CTA.map(s => fit(s, 640, 140))), clh = cs * 1.02;
    const ds = Math.min(52, fit(DOMAIN, 600, 52, 700, 2, MONO));
    const fh = CTA.length * clh + ds + 190, fTop = 880 - fh / 2;
    const Rfin = { x: 150, y: fTop, w: 780, h: fh };
    const cta = CTA.map((s, i) => ({ s, Y: fTop + 80 + clh * (i + .5) }));
    const domY = fTop + fh - 60 - ds / 2;
    L = { hs, hook, Rhook, hds, head, Pscan, Pcall, Pcar, nums, ph, Rnum, cs, cta, ds, domY, Rfin };
    // ключи предмета и прицела
    const Pk = (A, tt) => [tt, A];
    L.Pkeys = [Pk(Pscan, 0), Pk(Pscan, 4.5), Pk(Pcall, 5.05), Pk(Pcall, 7.2), Pk(Pcar, 7.75), Pk(Pcar, 15)];
    const core = Q => { const P = place(Q.X, Q.Y, Q.bw, Q.bh); return P.core; };
    L.Rkeys = [[0, { x: Rhook.x + 30, y: Rhook.y + 30, w: Rhook.w - 60, h: Rhook.h - 60 }], [.7, Rhook], [2.25, Rhook], [2.85, pad(core(Pscan), 30)], [4.5, pad(core(Pscan), 30)], [5.05, pad(core(Pcall), 26)],
      [7.2, pad(core(Pcall), 26)], [7.75, pad(core(Pcar), 28)], [10.45, pad(core(Pcar), 28)], [10.95, Rnum], [12.66, Rnum], [13.08, Rfin], [15, Rfin]];
  }
  const lerpQ = (A, B, p) => ({ X: mix(A.X, B.X, p), Y: mix(A.Y, B.Y, p), bw: mix(A.bw, B.bw, p), bh: mix(A.bh, B.bh, p) });

  // ── кадр ──
  const frame = t => {
    if (!IB) {
      measure(); layout();
      // прогрев буферов, чтобы превью не споткнулось на первом скане
      for (const w of [3.4, 7.8, 10.5]) { x.save(); frame(w); x.restore(); }
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    }
    const cam = { x: noise(3, t * .35) * 7, y: noise(5, t * .3) * 6 };
    const Q = keyed(L.Pkeys, t, lerpQ), P = place(Q.X + cam.x, Q.Y + cam.y, Q.bw, Q.bh);

    // ─ этапы предмета ─
    const T_SIL = 2.5, T_SCAN0 = 2.75, T_SCAN1 = 4.1, T_DS0 = 10.3, T_DS1 = 10.75, T_OFF = 10.98;
    const prodD = PRODS.length ? Math.min(.8, 2.7 / PRODS.length) : 0, prod0 = 7.6;
    const palAt = k => (k < 0 ? undefined : (PRODS[k] || {}).палитра);
    let item = null; // что рисовать
    if (t >= T_SIL - .05 && t < T_OFF) {
      // какая палитра и идёт ли смена
      let k = -1, sw = -1;
      for (let i = 0; i < PRODS.length; i++) { const ts = prod0 + i * prodD; if (t >= ts) k = i; if (t >= ts && t < ts + .34) sw = i; }
      const R0 = renderItem(B0, b0, t, palAt(k), P);
      let R1 = null;
      if (sw >= 0) R1 = renderItem(B1, b1, t, palAt(sw - 1), P);
      item = { R: R0, R1, sw, k };
    }

    background(t, cam, t > 12.7 ? mix(1, .38, E.inOut(prog(t, 12.7, 13.2))) : 1);
    const chromeA = 1 - E.inOut(prog(t, 12.7, 13.05));
    rulers(t, chromeA * .9);
    topBar(t, chromeA);

    x.save(); x.translate(cam.x, cam.y);

    // ═══ ХУК 0–2.6 ═══
    if (t < 2.75) {
      const n = L.hook.length;
      L.hook.forEach((h, i) => {
        const acc = h.acc;
        const gap = Math.min(.62, 1.75 / Math.max(1, n - 1)), t0 = i === 0 ? -1 : .12 + (i - 1) * gap, dur = Math.min(gap * .92, clamp(h.s.length * .045, .3, .58));
        const p = prog(t, t0, t0 + dur);
        const q = prog(t, 2.2 + i * .04, 2.42 + i * .04), sy = 1 - E.in(q) * .97;
        const col = acc ? N : TX;
        if (q < 1) {
          x.save(); x.translate(0, h.Y); x.scale(1, sy);
          if (acc || q > 0) glow(acc ? 26 : 30 * q, N, acc ? .55 : .6 * q);
          const tw = typeL(h.s, h.X, 0, p, { size: L.hs, color: q > 0 ? mixColor(col, N, q) : col });
          unglow();
          if (p < 1 && q === 0) ghostT(h.s, h.X, 0, L.hs, acc ? .62 : .5, h.X + tw + 2);
          unglow(); x.restore();
        }
        // курсор у печатаемой строки
        const typing = p > 0 && p < 1, last = i === n - 1 && p >= 1;
        if ((typing || last) && q === 0) {
          const k = Math.floor(p * h.s.length), w = textW(h.s.slice(0, k), L.hs);
          cursor(h.X + w, h.Y, L.hs * .82, t);
        }
      });
      // схлопывание строк в луч
      const m = E.inOut(prog(t, 2.42, 2.75));
      const beamY0 = place(L.Pscan.X, L.Pscan.Y, L.Pscan.bw, L.Pscan.bh).core.y - 40;
      if (t > 2.3) L.hook.forEach((h, i) => {
        const q = prog(t, 2.2 + i * .04, 2.42 + i * .04); if (q < .7) return;
        const y = mix(h.Y, beamY0, m), half = mix(h.w / 2, 540, m);
        beam(y, clamp((q - .7) / .3) * (1 - m * .3), 'y', 540 - half, 540 + half);
      });
    }

    // ═══ ЗАГОЛОВОК 2.75–4.7 ═══
    if (t > 2.7 && t < 4.75) L.head.forEach((h, i) => {
      const p = prog(t, 2.8 + i * .26, 3.15 + i * .26), q = prog(t, 4.42 + i * .04, 4.62 + i * .04);
      if (q >= 1) return;
      const acc = i === HACC;
      x.save(); x.translate(0, h.Y); x.scale(1, 1 - E.in(q) * .96);
      if (acc) glow(22, N, .5);
      const tw = typeL(h.s, h.X, 0, p, { size: L.hds, color: q > 0 ? mixColor(acc ? N : TX, N, q) : (acc ? N : TX) });
      unglow();
      if (p < 1) ghostT(h.s, h.X, 0, L.hds, .4 * E.out(prog(t, 2.72 + i * .08, 2.95 + i * .08)), h.X + tw + 2);
      x.restore();
      if (p > 0 && p < 1) { const w = textW(h.s.slice(0, Math.floor(p * h.s.length)), L.hds); cursor(h.X + w, h.Y, L.hds * .8, t); }
    });

    x.restore(); // предмет и лучи — в экранных координатах (камера уже в P)

    // ═══ ПРЕДМЕТ ═══
    if (item) {
      const R = item.R;
      const needWire = t < T_SCAN1 + .05 || (t > T_DS0 - .05);
      if (needWire) buildWire(B0, R, P);
      fadeMask(b0, R, P); if (item.R1) fadeMask(b1, R, P);
      if (t < T_SCAN1) {
        // каркас проявляется, луч сверху вниз делает предмет настоящим
        const by = mix(P.core.y - 40, P.core.y + P.core.h + 60, E.inOut(prog(t, T_SCAN0, T_SCAN1)));
        const wa = E.out(prog(t, T_SIL, T_SIL + .3));
        x.save(); x.beginPath(); x.rect(0, by, W, H); x.clip(); drawWire(R, wa); x.restore();
        if (t > T_SCAN0) {
          x.save(); x.beginPath(); x.rect(0, 0, W, by); x.clip(); x.drawImage(B0, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); x.restore();
          trail(R, by, 220, 1, 'y', .5);
        }
        const ba = t < T_SCAN0 ? E.out(prog(t, 2.6, T_SCAN0)) : 1 - E.in(prog(t, T_SCAN1 - .15, T_SCAN1));
        beam(by, ba, 'y', 0, W);
        // проценты скана у луча
        if (t > T_SCAN0) {
          const pc = Math.round(prog(by, P.core.y - 40, P.core.y + P.core.h + 60) * 100);
          mono(`SCAN ${String(pc).padStart(3, ' ')}%`, 958, by - 22, { size: 28, color: N, align: 'right', alpha: ba });
          mono(`Y ${Math.round(by)}`, 122, by - 22, { size: 28, color: DIM, alpha: ba });
        }
      } else if (t < T_DS0) {
        if (item.sw >= 0) {
          // смена товара: вертикальный луч слева направо перекрашивает предмет
          const ts = prod0 + item.sw * prodD, bx = mix(P.core.x - 50, P.core.x + P.core.w + 50, E.inOut(prog(t, ts, ts + .34)));
          x.save(); x.beginPath(); x.rect(0, 0, bx, H); x.clip(); x.drawImage(B0, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); x.restore();
          x.save(); x.beginPath(); x.rect(bx, 0, W - bx, H); x.clip(); x.drawImage(B1, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); x.restore();
          buildWire(B1, R, P); trail(R, bx, 130, 1, 'x', .55);
          beam(bx, Math.sin(Math.PI * prog(t, ts, ts + .34)), 'x', P.core.y - 120, P.core.y + P.core.h + 120);
        } else x.drawImage(B0, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h);
      } else {
        // обратный скан снизу вверх: предмет снова становится каркасом и гаснет
        const by = mix(P.core.y + P.core.h + 60, P.core.y - 60, E.inOut(prog(t, T_DS0, T_DS1)));
        const wa = 1 - E.inOut(prog(t, T_DS1 - .05, T_OFF));
        x.save(); x.beginPath(); x.rect(0, 0, W, by); x.clip(); x.drawImage(B0, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); x.restore();
        x.save(); x.beginPath(); x.rect(0, by, W, H); x.clip(); drawWire(R, wa); x.restore();
        if (t < T_DS1) trail(R, by, 200, -1, 'y', .5);
        beam(by, Math.sin(Math.PI * prog(t, T_DS0, T_DS1 + .05)), 'y', 0, W);
      }
    }

    x.save(); x.translate(cam.x, cam.y);
    const Pc = { ...P, core: { ...P.core, x: P.core.x - cam.x, y: P.core.y - cam.y } };

    // ═══ ВЫНОСКИ 4.7–7.4 ═══
    if (t > 4.6 && t < 7.5) {
      // подзаголовок строкой терминала
      if (S.подзаголовок) {
        const wf = wrapFit('// ' + S.подзаголовок, 820, 34, 700, MONO, 2, 28), o = 1 - E.inOut(prog(t, 7.1, 7.4));
        wf.lines.forEach((s, i) => { const p = prog(t, 4.85 + i * .45, 5.3 + i * .45); typeL(s, 130, 420 + i * wf.size * 1.45, p, { size: wf.size, weight: 700, font: MONO, color: DIM, alpha: o }); });
      }
      const n = CALL.length, sp = Math.min(300, 900 / Math.max(1, n));
      CALL.forEach((s, i) => {
        const ts = 5.05 + i * .32, out = prog(t, 7.05 + i * .05, 7.35 + i * .05);
        const ly = 950 + (i - (n - 1) / 2) * sp;
        const ax = Pc.core.x + Pc.core.w * (.58 + .12 * ((i + 1) % 2)), ay = Pc.core.y + Pc.core.h * (n > 1 ? .18 + .64 * i / (n - 1) : .5);
        const pts = [[ax, ay], [560, ly], [592, ly]];
        const pl = E.out(prog(t, ts + .08, ts + .42)) * (1 - E.in(out));
        // точка-якорь с расходящимся кольцом
        const da = E.out(prog(t, ts, ts + .15)) * (1 - out);
        if (da > 0) {
          x.save(); x.globalAlpha = da; glow(12); x.fillStyle = N; x.beginPath(); x.arc(ax, ay, 6, 0, 7); x.fill(); unglow();
          const rp = (t - ts) % 1.4 / 1.4; x.strokeStyle = rgba(N, (1 - rp) * .7); x.lineWidth = 2; x.beginPath(); x.arc(ax, ay, 8 + rp * 26, 0, 7); x.stroke(); x.restore();
        }
        if (pl > 0) neonStroke(() => poly(pts, pl), 2.2, 1);
        const tp = prog(t, ts + .38, ts + .8), ta = 1 - E.in(out);
        if (tp > 0 && ta > 0) {
          mono(`0${i + 1}`, 604, ly - 52, { size: 28, color: N, alpha: ta });
          x.fillStyle = rgba(N, .5 * ta); x.fillRect(652, ly - 53, 40 * E.out(tp), 2);
          const { lines: ls, size } = wrapFit(s, 356, 50, 700, undefined, 2, 34);
          ls.forEach((ln, j) => typeL(ln, 604, ly + j * size * 1.1, prog(tp, j * .4, j * .4 + .6), { size, weight: 700, color: TX, alpha: ta }));
        }
      });
    }

    // ═══ КАРУСЕЛЬ 7.6–10.5 ═══
    if (PRODS.length && t > 7.45 && t < 10.6) {
      const o = E.out(prog(t, 7.45, 7.75)) * (1 - E.inOut(prog(t, 10.25, 10.55)));
      let k = 0; for (let i = 0; i < PRODS.length; i++) if (t >= prod0 + i * prodD) k = i;
      const pr = PRODS[k], ts = prod0 + k * prodD, next = prod0 + (k + 1) * prodD;
      const erase = k < PRODS.length - 1 ? prog(t, next - .14, next) : prog(t, 10.25, 10.45);
      const typ = prog(t, ts + .04, ts + .36) * (1 - erase);
      const by = Pc.core.y + Pc.core.h + 28;
      mono(`ID ${String(k + 1).padStart(2, '0')}/${String(PRODS.length).padStart(2, '0')}`, 540, by + 30, { size: 28, color: N, align: 'center', alpha: o, track: 4 });
      const nm = U(pr.имя || ''), ns = Math.min(84, fit(nm, 780, 84));
      const nw = textW(nm, ns);
      typeL(nm, 540 - nw / 2, by + 96, typ, { size: ns, color: TX, alpha: o });
      // цена: цифры «расшифровываются»
      const price = String(pr.цена || ''), pp = prog(t, ts + .12, ts + .5), po = o * (1 - erase);
      let ps = ''; for (let j = 0; j < price.length; j++) { const ch = price[j]; ps += pp >= (j + 1) / price.length || !/\d/.test(ch) ? ch : String(Math.floor(hash(j * 13 + Math.floor(t * 24)) * 10)); }
      const pw = textW(ps, 48, 700, 2, MONO);
      if (pp > 0) { x.save(); glow(16, N, .5); T(ps, 540, by + 172, { size: 48, weight: 700, font: MONO, color: N, track: 2, alpha: po * clamp(pp * 3) }); unglow(); x.restore(); }
      x.fillStyle = rgba(N, .45 * po); x.fillRect(540 - pw / 2 - 30, by + 172, 18 * E.out(pp), 2); x.fillRect(540 + pw / 2 + 12, by + 172, 18 * E.out(pp), 2);
      // ячейки карусели
      const n = PRODS.length, cw = 70, gap = 26, tw = n * cw + (n - 1) * gap, sx = 540 - tw / 2, sy = 1440;
      const kf = (() => { let v = 0; for (let i = 1; i < n; i++) v += E.inOut(prog(t, prod0 + i * prodD, prod0 + i * prodD + .34)); return v; })();
      PRODS.forEach((p2, i) => {
        const X = sx + i * (cw + gap), pal = p2.палитра, hx = pal && Object.values(pal).filter(isHex);
        x.save(); x.globalAlpha = o * (i === k ? 1 : .55);
        x.strokeStyle = rgba(TX, .3); x.lineWidth = 1.5; x.strokeRect(X, sy - 22, cw, 44);
        if (hx && hx.length) { [0, 2, 4].forEach((q2, j) => { x.fillStyle = hx[q2 % hx.length]; x.fillRect(X + 10 + j * 18, sy - 8, 14, 16); }); }
        else mono(String(i + 1).padStart(2, '0'), X + cw / 2, sy, { size: 26, align: 'center', color: TX });
        x.restore();
      });
      const hxX = sx + kf * (cw + gap);
      x.save(); x.globalAlpha = o; neonStroke(() => x.rect(hxX - 5, sy - 27, cw + 10, 54), 2.4, 1); x.restore();
      // код палитры столбиком справа от предмета
      const pal = pr.палитра, hx = pal ? Object.values(pal).filter(isHex).slice(0, 4) : [];
      const hx0 = Math.min(Pc.core.x + Pc.core.w + 52, 846), hy0 = Pc.core.y + 64;
      if (hx.length && hx0 < 900) {
        mono('RGB', hx0, hy0 - 6, { size: 28, color: N, alpha: o, track: 2 });
        hx.forEach((h, j) => {
          const pj = E.out(prog(t, ts + .1 + j * .06, ts + .3 + j * .06)) * (1 - erase), Y = hy0 + 48 + j * 56;
          x.save(); x.globalAlpha = o * clamp(pj * 2); x.fillStyle = h; x.fillRect(hx0, Y - 20, 40 * pj, 40); x.strokeStyle = rgba(TX, .35); x.lineWidth = 1.5; x.strokeRect(hx0 + .5, Y - 19.5, 39, 39); x.restore();
        });
      }
    }

    // ═══ ЦИФРЫ 10.7–12.9 ═══
    if (NUMS.length && t > 10.6 && t < 13.12) {
      L.nums.forEach((nn, i) => {
        const ts = 10.9 + i * .2, a = E.out(prog(t, ts, ts + .3)), out = E.inOut(prog(t, 12.7 + i * .05, 13.0 + i * .05));
        const cv = E.out5(prog(t, ts + .1, ts + 1.15)), cp = cv * (1 - out), A = a * (1 - out);
        if (A <= 0) return;
        const cx = 290, cy = nn.Y, r = nn.r;
        // шкала-кольцо
        x.save(); x.globalAlpha = A;
        x.beginPath(); for (let j = 0; j < 60; j++) { const an = j / 60 * Math.PI * 2 - Math.PI / 2, k1 = j % 5 ? r + 14 : r + 20; x.moveTo(cx + Math.cos(an) * (r + 8), cy + Math.sin(an) * (r + 8)); x.lineTo(cx + Math.cos(an) * k1, cy + Math.sin(an) * k1); }
        x.strokeStyle = rgba(TX, .22); x.lineWidth = 2; x.stroke();
        x.beginPath(); x.arc(cx, cy, r, 0, 7); x.strokeStyle = rgba(N, .14); x.lineWidth = 10; x.stroke();
        x.save(); x.translate(cx, cy); x.rotate(t * .9 * (i % 2 ? -1 : 1)); x.setLineDash([6, 10]); x.beginPath(); x.arc(0, 0, r * .72, 0, 7); x.strokeStyle = rgba(N, .35); x.lineWidth = 2; x.stroke(); x.restore();
        glow(18, N, .7); x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cp); x.strokeStyle = N; x.lineWidth = 10; x.lineCap = 'round'; if (cp > .001) x.stroke(); unglow();
        const ea = -Math.PI / 2 + Math.PI * 2 * cp; x.fillStyle = '#fff'; if (cp > .001) { x.beginPath(); x.arc(cx + Math.cos(ea) * r, cy + Math.sin(ea) * r, 4, 0, 7); x.fill(); }
        x.restore();
        mono(String(Math.round(cp * 100)).padStart(2, '0') + '%', cx, cy, { size: 28, color: N, align: 'center', alpha: A });
        // число и подпись
        const sNum = num(nn.d.число * cv), plus = nn.d.плюс || '';
        const w = T(sNum, 430, cy - 18, { size: nn.size, color: TX, align: 'left', alpha: A });
        if (plus) { x.save(); glow(16, N, .6); T(plus, 430 + w + 4, cy - 18, { size: nn.size, color: N, align: 'left', alpha: A * cv }); unglow(); x.restore(); }
        typeL(U(nn.d.подпись || ''), 434, cy + nn.size * .5 + 8, prog(t, ts + .25, ts + .8), { size: 28, weight: 700, font: MONO, color: DIM, alpha: A, track: 1 });
        if (i < L.nums.length - 1) { x.fillStyle = rgba(TX, .12 * A); x.fillRect(160, cy + L.ph / 2, 760 * E.out(prog(t, ts + .2, ts + .8)), 1.5); }
      });
    }

    // ═══ ФИНАЛ 12.8–15 ═══
    const R = keyed(L.Rkeys, t, lerpR);
    const full = E.inOut(prog(t, 12.98, 13.45));
    if (t > 12.8) {
      const fa = E.out(prog(t, 12.9, 13.2)), Rf = L.Rfin, breathe = .85 + .15 * Math.sin(t * 3.2);
      // мягкая подсветка внутри рамки
      x.save(); x.globalAlpha = fa * full; const ig = x.createLinearGradient(0, Rf.y, 0, Rf.y + Rf.h); ig.addColorStop(0, rgba(N, .09)); ig.addColorStop(1, rgba(N, .02)); x.fillStyle = ig; x.fillRect(Rf.x, Rf.y, Rf.w, Rf.h); x.restore();
      if (full > .99) { x.save(); glow(30 * breathe, N, .5); x.strokeStyle = rgba(N, .9); x.lineWidth = 2; x.strokeRect(Rf.x, Rf.y, Rf.w, Rf.h); unglow(); x.restore(); }
      // призыв: оседает и проявляется лучом
      const by = mix(Rf.y, Rf.y + Rf.h, E.out(prog(t, 12.96, 13.56)));
      x.save(); x.beginPath(); x.rect(Rf.x, Rf.y, Rf.w, by - Rf.y); x.clip();
      L.cta.forEach((c2, i) => {
        const e = E.expo(prog(t, 12.98 + i * .1, 13.8 + i * .1)), acc = i === L.cta.length - 1 && L.cta.length > 1;
        x.save(); if (acc) glow(28, N, .6);
        T(c2.s, 540, c2.Y + (1 - e) * 34, { size: L.cs, color: acc ? N : TX, alpha: e });
        unglow(); x.restore();
      });
      x.restore();
      if (t < 13.66) beam(by, Math.sin(Math.PI * prog(t, 12.96, 13.63)), 'y', Rf.x - 60, Rf.x + Rf.w + 60);
      // разделитель и домен
      const dl = E.out(prog(t, 13.5, 13.9)), dvY = L.domY - L.ds / 2 - 34;
      x.fillStyle = rgba(N, .45); x.fillRect(540 - 300 * dl, dvY, 600 * dl, 2);
      const dw = textW(DOMAIN, L.ds, 700, 2, MONO), dp = prog(t, 13.6, 14.1);
      x.save(); glow(18, N, .55); const wd = typeL(DOMAIN, 540 - dw / 2, L.domY, dp, { size: L.ds, weight: 700, font: MONO, color: N, track: 2 }); unglow(); x.restore();
      if (dp > 0) cursor(540 - dw / 2 + wd, L.domY, L.ds * .9, t);
      // бренд над рамкой, кнопка под ней
      const ba = E.out(prog(t, 13.3, 13.8));
      mono(BRAND, 540, Rf.y - 40, { size: 28, color: DIM, align: 'center', alpha: ba, track: 6 });
      if (S.кнопка) mono('▸ ' + U(S.кнопка), 540, Rf.y + Rf.h + 48, { size: 28, color: TX, align: 'center', alpha: E.out(prog(t, 13.85, 14.35)), track: 2 });
    }

    // ═══ ПРИЦЕЛ — сквозь весь ролик ═══
    const sceneTag = t < 2.4 ? ['◉ SIGNAL', ''] : t < 4.15 ? [null, null] : t < 4.55 ? ['◉ TARGET', ''] : t < 7.3 ? ['◉ ANALYSIS', `${CALL.length} PTS`] : t < 10.5 ? ['◉ CATALOG', ''] : t < 12.7 ? ['◉ METRICS', ''] : ['', ''];
    const bA = E.out(prog(t, -.3, .35)) * (t > 12.65 && t < 13.15 ? .75 + .25 * Math.abs(Math.cos((t - 12.65) * 6.3)) : 1);
    brackets(R, mix(46, 64, E.out(prog(t, 0, .6))), bA, sceneTag[0], sceneTag[1] === null ? null : sceneTag[1] || `${Math.round(R.x)}:${Math.round(R.y)}`, full);

    x.restore();
  };
  window.КАДР = frame;
})();

  },
  morf() {
// СТИЛЬ «МОРФ»: весь ролик — один непрерывный контейнер, который без склеек перетекает из формы в форму.
// капсула с лого → (слова хука втягиваются) → окно браузера с сайтом → карточка товара (перекрашивается)
// → делится на таблетки-цифры (жидкие перемычки) → сливается в кнопку призыва → от неё отрывается капля с доменом.
// Всё содержимое рождается внутри контейнера или уходит в него. Тексты/цвета/цифры только из САЙТ.
window.ИМЯ = 'morf';
DUR = 15;
FONT = САЙТ.шрифт || FONT;

(() => {
  const S = САЙТ, C = S.цвета || {};
  // ── цвет ──
  const hx = h => '#' + hex2rgb(h).map(v => v.toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b), q = clamp(p); return '#' + A.map((v, i) => Math.round(mix(v, B[i], q)).toString(16).padStart(2, '0')).join(''); };
  const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const BG = hx(C.фон || '#0a0a0a'), CARD = hx(C.карта || mixHex(BG, '#808080', .12));
  const TX = hx(C.текст || (lum(BG) < .4 ? '#ffffff' : '#111111')), GR = hx(C.серый || mixHex(TX, BG, .45)), ACC = hx(C.акцент || '#6EC1F0');
  const DARK = S.тема ? !/свет/i.test(S.тема) : lum(BG) < .4;
  // акцент как цвет текста: если сливается с фоном/картой — темним к цвету текста
  let ACCT = ACC; for (let p = .15; p <= .9 && (contrast(ACCT, CARD) < 2.6 || contrast(ACCT, BG) < 2.6); p += .1) ACCT = mixHex(ACC, TX, p);
  const ON = contrast('#ffffff', ACC) >= 3.2 ? '#ffffff' : '#0b0b0b'; // текст на акценте
  const U = s => (S.капс ? String(s).toUpperCase() : String(s));
  const sm = p => p * p * (3 - 2 * p);
  // мягкий морф формы: экспонента в обе стороны (быстро в середине, бархатно на краях)
  const eio = p => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
  const soft = p => mix(E.inOut(p), eio(p), .55);

  // ── время ──
  const TL = {
    // сайт сжат на ~0,6 с, чтобы каждый товар держался дольше (~0,85 с)
    absorb: 1.45, cap: [1.98, 2.75], bar: 2.2, type: [2.5, 3.1], head: 3.1,
    item: 3.8, cur1: [4.08, 4.52], click1: 4.64, w2c: [4.8, 5.58],
    prod: [5.58, 8.98], split: [8.95, 9.55], count: 9.02, adv: 10.85,
    merge: [11.72, 12.38], cta: 12.05, drop: [12.5, 13.25], cur2: [13.25, 13.8], click2: 13.92,
  };

  // ── раскладка (считается один раз) ──
  let L = null;
  const box = (x0, y0, w, h, r) => ({ x: x0, y: y0, w, h, r });
  const lerpBox = (a, b, p) => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p), r: mix(a.r, b.r, p) });
  const top = b => b.y - b.h / 2, bot = b => b.y + b.h / 2;
  function wrap(s, maxW, size, weight, track = 0) {
    const out = []; let cur = '';
    for (const w of String(s).split(' ').filter(Boolean)) { const tryS = cur ? cur + ' ' + w : w; if (cur && textW(tryS, size, weight, track) > maxW) { out.push(cur); cur = w; } else cur = tryS; }
    if (cur) out.push(cur); return out;
  }
  // строки → ряды: длинная строка переносится, кегль подбирается под ширину и высоту; src = номер исходной строки (для акцента)
  function block(lines, maxW, maxS, maxH, weight, track, minS = 44) {
    // строки автора держим, пока кегль не мельче 2/3 максимума
    const keep = Math.min(maxS, maxH / lines.length, ...lines.map(r => fit(r, maxW, maxS, weight, track)));
    if (keep >= maxS * .66) return { size: keep, rows: lines.slice(), src: lines.map((_, i) => i) };
    let last;
    for (let s = maxS; s >= minS; s -= 2) {
      const rows = [], src = [];
      lines.forEach((ln, i) => wrap(ln, maxW, s, weight, track).forEach(r => { rows.push(r); src.push(i); }));
      last = { size: s, rows, src };
      if (rows.length * s <= maxH && rows.every(r => textW(r, s, weight, track) <= maxW)) return last;
    }
    last.size = Math.min(minS, ...last.rows.map(r => fit(r, maxW, minS, weight, track))); return last;
  }
  function words(B, weight, track, y0, pitch) {
    return B.rows.map((ln, li) => {
      const ws = ln.split(' ').filter(Boolean), widths = ws.map(w => textW(w, B.size, weight, track)), sp = textW(' ', B.size, weight, track);
      return { li, src: B.src[li], y: y0 + li * pitch, ws, widths, sp };
    });
  }
  function layout() {
    const l = {};
    // лого
    l.brand = U(S.бренд || S.домен || ''); l.tail = S.хвостЛого || '';
    l.logoSize = Math.min(46, fit(l.brand + l.tail, 560, 46, 800, 2));
    l.logoW = textW(l.brand, l.logoSize, 800, 2) + (l.tail ? textW(l.tail, l.logoSize, 800, 2) : 0) + 40;
    // хук
    const hook = (S.хук && S.хук.length ? S.хук : S.заголовок || [S.бренд]).map(U);
    const HB = block(hook, 830, 150, 560, 800, -2), hs = HB.size;
    l.hookSize = hs; l.hookPitch = hs * 1.0;
    const hookTop = 985 - HB.rows.length * l.hookPitch / 2; // группа «капсула + хук» по центру кадра, низ не пустой
    l.hook = words(HB, 800, -2, hookTop + l.hookPitch / 2, l.hookPitch);
    l.hookAcc = S.хукАкцент ?? (hook.length > 1 ? hook.length - 1 : -1);
    l.CAP = box(540, hookTop - 118, l.logoW + 108, 116, 58);
    // окно браузера
    l.WIN = box(540, 905, 880, 1170, 54);
    const head = (S.заголовок || []).map(U);
    const FB = block(head.length ? head : [l.brand], 760, 112, 390, 800, -2, 40), fs = FB.size;
    l.headSize = fs; l.headPitch = fs * 1.02;
    l.headTop = 168 + fs / 2; // от верха окна
    l.head = words(FB, 800, -2, l.headTop, l.headPitch);
    l.headAcc = S.акцентСтрока ?? -1;
    l.nHeadWords = l.head.reduce((n, r) => n + r.ws.length, 0);
    l.subSize = 34; l.sub = S.подзаголовок ? wrap(S.подзаголовок, 680, 34, 500) : [];
    if (l.sub.length > 3) { l.subSize = 30; l.sub = wrap(S.подзаголовок, 720, 30, 500); }
    if (l.sub.length > 3) { l.sub = l.sub.slice(0, 3); let z = l.sub[2]; while (z.includes(' ') && textW(z + '…', 30, 500) > 720) z = z.slice(0, z.lastIndexOf(' ')); l.sub[2] = z.replace(/[,.;:—-]+$/, '') + '…'; }
    l.subTop = l.headTop + (FB.rows.length - .5) * l.headPitch + 58; l.subPitch = Math.round(l.subSize * 1.36);
    l.btnText = S.кнопка || (S.призыв || []).join(' ');
    l.btnSize = Math.min(38, fit(l.btnText, 560, 38, 700));
    l.btnW = textW(l.btnText, l.btnSize, 700) + 110; l.btnH = 104;
    l.btnY = l.subTop + l.sub.length * l.subPitch + 56 + l.btnH / 2 - 23; // от верха окна
    l.itemHeroY = Math.max(l.btnY + l.btnH / 2 + 200, 1170 - 200); // от верха окна
    l.itemHeroS = 158;
    // карточка товара
    l.CARD = box(540, 905, 700, 1000, 62);
    l.goods = (S.товары || []).slice(0, 6);
    // таблетки
    const nums = S.цифры || [], adv = S.преимущества || [];
    l.N = clamp(Math.max(nums.length, nums.length ? 0 : adv.length), 1, 4);
    const ph = l.N <= 3 ? 214 : 176, gap = 40, tot = l.N * ph + (l.N - 1) * gap;
    l.PILL = []; l.SLICE = [];
    const ct = top(l.CARD), sh = l.CARD.h / l.N;
    for (let i = 0; i < l.N; i++) {
      l.PILL.push(box(540, 905 - tot / 2 + ph / 2 + i * (ph + gap), 800, ph, ph / 2));
      const a = Math.max(ct, ct + i * sh - 64), b = Math.min(ct + l.CARD.h, ct + (i + 1) * sh + 64);
      l.SLICE.push(box(540, (a + b) / 2, l.CARD.w, b - a, l.CARD.r));
    }
    l.nums = nums; l.adv = adv;
    // кнопка призыва
    const cta = (S.призыв && S.призыв.length ? S.призыв : [S.кнопка || S.домен]).map(U);
    const one = cta.join(' '); let cs = fit(one, 610, 72, 800, -1);
    if (cs >= 46 || cta.length < 2) { l.cta = [one]; l.ctaSize = Math.min(72, cs); } else { l.cta = cta; l.ctaSize = Math.min(58, ...cta.map(s => fit(s, 610, 58, 800, -1))); }
    const cw = Math.max(...l.cta.map(s => textW(s, l.ctaSize, 800, -1)));
    const bh = l.cta.length > 1 ? 240 : 188;
    l.BTN = box(540, 905, clamp(cw + 160, 560, 770), bh, bh / 2);
    l.dom = S.домен || '';
    l.domSize = Math.min(44, fit(l.dom, 560, 44, 600));
    const dw = textW(l.dom, l.domSize, 600) + 140;
    l.DROP0 = box(540, 905 + bh / 2 - 64, dw, 96, 48);
    l.DROP = box(540, 905 + bh / 2 + 112, dw, 96, 48);
    return l;
  }

  // ── вход/уход содержимого: из размытия снизу, в размытие вверх ──
  function vis(t, a, b, din = .42, dout = .28) {
    if (t < a || (b != null && t > b + dout)) return null;
    const pi = E.out5(prog(t, a, a + din)), po = b == null ? 0 : E.in(prog(t, b, b + dout));
    const al = pi * (1 - po); if (al <= .003) return null;
    return { a: al, blur: (1 - pi) * 16 + po * 12, dy: (1 - pi) * 34 - po * 40, p: pi, o: po };
  }

  // ── контейнер ──
  function shapePath(b) { rr(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, Math.max(0, Math.min(b.r, b.w / 2, b.h / 2))); }
  function drawBox(b, fill, o = {}) {
    x.save();
    if (o.glow) { shadow(o.glow, rgba(ACC, DARK ? .45 : .35), 0); shapePath(b); x.fillStyle = fill; x.fill(); }
    shadow(o.sh ?? 80, DARK ? 'rgba(0,0,0,.6)' : 'rgba(20,22,30,.16)', 26);
    if (!o.noFill) { shapePath(b); x.fillStyle = fill; x.fill(); } noShadow();
    if (o.onlyFill) { x.restore(); return; }
    // мягкий верхний свет
    const tp = top(b), g = x.createLinearGradient(0, tp, 0, tp + Math.min(b.h, 240));
    g.addColorStop(0, rgba('#ffffff', (DARK ? .075 : .45) * (o.sheen ?? 1))); g.addColorStop(1, rgba('#ffffff', 0));
    shapePath(b); x.fillStyle = g; x.fill();
    if (!o.noEdge) {
      x.lineWidth = 1.6; x.strokeStyle = rgba(TX, (DARK ? .11 : .08) * (o.edge ?? 1)); shapePath(b); x.stroke();
      // блик бежит по грани
      const gp = o.glint ?? -1;
      if (gp >= 0 && gp <= 1) {
        const gx = mix(b.x - b.w / 2 - 300, b.x + b.w / 2 + 300, gp), lg = x.createLinearGradient(gx - 260, 0, gx + 260, 0);
        lg.addColorStop(0, rgba('#ffffff', 0)); lg.addColorStop(.5, rgba(DARK ? '#ffffff' : ACC, DARK ? .5 : .55)); lg.addColorStop(1, rgba('#ffffff', 0));
        x.lineWidth = 2.2; x.strokeStyle = lg; shapePath(b); x.stroke();
      }
    }
    x.restore();
  }
  // жидкая перемычка между двумя капсулами (A сверху, B снизу)
  function bridge(A, B, fill, gmax = 38) {
    const gap = top(B) - bot(A); if (gap >= gmax) return;
    const k = clamp(gap / gmax), rA = Math.min(A.r, A.h / 2), rB = Math.min(B.r, B.h / 2);
    let bh = Math.min(A.w / 2 - rA * .7, B.w / 2 - rB * .7) * (1 - .45 * k); if (bh <= 4) return;
    const yA = bot(A) - Math.min(rA, A.h / 2) * .55, yB = top(B) + Math.min(rB, B.h / 2) * .55, ym = (Math.max(yA, bot(A)) + Math.min(yB, top(B))) / 2;
    const c = mix(bh, -bh, Math.pow(k, .8)), cx = (A.x + B.x) / 2;
    x.save(); x.beginPath();
    x.moveTo(A.x - bh, yA); x.quadraticCurveTo(cx - c, ym, B.x - bh, yB);
    x.lineTo(B.x + bh, yB); x.quadraticCurveTo(cx + c, ym, A.x + bh, yA); x.closePath();
    x.fillStyle = fill; x.fill(); x.restore();
  }
  const clipTo = b => { shapePath(b); x.clip(); };

  // ── слова, входящие по одному с перецентровкой строки ──
  function kinetic(rows, t, t0, step, o) {
    let k = 0;
    for (const r of rows) {
      const ps = r.ws.map((_, i) => { const tk = t0 + (k + i) * step; return { tk, p: E.out5(prog(t, tk, tk + .5)) }; });
      const cur = r.widths.reduce((s, w, i) => s + (w + (i ? r.sp : 0)) * ps[i].p, 0);
      let xx = o.cx - cur / 2;
      const ex = o.exit != null ? vis(t, -1, o.exit + r.li * .05, .01) : null;
      r.ws.forEach((w, i) => {
        const p = ps[i].p, ww = (r.widths[i] + (i ? r.sp : 0)) * p;
        if (i) xx += r.sp * p;
        if (p > .002 && (o.exit == null || ex)) {
          const acc = r.src === o.acc, fin = acc ? ACCT : TX;
          const col = p > .995 ? fin : mixHex(ACCT, fin, sm(p));
          const eAl = ex ? ex.a : 1, eBl = ex ? ex.blur : 0, eDy = ex ? ex.dy : 0;
          x.save(); x.translate(xx + r.widths[i] * p / 2, o.y0 + r.y + (1 - p) * 40 + eDy); const sc = .9 + .1 * p; x.scale(sc, sc);
          T(w, 0, 0, { size: o.size, weight: 800, color: col, track: o.track, alpha: p * eAl, blur: (1 - p) * 18 + eBl });
          x.restore();
        }
        xx += r.widths[i] * p;
      });
      k += r.ws.length;
    }
  }

  // ── курсор ──
  function cursor(X, Y, sc, a) {
    if (a <= .01) return;
    x.save(); x.globalAlpha *= a; x.translate(X, Y); x.scale(sc * 1.25, sc * 1.25);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 40); x.lineTo(10, 31); x.lineTo(17, 46); x.lineTo(24, 43); x.lineTo(17, 28.5); x.lineTo(29, 28.5); x.closePath();
    shadow(18, 'rgba(0,0,0,.35)', 6); x.fillStyle = DARK ? '#ffffff' : '#111111'; x.fill(); noShadow();
    x.lineWidth = 2.4; x.lineJoin = 'round'; x.strokeStyle = DARK ? '#111111' : '#ffffff'; x.stroke();
    x.restore();
  }
  function ring(X, Y, t, tc) {
    const p = prog(t, tc, tc + .55); if (p <= 0 || p >= 1) return;
    x.save(); x.beginPath(); x.arc(X, Y, 20 + 90 * E.out(p), 0, 7); x.lineWidth = 3; x.strokeStyle = rgba(ACC, .8 * (1 - p)); x.stroke(); x.restore();
  }
  const arcPath = (t, a, b, P0, P1, hump = 60) => { const p = E.out5(prog(t, a, b)); return [mix(P0[0], P1[0], p), mix(P0[1], P1[1], p) - Math.sin(p * Math.PI) * hump]; };

  // ── фон: туман цвета акцента + тонкая сетка ──
  function background(t, cam, fog) {
    x.fillStyle = BG; x.fillRect(0, 0, W, H);
    // сетка с параллаксом
    const sp = 96 * mix(1, cam.z, .35), ox = ((-(cam.cx - 540) * .3 * cam.z) % sp + sp) % sp, oy = ((-(cam.cy - 900) * .3 * cam.z - t * 9) % sp + sp) % sp;
    x.save(); x.lineWidth = 1; x.strokeStyle = rgba(TX, DARK ? .055 : .07); x.beginPath();
    for (let gx = ox - sp; gx < W + sp; gx += sp) { x.moveTo(gx, 0); x.lineTo(gx, H); }
    for (let gy = oy - sp; gy < H + sp; gy += sp) { x.moveTo(0, gy); x.lineTo(W, gy); }
    x.stroke(); x.restore();
    const vg = x.createRadialGradient(540, 900, 180, 540, 900, 1250); vg.addColorStop(0, rgba(BG, 0)); vg.addColorStop(1, rgba(BG, .96));
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    // туман
    const blobs = [[540 + noise(11, t * .22) * 260, 640 + noise(12, t * .2) * 200, 820, DARK ? .2 : .13], [540 + noise(13, t * .18) * 300, 1260 + noise(14, t * .21) * 180, 760, DARK ? .13 : .09]];
    for (const [bx, by, br, ba] of blobs) {
      const g = x.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, rgba(fog, ba)); g.addColorStop(.55, rgba(fog, ba * .35)); g.addColorStop(1, rgba(fog, 0));
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
  }

  // ── камера ──
  const MOVES = [
    [0, TL.absorb + .1, 1.05, 540, 870], [TL.absorb + .12, TL.cap[0] + .07, 1.13, 540, 700], [TL.cap[0] + .07, TL.type[0] + .03, 1.0, 540, 905],
    [TL.type[0] + .03, TL.type[0] + .43, 1.3, 540, 395], [TL.head + .07, TL.head + .7, 1.02, 540, 880], [TL.cur1[0] + .23, TL.click1 + .06, 1.12, 540, 'btn'], [TL.w2c[0], TL.w2c[1], 1.0, 540, 900],
    [TL.prod[0] + .05, TL.prod[1] + .05, 1.05, 540, 860], [TL.split[0] + .03, TL.split[1] + .15, 1.0, 540, 905], [9.75, 11.8, 1.035, 540, 905], [11.85, 12.5, .98, 540, 905], [12.5, 15, 1.045, 540, 940],
  ];
  function camera(t) {
    const s = { z: 1, cx: 540, cy: 900 };
    for (const [a, b, z, cx, cy] of MOVES) {
      const p = E.inOut(prog(t, a, b)); if (p <= 0) break;
      const ty = cy === 'btn' ? top(L.WIN) + L.btnY : cy;
      s.z = mix(s.z, z, p); s.cx = mix(s.cx, cx, p); s.cy = mix(s.cy, ty, p);
    }
    s.z *= 1 + .004 * Math.sin(t * 1.3);
    s.dx = noise(3, t * .35) * 5; s.dy = noise(4, t * .3) * 6;
    return s;
  }

  // ── палитры товаров ──
  const tintOf = pal => pal ? hx(pal.акцент || pal.циферблат || Object.values(pal).find(v => /^#/.test(v)) || ACC) : ACC;
  function goodsAt(t) {
    const g = L.goods, n = Math.max(1, g.length), P = (TL.prod[1] - TL.prod[0]) / n;
    const f = clamp((t - TL.prod[0] + .24) / P, 0, n - .0001), i = Math.floor(f); // смена начинается за .24 с до границы
    const tr = i > 0 ? E.inOut(prog(t, TL.prod[0] + i * P - .24, TL.prod[0] + i * P + .24)) : 1;
    const A = g[Math.max(0, i - 1)] || {}, B = g[i] || {};
    // фото не перекрашивается: палитру не смешиваем, на переходе рисуются два фото (сдвиг + кроссфейд)
    const tint = mixHex(tintOf(A.палитра), tintOf(B.палитра), tr);
    return { i, tr, A, B, pal: B.палитра, tint, P, n };
  }

  // ── сцены внутри контейнера ──
  function logoContent(b, t, al, sc = 1) {
    if (al <= .01) return;
    const s = L.logoSize, bw = textW(L.brand, s, 800, 2), tw = L.tail ? textW(L.tail, s, 800, 2) : 0, tot = 40 + bw + tw;
    let xx = b.x - tot * sc / 2;
    x.save(); x.translate(xx, b.y); x.scale(sc, sc);
    const pulse = .5 + .5 * Math.sin(t * 3.2);
    x.beginPath(); x.arc(12, 0, 12, 0, 7); x.fillStyle = rgba(ACC, al); x.fill();
    x.beginPath(); x.arc(12, 0, 12 + 8 + pulse * 6, 0, 7); x.lineWidth = 2; x.strokeStyle = rgba(ACC, al * .35 * (1 - pulse)); x.stroke();
    T(L.brand, 40, 2, { size: s, weight: 800, color: TX, align: 'left', track: 2, alpha: al });
    if (L.tail) T(L.tail, 40 + bw, 2, { size: s, weight: 800, color: ACCT, align: 'left', track: 2, alpha: al });
    x.restore();
  }

  function heroContent(b, t, exitT) {
    const tp = top(b);
    // полоса браузера
    const vb = vis(t, TL.bar, exitT, .45);
    if (vb) {
      x.save(); x.globalAlpha *= vb.a; x.translate(0, vb.dy * .4);
      const by = tp + 64;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(b.x - b.w / 2 + 50 + i * 30, by, 8.5, 0, 7); x.fillStyle = rgba(TX, i === 0 ? .32 : .16); x.fill(); }
      const aw = Math.min(b.w - 250, 560), ab = box(b.x + 30, by, aw, 62, 31);
      shapePath(ab); x.fillStyle = DARK ? rgba('#ffffff', .06) : rgba('#000000', .045); x.fill();
      // замок
      const lx = ab.x - aw / 2 + 36;
      x.lineWidth = 3; x.strokeStyle = rgba(TX, .55); x.beginPath(); x.arc(lx, by - 4, 7, Math.PI, 0); x.stroke();
      rr(lx - 10, by - 4, 20, 15, 3); x.fillStyle = rgba(TX, .55); x.fill();
      const n = Math.round(L.dom.length * prog(t, TL.type[0], TL.type[1])), s = L.dom.slice(0, n);
      const dsz = Math.min(32, fit(L.dom, aw - 110, 32, 600));
      const tw = T(s, lx + 24, by + 1, { size: dsz, weight: 600, color: TX, align: 'left', alpha: .9 });
      const caretOn = t < TL.type[1] + .5 ? (Math.floor(t * 3.2) % 2 === 0 || t < TL.type[1]) : false;
      if (caretOn && t > TL.type[0] - .3) { x.fillStyle = ACC; x.fillRect(lx + 27 + tw, by - dsz * .55, 3, dsz * 1.1); }
      x.fillStyle = rgba(TX, DARK ? .08 : .07); x.fillRect(b.x - b.w / 2, tp + 126, b.w, 1.5);
      x.restore();
    }
    const step = Math.min(.11, .62 / Math.max(1, L.nHeadWords - 1));
    const subT0 = TL.head + (L.nHeadWords - 1) * step + .2, bt0 = Math.min(subT0 + L.sub.length * .08 + .1, TL.cur1[0]);
    // скелет-загрузка: серые плашки на местах заголовка, текста и кнопки, по ним бежит отблеск
    const sk = vis(t, TL.bar + .05, null, .45);
    if (sk) {
      const sh = ((t - TL.bar) * .85) % 1.4, gx = mix(b.x - b.w * .8, b.x + b.w * .8, sh);
      const sg = x.createLinearGradient(gx - 200, 0, gx + 200, 0), base = rgba(TX, DARK ? .07 : .06), hi = rgba(TX, DARK ? .16 : .12);
      sg.addColorStop(0, base); sg.addColorStop(.5, hi); sg.addColorStop(1, base);
      const bar = (cx, cy, w, h, end) => { const a = sk.a * (1 - E.out(prog(t, end - .06, end + .22))); if (a <= .01) return; x.save(); x.globalAlpha *= a; rr(cx - w / 2, cy - h / 2 + sk.dy * .5, w, h, h / 2); x.fillStyle = sg; x.fill(); x.restore(); };
      let k = 0;
      for (const r of L.head) { const lw = r.widths.reduce((s, w) => s + w, 0) + r.sp * (r.ws.length - 1); bar(b.x, tp + r.y, lw * .86, L.headSize * .58, TL.head + k * step); k += r.ws.length; }
      L.sub.forEach((s, i) => bar(b.x, tp + L.subTop + i * L.subPitch, textW(s, L.subSize, 500) * .9, 22, subT0 + i * .08));
      bar(b.x, tp + L.btnY, L.btnW * .9, L.btnH * .7, bt0 + .1);
    }
    // заголовок: слова по одному
    kinetic(L.head, t, TL.head, step, { cx: b.x, y0: tp, size: L.headSize, track: -2, acc: L.headAcc, exit: exitT });
    // подзаголовок
    L.sub.forEach((s, i) => {
      const v = vis(t, subT0 + i * .08, exitT == null ? null : exitT + .04, .5); if (!v) return;
      T(s, b.x, tp + L.subTop + i * L.subPitch + v.dy, { size: L.subSize, weight: 500, color: GR, alpha: v.a, blur: v.blur });
    });
    // кнопка сайта: рождается из точки
    const bt = bt0, bp = E.out5(prog(t, bt, bt + .55)), bwp = soft(prog(t, bt + .08, bt + .62));
    const bo = exitT == null ? 0 : E.in(prog(t, exitT, exitT + .3));
    if (bp > 0 && bo < 1) {
      const press = Math.exp(-Math.pow((t - TL.click1 - .05) / .09, 2));
      const h = mix(L.btnH * .2, L.btnH, bp) * (1 - .05 * press), w = Math.max(h, mix(L.btnH * .2, L.btnW, bwp) * (1 - .05 * press));
      const bb = box(b.x, tp + L.btnY - bo * 40, w, h, h / 2);
      x.save(); x.globalAlpha *= 1 - bo;
      shadow(40, rgba(ACC, DARK ? .45 : .35), 10); shapePath(bb); x.fillStyle = mixHex(ACC, '#ffffff', press * .25); x.fill(); noShadow();
      const ta = prog(t, bt + .32, bt + .7);
      if (ta > 0) { x.save(); clipTo(bb); T(L.btnText, bb.x, bb.y + (1 - E.out5(ta)) * 30, { size: L.btnSize, weight: 700, color: ON, alpha: ta }); x.restore(); }
      x.restore();
      ring(bb.x + L.btnW / 2 - 50, bb.y + 22, t, TL.click1);
    }
  }

  function item(t, X, Y, s, pal, al = 1, rot = 0, sx = 1, glow, ga = 1) {
    if (al <= .01 || s < 2) return;
    x.save(); x.globalAlpha *= al;
    if (glow) { const g = x.createRadialGradient(X, Y, 0, X, Y, s * 2.1); g.addColorStop(0, rgba(glow, (DARK ? .34 : .26) * ga)); g.addColorStop(1, rgba(glow, 0)); x.fillStyle = g; x.fillRect(X - s * 2.2, Y - s * 2.2, s * 4.4, s * 4.4); }
    x.translate(X, Y); x.rotate(rot); x.scale(sx, 1);
    САЙТ.предмет(x, t, pal || undefined, s);
    x.restore();
  }

  // затемнения карточки сверху и снизу: браслет предмета уходит под подпись, как на витрине
  function cardFades(b, fill, a = 1) {
    if (a <= .01) return;
    const tp = top(b), bt = bot(b);
    x.save(); x.globalAlpha *= a;
    let g = x.createLinearGradient(0, tp, 0, tp + 150); g.addColorStop(0, rgba(fill, .96)); g.addColorStop(1, rgba(fill, 0));
    x.fillStyle = g; x.fillRect(b.x - b.w / 2, tp, b.w, 150);
    g = x.createLinearGradient(0, bt - 330, 0, bt - 190); g.addColorStop(0, rgba(fill, 0)); g.addColorStop(1, rgba(fill, .97));
    x.fillStyle = g; x.fillRect(b.x - b.w / 2, bt - 330, b.w, 330);
    x.restore();
  }
  // предмет уходит в среднюю таблетку: сжимается, тает, едет к её центру
  const itemQ = t => E.inOut(prog(t, TL.split[0] - .12, TL.split[0] + .42));
  function itemOut(t, iy, is, pal, rot, sx, glow, dest) {
    const q = itemQ(t), ty = dest ? dest.y : iy;
    item(t, 540, mix(iy, ty, q), is * (1 - .82 * q), pal, 1 - sm(clamp((q - .5) / .5)), rot * (1 - q), sx, glow);
  }
  function cardContent(b, t, G, exitT) {
    const tp = top(b), bt = bot(b);
    const ex = exitT == null ? 0 : E.in(prog(t, exitT, exitT + .3));
    // индекс
    const v0 = vis(t, TL.w2c[1] - .25, exitT, .4);
    if (v0) {
      const s = `${String(G.i + (G.tr < .5 ? 0 : 1)).padStart(2, '0')} / ${String(G.n).padStart(2, '0')}`;
      T(s, b.x, tp + 64 + v0.dy, { size: 26, weight: 700, color: GR, track: 5, alpha: v0.a, blur: v0.blur });
      // точки прогресса
      for (let k = 0; k < G.n; k++) {
        const on = k === G.i ? G.tr : (k === G.i - 1 ? 1 - G.tr : 0), w = 12 + 30 * on;
        const dx = (k - (G.n - 1) / 2) * 30 + (k < G.i ? -15 * G.tr : k > G.i ? 15 * G.tr : 0);
        rr(b.x + dx - w / 2 + (k === G.i ? 0 : 0), bt - 58 + v0.dy, w, 10, 5); x.fillStyle = rgba(on > .5 ? ACC : TX, (on > .5 ? 1 : .22) * v0.a); x.fill();
      }
    }
    // имя и цена: старое уходит вверх в размытие, новое входит снизу
    const nameY = bt - 228, priceY = bt - 150;
    const show = (g, al, dy, bl) => {
      if (!g || al <= .01) return;
      T(U(g.имя || ''), b.x, nameY + dy, { size: Math.min(64, fit(U(g.имя || ''), b.w - 120, 64, 800, -1)), weight: 800, color: TX, track: -1, alpha: al, blur: bl });
      if (g.цена) T(g.цена, b.x, priceY + dy * 1.2, { size: 46, weight: 700, color: ACCT, alpha: al, blur: bl });
    };
    const startIn = G.i === 0 ? TL.w2c[1] - .3 : TL.prod[0] + G.i * G.P - .1;
    const vi = vis(t, startIn, exitT, .42);
    if (G.i > 0) { const po = E.in(prog(t, TL.prod[0] + G.i * G.P - .28, TL.prod[0] + G.i * G.P)); if (po < 1) show(G.A, 1 - po, -po * 40, po * 12); }
    if (vi) show(G.B, vi.a, vi.dy, vi.blur);
  }

  function pillContent(b, t, i) {
    const n = L.nums[i], a = L.adv[i], nIn = TL.count + i * .12, aIn = TL.adv + i * .1;
    const hasAdv = !!a && !!n, aStart = n ? aIn : TL.count + i * .12;
    const vn = n ? vis(t, nIn - .07, hasAdv ? aIn - .24 : TL.merge[0] + .04, .38) : null;
    x.save(); clipTo(b);
    if (vn) {
      const big = b.h > 190 ? 98 : 80;
      const str = num(n.число) + (n.плюс || ''), size = Math.min(big, fit(str, b.w - 140, big, 800, -2));
      const cp = prog(t, nIn, nIn + 1.35), v = n.число * (1 - Math.pow(1 - cp, 4)), vs = num(v), sw = textW(vs, size, 800, -2), pl = n.плюс || '';
      const ny = b.y - b.h * .1 + vn.dy, pa = E.out5(prog(t, nIn + 1.1, nIn + 1.5));
      // число считает, «+» въезжает справа, когда счёт дошёл
      const pw = pl ? textW(pl, size, 800, -2) * pa : 0;
      T(vs, b.x - pw / 2, ny, { size, weight: 800, color: TX, track: -2, alpha: vn.a, blur: vn.blur });
      if (pl && pa > 0) T(pl, b.x - pw / 2 + sw / 2 + textW(pl, size, 800, -2) / 2, ny + (1 - pa) * 26, { size, weight: 800, color: ACCT, track: -2, alpha: vn.a * pa, blur: (1 - pa) * 10 });
      T(n.подпись || '', b.x, b.y + b.h * .27 + vn.dy * .6, { size: Math.min(36, fit(n.подпись || '', b.w - 160, 36, 600)), weight: 600, color: GR, alpha: vn.a, blur: vn.blur });
    }
    const va = a ? vis(t, aStart, TL.merge[0] + .04, .45) : null;
    if (va) {
      const s = Math.min(46, fit(a, b.w - 220, 46, 700)), tw = textW(a, s, 700), tot = tw + 64, x0 = b.x - tot / 2;
      const cx = x0 + 22, cy = b.y + va.dy, ip = E.out5(prog(t, aStart + .05, aStart + .45));
      x.beginPath(); x.arc(cx, cy, 22 * ip, 0, 7); x.fillStyle = rgba(ACC, va.a); x.fill();
      if (ip > .3) { x.save(); x.lineWidth = 4.5; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = rgba(ON, va.a); const cp = prog(t, aStart + .15, aStart + .45);
        x.beginPath(); x.moveTo(cx - 9, cy + 1); x.lineTo(cx - 9 + 6 * clamp(cp * 2), cy + 1 + 7 * clamp(cp * 2)); if (cp > .5) x.lineTo(cx - 3 + 13 * clamp(cp * 2 - 1), cy + 8 - 16 * clamp(cp * 2 - 1)); x.stroke(); x.restore(); }
      T(a, x0 + 64, cy, { size: s, weight: 700, color: TX, align: 'left', alpha: va.a, blur: va.blur });
    }
    x.restore();
  }

  function ctaContent(b, t) {
    x.save(); clipTo(b);
    const n = L.cta.length, pitch = L.ctaSize * 1.05;
    let k = 0;
    L.cta.forEach((line, li) => {
      const ws = line.split(' '), sp = textW(' ', L.ctaSize, 800, -1), wd = ws.map(w => textW(w, L.ctaSize, 800, -1));
      const ps = ws.map((_, i) => E.out5(prog(t, TL.cta + (k + i) * .09, TL.cta + (k + i) * .09 + .5)));
      const cur = wd.reduce((s, w, i) => s + (w + (i ? sp : 0)) * ps[i], 0);
      let xx = b.x - cur / 2;
      ws.forEach((w, i) => {
        const p = ps[i]; if (i) xx += sp * p;
        if (p > .002) {
          x.save(); x.translate(xx + wd[i] * p / 2, b.y + (li - (n - 1) / 2) * pitch + (1 - p) * 36); x.scale(.9 + .1 * p, .9 + .1 * p);
          T(w, 0, 2, { size: L.ctaSize, weight: 800, color: ON, track: -1, alpha: p, blur: (1 - p) * 16 }); x.restore();
        }
        xx += wd[i] * p;
      });
      k += ws.length;
    });
    x.restore();
  }

  function domContent(b, t, a) {
    if (a <= .01) return;
    x.save(); clipTo(b);
    const tw = textW(L.dom, L.domSize, 600), tot = tw + 50, x0 = b.x - tot / 2;
    T(L.dom, x0, b.y + 1, { size: L.domSize, weight: 600, color: TX, align: 'left', alpha: a });
    // стрелка ↗
    const ax = x0 + tw + 30, ay = b.y; x.lineWidth = 3.5; x.lineCap = 'round'; x.strokeStyle = rgba(ACCT, a);
    x.beginPath(); x.moveTo(ax - 9, ay + 9); x.lineTo(ax + 9, ay - 9); x.moveTo(ax - 5, ay - 9); x.lineTo(ax + 9, ay - 9); x.lineTo(ax + 9, ay + 5); x.stroke();
    x.restore();
  }

  // ════════════════ КАДР ════════════════
  window.КАДР = t => {
    if (!L) L = layout();
    const cam = camera(t);
    // цвет тумана: акцент, на товарах — оттенок товара
    const G = goodsAt(t), pw = sm(prog(t, TL.w2c[0], TL.prod[0])) * (1 - sm(prog(t, TL.prod[1] - .1, TL.split[0] + .3)));
    const fog = mixHex(ACC, G.tint, pw);
    background(t, cam, fog);

    x.save();
    x.translate(540 + cam.dx, 900 + cam.dy); x.scale(cam.z, cam.z); x.translate(-cam.cx, -cam.cy);

    const glint = (a, d = 1.4) => (t - a) / d;
    const cardFill = mixHex(CARD, G.tint, (DARK ? .13 : .08) * pw);

    // ── 1. капсула с лого + хук (обложка) → слова втягиваются в капсулу ──
    if (t < TL.cap[1] + .01) {
      // удары слов о капсулу
      let bump = 0, k = 0; const nw = L.hook.reduce((n, r) => n + r.ws.length, 0), stp = Math.min(.06, .42 / Math.max(1, nw - 1));
      const arrivals = [];
      for (const r of L.hook) r.ws.forEach(() => { const ta = TL.absorb + k * stp + .5; arrivals.push(ta); const d = t - ta; if (d > 0) bump += Math.exp(-d * 7) * Math.sin(Math.min(d * 18, Math.PI)) ; k++; });
      const mp = soft(prog(t, TL.cap[0], TL.cap[1]));
      const cap = { ...L.CAP }; cap.w *= 1 + .05 * bump; cap.h *= 1 + .07 * bump;
      const b = lerpBox(cap, L.WIN, mp);
      const flash = clamp(bump * .4) * (1 - mp);
      drawBox(b, mixHex(CARD, ACC, flash * .35), { glint: glint(.25, 1.6), glow: flash > .02 ? 40 * flash : 0 });
      x.save(); clipTo(b);
      const lv = 1 - E.in(prog(t, TL.cap[0] - .05, TL.cap[0] + .25));
      logoContent(b, t, lv, 1 - .15 * (1 - lv));
      if (mp > .12) heroContent(b, t, null);
      x.restore();
      // слова хука
      k = 0;
      const hookLight = prog(t, .15, 1.35);
      for (const r of L.hook) {
        const lineW = r.widths.reduce((s, w) => s + w, 0) + r.sp * (r.ws.length - 1);
        let xx = 540 - lineW / 2;
        r.ws.forEach((w, i) => {
          const wx = xx + r.widths[i] / 2, wy = r.y; xx += r.widths[i] + r.sp;
          const a0 = TL.absorb + k * stp, p = prog(t, a0, a0 + .5), e = E.in(p); k++;
          if (p >= 1) return;
          const acc = r.src === L.hookAcc, base = acc ? ACCT : TX;
          const fl = Math.sin(t * 1.4 + k) * 3 * (1 - e);
          const tx = mix(wx, cap.x, e), ty = mix(wy + fl, cap.y, e) - Math.sin(e * Math.PI) * 30, sc = mix(1, .1, e);
          let col = mixHex(base, ACC, e);
          if (hookLight > 0 && hookLight < 1 && e === 0) {
            const gx = mix(-300, 1380, E.inOut(hookLight)) + (r.li * 120), g = x.createLinearGradient(gx - 220, 0, gx + 220, 0);
            const hi = acc ? mixHex(ACCT, '#ffffff', DARK ? .55 : .0) : mixHex(TX, ACC, .75);
            g.addColorStop(0, base); g.addColorStop(.5, hi); g.addColorStop(1, base); col = g;
          }
          x.save(); x.translate(tx, ty); x.scale(sc, sc);
          T(w, 0, 0, { size: L.hookSize, weight: 800, color: col, track: -2, alpha: 1 - sm(clamp((e - .45) / .55)), blur: e * 14 });
          x.restore();
        });
      }
    }
    // ── 2. окно браузера с сайтом ──
    else if (t < TL.w2c[1]) {
      const mp = soft(prog(t, TL.w2c[0], TL.w2c[1]));
      const b = lerpBox(L.WIN, L.CARD, mp);
      drawBox(b, mixHex(CARD, cardFill, mp), { glint: glint(3.7, 1.6) });
      x.save(); clipTo(b);
      // предмет поднимается из нижнего края окна и переезжает в карточку (за текстом)
      const rise = E.out5(prog(t, TL.item, TL.item + 1.0));
      const hy = top(L.WIN) + L.itemHeroY + (1 - rise) * 720;
      const iy = mix(hy, L.CARD.y - 120, mp), is = mix(L.itemHeroS, 208, mp);
      const G0 = L.goods[0] || {};
      item(t, b.x, iy, is, G0.палитра, 1, -.06 * (1 - mp) + (1 - rise) * .2, 1, mixHex(ACC, tintOf(G0.палитра), mp), sm(mp));
      cardFades(b, cardFill, sm(prog(mp, .3, 1)));
      heroContent(b, t, TL.w2c[0] - .06);
      if (mp > .6) cardContent(b, t, G, null);
      x.restore();
      // курсор
      if (t > TL.cur1[0] && t < TL.w2c[0] + .7) {
        const target = [L.WIN.x + L.btnW / 2 - 50, top(L.WIN) + L.btnY + 22];
        const [cx, cy] = t < TL.click1 + .12 ? arcPath(t, TL.cur1[0], TL.cur1[1], [1180, 1780], target, 80) : (() => { const q = E.in(prog(t, TL.click1 + .12, TL.click1 + .7)); return [mix(target[0], 1250, q), mix(target[1], 1900, q)]; })();
        const press = Math.exp(-Math.pow((t - TL.click1) / .08, 2));
        cursor(cx, cy, 1 - .18 * press, 1);
      }
    }
    // ── 3. карточка товара: перелистывает и перекрашивает ──
    else if (t < TL.split[0]) {
      const b = { ...L.CARD };
      const calm = 1 - sm(prog(t, TL.prod[1] - .25, TL.prod[1] + .05)), breath = Math.sin((t - TL.w2c[1]) * 1.6) * 6 * calm; b.h += breath; b.w += G.tr < 1 ? Math.sin(G.tr * Math.PI) * 26 : 0;
      drawBox(b, cardFill, { glint: glint(TL.prod[0] + Math.max(0, G.i * G.P - .1), 1.0) });
      x.save(); clipTo(b);
      const ramp = sm(prog(t, TL.w2c[1], TL.w2c[1] + .7)), fl = Math.sin(t * 1.7) * 7 * ramp;
      const iy = L.CARD.y - 120 + fl * (1 - itemQ(t)), is = 208;
      const sway = noise(7, t * .6) * .035 * ramp;
      if (G.i === 0 || G.tr >= 1) {
        itemOut(t, iy, is, G.pal, sway, 1, G.tint, null);
      } else { // два фото: старое уезжает влево и тает, новое въезжает справа (подсветка одна, общая)
        const q = G.tr, gl = x.createRadialGradient(b.x, iy, 0, b.x, iy, is * 2.1);
        gl.addColorStop(0, rgba(G.tint, DARK ? .34 : .26)); gl.addColorStop(1, rgba(G.tint, 0));
        x.fillStyle = gl; x.fillRect(b.x - is * 2.2, iy - is * 2.2, is * 4.4, is * 4.4);
        item(t, b.x - q * 420, iy + q * 10, is * (1 - .1 * q), G.A.палитра, 1 - sm(clamp(q * 1.3 - .1)), sway - q * .14, 1);
        item(t, b.x + (1 - q) * 420, iy + (1 - q) * 10, is * (.9 + .1 * q), G.B.палитра, sm(clamp(q * 1.3 - .2)), sway + (1 - q) * .14, 1);
      }
      cardFades(b, cardFill, 1);
      cardContent(b, t, G, TL.split[0] - .32);
      x.restore();
    }
    // ── 4. карточка делится на таблетки, считает цифры, потом сливается в кнопку ──
    else if (t < TL.merge[1]) {
      const fill = cardFill, lightP = prog(t, TL.merge[1] - .34, TL.merge[1]);
      const bs = L.PILL.map((P, i) => {
        const sp = E.inOut(prog(t, TL.split[0] + i * .05, TL.split[1] + i * .05));
        const mg = soft(prog(t, TL.merge[0] + Math.abs(i - (L.N - 1) / 2) * .05, TL.merge[1]));
        let b = lerpBox(L.SLICE[i], P, sp);
        b = lerpBox(b, L.BTN, mg);
        const br = Math.sin((t + i * .4) * 2.1) * 3 * sp * (1 - mg); b.w += br * 2; b.h += br;
        return b;
      });
      // тени всех кусков → заливки поверх (чтобы тень соседа не легла полосой) → перемычки → свет и грань
      const solo = bs.map((_, i) => sm(prog(t, TL.split[0] + .45 + i * .05, TL.split[1] + .05 + i * .05)) * (1 - sm(prog(t, TL.merge[0], TL.merge[0] + .25))));
      bs.forEach(b => drawBox(b, fill, { sh: 60, onlyFill: true }));
      bs.forEach(b => { shapePath(b); x.fillStyle = fill; x.fill(); });
      for (let i = 0; i + 1 < bs.length; i++) bridge(bs[i], bs[i + 1], fill);
      bs.forEach((b, i) => drawBox(b, fill, { noFill: true, sh: 0, sheen: solo[i], edge: solo[i], glint: solo[i] > .9 ? glint(TL.split[1] + .1 + i * .12, 1.2) : -1 }));
      const ca = 1 - sm(prog(t, TL.split[0], TL.split[0] + .3));
      if (ca > 0) { x.save(); x.globalAlpha *= ca; drawBox(L.CARD, fill, { noFill: true, sh: 0 }); x.restore(); }
      const ma = sm(prog(t, TL.merge[1] - .25, TL.merge[1]));
      if (ma > 0) { x.save(); x.globalAlpha *= ma; drawBox(L.BTN, fill, { noFill: true, sh: 0, noEdge: true }); x.restore(); }
      if (itemQ(t) < 1) {
        const m = Math.floor((L.N - 1) / 2), q = itemQ(t);
        x.save(); x.beginPath(); bs.forEach(b => x.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, Math.min(b.r, b.w / 2, b.h / 2))); x.clip();
        itemOut(t, L.CARD.y - 120, 208, G.pal, 0, 1, G.tint, bs[m]);
        cardFades(L.CARD, fill, 1 - sm(clamp(q * 1.6)));
        x.restore();
      }
      bs.forEach((b, i) => pillContent(b, t, i));
      // кнопка «загорается»: акцент разливается из центра слившейся формы
      if (lightP > 0) {
        x.save(); x.beginPath(); bs.forEach(b => x.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, Math.min(b.r, b.w / 2, b.h / 2))); x.clip();
        x.beginPath(); x.arc(L.BTN.x, L.BTN.y, 8 + 560 * E.out(lightP), 0, 7); x.fillStyle = ACC; x.fill(); x.restore();
        ctaContent(L.BTN, t);
      }
    }
    // ── 5. кнопка призыва + капля с доменом ──
    else {
      const press = Math.exp(-Math.pow((t - TL.click2 - .04) / .09, 2));
      const live = sm(prog(t, TL.merge[1], TL.merge[1] + .5)), b = { ...L.BTN }; const br = Math.sin(t * 2.2) * 4 * live; b.w += br * 2 - 26 * press; b.h += br - 10 * press;
      // лого поднимается из-за кнопки
      const lp = E.out5(prog(t, TL.drop[0] + .1, TL.drop[0] + .9));
      if (lp > 0) {
        const lb = box(540, mix(b.y, top(b) - 112, lp), L.logoW + 60, 96, 48);
        x.save(); x.globalAlpha *= lp; logoContent(lb, t, 1, .92); x.restore();
      }
      // капля
      const dp = soft(prog(t, TL.drop[0], TL.drop[1]));
      const D = lerpBox(L.DROP0, L.DROP, dp); D.y += Math.sin(t * 2.2 - .8) * 3;
      const dfill = mixHex(ACC, CARD, sm(prog(t, TL.drop[0] + .15, TL.drop[1] - .1)));
      drawBox(D, dfill, { sh: 40, glint: glint(TL.drop[1] + .2, 1.2), noEdge: dp < .6 });
      drawBox(b, ACC, { sheen: live, sh: mix(60, 80, live), glow: (50 + 20 * Math.sin(t * 2.4)) * E.out(prog(t, TL.merge[1] - .05, TL.merge[1] + .6)), glint: glint(TL.merge[1] + .9, 1.3), noEdge: true });
      bridge(b, D, dfill, 44);
      ctaContent(b, t);
      domContent(D, t, E.out5(prog(t, TL.drop[1] - .3, TL.drop[1] + .25)));
      const tgt = [b.x + L.BTN.w / 2 - 92, b.y + L.BTN.h / 2 - 34];
      ring(tgt[0], tgt[1], t, TL.click2);
      // курсор
      const [cx, cy] = arcPath(t, TL.cur2[0], TL.cur2[1], [1200, 1800], tgt, 90);
      if (t > TL.cur2[0]) cursor(cx + noise(9, t * .5) * 3, cy + noise(10, t * .5) * 3, 1 - .18 * Math.exp(-Math.pow((t - TL.click2) / .08, 2)), 1);
    }
    x.restore();
  };
})();

  },
  chertezh() {
// СТИЛЬ «Чертёж»: инженерный лист (blueprint), как «как это сделано» у Apple / Teenage Engineering.
// Синяя калька (на светлой теме — белая калька с синими чернилами), миллиметровка, рамка с зонами и штамп.
// Линии чертятся по длине пути, размерные линии со стрелками и числами, выноски-позиции, перо-перекрестье.
// Сцены: хук вписывается моноширинным капсом 0–2,2 → пролёт листа к виду предмета 2,2–3,2 →
// контур предмета чертится, циркуль проявляет детали, размеры, позиции, заливка снизу вверх 2,8–7 →
// товары как ревизии A/B/C… со штампом 7–10,2 → спецификация со счётчиками 10,2–12,5 →
// штамп вырастает в центр: призыв + домен, линии сворачиваются 12,5–15.
// Все слова, цвета и цифры — из САЙТ. Кадр = чистая функция времени.
window.ИМЯ = 'chertezh';
DUR = 15;
FONT = САЙТ.шрифт || FONT;
(() => {
  const S = САЙТ, C = S.цвета || {};
  const MONO = 'Menlo,"SF Mono","DejaVu Sans Mono",Consolas,"Liberation Mono","Courier New",monospace';

  // ——— цвет ———
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mixH = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b); return toHex(A.map((v, i) => mix(v, B[i], p))); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const ensure = (col, bg, need, to) => { let c = col; for (let i = 0; i < 14 && ratio(c, bg) < need; i++) c = mixH(c, to, .14); return c; };

  const FON = isHex(C.фон) ? C.фон : null;
  const DARK = S.тема ? !/светл/i.test(S.тема) : !(FON && lum(FON) > .4);
  const PAPER = DARK ? mixH('#0d2f6e', FON || '#000000', .14) : mixH('#fbfcfe', FON || '#ffffff', .2);
  const PAPER_E = DARK ? mixH(PAPER, '#000000', .5) : mixH(PAPER, '#c4cfe2', .45);
  const PAPER_C = DARK ? mixH(PAPER, '#3a6cc4', .22) : mixH(PAPER, '#ffffff', .7);
  const INK = ensure(DARK ? mixH('#e4edff', isHex(C.текст) ? C.текст : '#ffffff', .2) : mixH('#16409a', isHex(C.текст) ? C.текст : '#000000', .15),
    PAPER, 7, DARK ? '#ffffff' : '#000000');
  const ACC = ensure(isHex(C.акцент) ? C.акцент : (DARK ? '#ffd23a' : '#e2541d'), PAPER, DARK ? 3.2 : 3.1, DARK ? '#ffffff' : '#000000');
  const ON_ACC = ratio(PAPER, ACC) >= ratio('#ffffff', ACC) ? PAPER : '#ffffff';
  const LINE = DARK ? .085 : .11, LINE2 = DARK ? .16 : .2;   // сетка: мелкая / крупная

  // ——— данные ———
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(s => s == null ? '' : String(s).trim()).filter(Boolean);
  const UP = s => String(s ?? '').toUpperCase();
  const head = arr(S.заголовок).slice(0, 3);
  const accHead = Number.isInteger(S.акцентСтрока) ? S.акцентСтрока : head.length - 1;
  const hook0 = arr(S.хук).length ? arr(S.хук) : head.length ? head : [S.бренд || ''];
  const goods = (S.товары || []).filter(g => g && (g.имя || g.цена)).slice(0, 5);
  const stats = (S.цифры || []).filter(d => d && isFinite(+d.число)).slice(0, 4);
  const notes = (arr(S.шаги).length ? arr(S.шаги) : arr(S.преимущества)).slice(0, 4);
  const cta = (arr(S.призыв).length ? arr(S.призыв) : arr(S.кнопка || S.бренд)).slice(0, 3).map(UP);
  const brand = String(S.бренд || ''), tail = String(S.хвостЛого || ''), domain = String(S.домен || ''), btn = String(S.кнопка || '');
  const pal = i => (goods[i] && goods[i].палитра && typeof goods[i].палитра === 'object') ? goods[i].палитра : undefined;
  const REV = 'ABCDEFGH';
  let hs = 0; for (const ch of domain + brand) hs = (hs * 31 + ch.charCodeAt(0)) % 100000;
  const DOCN = String(1000 + Math.floor(hash(hs * .37 + 1) * 8999));

  // ——— примитивы чертежа ———
  const ink = (a = 1, col = INK) => rgba(col, a);
  function seg(x0, y0, x1, y1, p = 1) { if (p <= 0) return; p = Math.min(1, p); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); x.stroke(); }
  function segC(x0, y0, x1, y1, p = 1) { if (p <= 0) return; const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; seg(mx, my, x0, y0, p); seg(mx, my, x1, y1, p); }
  function arrow(X, Y, ang, len = 24, w = 7) { x.save(); x.translate(X, Y); x.rotate(ang); x.beginPath(); x.moveTo(0, 0); x.lineTo(-len, -w / 2); x.lineTo(-len, w / 2); x.closePath(); x.fill(); x.restore(); }
  const mW = (s, size, weight = 500) => textW(String(s), size, weight, 0, MONO);
  const mfit = (s, maxW, size, weight = 500) => { const w = mW(s, size, weight); return w > maxW ? size * maxW / w : size; };
  function mT(s, X, Y, size, o = {}) { return T(String(s), X, Y, { size, font: MONO, weight: o.weight || 500, color: o.color || INK, align: o.align || 'left', alpha: o.alpha ?? 1, track: o.track || 0, base: o.base }); }
  // пишущая машинка: строка набирается по символам, блок-курсор на конце
  function typ(s, X, Y, size, p, o = {}) {
    s = String(s); if (p <= 0 || !s) return 0;
    const wt = o.weight || 500, n = Math.round(s.length * clamp(p)), sub = s.slice(0, n), wF = mW(s, size, wt) + (o.track || 0) * s.length;
    const left = o.align === 'center' ? X - wF / 2 : o.align === 'right' ? X - wF : X;
    mT(sub, left, Y, size, { weight: wt, color: o.color, alpha: o.alpha, track: o.track });
    if (p < 1 && o.cursor !== false) { const wS = mW(sub, size, wt) + (o.track || 0) * n; x.fillStyle = rgba(o.color || INK, (o.alpha ?? 1) * .85); x.fillRect(left + wS + 3, Y - size * .44, size * .56, size * .86); }
    return wF;
  }
  // подложка под числом, чтобы сетка не лезла в цифры
  function pad(X, Y, w, h, a = 1) { x.fillStyle = rgba(PAPER, .92 * a); x.fillRect(X - w / 2, Y - h / 2, w, h); }
  // размерная линия по горизонтали: выносные от ref0/ref1 к y, стрелки, число
  function dimH(x0, x1, y, ref0, ref1, p, val, o = {}) {
    if (p <= 0) return; const a = o.a ?? 1, col = o.col || INK;
    x.save(); x.lineCap = 'butt';
    const pe = E.out(prog(p, 0, .4)), pl = E.inOut(prog(p, .15, .7)), pa = prog(p, .62, .75), pn = prog(p, .3, 1);
    x.strokeStyle = rgba(INK, .55 * a); x.lineWidth = 1.3;
    seg(x0, ref0 + Math.sign(y - ref0) * 8, x0, y + Math.sign(y - ref0) * 16, pe);
    seg(x1, ref1 + Math.sign(y - ref1) * 8, x1, y + Math.sign(y - ref1) * 16, pe);
    x.strokeStyle = rgba(col, .9 * a); x.lineWidth = 1.6; segC(x0, y, x1, y, pl);
    x.fillStyle = rgba(col, .95 * a); if (pa > 0) { x.globalAlpha = pa * a; arrow(x0, y, Math.PI); arrow(x1, y, 0); x.globalAlpha = 1; }
    if (pn > 0) { const s = (o.pre || '') + num(val * E.out5(pn)), sz = o.size || 26, w = mW(s, sz, 600) + 16;
      pad((x0 + x1) / 2, y - sz * .72, w, sz * 1.05, pn * a); mT(s, (x0 + x1) / 2, y - sz * .72, sz, { weight: 600, align: 'center', color: o.tcol || col, alpha: pn * a }); }
    x.restore();
  }
  function dimV(xx, y0, y1, ref0, ref1, p, val, o = {}) {
    if (p <= 0) return; const a = o.a ?? 1, col = o.col || INK;
    x.save();
    const pe = E.out(prog(p, 0, .4)), pl = E.inOut(prog(p, .15, .7)), pa = prog(p, .62, .75), pn = prog(p, .3, 1);
    x.strokeStyle = rgba(INK, .55 * a); x.lineWidth = 1.3;
    seg(ref0 + Math.sign(xx - ref0) * 8, y0, xx + Math.sign(xx - ref0) * 16, y0, pe);
    seg(ref1 + Math.sign(xx - ref1) * 8, y1, xx + Math.sign(xx - ref1) * 16, y1, pe);
    x.strokeStyle = rgba(col, .9 * a); x.lineWidth = 1.6; segC(xx, y0, xx, y1, pl);
    x.fillStyle = rgba(col, .95 * a); if (pa > 0) { x.globalAlpha = pa * a; arrow(xx, y0, -Math.PI / 2); arrow(xx, y1, Math.PI / 2); x.globalAlpha = 1; }
    if (pn > 0) { const s = (o.pre || '') + num(val * E.out5(pn)), sz = o.size || 26, w = mW(s, sz, 600) + 16;
      x.translate(xx - sz * .72, (y0 + y1) / 2); x.rotate(-Math.PI / 2);
      pad(0, 0, w, sz * 1.05, pn * a); mT(s, 0, 0, sz, { weight: 600, align: 'center', color: o.tcol || col, alpha: pn * a }); }
    x.restore();
  }
  // осевая (штрихпунктир)
  function axis(x0, y0, x1, y1, p, a = .45) { if (p <= 0) return; x.save(); x.setLineDash([34, 7, 5, 7]); x.strokeStyle = ink(a); x.lineWidth = 1.2; segC(x0, y0, x1, y1, p); x.restore(); }
  // перо-перекрестье плоттера
  function pen(X, Y, a = 1, lab = true) {
    if (a <= .01) return; x.save(); x.globalAlpha *= a; x.lineCap = 'round';
    x.strokeStyle = ACC; x.lineWidth = 2.2; x.beginPath(); x.arc(X, Y, 13, 0, 7); x.stroke();
    x.lineWidth = 1.4; seg(X - 32, Y, X - 18, Y); seg(X + 18, Y, X + 32, Y); seg(X, Y - 32, X, Y - 18); seg(X, Y + 18, X, Y + 32);
    x.fillStyle = ACC; x.beginPath(); x.arc(X, Y, 3.2, 0, 7); x.fill();
    if (lab) { const s = `X ${String(Math.round(X)).padStart(4, '0')}  Y ${String(Math.round(Y)).padStart(4, '0')}`; const lx = X + 30 > 760 ? X - 30 - mW(s, 15) : X + 30;
      pad(lx + mW(s, 15) / 2, Y - 30, mW(s, 15) + 10, 21, .8); mT(s, lx, Y - 30, 15, { color: ACC, weight: 600 }); }
    x.restore();
  }

  // ——— лист: калька, сетка, рамка с зонами ———
  function paper(panY) {
    const g = x.createRadialGradient(540, 820, 60, 540, 960, 1300);
    g.addColorStop(0, PAPER_C); g.addColorStop(.55, PAPER); g.addColorStop(1, PAPER_E);
    x.fillStyle = g; x.fillRect(-80, -80, W + 160, H + 160);
    const m = 24, M = m * 5;
    for (const [step, a, w] of [[m, LINE, 1], [M, LINE2, 1.2]]) {
      const off = ((-panY % step) + step) % step;
      x.beginPath();
      for (let xx = 0; xx <= W + 1; xx += step) { x.moveTo(xx + .5, -80); x.lineTo(xx + .5, H + 80); }
      for (let yy = off - step * 4; yy <= H + 80; yy += step) { x.moveTo(-80, yy + .5); x.lineTo(W + 80, yy + .5); }
      x.strokeStyle = ink(a); x.lineWidth = w; x.stroke();
    }
  }
  const FR = { x0: 58, y0: 96, x1: W - 58, y1: H - 96 };
  function frame() {
    x.save();
    x.strokeStyle = ink(.35); x.lineWidth = 1.2; x.strokeRect(30, 68, W - 60, H - 136);
    x.strokeStyle = ink(.9); x.lineWidth = 3.2; x.strokeRect(FR.x0, FR.y0, FR.x1 - FR.x0, FR.y1 - FR.y0);
    // зоны: цифры по горизонтали, буквы по вертикали
    x.lineWidth = 1.2; x.strokeStyle = ink(.4);
    const nx = 6, ny = 10, zw = (FR.x1 - FR.x0) / nx, zh = (FR.y1 - FR.y0) / ny;
    for (let i = 0; i <= nx; i++) { const X = FR.x0 + i * zw; seg(X, 68, X, FR.y0); seg(X, FR.y1, X, H - 68); }
    for (let j = 0; j <= ny; j++) { const Y = FR.y0 + j * zh; seg(30, Y, FR.x0, Y); seg(FR.x1, Y, W - 30, Y); }
    for (let i = 0; i < nx; i++) { const X = FR.x0 + (i + .5) * zw; mT(String(nx - i), X, 82, 15, { align: 'center', alpha: .55 }); mT(String(nx - i), X, H - 82, 15, { align: 'center', alpha: .55 }); }
    for (let j = 0; j < ny; j++) { const Y = FR.y0 + (j + .5) * zh, L = 'ABCDEFGHJK'[j]; mT(L, 44, Y, 15, { align: 'center', alpha: .55 }); mT(L, W - 44, Y, 15, { align: 'center', alpha: .55 }); }
    // метки совмещения в углах
    for (const [X, Y] of [[30, 68], [W - 30, 68], [30, H - 68], [W - 30, H - 68]]) { x.strokeStyle = ink(.5); seg(X - 14, Y, X + 14, Y); seg(X, Y - 14, X, Y + 14); }
    x.restore();
  }

  // ——— хук: моноширинный капс вписывается по клеткам ———
  let HK = null;
  function hookLayout() {
    const lines0 = hook0.map(UP), accI = lines0.length > 1 ? lines0.length - 1 : -1, maxW = 770;
    let best = null, s1 = 150;
    for (const L of lines0) s1 = Math.min(s1, Math.floor(maxW / (Math.max(1, L.length) * mW('0', 100, 700) / 100)));
    if (s1 >= 84 && lines0.length <= 5) { const cw = mW('0', s1, 700); best = { size: s1, cw, lines: lines0.map((s, li) => ({ s, acc: li === accI })) }; }
    if (!best) for (let size = 120; size >= 50; size -= 4) {
      const cw = mW('0', size, 700), maxCh = Math.max(1, Math.floor(maxW / cw)), out = []; let ok = true;
      lines0.forEach((L, li) => { let cur = '';
        for (const w of L.split(/\s+/).filter(Boolean)) { if (w.length > maxCh) ok = false; const nx = cur ? cur + ' ' + w : w; if (nx.length <= maxCh) cur = nx; else { if (cur) out.push({ s: cur, acc: li === accI }); cur = w; } }
        if (cur) out.push({ s: cur, acc: li === accI }); });
      best = { size, cw, lines: out }; if (ok && out.length <= (size > 84 ? 4 : 5)) break;
    }
    if (accI < 0 && best.lines.length >= 3) best.lines[best.lines.length - 1].acc = true;
    const { size, cw, lines } = best, lh = size * 1.34, capH = size * .73, n = lines.length, top = 900 - n * lh / 2;
    lines.forEach((L, i) => { L.yb = top + i * lh + (lh - capH) / 2 + capH; L.w = L.s.length * cw; L.left = 540 - L.w / 2; L.len = L.s.length; });
    // тайминг заливки: первая строка уже вписана на обложке, остальные пишет перо
    let t0 = .35; const span = 1.95 - .35, rest = lines.slice(1).reduce((a, L) => a + L.len, 0) || 1;
    lines.forEach((L, i) => { if (i === 0) { L.ts = -1; L.dt = .01; L.te = -.9; return; } L.dt = Math.min(.06, span * .85 / rest); L.ts = t0; L.te = t0 + L.len * L.dt; t0 = L.te + span * .15 / Math.max(1, n - 1); });
    HK = { size, cw, lines, lh, capH, top, bot: top + n * lh, wMax: Math.max(...lines.map(L => L.w)) };
  }
  function hookPen(t) {
    const L = HK.lines; if (L.length < 2) { const A = L[0]; return { X: A.left + A.w, Y: A.yb - HK.capH / 2 }; }
    for (let i = 1; i < L.length; i++) {
      const A = L[i - 1], B = L[i];
      const endA = { X: A.left + A.w + 34, Y: A.yb - HK.capH / 2 }, stB = { X: B.left, Y: B.yb - HK.capH / 2 };
      if (t < B.ts) { const q = E.inOut(prog(t, Math.max(A.te, B.ts - .22), B.ts)); return { X: mix(endA.X, stB.X, q), Y: mix(endA.Y, stB.Y, q) }; }
      if (t <= B.te) return { X: B.left + ((t - B.ts) / B.dt) * HK.cw, Y: B.yb - HK.capH / 2 };
    }
    const Z = L[L.length - 1]; return { X: Z.left + Z.w + 34, Y: Z.yb - HK.capH / 2 };
  }
  function hook(t) {
    const { size, cw, lines, capH } = HK;
    x.save();
    // построение: базовые линии, линии прописных, отметки клеток
    x.lineWidth = 1; lines.forEach((L, i) => {
      const pg = E.out(prog(t, -.6 + i * .12, .5 + i * .12));
      x.strokeStyle = ink(.24); segC(FR.x0 + 20, L.yb, FR.x1 - 20, L.yb, pg); x.strokeStyle = ink(.16); segC(FR.x0 + 20, L.yb - capH, FR.x1 - 20, L.yb - capH, pg);
      x.strokeStyle = ink(.32); for (let k = 0; k <= L.len; k++) seg(L.left + k * cw, L.yb + 10, L.left + k * cw, L.yb + 10 - 18 * pg);
    });
    axis(540, HK.top - 110, 540, HK.bot + 110, E.out(prog(t, -.4, .6)), .4);
    // контур букв + заливка по клеткам
    x.font = `700 ${size}px ${MONO}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.letterSpacing = '0px';
    x.lineJoin = 'round';
    lines.forEach(L => {
      const col = L.acc ? ACC : INK;
      for (let k = 0; k < L.len; k++) {
        const ch = L.s[k]; if (ch === ' ') continue;
        const cs = L.ts + k * L.dt, fp = E.out(prog(t, cs, cs + .2)), X = L.left + k * cw;
        x.strokeStyle = rgba(col, .92 - .45 * fp); x.lineWidth = Math.max(1.6, size / 62); x.strokeText(ch, X, L.yb);
        if (fp > 0) { x.save(); x.beginPath(); x.rect(X - 4, L.yb + size * .3 - (size * 1.3) * E.out5(fp), cw + 8, size * 1.4); x.clip(); x.fillStyle = col; x.fillText(ch, X, L.yb); x.restore(); }
      }
    });
    // размеры блока
    const wl = lines.reduce((a, L) => L.w > a.w ? L : a, lines[0]);
    const ty = lines[0].yb - capH;
    dimH(wl.left, wl.left + wl.w, ty - 74, wl.yb - capH, wl.yb - capH, prog(t, .25, 1.25), wl.w, { tcol: ACC });
    const lx = Math.max(FR.x0 + 46, Math.min(...lines.map(L => L.left)) - 58);
    dimV(lx, ty, lines[lines.length - 1].yb, lines[0].left, lines[lines.length - 1].left, prog(t, .55, 1.55), lines[lines.length - 1].yb - ty, { tcol: ACC });
    // метка вида
    const pv = E.out(prog(t, .9, 1.5));
    if (pv > 0) { const X = wl.left + wl.w + 34, Y = lines[lines.length - 1].yb + 70; x.strokeStyle = ink(.8 * pv); x.lineWidth = 1.5; seg(X - 40, Y - 30, X, Y, pv); x.beginPath(); x.arc(X + 18, Y + 12, 20, 0, 7 * pv); x.stroke(); mT('1', X + 18, Y + 13, 20, { align: 'center', weight: 700, alpha: pv }); }
    x.restore();
  }

  // ——— предмет: замер, контур по альфе, детали Собелем ———
  let OB = null;
  function drawItem(tt, p, s) {
    x.save();
    try { if (typeof S.предмет === 'function') S.предмет(x, tt, p, s); else fallbackItem(s); } catch (e) { }
    x.restore();
  }
  function fallbackItem(s) {
    rr(-s * .8, -s * .8, s * 1.6, s * 1.6, s * .22); x.fillStyle = mixH(ACC, '#000000', .2); x.fill();
    T(UP(brand).slice(0, 1) || '◆', 0, s * .04, { size: s * .9, weight: 800, color: ON_ACC });
  }
  function bboxAt(s, cx, cy) {
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.translate(cx, cy); drawItem(0, undefined, s); x.restore();
    const d = x.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 110) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    if (x1 <= x0) return { x0: -1, x1: 1, y0: -1, y1: 1, w: 2, h: 2, cx: 0, cy: 0 };
    const b = { x0: (x0 - cx) / s, x1: (x1 - cx) / s, y0: (y0 - cy) / s, y1: (y1 - cy) / s }; b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; return b;
  }
  function buildObject() {
    const IB = bboxAt(100, 540, 960);
    const ch = Math.min(IB.h, IB.w * 1.22), broken = IB.h > ch * 1.16;
    const cx = 540, cy = 800, s = Math.min(470 / IB.w, 520 / ch);
    const ox = cx - IB.cx * s, oy = cy - IB.cy * s;
    const half = broken ? ch * s * .5 + ch * s * .13 : IB.h * s * .5 + 3;
    const y0 = cy - half, y1 = cy + half;
    const R = { x: Math.max(0, Math.floor(ox + IB.x0 * s - 26)), y: Math.max(0, Math.floor(Math.max(y0 - 30, oy + IB.y0 * s - 26))) };
    R.w = Math.min(W, Math.ceil(ox + IB.x1 * s + 26)) - R.x; R.h = Math.min(H, Math.ceil(Math.min(y1 + 30, oy + IB.y1 * s + 26))) - R.y;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.translate(ox, oy); drawItem(0, undefined, s); x.restore();
    const img = x.getImageData(R.x, R.y, R.w, R.h), D = img.data;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    const inY = Y => Y >= y0 && Y <= y1;
    // — маска и марширующие квадраты —
    const g = 3, nx = Math.ceil(R.w / g), ny = Math.ceil(R.h / g), NX = nx + 1, Mk = new Uint8Array(NX * (ny + 1));
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) { const px = i * g, py = j * g; if (px >= R.w || py >= R.h || !inY(R.y + py)) continue; if (D[(py * R.w + px) * 4 + 3] > 130) Mk[j * NX + i] = 1; }
    const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); };
    const hK = (i, j) => (j * NX + i) * 2, vK = (i, j) => (j * NX + i) * 2 + 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = Mk[j * NX + i], b = Mk[j * NX + i + 1], c = Mk[(j + 1) * NX + i + 1], d = Mk[(j + 1) * NX + i];
      const Tt = hK(i, j), Rt = vK(i + 1, j), Bt = hK(i, j + 1), Lt = vK(i, j);
      switch (a * 8 + b * 4 + c * 2 + d) {
        case 1: case 14: link(Lt, Bt); break; case 2: case 13: link(Bt, Rt); break; case 3: case 12: link(Lt, Rt); break;
        case 4: case 11: link(Tt, Rt); break; case 5: link(Tt, Rt); link(Lt, Bt); break; case 6: case 9: link(Tt, Bt); break;
        case 7: case 8: link(Tt, Lt); break; case 10: link(Tt, Lt); link(Rt, Bt); break;
      }
    }
    const kp = k => { const idx = k >> 1, i = idx % NX, j = Math.floor(idx / NX); return k & 1 ? [R.x + i * g, R.y + (j + .5) * g] : [R.x + (i + .5) * g, R.y + j * g]; };
    const seen = new Set(), raw = [];
    for (const k0 of adj.keys()) { if (seen.has(k0)) continue; const pts = []; let prev = -1, cur = k0;
      while (cur !== undefined && !seen.has(cur)) { seen.add(cur); pts.push(kp(cur)); const nb = adj.get(cur); let nxt; for (const q of nb) if (q !== prev && !seen.has(q)) { nxt = q; break; } prev = cur; cur = nxt; }
      if (pts.length > 8) raw.push(pts); }
    // — разрезы по линии обрыва, сглаживание —
    const near = P => broken && (Math.abs(P[1] - y0) < g * 1.7 || Math.abs(P[1] - y1) < g * 1.7);
    const polys = [];
    for (let pts of raw) {
      const ci = pts.findIndex(near); if (ci > 0) pts = pts.slice(ci).concat(pts.slice(0, ci));
      let cur = []; const closed = ci < 0;
      for (const P of pts) { if (near(P)) { if (cur.length > 6) polys.push({ p: cur, closed: false }); cur = []; } else cur.push(P); }
      if (cur.length > 6) polys.push({ p: cur, closed });
    }
    const smooth = (P, closed) => { const n = P.length, o = []; for (let i = 0; i < n; i++) { let sx = 0, sy = 0, c = 0; for (let k = -2; k <= 2; k++) { let j = i + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue; sx += P[j][0]; sy += P[j][1]; c++; } o.push([sx / c, sy / c]); } return o; };
    let lines = polys.map(({ p, closed }) => { let q = smooth(smooth(p, closed), closed).filter((_, i, a) => i % 2 === 0 || i === a.length - 1); if (closed) { let m = 0; q.forEach((P, i) => { if (P[1] < q[m][1]) m = i; }); q = q.slice(m).concat(q.slice(0, m)); q.push(q[0]); }
      let L = 0; for (let i = 1; i < q.length; i++) L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return { q, L }; })
      .filter(o => o.L > 50).sort((a, b) => b.L - a.L).slice(0, 18);
    const total = lines.reduce((a, o) => a + o.L, 0) || 1;
    // — детали: упрощённый Canny по яркости → чистые линии чернилами —
    // на фото фактура (матовый безель, браслет) даёт шум: сильное размытие, тонкие линии (подавление немаксимумов),
    // двойной порог с дорастанием слабых от сильных, мелкие обрывки выкидываем
    const E2 = document.createElement('canvas'); E2.width = R.w; E2.height = R.h; const ec = E2.getContext('2d'), out = ec.createImageData(R.w, R.h), O = out.data;
    const RW = R.w, RH = R.h, NP = RW * RH;
    let L0 = new Float32Array(NP), Lm = new Float32Array(NP);
    for (let i = 0; i < NP; i++) L0[i] = (D[i * 4] * .3 + D[i * 4 + 1] * .59 + D[i * 4 + 2] * .11) * D[i * 4 + 3] / 255;
    // размытие: три прохода коробки 5×5 раздельно (≈ гаусс σ≈2,5)
    const blurH = (A, B) => { for (let yy = 0; yy < RH; yy++) { const o = yy * RW; for (let xx = 0; xx < RW; xx++) { let sm = 0, c = 0; for (let k = -2; k <= 2; k++) { const q = xx + k; if (q >= 0 && q < RW) { sm += A[o + q]; c++; } } B[o + xx] = sm / c; } } };
    const blurV = (A, B) => { for (let yy = 0; yy < RH; yy++) for (let xx = 0; xx < RW; xx++) { let sm = 0, c = 0; for (let k = -2; k <= 2; k++) { const q = yy + k; if (q >= 0 && q < RH) { sm += A[q * RW + xx]; c++; } } B[yy * RW + xx] = sm / c; } };
    for (let r = 0; r < 3; r++) { blurH(L0, Lm); blurV(Lm, L0); }
    Lm = L0;
    const Mg = new Float32Array(NP), Dr = new Uint8Array(NP);
    for (let yy = 1; yy < RH - 1; yy++) { if (!inY(R.y + yy)) continue; for (let xx = 1; xx < RW - 1; xx++) {
      const i = yy * RW + xx; if (D[i * 4 + 3] < 140) continue;
      const gx = -Lm[i - RW - 1] - 2 * Lm[i - 1] - Lm[i + RW - 1] + Lm[i - RW + 1] + 2 * Lm[i + 1] + Lm[i + RW + 1];
      const gy = -Lm[i - RW - 1] - 2 * Lm[i - RW] - Lm[i - RW + 1] + Lm[i + RW - 1] + 2 * Lm[i + RW] + Lm[i + RW + 1];
      Mg[i] = Math.hypot(gx, gy); let an = Math.atan2(gy, gx) * 4 / Math.PI; an = ((Math.round(an) % 4) + 4) % 4; Dr[i] = an;
    } }
    // у края силуэта градиент от прозрачности — его рисует контур, тут не дублируем
    const nearEdge = i => { const yy = (i / RW) | 0, xx = i - yy * RW; for (let dy = -5; dy <= 5; dy += 5) for (let dx = -5; dx <= 5; dx += 5) { const q = (yy + dy) * RW + xx + dx; if (yy + dy < 0 || yy + dy >= RH || xx + dx < 0 || xx + dx >= RW || D[q * 4 + 3] < 140) return true; } return false; };
    const OFF = [[1, 0], [1, 1], [0, 1], [-1, 1]], St = new Uint8Array(NP), HI = 64, LO = 34;
    for (let yy = 2; yy < RH - 2; yy++) for (let xx = 2; xx < RW - 2; xx++) {
      const i = yy * RW + xx, m = Mg[i]; if (m < LO) continue;
      const [ox, oy] = OFF[Dr[i]], d = oy * RW + ox; if (m < Mg[i + d] || m < Mg[i - d]) continue;
      if (nearEdge(i)) continue;
      St[i] = m >= HI ? 2 : 1;
    }
    // дорастание слабых от сильных + выброс коротких обрывков (связные куски < 26 px)
    const Lb = new Int32Array(NP), stack = [];
    for (let i0 = 0; i0 < NP; i0++) {
      if (!St[i0] || Lb[i0]) continue; const comp = []; let strong = false; stack.push(i0); Lb[i0] = 1;
      while (stack.length) { const i = stack.pop(); comp.push(i); if (St[i] === 2) strong = true; const yy = (i / RW) | 0, xx = i - yy * RW;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (yy + dy) * RW + xx + dx; if ((dx || dy) && yy + dy >= 0 && yy + dy < RH && xx + dx >= 0 && xx + dx < RW && St[q] && !Lb[q]) { Lb[q] = 1; stack.push(q); } } }
      if (!strong || comp.length < 26) continue;
      for (const i of comp) { const a = clamp((Mg[i] - LO) / (HI - LO) * .6 + .4); O[i * 4 + 3] = Math.max(O[i * 4 + 3], a * 255);
        // вторая половина пикселя — линия ~1,5 px, без «лесенки»
        for (const q of [i + 1, i + RW]) if (q < NP) O[q * 4 + 3] = Math.max(O[q * 4 + 3], a * 110); }
    }
    const [ir, ig, ib] = hex2rgb(INK);
    for (let i = 0; i < NP; i++) if (O[i * 4 + 3]) { O[i * 4] = ir; O[i * 4 + 1] = ig; O[i * 4 + 2] = ib; }
    ec.putImageData(out, 0, 0);
    // — габариты силуэта —
    const alphaAt = (X, Y) => { const px = Math.round(X - R.x), py = Math.round(Y - R.y); if (px < 0 || py < 0 || px >= R.w || py >= R.h || !inY(Y)) return 0; return D[(py * R.w + px) * 4 + 3]; };
    const rowExt = Y => { let a = -1, b = -1; for (let xx = 0; xx < R.w; xx++) if (alphaAt(R.x + xx, Y) > 130) { if (a < 0) a = xx; b = xx; } return a < 0 ? null : [R.x + a, R.x + b]; };
    let xL = W, xR = 0, yW = cy, wBest = 0, yT = y1, yB = y0;
    for (let Y = Math.ceil(y0); Y <= y1; Y += 3) { const e = rowExt(Y); if (!e) continue; if (e[0] < xL) xL = e[0]; if (e[1] > xR) xR = e[1]; if (e[1] - e[0] > wBest) { wBest = e[1] - e[0]; yW = Y; } if (Y < yT) yT = Y; if (Y > yB) yB = Y; }
    if (xR <= xL) { xL = cx - 100; xR = cx + 100; yT = y0; yB = y1; }
    const ext0 = rowExt(y0 + 4) || [xL, xR], ext1 = rowExt(y1 - 4) || [xL, xR];
    // точки привязки выносок: внутри силуэта, по лучам из центра
    const anchors = [];
    const angs = [-.62, -.18, .2, .62, -1.0].map(a => a * Math.PI / 2);
    for (let k = 0; k < notes.length; k++) {
      const a = angs[k % angs.length]; let d = 0; while (d < 900 && alphaAt(cx + Math.cos(a) * (d + 4), cy + Math.sin(a) * (d + 4)) > 130) d += 4;
      if (d < 20) d = 60; const f = [.78, .55, .7, .5, .62][k]; anchors.push([cx + Math.cos(a) * d * f, cy + Math.sin(a) * d * f]);
    }
    anchors.sort((a, b) => a[1] - b[1]);
    OB = { cx, cy, s, ox, oy, R, y0, y1, broken, lines, total, edge: E2, xL, xR, yW, yT, yB, ext0, ext1, anchors, fullH: Math.round(IB.h * s), coreW: Math.round(xR - xL) };
  }
  // линия обрыва (сплошная тонкая с изломом) и клип-область вида
  function zig(y, a, b, dir) { const m = (a + b) / 2, h = 15; return dir > 0 ? [[a, y], [m - 16, y], [m - 6, y - h], [m + 6, y + h], [m + 16, y], [b, y]] : [[b, y], [m + 16, y], [m + 6, y + h], [m - 6, y - h], [m - 16, y], [a, y]]; }
  function viewClip() {
    const O = OB; x.beginPath();
    if (!O.broken) { x.rect(O.R.x - 40, O.y0 - 6, O.R.w + 80, O.y1 - O.y0 + 12); return; }
    const L = O.R.x - 40, Rr = O.R.x + O.R.w + 40, z0 = zig(O.y0, L, Rr, 1), z1 = zig(O.y1, L, Rr, -1);
    z0.forEach((P, i) => i ? x.lineTo(...P) : x.moveTo(...P)); z1.forEach(P => x.lineTo(...P)); x.closePath();
  }
  function breakLines(p, a) {
    if (!OB.broken || p <= 0) return; x.save(); x.strokeStyle = ink(.85 * a); x.lineWidth = 1.5; x.lineJoin = 'round';
    for (const [y, e, dir] of [[OB.y0, OB.ext0, 1], [OB.y1, OB.ext1, 1]]) { const P = zig(y, e[0] - 34, e[1] + 34, dir); const n = P.length;
      x.beginPath(); const cut = (n - 1) * p; P.forEach((Q, i) => { if (i > cut + 1) return; const q = i <= cut ? Q : [mix(P[i - 1][0], Q[0], cut - (i - 1)), mix(P[i - 1][1], Q[1], cut - (i - 1))]; i ? x.lineTo(...q) : x.moveTo(...q); }); x.stroke(); }
    x.restore();
  }
  // контур чертится по длине; возвращает точку пера
  function contour(len, lw, a) {
    let rem = len, end = null; x.save(); x.strokeStyle = ink(a); x.lineWidth = lw; x.lineJoin = 'round'; x.lineCap = 'round';
    for (const o of OB.lines) { if (rem <= 0) break; const q = o.q; x.beginPath(); x.moveTo(...q[0]); end = q[0];
      for (let i = 1; i < q.length; i++) { const d = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
        if (rem >= d) { x.lineTo(...q[i]); rem -= d; end = q[i]; } else { const f = rem / d; end = [mix(q[i - 1][0], q[i][0], f), mix(q[i - 1][1], q[i][1], f)]; x.lineTo(...end); rem = 0; break; } }
      x.stroke(); }
    x.restore(); return end;
  }
  function fillObj(tt, p, yA, yB) { if (yB <= yA) return; x.save(); viewClip(); x.clip(); x.beginPath(); x.rect(OB.R.x - 60, yA, OB.R.w + 120, yB - yA); x.clip(); x.translate(OB.ox, OB.oy); drawItem(tt, p, OB.s); x.restore(); }

  // ——— штамп (основная надпись): угол → ревизии → финал ———
  const ST = {
    corner: { x: 540, y: 1372, w: 420, h: 124, r1: .58, r2: 1, c1: .62, c2: .62 },
    prod: { x: 120, y: 1176, w: 840, h: 306, r1: .48, r2: .79, c1: .74, c2: .74 },
    fin: { x: 120, y: 548, w: 840, h: 720, r1: .55, r2: .8, c1: 1, c2: .72 },
  };
  const R3 = [.3, .68, .84], R3F = [.25, .86];
  const lerpSt = (A, B, q) => { const o = {}; for (const k in A) o[k] = mix(A[k], B[k], q); return o; };
  function stampRect(t) {
    const q1 = E.inOut(prog(t, 6.88, 7.3)), q2 = E.inOut(prog(t, 10.15, 10.55)), q3 = E.inOut(prog(t, 12.5, 13.0));
    if (!goods.length) return q3 > 0 ? { st: lerpSt(ST.corner, ST.fin, q3), mode: 'fin', q: q3 } : { st: ST.corner, mode: 'corner', q: 1 };
    if (t < 10.15) return q1 < 1 ? { st: lerpSt(ST.corner, ST.prod, q1), mode: q1 < .5 ? 'corner' : 'prod', q: q1 } : { st: ST.prod, mode: 'prod', q: 1 };
    if (t < 12.5) return { st: lerpSt(ST.prod, ST.corner, q2), mode: q2 < .5 ? 'prod' : 'corner', q: q2 };
    return { st: lerpSt(ST.corner, ST.fin, q3), mode: q3 < .5 ? 'corner' : 'fin', q: q3 };
  }
  function cellLabel(s, X, Y, a) { mT(s, X + 10, Y + 15, 14, { alpha: .55 * a, weight: 600, track: 1.5 }); }
  function stamp(t) {
    const { st: s } = stampRect(t);
    const X = s.x, Y = s.y, w = s.w, h = s.h, ya = Y + h * s.r1, yb = Y + h * s.r2, xa = X + w * s.c1, xb = X + w * s.c2;
    x.save();
    x.fillStyle = rgba(PAPER, .96); x.fillRect(X, Y, w, h);
    x.strokeStyle = ink(.92); x.lineWidth = 3; x.strokeRect(X, Y, w, h);
    x.lineWidth = 1.4; x.strokeStyle = ink(.6);
    if (ya < Y + h - 1) seg(X, ya, X + w, ya); if (yb < Y + h - 1) seg(X, yb, X + w, yb);
    if (s.c1 < .999) seg(xa, Y, xa, ya); if (s.c2 < .999) seg(xb, ya, xb, yb);
    if (yb < Y + h - 2) for (const f of (t > 12.5 ? R3F : R3)) seg(X + w * f, yb, X + w * f, Y + h);
    x.restore();
    // — содержимое по состояниям —
    const aC = goods.length ? (t < 7.2 ? 1 - prog(t, 6.86, 6.98) : t < 12.5 ? prog(t, 10.45, 10.6) : 1 - prog(t, 12.5, 12.65)) : (t < 12.5 ? 1 : 1 - prog(t, 12.5, 12.65));
    if (aC > 0) {
      const s0 = ST.corner, ya0 = s0.y + s0.h * s0.r1, xa0 = s0.x + s0.w * s0.c1;
      const bt = brand + tail, bs = Math.min(34, mfit(bt, xa0 - s0.x - 24, 34, 700));
      mT(bt, s0.x + 12, (s0.y + ya0) / 2 + 2, bs, { weight: 700, alpha: aC });
      mT('ЛИСТ 1 / 1', xa0 + 12, (s0.y + ya0) / 2 + 2, Math.min(22, mfit('ЛИСТ 1 / 1', s0.x + s0.w - xa0 - 20, 22)), { alpha: .8 * aC, weight: 600 });
      mT(domain, s0.x + 12, (ya0 + s0.y + s0.h) / 2, Math.min(24, mfit(domain, xa0 - s0.x - 20, 24)), { alpha: .85 * aC, color: ACC, weight: 600 });
      mT('№ ' + DOCN, xa0 + 12, (ya0 + s0.y + s0.h) / 2, Math.min(20, mfit('№ ' + DOCN, s0.x + s0.w - xa0 - 20, 20)), { alpha: .7 * aC });
    }
    if (goods.length) stampProd(t, s, ya, yb, xa, xb);
    stampFin(t, s, ya, yb, xa, xb);
  }
  const N = goods.length, ITEM0 = 7.15, D = N ? Math.min(.85, 3.0 / N) : 0;
  const itemAt = t => clamp(Math.floor((t - ITEM0) / D), 0, N - 1);
  function stampProd(t, s, ya, yb, xa, xb) {
    const a = prog(t, 6.98, 7.1) * (1 - prog(t, 10.15, 10.3)); if (a <= 0) return;
    const X = s.x, Y = s.y, w = s.w, h = s.h;
    cellLabel('НАИМЕНОВАНИЕ', X, Y, a); cellLabel('РЕВ.', xa, Y, a); cellLabel('ЦЕНА', X, ya, a); cellLabel('ЛИСТ', xb, ya, a);
    const i = itemAt(t), ti = ITEM0 + i * D, g = goods[i];
    if (t >= ITEM0) {
      const nm = UP(g.имя || ''), ns = Math.min(70, mfit(nm, xa - X - 40, 70, 700)), pn = prog(t, ti + .02, ti + .32);
      typ(nm, X + 20, (Y + ya) / 2 + 12, ns, pn, { weight: 700, alpha: a });
      const pr = String(g.цена || ''), ps = Math.min(60, mfit(pr, xb - X - 40, 60, 700));
      typ(pr, X + 20, (ya + yb) / 2 + 8, ps, prog(t, ti + .12, ti + .4), { weight: 700, color: ACC, alpha: a });
      // ревизия: буква в треугольнике
      const L = REV[i], pq = E.out5(prog(t, ti, ti + .3)), cxr = (xa + X + w) / 2, cyr = (Y + ya) / 2 + 10, r = Math.min(62, (ya - Y) * .36);
      x.save(); x.globalAlpha = a; x.strokeStyle = ACC; x.lineWidth = 2.4; x.beginPath();
      for (let k = 0; k < 3; k++) { const an = -Math.PI / 2 + k * Math.PI * 2 / 3; const P = [cxr + Math.cos(an) * r, cyr + Math.sin(an) * r + 8]; k ? x.lineTo(...P) : x.moveTo(...P); } x.closePath(); x.stroke(); x.restore();
      mT(L, cxr, cyr + 20 + (1 - pq) * 30, r * .82, { weight: 700, align: 'center', alpha: a * pq, color: INK });
    }
    mT('1 / 1', xb + 14, (ya + yb) / 2 + 8, Math.min(30, mfit('1 / 1', X + w - xb - 28, 30)), { weight: 600, alpha: .8 * a });
    // нижняя строка: бренд, домен, масштаб, номер
    const cells = [brand + tail, domain, 'М 1:1', '№ ' + DOCN], xs = [X, X + w * R3[0], X + w * R3[1], X + w * R3[2], X + w];
    cells.forEach((c, k) => { const cw = xs[k + 1] - xs[k] - 22; mT(c, xs[k] + 11, (yb + Y + h) / 2, Math.min(k === 0 ? 30 : 22, mfit(c, cw, k === 0 ? 30 : 22, k === 0 ? 700 : 500)), { weight: k === 0 ? 700 : 500, alpha: a * (k === 1 ? 1 : .8), color: k === 1 ? ACC : INK }); });
    // ряд ревизий: A B C D, текущая подсвечена
    for (let k = 0; k < N; k++) { const on = k === i && t >= ITEM0, done = t >= ITEM0 + k * D, bx = X + w - 30 - (N - 1 - k) * 34, by = Y - 26;
      x.save(); x.globalAlpha = a * (done ? 1 : .35); x.strokeStyle = on ? ACC : INK; x.lineWidth = 1.5; x.strokeRect(bx - 14, by - 14, 28, 28);
      if (on) { x.fillStyle = ACC; x.fillRect(bx - 14, by - 14, 28, 28); } x.restore();
      mT(REV[k], bx, by + 1, 17, { weight: 700, align: 'center', alpha: a * (done ? 1 : .4), color: on ? ON_ACC : INK }); }
  }
  // финал: призыв вписывается как хук, домен набирается, кнопка-ячейка заливается
  let FN = null;
  function finLayout() {
    const s = ST.fin, X = s.x, Y = s.y, w = s.w, h = s.h, ya = Y + h * s.r1;
    const L = cta.length ? cta : [UP(brand)], maxW = w - 70, maxH = (ya - Y) - 60;
    let size = 130; for (const l of L) size = Math.min(size, mfit(l, maxW, 130, 700)); size = Math.min(size, maxH / (L.length * 1.18));
    const cw = mW('0', size, 700), lh = size * 1.18, capH = size * .73, top = Y + (ya - Y) / 2 - L.length * lh / 2 + 6;
    const lines = L.map((l, i) => ({ s: l, len: l.length, w: l.length * cw, left: X + w / 2 - l.length * cw / 2, yb: top + i * lh + (lh - capH) / 2 + capH, acc: L.length > 1 && i === L.length - 1 }));
    let t0 = 12.9; const tot = lines.reduce((a, l) => a + l.len, 0) || 1, dt = Math.min(.05, .8 / tot);
    lines.forEach(l => { l.ts = t0; l.dt = dt; l.te = t0 + l.len * dt; t0 = l.te + .06; });
    FN = { lines, size, cw, capH };
  }
  function finPen(t) { const L = FN.lines; for (const l of L) if (t <= l.te) return { X: l.left + clamp((t - l.ts) / l.dt, 0, l.len) * FN.cw, Y: l.yb - FN.capH / 2 }; const z = L[L.length - 1]; return { X: z.left + z.w + 8, Y: z.yb - FN.capH / 2 }; }
  function stampFin(t, s, ya, yb, xa, xb) {
    const a = prog(t, 12.68, 12.84); if (a <= 0) return;
    const X = s.x, Y = s.y, w = s.w, h = s.h, { size, cw, capH } = FN;
    // строки призыва: контур → заливка по клеткам
    // строки стоят в координатах финального штампа: пока штамп растёт, видна только часть внутри него
    x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip();
    x.font = `700 ${size}px ${MONO}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.letterSpacing = '0px'; x.lineJoin = 'round';
    for (const L of FN.lines) { const col = L.acc ? ACC : INK; const po = prog(t, L.ts - .28, L.ts - .08);
      x.strokeStyle = ink(.14 * a); x.lineWidth = 1; segC(X + 16, L.yb, X + w - 16, L.yb, E.out(po)); segC(X + 16, L.yb - capH, X + w - 16, L.yb - capH, E.out(po));
      for (let k = 0; k < L.len; k++) { const ch = L.s[k]; if (ch === ' ') continue; const cs = L.ts + k * L.dt, fp = E.out(prog(t, cs, cs + .2)), Xc = L.left + k * cw;
        x.strokeStyle = rgba(col, (.8 - .4 * fp) * a * po); x.lineWidth = Math.max(1.3, size / 85); x.strokeText(ch, Xc, L.yb);
        if (fp > 0) { x.save(); x.beginPath(); x.rect(Xc - 4, L.yb + size * .3 - size * 1.3 * E.out5(fp), cw + 8, size * 1.4); x.clip(); x.fillStyle = col; x.globalAlpha = a; x.fillText(ch, Xc, L.yb); x.restore(); } } }
    x.restore();
    // домен
    cellLabel('АДРЕС', X, ya, a);
    const ds = Math.min(66, mfit(domain, w - 70, 66, 700)), pd = prog(t, 13.6, 14.1);
    const dw = typ(domain, X + w / 2, (ya + yb) / 2 + 10, ds, pd, { weight: 700, color: ACC, align: 'center', alpha: a });
    x.save(); x.strokeStyle = rgba(ACC, .8 * a); x.lineWidth = 2; segC(X + w / 2 - dw / 2, (ya + yb) / 2 + 10 + ds * .62, X + w / 2 + dw / 2, (ya + yb) / 2 + 10 + ds * .62, E.inOut(prog(t, 14.05, 14.5))); x.restore();
    // нижняя строка: бренд | кнопка | №
    const xs = [X, X + w * R3F[0], X + w * R3F[1], X + w], ym = (yb + Y + h) / 2, pr = prog(t, 13.45, 13.75);
    const bt = brand + tail; mT(bt, xs[0] + 14, ym, Math.min(36, mfit(bt, xs[1] - xs[0] - 28, 36, 700)), { weight: 700, alpha: a * pr });
    if (btn) { const pf = E.inOut(prog(t, 13.85, 14.35)), bw = xs[2] - xs[1]; x.save(); x.fillStyle = rgba(ACC, a); x.fillRect(xs[1] + 4, yb + 4, (bw - 8) * pf, Y + h - yb - 8); x.restore();
      const bs = Math.min(32, mfit(btn + ' →', bw - 40, 32, 700));
      x.save(); x.beginPath(); x.rect(xs[1], yb, bw * pf, Y + h - yb); x.clip(); mT(btn + ' →', (xs[1] + xs[2]) / 2, ym, bs, { weight: 700, align: 'center', color: ON_ACC, alpha: a }); x.restore();
      x.save(); x.beginPath(); x.rect(xs[1] + bw * pf, yb, bw * (1 - pf), Y + h - yb); x.clip(); mT(btn + ' →', (xs[1] + xs[2]) / 2, ym, bs, { weight: 700, align: 'center', alpha: a * pr * .45 }); x.restore(); }
    cellLabel('ЛИСТ 1/1', xs[2], yb, a); mT(DOCN, (xs[2] + xs[3]) / 2, ym + 8, Math.min(24, mfit(DOCN, xs[3] - xs[2] - 20, 24)), { weight: 600, align: 'center', alpha: a * pr });
    // размер над штампом
    dimH(X, X + w, Y - 46, Y, Y, prog(t, 13.5, 14.5), w, { tcol: ACC });
  }

  // ——— сцена вида: заголовок, контур, циркуль, размеры, позиции, заливка, ревизии, спецификация ———
  let TT = null;
  function titleLayout() {
    if (!head.length) { TT = { lines: [], size: 0 }; return; }
    const L = head.map(UP); let size = 46; for (const l of L) size = Math.min(size, mfit(l, 800, 46, 700));
    TT = { lines: L, size, y: OB.y0 - 96 - (L.length - 1) * size * 1.22 };
  }
  function scene(t) {
    const O = OB, pal0 = undefined;
    // переход к спецификации: вид уезжает вверх и уменьшается; в финале — сворачивается
    const qm = E.inOut(prog(t, 10.2, 10.95)), qf = E.inOut(prog(t, 12.45, 13.05));
    const k = mix(1, .86, qm), ty = mix(O.cy, 478, qm);
    // заголовок (набор и стирание)
    if (TT.lines.length) TT.lines.forEach((l, i) => { const p = prog(t, 2.6 + i * .2, 3.25 + i * .2) - prog(t, 10.05, 10.4);
      typ(l, 540, TT.y + i * TT.size * 1.22, TT.size, p, { weight: 700, align: 'center', color: i === accHead ? ACC : INK }); });
    x.save(); x.translate(540, ty); x.scale(k, k); x.translate(-540, -O.cy);
    const outA = 1 - qf;
    if (outA > 0) {
      // осевые
      const pAx = E.out(prog(t, 2.55, 3.4)) * (1 - prog(t, 10.0, 10.3)) + 0;
      axis(O.cx, O.y0 - 36, O.cx, O.y1 + 36, pAx); axis(O.xL - 46, O.cy, O.xR + 46, O.cy, pAx);
      // заливка цветом снизу вверх + ревизии
      const pf = E.inOut(prog(t, 5.45, 6.45)), drain = qf;
      const fillY = mix(O.y1 + 18, O.y0 - 18, pf * (1 - drain));
      if (pf > 0) {
        if (!N || t < ITEM0) fillObj(t, pal0, fillY, O.y1 + 20);
        else { const i = itemAt(t), ti = ITEM0 + i * D, ps = E.inOut(prog(t, ti, ti + .42)), sy = mix(O.y0 - 20, O.y1 + 20, ps), prev = i ? pal(i - 1) : pal0;
          fillObj(t, pal(i), Math.max(fillY, O.y0 - 20), Math.max(fillY, sy)); fillObj(t, prev, Math.max(fillY, sy), O.y1 + 20);
          if (ps > 0 && ps < 1) { x.save(); x.strokeStyle = ACC; x.lineWidth = 2.4; seg(O.xL - 40, sy, O.xR + 40, sy); x.fillStyle = ACC; arrow(O.xL - 40, sy, Math.PI, 14, 10); arrow(O.xR + 40, sy, 0, 14, 10); x.restore(); } }
      }
      // детали (Собель): циркуль проявляет по кругу
      const rev = N > 1 ? prog(t, ITEM0 + D, ITEM0 + D + .35) : 0;
      const pe = prog(t, 3.65, 4.6), ea = mix(.9, .4, pf) * outA * (1 - rev);
      if (pe > 0 && ea > 0) { x.save(); viewClip(); x.clip();
        if (pe < 1) { x.beginPath(); x.moveTo(O.cx, O.cy); x.arc(O.cx, O.cy, 1400, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * E.inOut(pe)); x.closePath(); x.clip(); }
        x.globalAlpha = ea; x.drawImage(O.edge, O.R.x, O.R.y); x.restore();
        if (pe < 1) { const an = -Math.PI / 2 + Math.PI * 2 * E.inOut(pe), rr2 = Math.max(O.xR - O.cx, O.y1 - O.cy) + 30; x.save(); x.strokeStyle = ink(.65); x.lineWidth = 1.3; seg(O.cx, O.cy, O.cx + Math.cos(an) * rr2, O.cy + Math.sin(an) * rr2);
          x.strokeStyle = rgba(ACC, .8); x.beginPath(); x.arc(O.cx, O.cy, rr2, -Math.PI / 2, an); x.stroke(); x.fillStyle = ACC; x.beginPath(); x.arc(O.cx, O.cy, 5, 0, 7); x.fill(); x.restore(); }
      }
      // контур: чертится, потом остаётся поверх цвета; в финале сворачивается
      const pc = prog(t, 2.75, 4.35), pcE = mix(pc, E.inOut(pc), .6) * (1 - qf);
      O.penC = contour(O.total * pcE, mix(3.2, 2.2, pf), mix(.95, .7, pf) * (1 - .8 * rev));
      breakLines(E.out(prog(t, 4.0, 4.5)) * (1 - qf), 1);
      // уровень заливки
      if (pf > 0 && pf < 1) { x.save(); x.strokeStyle = ACC; x.lineWidth = 2.4; seg(O.xL - 40, fillY, O.xR + 40, fillY); x.fillStyle = ACC; arrow(O.xL - 40, fillY, Math.PI, 14, 10); arrow(O.xR + 40, fillY, 0, 14, 10); x.restore(); }
      O.fillPen = (pf > 0 && pf < 1) ? [O.xR + 40, fillY] : null;
      if (N && t >= ITEM0 && t < 10.2) { const i = itemAt(t), ti = ITEM0 + i * D, ps = E.inOut(prog(t, ti, ti + .42)); O.scanPen = ps > 0 && ps < 1 ? [O.xR + 40, mix(O.y0 - 20, O.y1 + 20, ps)] : null; } else O.scanPen = null;
      // размеры
      const pd = 1 - prog(t, 9.95, 10.25);
      dimH(O.xL, O.xR, O.y0 - 44, O.yW, O.yW, prog(t, 3.9, 4.8), O.coreW, { a: pd });
      dimV(O.xL - 64, O.cy - (O.broken ? (O.y1 - O.y0) * .5 - 30 : (O.yB - O.yT) / 2), O.cy + (O.broken ? (O.y1 - O.y0) * .5 - 30 : (O.yB - O.yT) / 2), O.xL, O.xL, prog(t, 4.1, 5.0), O.broken ? O.fullH : O.yB - O.yT, { a: pd, tcol: ACC });
      // позиции (выноски) и порядок
      const aN = 1 - prog(t, 6.75, 7.05);
      notes.forEach((nt, i) => {
        const A = O.anchors[i]; if (!A) return; const ps = prog(t, 4.55 + i * .2, 5.15 + i * .2); if (ps <= 0 || aN <= 0) return;
        const by = mix(O.y0 + 30, O.y1 - 30, notes.length > 1 ? i / (notes.length - 1) : .5), bx = Math.min(952, O.xR + 96);
        x.save(); x.globalAlpha = aN; x.fillStyle = INK; x.beginPath(); x.arc(A[0], A[1], 5 * E.out(prog(ps, 0, .2)), 0, 7); x.fill();
        const ang = Math.atan2(by - A[1], bx - A[0]), ex = bx - Math.cos(ang) * 26, ey = by - Math.sin(ang) * 26;
        x.strokeStyle = ink(.9); x.lineWidth = 1.5; seg(A[0], A[1], ex, ey, E.inOut(prog(ps, .1, .6)));
        const pb = E.out(prog(ps, .5, .9)); x.fillStyle = rgba(PAPER, .9 * pb); x.beginPath(); x.arc(bx, by, 26, 0, 7); x.fill(); x.lineWidth = 2; x.strokeStyle = ink(.95); x.beginPath(); x.arc(bx, by, 26, ang + Math.PI, ang + Math.PI + 7 * pb); x.stroke(); x.restore();
        mT(String(i + 1), bx, by + 1, 26, { weight: 700, align: 'center', alpha: aN * prog(ps, .7, 1) });
      });
    }
    x.restore();
    // таблица порядка под видом
    const aN = 1 - prog(t, 6.75, 7.05);
    if (aN > 0) notes.forEach((nt, i) => {
      const y = O.y1 + 56 + i * 56, ps = prog(t, 4.7 + i * .24, 5.35 + i * .24) - prog(t, 6.7 + i * .05, 7.0); if (ps <= 0) return;
      x.save(); x.strokeStyle = ink(.35); x.lineWidth = 1; seg(120, y + 28, 960, y + 28, E.inOut(prog(ps, 0, .6))); x.restore();
      x.save(); x.strokeStyle = ink(.9); x.lineWidth = 1.6; x.beginPath(); x.arc(144, y, 17, 0, 7 * E.out(prog(ps, 0, .4))); x.stroke(); x.restore();
      mT(String(i + 1), 144, y + 1, 19, { weight: 700, align: 'center', alpha: prog(ps, .2, .5) });
      typ(nt, 180, y, Math.min(28, mfit(nt, 770, 28)), prog(ps, .15, 1), { alpha: 1 });
    });
    // спецификация
    if (stats.length) spec(t);
  }
  function spec(t) {
    const X = 120, w = 840, Y0 = 892, hh = 56, n = stats.length, rh = Math.min(146, (1352 - Y0 - hh) / n), Yb = Y0 + hh + n * rh;
    const cols = [X, X + w * .11, X + w * .6, X + w];
    const pin = prog(t, 10.22, 10.72), pout = 1 - prog(t, 12.45, 12.95); if (pin <= 0 || pout <= 0) return;
    const pl = E.inOut(pin) * pout;
    typ('СПЕЦИФИКАЦИЯ', X, Y0 - 34, 28, prog(t, 10.2, 10.55) - prog(t, 12.45, 12.7), { weight: 700, track: 4 });
    x.save(); x.fillStyle = rgba(PAPER, .9 * pl); x.fillRect(X, Y0, w * pl, Yb - Y0);
    x.strokeStyle = ink(.92); x.lineWidth = 3;
    seg(X, Y0, X + w, Y0, pl); seg(X + w, Yb, X, Yb, pl); seg(X, Yb, X, Y0, pl); seg(X + w, Y0, X + w, Yb, pl);
    x.lineWidth = 1.4; x.strokeStyle = ink(.6);
    for (let i = 0; i <= n - 1; i++) seg(X, Y0 + hh + i * rh, X + w, Y0 + hh + i * rh, E.inOut(prog(t, 10.35 + i * .08, 10.85 + i * .08)) * pout);
    for (let c = 1; c < 3; c++) seg(cols[c], Y0, cols[c], Yb, E.inOut(prog(t, 10.4 + c * .06, 10.9 + c * .06)) * pout);
    x.restore();
    const ah = prog(t, 10.55, 10.8) * pout;
    [['ПОЗ.', 0], ['НАИМЕНОВАНИЕ', 1], ['КОЛ.', 2]].forEach(([s, c]) => mT(s, c === 2 ? cols[3] - 18 : cols[c] + 14, Y0 + hh / 2 + 1, 17, { weight: 600, alpha: .6 * ah, track: 2, align: c === 2 ? 'right' : 'left' }));
    stats.forEach((d, i) => {
      const yc = Y0 + hh + i * rh + rh / 2, pa = prog(t, 10.6 + i * .12, 10.9 + i * .12) * pout; if (pa <= 0) return;
      mT(String(i + 1), (cols[0] + cols[1]) / 2, yc + 2, 30, { weight: 700, align: 'center', alpha: pa });
      // подпись в 1–2 строки
      const sig = String(d.подпись || ''), cwid = cols[2] - cols[1] - 30; let sz = 28, L = [sig];
      if (mW(sig, sz) > cwid) { const wds = sig.split(/\s+/); let best = null; for (let k = 1; k < wds.length; k++) { const a = wds.slice(0, k).join(' '), b = wds.slice(k).join(' '), m = Math.max(mW(a, sz), mW(b, sz)); if (!best || m < best.m) best = { a, b, m }; } if (best) { L = [best.a, best.b]; sz = Math.min(sz, sz * cwid / best.m); } else sz = mfit(sig, cwid, sz); }
      L.forEach((l, j) => typ(l, cols[1] + 16, yc + (j - (L.length - 1) / 2) * sz * 1.22, sz, prog(t, 10.6 + i * .12, 11.1 + i * .12) - prog(t, 12.45, 12.8), { cursor: false }));
      const pc = E.out5(prog(t, 10.8 + i * .16, 11.9 + i * .16)), v = num(+d.число * pc) + (d.плюс || ''), full = num(+d.число) + (d.плюс || '');
      const vs = Math.min(64, mfit(full, cols[3] - cols[2] - 36, 64, 700));
      mT(v, cols[3] - 18, yc + 3, vs, { weight: 700, color: ACC, align: 'right', alpha: pa });
      // бегущая подсветка ячейки, пока считает
      if (pc > 0 && pc < 1) { x.save(); x.fillStyle = rgba(ACC, .1 * pa); x.fillRect(cols[2] + 2, yc - rh / 2 + 2, (cols[3] - cols[2] - 4) * pc, rh - 4); x.restore(); }
    });
  }

  // ——— кадр ———
  const SH = 1240;
  window.КАДР = t => {
    if (!OB) { buildObject(); hookLayout(); titleLayout(); finLayout(); }
    const z = 1 + .022 * E.inOut(t / DUR), dx = noise(3, t * .32) * 5, dy = noise(7, t * .28) * 5;
    x.save(); x.translate(540, 960); x.scale(z, z); x.translate(-540 + dx, -960 + dy);
    const pan = SH * E.inOut(prog(t, 2.2, 3.15));
    paper(pan); frame();
    let P = null, pa = 0;
    x.save(); x.beginPath(); x.rect(FR.x0 + 2, FR.y0 + 2, FR.x1 - FR.x0 - 4, FR.y1 - FR.y0 - 4); x.clip();
    if (t < 3.3) { x.save(); x.translate(0, -pan); hook(t); x.restore(); }
    if (t > 2.0) { x.save(); x.translate(0, SH - pan); scene(t); x.restore(); }
    x.restore();
    stamp(t);
    // перо: хук → (перелёт) → контур → уровень заливки → ревизии → финал
    const hp = hookPen(t), hS = { X: hp.X, Y: hp.Y - pan };
    if (t < 2.75) { if (t < 2.1) { P = hS; pa = 1; } else { const c0 = OB.lines[0] ? OB.lines[0].q[0] : [OB.cx, OB.y0], q = E.inOut(prog(t, 2.1, 2.75)), hE = hookPen(2.1); P = { X: mix(hE.X, c0[0], q), Y: mix(hE.Y - pan, c0[1] + SH - pan, q) }; pa = 1; } }
    else if (t < 4.45 && OB.penC) { P = { X: OB.penC[0], Y: OB.penC[1] + SH - pan }; pa = 1 - prog(t, 4.3, 4.45); }
    else if (OB.fillPen) { P = { X: OB.fillPen[0], Y: OB.fillPen[1] }; pa = prog(t, 5.45, 5.6) * (1 - prog(t, 6.3, 6.45)); }
    else if (OB.scanPen) { P = { X: OB.scanPen[0], Y: OB.scanPen[1] }; pa = 1; }
    else if (t > 12.9) { const fp = finPen(t); P = fp; pa = prog(t, 12.9, 13.05) * (1 - prog(t, 14.0, 14.3)); }
    if (P) pen(P.X, P.Y, pa, !(t < 2.1 || t > 13));
    x.restore();
  };
})();

  },
  retro() {
// СТИЛЬ «Ретро-ОС»: сайт как программа на рабочем столе Windows 98 / Mac OS 9.
// Бирюзовый стол, серые окна с объёмной кромкой, заголовки окон и полоса загрузки в цвете бренда,
// пиксельный курсор ездит по кривым и жмёт кнопки. Сцены связаны «летящей рамкой» окна (анимация Win95).
// Хук-предупреждение 0–1,8 (дзынь ×2, курсор жмёт кнопку) → «Установка БРЕНД.exe» 2,1–5,1 (шаги, полоса, песочные часы) →
// «Просмотр изображений» 5,4–8,9 (товары листаются, картинка грузится пикселями) →
// каскад окон за курсором с цифрами 9,1–11,9 → заставка + окно «Готово!» с призывом и доменом 12,3–15.
// Все слова бренда, цвета и цифры — из САЙТ. Слова интерфейса ОС («OK», «Пуск», «Файл») — общие для любого сайта.
window.ИМЯ = 'retro';
DUR = 15;
FONT = САЙТ.шрифт || FONT;

(() => {
  const S = САЙТ, C = S.цвета || {};
  const U = s => (S.капс ? String(s).toUpperCase() : String(s));
  const SYS = 'Tahoma,"MS Sans Serif",Verdana,Geneva,"DejaVu Sans",sans-serif';

  // ── цвет ──
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  const toHex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mixH = (a, b, p) => { const A = hex2rgb(a), Bb = hex2rgb(b); return toHex(A.map((v, i) => mix(v, Bb[i], p))); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const con = (a, b) => { const A = lum(a), Bb = lum(b); return (Math.max(A, Bb) + .05) / (Math.min(A, Bb) + .05); };
  const darkTo = (h, bg, r) => { let k = h; for (let i = 0; i < 30 && con(k, bg) < r; i++) k = mixH(k, '#000000', .08); return k; };
  const lightTo = (h, bg, r) => { let k = h; for (let i = 0; i < 30 && con(k, bg) < r; i++) k = mixH(k, '#ffffff', .08); return k; };

  const ACC = isHex(C.акцент) ? C.акцент : '#1084d0';
  const T1 = darkTo(ACC, '#ffffff', 5.4);                                   // заголовок окна слева (белый текст)
  const T2 = con(ACC, '#ffffff') < 2.2 ? ACC : mixH(ACC, '#ffffff', .38);    // заголовок окна справа
  const ACCT = darkTo(ACC, '#ffffff', 3.6);                                 // акцент как текст на светлом
  const BAR = ACC, TROUGH = lum(ACC) > .38 ? '#101010' : '#ffffff';          // полоса загрузки
  const DESK = mixH('#008080', ACC, .06);                                   // бирюзовый стол с каплей бренда
  const STAR = lightTo(ACC, '#000000', 6);                                  // акцент на чёрной заставке
  const FACE = '#c0c0c0', HI = '#ffffff', LITE = '#dfdfdf', SHD = '#808080', DK = '#000000', INK = '#000000';
  const BV = 3, TH = 62;                                                    // толщина кромки, высота заголовка

  // ── данные ──
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(s => s == null ? '' : String(s).trim()).filter(Boolean);
  const BRAND = String(S.бренд || S.домен || '').trim();
  const LOGO = U(BRAND + (S.хвостЛого || ''));
  const HEAD = arr(S.заголовок).map(U), HACC = Number.isInteger(S.акцентСтрока) ? S.акцентСтрока : HEAD.length - 1;
  const HOOK = (arr(S.хук).length ? arr(S.хук) : HEAD.length ? HEAD : [BRAND]).map(U);
  const STEPS = (arr(S.шаги).length ? arr(S.шаги) : arr(S.преимущества)).slice(0, 5);
  const TICK = arr(S.преимущества).length ? arr(S.преимущества) : arr(S.подзаголовок);
  const PRODS = (S.товары || []).filter(g => g && (g.имя || g.цена)).slice(0, 5);
  const NUMS = (S.цифры || []).filter(d => d && isFinite(+d.число)).slice(0, 4);
  const CTA = (arr(S.призыв).length ? arr(S.призыв) : arr(S.кнопка || BRAND)).map(U);
  const DOMAIN = String(S.домен || '').trim();
  const BTN = arr(S.кнопка)[0] || 'OK';
  const LETTER = (BRAND.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '')[0] || '✦').toUpperCase();
  const EXE = BRAND.replace(/\s+/g, '') + '.exe';
  const fileOf = g => String(g.имя || BRAND).trim() + '.bmp';

  // ── мелочи рисования ──
  const fitS = (s, maxW, size, weight = 700) => { const w = textW(s, size, weight, 0, SYS); return w > maxW ? size * maxW / w : size; };
  // обрезка с многоточием и перенос по словам (текст не мельчает ниже 34 px)
  const ell = (s, maxW, size, weight = 400) => { s = String(s); if (textW(s, size, weight, 0, SYS) <= maxW) return s; let k = s; while (k.length > 1 && textW(k + '…', size, weight, 0, SYS) > maxW) k = k.slice(0, -1); return k.trimEnd() + '…'; };
  const wrapS = (s, maxW, size, weight = 400, maxL = 2) => {
    const out = []; let cur = '';
    for (const w of String(s).split(/\s+/).filter(Boolean)) { const n2 = cur ? cur + ' ' + w : w; if (!cur || textW(n2, size, weight, 0, SYS) <= maxW) cur = n2; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    if (out.length > maxL) { const keep = out.slice(0, maxL); keep[maxL - 1] = ell(out.slice(maxL - 1).join(' '), maxW, size, weight); return keep; }
    return out.map(l => ell(l, maxW, size, weight));
  };
  // блок крупного текста: самый большой кегль, при котором строки (с переносом) влезают в maxL строк
  const fitBlock = (lines, maxW, maxS, minS, maxL, lead = 1.08, maxH = 1e9, pref = minS) => {
    // сначала строки как в данных, без переноса — если кегль не мельче pref
    const ns = Math.min(maxS, ...lines.map(l => fitS(l, maxW, maxS)), maxH / (Math.max(1, lines.length) * lead));
    if (lines.length && lines.length <= maxL && ns >= pref) return { size: ns, rows: lines.map((l, i) => ({ s: l, i })) };
    let best = null;
    for (let size = maxS; size >= minS; size -= 2) {
      const rows = []; lines.forEach((l, i) => wrapS(l, maxW, size, 700, 99).forEach(s2 => rows.push({ s: s2, i })));
      best = { size, rows };
      if (rows.length <= maxL && rows.every(r => textW(r.s, size, 700, 0, SYS) <= maxW) && rows.length * size * lead <= maxH) return best;
    }
    if (best.rows.length > maxL) { best.rows = best.rows.slice(0, maxL); const r = best.rows[maxL - 1]; r.s = ell(r.s + '…', maxW, best.size, 700); }
    return best;
  };
  // число с дробной частью как в данных: 4.9 → «4,9», 10000 → «10 000»
  const fmtN = (v, ref) => { const d = (String(ref).split('.')[1] || '').length; return d ? v.toFixed(d).replace('.', ',') : num(v); };
  const sT = (s, X, Y, o = {}) => T(s, X, Y, { font: SYS, weight: 700, color: INK, align: 'left', ...o });
  const lerpR = (A, Bq, p) => ({ X: mix(A.X, Bq.X, p), Y: mix(A.Y, Bq.Y, p), w: mix(A.w, Bq.w, p), h: mix(A.h, Bq.h, p) });
  const inR = (r, d = 0) => ({ X: r.X + d, Y: r.Y + d, w: r.w - 2 * d, h: r.h - 2 * d });
  function edge(X, Y, w, h, b, tl, br) {
    x.fillStyle = tl; x.fillRect(X, Y, w, b); x.fillRect(X, Y, b, h);
    x.fillStyle = br; x.fillRect(X, Y + h - b, w, b); x.fillRect(X + w - b, Y, b, h);
  }
  function bevel(X, Y, w, h, mode = 'raised') {
    if (mode === 'raised') { edge(X, Y, w, h, BV, LITE, DK); edge(X + BV, Y + BV, w - 2 * BV, h - 2 * BV, BV, HI, SHD); }
    else if (mode === 'sunken') { edge(X, Y, w, h, BV, SHD, HI); edge(X + BV, Y + BV, w - 2 * BV, h - 2 * BV, BV, DK, LITE); }
    else if (mode === 'pressed') { edge(X, Y, w, h, BV, DK, HI); edge(X + BV, Y + BV, w - 2 * BV, h - 2 * BV, BV, SHD, LITE); }
    else if (mode === 'thin') edge(X, Y, w, h, 2, SHD, HI);
  }
  const etched = (X, Y, w) => { x.fillStyle = SHD; x.fillRect(X, Y, w, 2); x.fillStyle = HI; x.fillRect(X, Y + 2, w, 2); };
  function field(r, bg = '#ffffff') { x.fillStyle = bg; x.fillRect(r.X, r.Y, r.w, r.h); bevel(r.X, r.Y, r.w, r.h, 'sunken'); }
  // текст «вдавленный» (неактивная кнопка)
  function engraved(s, X, Y, o) { sT(s, X + 2, Y + 2, { ...o, color: HI }); sT(s, X, Y, { ...o, color: SHD }); }

  function button(r, label, o = {}) {
    let { X, Y, w, h } = r;
    if (o.def) { x.fillStyle = DK; x.fillRect(X, Y, w, h); X += 3; Y += 3; w -= 6; h -= 6; }
    x.fillStyle = FACE; x.fillRect(X, Y, w, h);
    bevel(X, Y, w, h, o.pressed ? 'pressed' : 'raised');
    const d = o.pressed ? 3 : 0, size = o.size || fitS(label, w - 40, 40);
    if (o.disabled) engraved(label, X + w / 2 + d, Y + h / 2 + d, { align: 'center', size, weight: 400 });
    else if (o.draw) o.draw(X + w / 2 + d, Y + h / 2 + d);
    else sT(label, X + w / 2 + d, Y + h / 2 + d + 1, { align: 'center', size, weight: o.weight || 400 });
    if (o.focus) { x.save(); x.setLineDash([3, 3]); x.lineWidth = 2; x.strokeStyle = DK; x.strokeRect(X + 11 + d, Y + 11 + d, w - 22, h - 22); x.restore(); }
  }
  function capBtn(X, Y, w, h, kind) {
    x.fillStyle = FACE; x.fillRect(X, Y, w, h); bevel(X, Y, w, h, 'raised');
    x.fillStyle = DK; const cx = X + w / 2, cy = Y + h / 2;
    if (kind === 'min') x.fillRect(cx - 11, cy + 8, 20, 6);
    else if (kind === 'max') { x.lineWidth = 3; x.strokeStyle = DK; x.strokeRect(cx - 12, cy - 11, 24, 21); x.fillRect(cx - 12, cy - 11, 24, 6); }
    else { x.save(); x.lineWidth = 5; x.lineCap = 'square'; x.strokeStyle = DK; x.beginPath(); x.moveTo(cx - 9, cy - 8); x.lineTo(cx + 9, cy + 8); x.moveTo(cx + 9, cy - 8); x.lineTo(cx - 9, cy + 8); x.stroke(); x.restore(); }
  }
  function titleGrad(X, w, active) {
    const g = x.createLinearGradient(X, 0, X + w, 0);
    if (active) { g.addColorStop(0, T1); g.addColorStop(.35, T1); g.addColorStop(1, T2); } else { g.addColorStop(0, '#808080'); g.addColorStop(1, '#b8b8b8'); }
    return g;
  }
  // значок программы: квадрат в цветах бренда с первой буквой
  function appIcon(X, Y, s) {
    x.fillStyle = DK; x.fillRect(X, Y, s, s);
    const g = x.createLinearGradient(X, Y, X + s, Y + s); g.addColorStop(0, T2); g.addColorStop(1, T1);
    x.fillStyle = g; x.fillRect(X + 2, Y + 2, s - 4, s - 4);
    const k = Math.max(2, Math.round(s * .08));
    x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(X + 2, Y + 2, s - 4, k); x.fillRect(X + 2, Y + 2, k, s - 4);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(X + 2, Y + s - 2 - k, s - 4, k); x.fillRect(X + s - 2 - k, Y + 2, k, s - 4);
    const fs = s * .6;
    T(LETTER, X + s / 2 + s * .04, Y + s / 2 + s * .07, { font: SYS, weight: 700, size: fs, color: DK });
    T(LETTER, X + s / 2, Y + s / 2 + s * .03, { font: SYS, weight: 700, size: fs, color: '#ffffff' });
  }
  // окно: рамка, заголовок, кнопки; возвращает клиентскую область
  const client = r => ({ X: r.X + 2 * BV + 3, Y: r.Y + 2 * BV + 3 + TH + 4, w: r.w - 4 * BV - 6, h: r.h - (2 * BV + 3 + TH + 4) - 2 * BV - 3 });
  function win(r, title, o = {}) {
    const { X, Y, w, h } = r, active = o.active !== false;
    x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(X + 12, Y + 14, w, h);           // жёсткая тень без размытия
    x.fillStyle = FACE; x.fillRect(X, Y, w, h); bevel(X, Y, w, h, 'raised');
    const tx = X + 2 * BV + 3, ty = Y + 2 * BV + 3, tw = w - 4 * BV - 6;
    x.fillStyle = titleGrad(tx, tw, active); x.fillRect(tx, ty, tw, TH);
    const bw = 52, bh = TH - 16, by = ty + 8;
    const kinds = o.caps || ['min', 'max', 'close'];
    let bx = tx + tw - 8;
    for (let i = kinds.length - 1; i >= 0; i--) { bx -= bw; capBtn(bx, by, bw, bh, kinds[i]); bx -= kinds[i] === 'close' ? 8 : 2; }
    let lx = tx + 14;
    if (o.icon !== false) { appIcon(tx + 10, ty + 11, TH - 22); lx = tx + TH + 2; }
    const size = Math.min(o.tsize || 36, fitS(title, bx - lx - 14, o.tsize || 36));
    sT(title, lx, ty + TH / 2 + 1, { size, color: active ? '#ffffff' : '#d8d8d8' });
    return client(r);
  }

  // ── значки ──
  function warnIcon(cx, cy, s) {
    x.save(); x.lineJoin = 'round';
    x.beginPath(); x.moveTo(cx, cy - s * .5); x.lineTo(cx + s * .58, cy + s * .5); x.lineTo(cx - s * .58, cy + s * .5); x.closePath();
    x.fillStyle = 'rgba(0,0,0,.35)'; x.save(); x.translate(6, 6); x.fill(); x.restore();
    x.fillStyle = '#ffd200'; x.fill(); x.lineWidth = s * .06; x.strokeStyle = DK; x.stroke();
    x.fillStyle = DK; x.fillRect(cx - s * .06, cy - s * .2, s * .12, s * .42); x.fillRect(cx - s * .06, cy + s * .29, s * .12, s * .12);
    x.restore();
  }
  function okIcon(cx, cy, r) {
    x.save();
    x.beginPath(); x.arc(cx + 5, cy + 5, r, 0, 7); x.fillStyle = 'rgba(0,0,0,.35)'; x.fill();
    x.beginPath(); x.arc(cx, cy, r, 0, 7); const g = x.createRadialGradient(cx - r * .4, cy - r * .4, 0, cx, cy, r);
    g.addColorStop(0, T2); g.addColorStop(1, T1); x.fillStyle = g; x.fill(); x.lineWidth = 4; x.strokeStyle = DK; x.stroke();
    x.lineWidth = r * .24; x.lineJoin = 'miter'; x.lineCap = 'square'; x.strokeStyle = '#ffffff';
    x.beginPath(); x.moveTo(cx - r * .42, cy + r * .02); x.lineTo(cx - r * .1, cy + r * .34); x.lineTo(cx + r * .46, cy - r * .3); x.stroke();
    x.restore();
  }
  function checkbox(X, Y, s, on) {
    field({ X, Y, w: s, h: s });
    if (!on) return;
    x.save(); x.lineWidth = s * .16; x.lineJoin = 'miter'; x.lineCap = 'square'; x.strokeStyle = DK;
    x.beginPath(); x.moveTo(X + s * .25, Y + s * .5); x.lineTo(X + s * .43, Y + s * .7); x.lineTo(X + s * .76, Y + s * .3); x.stroke(); x.restore();
  }
  // значки рабочего стола (пиксельно-простые фигуры)
  function deskIcon(kind, cx, Y, label) {
    const s = 92;
    x.save();
    if (kind === 'pc') {
      x.fillStyle = FACE; x.fillRect(cx - 44, Y, 88, 66); bevel(cx - 44, Y, 88, 66, 'thin');
      const g = x.createLinearGradient(0, Y + 8, 0, Y + 56); g.addColorStop(0, '#2a6fd6'); g.addColorStop(1, '#0a2a7a');
      x.fillStyle = g; x.fillRect(cx - 35, Y + 8, 70, 48);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(cx - 35, Y + 8, 70, 6);
      x.fillStyle = FACE; x.fillRect(cx - 14, Y + 66, 28, 10); x.fillRect(cx - 34, Y + 76, 68, 12); bevel(cx - 34, Y + 76, 68, 12, 'thin');
    } else if (kind === 'bin') {
      x.fillStyle = '#e8e8e8'; x.beginPath(); x.moveTo(cx - 34, Y + 14); x.lineTo(cx + 34, Y + 14); x.lineTo(cx + 26, Y + 88); x.lineTo(cx - 26, Y + 88); x.closePath(); x.fill();
      x.lineWidth = 3; x.strokeStyle = DK; x.stroke();
      x.strokeStyle = SHD; x.lineWidth = 2; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx + i * 12, Y + 22); x.lineTo(cx + i * 9, Y + 82); x.stroke(); }
      x.fillStyle = '#d0d0d0'; x.fillRect(cx - 38, Y + 6, 76, 10); x.strokeStyle = DK; x.lineWidth = 3; x.strokeRect(cx - 38, Y + 6, 76, 10);
    } else if (kind === 'folder') {
      x.fillStyle = '#e8b400'; x.fillRect(cx - 44, Y + 14, 36, 14);
      x.fillStyle = '#ffd84a'; x.fillRect(cx - 44, Y + 24, 88, 62); x.lineWidth = 3; x.strokeStyle = DK; x.strokeRect(cx - 44, Y + 24, 88, 62);
      x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(cx - 41, Y + 27, 82, 5);
    } else if (kind === 'app') {
      appIcon(cx - 44, Y + 2, 86);
      x.fillStyle = HI; x.fillRect(cx - 44, Y + 62, 28, 28); x.strokeStyle = DK; x.lineWidth = 2; x.strokeRect(cx - 44, Y + 62, 28, 28);
      x.lineWidth = 4; x.beginPath(); x.moveTo(cx - 38, Y + 84); x.quadraticCurveTo(cx - 36, Y + 70, cx - 22, Y + 70); x.stroke();
      x.fillStyle = DK; x.beginPath(); x.moveTo(cx - 22, Y + 63); x.lineTo(cx - 22, Y + 77); x.lineTo(cx - 16, Y + 70); x.fill();
    }
    x.restore();
    const ls = fitS(label, 190, 32, 400);
    T(label, cx + 2, Y + s + 30, { font: SYS, weight: 400, size: ls, color: 'rgba(0,0,0,.45)' });
    T(label, cx, Y + s + 28, { font: SYS, weight: 400, size: ls, color: '#ffffff' });
  }

  // ── пиксельный курсор ──
  const ARROW = ['B', 'BB', 'BWB', 'BWWB', 'BWWWB', 'BWWWWB', 'BWWWWWB', 'BWWWWWWB', 'BWWWWWWWB', 'BWWWWWWWWB',
    'BWWWWWBBBBB', 'BWWBWWB', 'BWB.BWWB', 'BB..BWWB', 'B....BWWB', '.....BWWB', '......BWWB', '......BWWB', '.......BB'];
  const GLASS = ['BBBBBBBBBBB', 'BWWWWWWWWWB', '.BWYYYYYWB.', '.BWWYYYWWB.', '..BWWYWWB..', '...BWYWB...', '....BWB....',
    '...BWWWB...', '..BWWYWWB..', '.BWWWYWWWB.', '.BWWYYYWWB.', '.BWYYYYYWB.', 'BWWWWWWWWWB', 'BBBBBBBBBBB'];
  function sprite(map, X, Y, p, ox = 0, oy = 0) {
    const col = { B: DK, W: '#ffffff', Y: '#e0b000' };
    x.save(); x.translate(Math.round(X - ox * p), Math.round(Y - oy * p));
    x.fillStyle = 'rgba(0,0,0,.25)';
    map.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') x.fillRect(i * p + 5, j * p + 5, p, p); });
    map.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const k = row[i]; if (k === '.') continue; x.fillStyle = col[k]; x.fillRect(i * p, j * p, p + .6, p + .6); } });
    x.restore();
  }

  // ── раскладка окон ──
  const AL = { X: 110, Y: 640, w: 860, h: 640 };      // предупреждение-хук (высота ниже — по тексту)
  const IN = { X: 110, Y: 320, w: 860, h: 1110 };     // мастер установки
  const VW = { X: 110, Y: 290, w: 860, h: 1190 };     // просмотр изображений
  const FN = { X: 110, Y: 600, w: 860, h: 760 };      // «Готово!» (высота ниже — по тексту)
  const TASK = { X: 222, Y: H - 86, w: 330, h: 72 };  // кнопка задачи на панели

  // предупреждение
  const hookX0 = 2 * BV + 3 + 156, hookW = AL.w - 4 * BV - 6 - 156 - 30;
  const HB = fitBlock(HOOK, hookW, 124, 50, 5, 1.06, 540, 100), hookSize = HB.size;
  AL.h = (2 * BV + 3 + TH + 4) + 40 + HB.rows.length * hookSize * 1.06 + 46 + 96 + 34 + 2 * BV + 3;
  AL.Y = Math.round(980 - AL.h / 2);
  const alC = client(AL), hookX = AL.X + hookX0;
  const alBtnW = Math.min(alC.w - 120, Math.max(300, textW(BTN, 40, 700, 0, SYS) + 110));
  const alBtn = { X: alC.X + (alC.w - alBtnW) / 2, Y: alC.Y + alC.h - 96 - 34, w: alBtnW, h: 96 };
  // мастер установки
  const inCW = IN.w - 4 * BV - 6;
  const nSt = Math.max(1, STEPS.length), rowH = Math.min(92, 400 / nSt);
  const tickTxt = it => `Распаковка: ${it}`;
  const tickL = Math.max(1, ...TICK.map(it => wrapS(tickTxt(it), inCW - 68, 34).length));
  const inOff = { st: 250 + 34 };
  inOff.pg = inOff.st + STEPS.length * rowH + 40;
  inOff.tick = inOff.pg + 32 + 70 + 46;
  inOff.btn = inOff.tick + (TICK.length ? (tickL - 1) * 42 + 30 : -40) + 56;
  IN.h = (2 * BV + 3 + TH + 4) + inOff.btn + 86 + 30 + 2 * BV + 3;
  IN.Y = Math.max(290, Math.round(900 - IN.h / 2));
  const inC = client(IN);
  const inHead = { X: inC.X, Y: inC.Y, w: inC.w, h: 250 };
  const stY = inC.Y + inOff.st, pgY = inC.Y + inOff.pg, tickY = inC.Y + inOff.tick;
  const inBtnY = inC.Y + inOff.btn;
  const inBtns = (() => { const w = 232, R = inC.X + inC.w - 26; const b3 = R - w, b2 = b3 - 26 - w, b1 = b2 - w; return [b1, b2, b3].map(X => ({ X, Y: inBtnY, w, h: 86 })); })();
  // просмотрщик
  const vwC = client(VW);
  const tbY = vwC.Y + 60;
  const vPrev = { X: vwC.X + 14, Y: tbY + 6, w: 100, h: 84 }, vNext = { X: vwC.X + 118, Y: tbY + 6, w: 100, h: 84 };
  const pv = { X: vwC.X + 10, Y: tbY + 104, w: vwC.w - 20, h: vwC.Y + vwC.h - 100 - (tbY + 104) };
  const stBar = vwC.Y + vwC.h - 88;
  // финал
  const CB = fitBlock(CTA, FN.w - 4 * BV - 6 - 198, 104, 52, 3, 1.06, 330, 66);
  FN.h = (2 * BV + 3 + TH + 4) + 44 + Math.max(CB.rows.length * CB.size * 1.06, 150) + 74 + 104 + 64 + 100 + 34 + 2 * BV + 3;
  FN.Y = Math.max(560, Math.round(1010 - FN.h / 2));
  const fnC = client(FN);
  const ctaX = fnC.X + 168, ctaW = fnC.X + fnC.w - 30 - ctaX;
  const ctaSize = CB.size, ctaH = CB.rows.length * ctaSize * 1.06;
  const fnFieldY = fnC.Y + 44 + Math.max(ctaH, 150) + 74;
  const fnField = { X: fnC.X + 36, Y: fnFieldY, w: fnC.w - 72, h: 104 };
  const fnBtn = { X: fnC.X + (fnC.w - 300) / 2, Y: fnC.Y + fnC.h - 34 - 100, w: 300, h: 100 };

  // ── время ──
  const tA_click = 1.66, tA_z0 = 1.80, tA_z1 = 2.04;
  const tB_p0 = 2.22, tB_p1 = 4.22, tB_click = 4.52, tB_z0 = 4.66, tB_z1 = 4.90;
  const tC_z0 = 9.00, tC_z1 = 9.24;
  const cS = 9.24, cE = 11.92;
  const tE_d0 = 12.00, tE_d1 = 12.32, tF_z0 = 12.24, tF_z1 = 12.44, tF_click = 13.86;
  // смена товаров в просмотрщике: каждая новая картинка «грузится по модему» LD секунд
  const nP = Math.max(1, PRODS.length), V0 = 5.0, LD = .5;
  const swGap = (8.80 - V0) / nP;
  const SW = Array.from({ length: nP - 1 }, (_, k) => V0 + swGap * (k + 1) + .1);
  const prodAt = t => { let k = 0; SW.forEach((s, i) => { if (t >= s) k = i + 1; }); return k; };
  // каскад: крупные окна, стопка по центру кадра; каждое окно тащат снизу-слева на место (след не закрывает соседей)
  const NC = NUMS.length ? NUMS : [{ число: 0, плюс: '', подпись: '', текст: LOGO }];
  const nC = NC.length, cGap = 40, cMid = 900;
  const cWh = Math.min(340, (1160 - (nC - 1) * cGap) / nC), cWw = 800;
  const cTot = nC * cWh + (nC - 1) * cGap, cTop = cMid - cTot / 2, cDrop = Math.min(110, cWh * .4);
  const per = (cE - cS) / nC, drag = per * .66, STAMP = .04;
  const cPath = (i, u) => ({ X: mix(-30, (W - cWw) / 2, E.inOut(u)), Y: cTop + i * (cWh + cGap) + mix(cDrop, 0, E.inOut(u)) - Math.sin(u * Math.PI) * 24 });
  const grip = { dx: cWw * .2, dy: 2 * BV + 3 + TH / 2 };
  const cR = (i, u) => { const p = cPath(i, u); return { X: p.X, Y: p.Y, w: cWw, h: cWh }; };

  // ── курсор: отрезки-кривые по времени ──
  const ctr = r => [r.X + r.w / 2, r.Y + r.h / 2];
  const P_start = [870, 1560], P_wait = [800, 1010];
  const SEG = [];
  const seg = (a, b, P, Q, bend = .2) => SEG.push({ a, b, P, Q, bend });
  seg(.12, 1.58, P_start, [ctr(alBtn)[0] + 30, ctr(alBtn)[1] + 6], .22);
  seg(1.90, 2.38, [ctr(alBtn)[0] + 30, ctr(alBtn)[1] + 6], P_wait, -.25);
  const P_wait2 = [P_wait[0] - 46, P_wait[1] + 34];
  seg(2.40, tB_p1 - .06, P_wait, P_wait2, .35);
  seg(tB_p1 + .04, tB_click - .04, P_wait2, [ctr(inBtns[1])[0] + 20, ctr(inBtns[1])[1] + 4], .25);
  const nextAt = [ctr(vNext)[0] + 8, ctr(vNext)[1] + 6];
  seg(tB_z1 - .1, Math.min(V0 + swGap * .7, (SW[0] || 9) - .3), [ctr(inBtns[1])[0] + 20, ctr(inBtns[1])[1] + 4], nextAt, .3);
  // между щелчками рука чуть отходит и возвращается
  SW.forEach((s, k) => { const back = s - .1, nxt = SW[k + 1]; if (nxt) { seg(s + .08, s + .08 + (nxt - s) * .45, nextAt, [nextAt[0] + 70, nextAt[1] + 120], .4); seg(nxt - .1 - (nxt - s) * .4, nxt - .14, [nextAt[0] + 70, nextAt[1] + 120], nextAt, .4); } });
  const lastAway = SW.length ? [nextAt[0] + 70, nextAt[1] + 120] : nextAt;
  if (SW.length) seg(SW[SW.length - 1] + .08, Math.min(SW[SW.length - 1] + .6, tC_z0 - .36), nextAt, lastAway, .4);
  const cStart = i => { const r = cR(i, 0); return [r.X + grip.dx, r.Y + grip.dy]; };
  const cEnd = i => { const r = cR(i, 1); return [r.X + grip.dx, r.Y + grip.dy]; };
  seg(tC_z0 - .3, cS, lastAway, cStart(0), .2);
  for (let i = 0; i < nC; i++) {
    const a = cS + i * per;
    SEG.push({ a, b: a + drag, fn: u => { const r = cR(i, u); return [r.X + grip.dx, r.Y + grip.dy]; } });
    if (i < nC - 1) seg(a + drag + .02, cS + (i + 1) * per, cEnd(i), cStart(i + 1), .35);
  }
  const okAt = [ctr(fnBtn)[0] + 26, ctr(fnBtn)[1] + 8];
  seg(cE + .05, tF_click - .1, cEnd(nC - 1), okAt, -.28);
  seg(tF_click + .3, 14.75, okAt, [okAt[0] + 150, okAt[1] + 110], .3);
  function cursorAt(t) {
    let pos = SEG[0].P;
    for (const s of SEG) {
      if (t < s.a) break;
      if (t <= s.b) {
        const u = (t - s.a) / (s.b - s.a);
        if (s.fn) return s.fn(u);
        const e = E.inOut(u), [x0, y0] = s.P, [x1, y1] = s.Q, dx = x1 - x0, dy = y1 - y0;
        const mx = (x0 + x1) / 2 - dy * s.bend, my = (y0 + y1) / 2 + dx * s.bend;
        return [(1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * mx + e * e * x1, (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * my + e * e * y1];
      }
      pos = s.fn ? s.fn(1) : s.Q;
    }
    return pos;
  }
  const pressed = (t, at, len = .12) => t >= at && t < at + len;

  // ── летящая рамка окна (анимация открытия Win95) ──
  function ghosts(A, Bq, p) {
    if (p < 0 || p >= 1) return;
    for (let k = 3; k >= 0; k--) {
      const q = E.inOut(clamp(p * 1.45 - k * .15));
      if (q >= 1 || (q <= 0 && k > 0)) continue;   // первая рамка видна с нулевого кадра перехода — без пустого кадра
      const r = lerpR(A, Bq, q);
      x.save();
      x.lineWidth = 4; x.strokeStyle = DK; x.strokeRect(r.X, r.Y, r.w, r.h);
      x.lineWidth = 2; x.strokeStyle = HI; x.strokeRect(r.X + 4, r.Y + 4, r.w - 8, r.h - 8);
      const th = Math.min(TH, r.h * .3);
      x.fillStyle = titleGrad(r.X + 6, r.w - 12, true); x.fillRect(r.X + 6, r.Y + 6, r.w - 12, th);
      x.restore();
    }
  }

  // ── рабочий стол и панель задач ──
  function desktop() {
    x.fillStyle = DESK; x.fillRect(-60, -60, W + 120, H + 120);
    // обои: крупное бледное лого по центру низа
    const ls = Math.min(170, fit(LOGO, 900, 170));
    T(LOGO, W / 2, 1600, { size: ls, weight: 800, color: 'rgba(255,255,255,.07)' });
    deskIcon('pc', 190, 300, 'Мой компьютер');
    deskIcon('folder', 410, 300, 'Мои документы');
    deskIcon('app', 630, 300, EXE);
    deskIcon('bin', 850, 300, 'Корзина');
  }
  function taskbar(t, label) {
    const Y = H - 100;
    x.fillStyle = FACE; x.fillRect(-60, Y, W + 120, 160);
    x.fillStyle = LITE; x.fillRect(-60, Y, W + 120, 3); x.fillStyle = HI; x.fillRect(-60, Y + 3, W + 120, 3);
    // «Пуск»
    const sb = { X: 10, Y: Y + 14, w: 200, h: 72 };
    x.fillStyle = FACE; x.fillRect(sb.X, sb.Y, sb.w, sb.h); bevel(sb.X, sb.Y, sb.w, sb.h, 'raised');
    appIcon(sb.X + 14, sb.Y + 14, 44); sT('Пуск', sb.X + 70, sb.Y + 38, { size: 36 });
    // задача
    if (label) {
      const r = TASK, on = label.on;
      x.fillStyle = on ? '#e3e3e3' : FACE; x.fillRect(r.X, r.Y, r.w, r.h); bevel(r.X, r.Y, r.w, r.h, on ? 'pressed' : 'raised');
      appIcon(r.X + 14, r.Y + 16, 40);
      sT(label.s, r.X + 66, r.Y + 38, { size: fitS(label.s, r.w - 84, 32, on ? 700 : 400), weight: on ? 700 : 400 });
    }
    // трей с часами
    const tr = { X: W - 230, Y: Y + 14, w: 220, h: 72 };
    bevel(tr.X, tr.Y, tr.w, tr.h, 'thin');
    // динамик
    x.fillStyle = DK; x.fillRect(tr.X + 22, tr.Y + 28, 10, 16); x.beginPath(); x.moveTo(tr.X + 32, tr.Y + 28); x.lineTo(tr.X + 44, tr.Y + 18); x.lineTo(tr.X + 44, tr.Y + 54); x.lineTo(tr.X + 32, tr.Y + 44); x.fill();
    sT('12:00', tr.X + 140, tr.Y + 38, { size: 34, weight: 400, align: 'center' });
  }

  // ── сцена 1: предупреждение-хук ──
  function sceneAlert(t) {
    // «дзынь»: дрожь на 2 кадра и мигание заголовка, как у модального окна (дважды)
    let shake = 0, flash = false;
    for (const d of [.10, .86]) {
      if (t >= d && t < d + .0334) shake = t < d + .0167 ? 16 : -16;
      if (t >= d && t < d + .28 && Math.floor((t - d) / .07) % 2 === 0) flash = true;
    }
    x.save(); x.translate(shake, 0);
    const cr = win(AL, BRAND ? `${BRAND} — Внимание` : 'Внимание', { active: !flash, caps: ['close'] });
    warnIcon(cr.X + 70, cr.Y + 40 + hookSize * .53, 106);
    const lh = hookSize * 1.06, top = cr.Y + 40 + lh / 2;
    HB.rows.forEach((r, k) => sT(r.s, hookX, top + k * lh, { size: hookSize, color: r.i === HOOK.length - 1 && HOOK.length > 1 ? ACCT : INK }));
    button(alBtn, BTN, { def: true, focus: true, pressed: pressed(t, tA_click, .14), size: Math.min(40, fitS(BTN, alBtn.w - 70, 40)), weight: 700 });
    x.restore();
  }

  // ── сцена 2: мастер установки ──
  function sceneInstall(t) {
    const p = clamp((t - tB_p0) / (tB_p1 - tB_p0));
    const prog = Math.floor(E.inOut(p) * 100 + 1e-6) / 100;   // целые проценты
    const done = t >= tB_p1;
    const cr = win(IN, `Установка ${EXE}`);
    // белая шапка с заголовком сайта
    x.fillStyle = '#ffffff'; x.fillRect(inHead.X, inHead.Y, inHead.w, inHead.h);
    const hw = inHead.w - 270;
    const HD = fitBlock(HEAD, hw, 54, 34, 3, 1.12, inHead.h - 40, 40), hs = HD.size, nh = HD.rows.length;
    HD.rows.forEach((r, k) => sT(r.s, inHead.X + 34, inHead.Y + inHead.h / 2 + (k - (nh - 1) / 2) * hs * 1.12, { size: hs, color: r.i === HACC ? ACCT : INK }));
    // предмет в шапке, как картинка мастера
    x.save(); x.beginPath(); x.rect(inHead.X + inHead.w - 230, inHead.Y + 6, 224, inHead.h - 12); x.clip();
    checker({ X: inHead.X + inHead.w - 230, Y: inHead.Y + 6, w: 224, h: inHead.h - 12 });
    if (!(t >= tB_z0)) { x.translate(inHead.X + inHead.w - 118, inHead.Y + inHead.h / 2); САЙТ.предмет(x, t, palOf(0), 82); }
    x.restore();
    bevel(inHead.X + inHead.w - 230, inHead.Y + 6, 224, inHead.h - 12, 'thin');
    etched(inC.X, inHead.Y + inHead.h, inC.w);
    // шаги
    STEPS.forEach((s, i) => {
      const y = stY + i * rowH + rowH / 2, a = i / STEPS.length, b = (i + 1) / STEPS.length;
      const ok = prog >= b - 1e-6, cur = !ok && prog >= a;
      checkbox(inC.X + 34, y - 25, 50, ok);
      const ts = Math.min(40, fitS(s, inC.w - 170, 40, cur ? 700 : 400));
      if (cur) { const tw = textW(s, ts, 700, 0, SYS); x.fillStyle = T1; x.fillRect(inC.X + 104, y - ts * .72, tw + 24, ts * 1.44); x.save(); x.setLineDash([3, 3]); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.strokeRect(inC.X + 107, y - ts * .72 + 3, tw + 18, ts * 1.44 - 6); x.restore(); }
      sT(s, inC.X + 116, y + 1, { size: ts, weight: cur ? 700 : 400, color: cur ? '#ffffff' : ok ? INK : '#5c5c5c' });
    });
    // полоса загрузки из блоков
    sT(done ? 'Установка завершена' : 'Копирование файлов…', inC.X + 34, pgY, { size: 36, weight: 400 });
    sT(Math.round(prog * 100) + '%', inC.X + inC.w - 34, pgY, { size: 36, align: 'right' });
    const tr = { X: inC.X + 34, Y: pgY + 32, w: inC.w - 68, h: 70 };
    field(tr, TROUGH);
    const bw = 30, gap = 6, iw = tr.w - 2 * BV * 2 - 8, nb = Math.floor((iw + gap) / (bw + gap));
    const on = Math.floor(nb * prog + 1e-6);
    for (let i = 0; i < on; i++) {
      const bx = tr.X + 2 * BV + 4 + i * (bw + gap), by = tr.Y + 2 * BV + 4, bh = tr.h - 4 * BV - 8;
      x.fillStyle = BAR; x.fillRect(bx, by, bw, bh);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(bx, by, bw, 5);
    }
    // бегущая строка «что копируется»
    if (TICK.length) {
      const k = Math.min(TICK.length - 1, Math.floor(prog * TICK.length * .999));
      const s = done ? 'Готово. Нажмите «Готово».' : tickTxt(TICK[k]);
      wrapS(s, inC.w - 68, 34).forEach((l, i) => sT(l, inC.X + 34, tickY + i * 42, { size: 34, weight: 400, color: '#333333' }));
    }
    etched(inC.X, inBtnY - 28, inC.w);
    button(inBtns[0], '< Назад', { disabled: true, size: 38 });
    button(inBtns[1], done ? 'Готово' : 'Далее >', { disabled: !done, def: done, focus: done, pressed: pressed(t, tB_click, .13), size: 38, weight: done ? 700 : 400 });
    button(inBtns[2], 'Отмена', { size: 38, disabled: done });
  }

  // ── сцена 3: просмотр изображений ──
  // шахматка прозрачности, как в просмотрщике картинок
  const chk = (() => { const q = document.createElement('canvas'); q.width = q.height = 56; const g = q.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 56, 56); g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, 28, 28); g.fillRect(28, 28, 28, 28); return x.createPattern(q, 'repeat'); })();
  function checker(r) { x.save(); x.translate(r.X, r.Y); x.fillStyle = chk; x.fillRect(0, 0, r.w, r.h); x.restore(); }
  // где и каким размером ставить предмет, чтобы фото целиком влезло в рамку: { s, dy } (dy — сдвиг начала от центра рамки)
  // фото не раздуваем больше 1,6× исходника (иначе мыло); рисованный предмет — просто sMax
  const ZM = 1.05;
  function fitItem(pal, bw, bh, sMax) {
    const im = pal && pal.фото && typeof фото === 'function' ? фото(pal.фото) : null;
    if (!im) return { s: sMax, dy: 0 };
    const k = pal.ширина || 2.25, nw = im.naturalWidth, nh = im.naturalHeight;
    const w = Math.min(sMax * k, bw / ZM, bh / ZM * nw / nh, 1.6 * nw / ZM), h = w * nh / nw;
    return { s: w / k, dy: -h * (.5 - (pal.якорь ?? .5)) };
  }
  const PS = 250, PAD = 34;  // радиус предмета в просмотрщике, поле вокруг фото
  const palOf = k => PRODS[k] && PRODS[k].палитра;
  // рисует товар k в рамке r на контексте g (чёткий или в маленький буфер для пикселей)
  function itemIn(g, t, k, r, z) {
    const f = fitItem(palOf(k), r.w - 2 * PAD, r.h - 2 * PAD, PS);
    g.translate(r.X + r.w / 2, r.Y + r.h / 2 + f.dy * z); g.scale(z, z);
    САЙТ.предмет(g, t, palOf(k), f.s);
  }
  // «модемная» загрузка: товар рисуется в маленький буфер (1 пиксель = блок bs) и растягивается без сглаживания.
  // Пиксели — только у картинки, шахматка под ней остаётся чёткой. Ниже линии cut (или везде).
  const oc = document.createElement('canvas'), ox = oc.getContext('2d');
  function pixItem(t, k, r, z, bs, cut) {
    const sw = Math.max(1, Math.ceil(r.w / bs)), sh = Math.max(1, Math.ceil(r.h / bs));
    if (oc.width !== sw || oc.height !== sh) { oc.width = sw; oc.height = sh; } else ox.clearRect(0, 0, sw, sh);
    ox.save(); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.scale(1 / bs, 1 / bs); ox.translate(-r.X, -r.Y);
    itemIn(ox, t, k, r, z); ox.restore();
    x.save(); const cy = cut == null ? r.Y : cut;
    x.beginPath(); x.rect(r.X, cy, r.w, r.Y + r.h - cy); x.clip();
    x.imageSmoothingEnabled = false; x.drawImage(oc, 0, 0, sw, sh, r.X, r.Y, sw * bs, sh * bs);
    x.restore();
  }
  const zoomAt = (t, k) => 1 + (ZM - 1) * E.out(clamp((k > 0 ? t - SW[k - 1] - LD : t - tB_z1) / 1.4));
  function viewerImage(t, k, inner) {
    checker(inner);
    const u = k > 0 ? clamp((t - SW[k - 1]) / LD) : 1, z = zoomAt(t, k);
    if (u >= 1) { x.save(); itemIn(x, t, k, inner, z); x.restore(); return; }
    // старая картинка рассыпается в блоки → новая приходит крупными блоками → мельче → чёткая строка бежит вниз
    if (u < .16) pixItem(t, k - 1, inner, zoomAt(t, k - 1), mix(10, 44, E.in(u / .16)));
    else if (u < .32) pixItem(t, k, inner, 1, 44);
    else if (u < .46) pixItem(t, k, inner, 1, 20);
    else {
      const cut = inner.Y + inner.h * E.inOut((u - .46) / .54);
      x.save(); x.beginPath(); x.rect(inner.X, inner.Y, inner.w, cut - inner.Y); x.clip(); itemIn(x, t, k, inner, 1); x.restore();
      pixItem(t, k, inner, 1, 9, cut);
      x.fillStyle = rgba(T1, .55); x.fillRect(inner.X, cut - 2, inner.w, 4);
    }
  }
  function sceneViewer(t) {
    const k = prodAt(t), g = PRODS[k] || {};
    const cr = win(VW, 'Просмотр изображений');
    // меню
    let mx = vwC.X + 18;
    ['Файл', 'Правка', 'Вид', 'Справка'].forEach(s => { const w = sT(s, mx, vwC.Y + 28, { size: 34, weight: 400 }); x.fillStyle = INK; x.fillRect(mx, vwC.Y + 47, textW(s[0], 34, 400, 0, SYS), 2); mx += w + 40; });
    etched(vwC.X, vwC.Y + 56, vwC.w);
    // панель инструментов
    const clickNow = SW.some(s => pressed(t, s - .1, .1));
    button(vPrev, '', { draw: (cx, cy) => { x.fillStyle = DK; x.beginPath(); x.moveTo(cx + 13, cy - 18); x.lineTo(cx - 15, cy); x.lineTo(cx + 13, cy + 18); x.fill(); } });
    button(vNext, '', { pressed: clickNow, draw: (cx, cy) => { x.fillStyle = DK; x.beginPath(); x.moveTo(cx - 13, cy - 18); x.lineTo(cx + 15, cy); x.lineTo(cx - 13, cy + 18); x.fill(); } });
    const cf = { X: vwC.X + 238, Y: tbY + 14, w: 190, h: 68 };
    field(cf); sT(`${k + 1} / ${nP}`, cf.X + cf.w / 2, cf.Y + cf.h / 2 + 1, { size: 36, align: 'center', weight: 400 });
    sT('100%', vwC.X + vwC.w - 30, tbY + 48, { size: 34, weight: 400, align: 'right', color: '#333333' });
    // картинка
    field(pv, '#ffffff');
    const inner = inR(pv, 2 * BV);
    x.save(); x.beginPath(); x.rect(inner.X, inner.Y, inner.w, inner.h); x.clip();
    viewerImage(t, k, inner);
    x.restore();
    // строка состояния
    const L = { X: vwC.X + 4, Y: stBar, w: vwC.w - 334, h: 82 }, R = { X: vwC.X + vwC.w - 324, Y: stBar, w: 320, h: 82 };
    bevel(L.X, L.Y, L.w, L.h, 'thin'); bevel(R.X, R.Y, R.w, R.h, 'thin');
    const fn = fileOf(g), price = String(g.цена || '');
    const loading = k > 0 && t - SW[k - 1] < LD;
    const ls = Math.max(34, Math.min(40, fitS(fn, L.w - 40, 40, 700)));
    sT(ell(fn, L.w - 40, ls, 700), L.X + 20, L.Y + L.h / 2 + 1, { size: ls });
    if (price) sT(price, R.X + R.w / 2, R.Y + R.h / 2 + 1, { size: Math.min(42, fitS(price, R.w - 30, 42)), align: 'center', color: loading ? '#6a6a6a' : ACCT });
  }

  // ── сцена 4: каскад окон с цифрами ──
  function numWin(i, u, active) {
    const it = NC[i], r = cR(i, u);
    const cr = win(r, EXE, { active, caps: ['close'] });
    if (it.текст) { sT(it.текст, cr.X + cr.w / 2, cr.Y + cr.h / 2, { size: fitS(it.текст, cr.w - 60, 80), align: 'center' }); return; }
    const v = +it.число * E.out(u);
    const s = fmtN(u >= 1 ? +it.число : v, it.число) + (u >= 1 ? (it.плюс || '') : '');
    const label = String(it.подпись || '');
    const LL = label ? wrapS(label, cr.w - 80, 38) : [], lab = LL.length * 46 + (LL.length ? 18 : 0);
    const ns = Math.min((cr.h - lab - 16) * .8, fitS(fmtN(+it.число, it.число) + (it.плюс || ''), cr.w - 90, 150));
    const cy = cr.Y + (cr.h - lab) / 2 + 4;
    sT(s, cr.X + cr.w / 2, cy, { size: ns, align: 'center', color: u >= 1 ? INK : '#1a1a1a' });
    LL.forEach((l, k) => sT(l, cr.X + cr.w / 2, cr.Y + cr.h - lab + 10 + k * 46, { size: 38, weight: 400, align: 'center', color: '#222222' }));
  }
  function sceneCascade(t) {
    for (let i = 0; i < nC; i++) {
      const a = cS + i * per;
      if (t < a) break;
      const live = clamp((t - a) / drag);
      // отпечатки окна, оставшиеся за курсором
      for (let j = 0; ; j++) {
        const ts = a + j * STAMP; if (ts > t || ts > a + drag) break;
        const u = (ts - a) / drag;
        numWin(i, u, false);
      }
      const isLast = i === nC - 1 || t < a + per;
      numWin(i, live, live < 1 ? true : isLast && t < cS + (i + 1) * per + .01 ? true : false);
    }
  }

  // ── сцена 5: заставка и «Готово!» ──
  function screensaver(t) {
    x.fillStyle = mixH('#000000', T1, .14); x.fillRect(-60, -60, W + 120, H + 120);
    const cx = W / 2, cy = 880;
    for (let i = 0; i < 170; i++) {
      const ang = hash(i * 3.1 + 1) * Math.PI * 2, sp = .1 + hash(i * 7.7 + 2) * .16, ph = hash(i * 1.9 + 3);
      const z = (ph + t * sp) % 1, r = 30 + z * z * 1300, sz = Math.round(2 + z * z * 11);
      const X = cx + Math.cos(ang) * r, Y = cy + Math.sin(ang) * r * 1.15;
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      x.globalAlpha = clamp(z * 2.2); x.fillStyle = i % 4 === 0 ? STAR : '#ffffff'; x.fillRect(X - sz / 2, Y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
    // «объёмный текст» с лого, как заставка «3D-текст»
    const ls = Math.min(150, fit(LOGO, 820, 150, 900));
    const a = .55 * Math.sin((t - tE_d0) * 1.6), bob = Math.sin(t * 2.1) * 8;
    x.save(); x.translate(W / 2, 430 + bob); x.scale(Math.cos(a), 1); x.transform(1, 0, Math.sin(a) * -.12, 1, 0, 0);
    const ext = mixH(STAR, '#000000', .62);
    for (let k = 10; k >= 1; k--) T(LOGO, k * 1.4 * Math.sign(a || 1), k * 1.6, { size: ls, weight: 900, color: k === 10 ? '#000000' : ext });
    const gg = x.createLinearGradient(0, -ls / 2, 0, ls / 2); gg.addColorStop(0, mixH(STAR, '#ffffff', .55)); gg.addColorStop(.55, STAR); gg.addColorStop(1, mixH(STAR, '#000000', .2));
    T(LOGO, 0, 0, { size: ls, weight: 900, color: gg });
    x.restore();
  }
  function dissolve(p, drawB) {
    if (p <= 0) return; if (p >= 1) { drawB(); return; }
    const bs = 60, cols = Math.ceil(W / bs) + 2, rows = Math.ceil(H / bs) + 2;
    x.save(); x.beginPath();
    for (let j = -1; j < rows - 1; j++) for (let i = -1; i < cols - 1; i++) { const h = hash(i * 13.37 + j * 71.3 + .5); if (h < p) x.rect(i * bs, j * bs, bs + .5, bs + .5); }
    x.clip(); drawB(); x.restore();
  }
  function sceneFinal(t) {
    const cr = win(FN, 'Готово!', { caps: ['close'] });
    okIcon(cr.X + 86, cr.Y + 104, 58);
    const e = E.out5(clamp((t - tF_z1) / .5));
    const lh = ctaSize * 1.06, top = cr.Y + 44 + Math.max(0, (150 - ctaH) / 2) + lh / 2;
    CB.rows.forEach((r, i) => {
      const ei = E.out5(clamp((t - tF_z1 - i * .08) / .5));
      sT(r.s, ctaX, top + i * lh + (1 - ei) * 46, { size: ctaSize, alpha: .2 + .8 * ei, color: r.i === CTA.length - 1 && CTA.length > 1 ? ACCT : INK });
    });
    // адрес
    sT('Адрес:', fnField.X, fnField.Y - 32, { size: 34, weight: 400 });
    field(fnField);
    const typed = DOMAIN.slice(0, Math.round(DOMAIN.length * clamp((t - tF_z1 - .05) / .4)));
    const ds = Math.min(56, fitS(DOMAIN, fnField.w - 70, 56));
    const sel = t >= tF_click + .14;
    if (sel) { const tw = textW(DOMAIN, ds, 700, 0, SYS); x.fillStyle = T1; x.fillRect(fnField.X + 22, fnField.Y + 18, tw + 16, fnField.h - 36); }
    const tw = sT(typed, fnField.X + 30, fnField.Y + fnField.h / 2 + 2, { size: ds, color: sel ? '#ffffff' : INK });
    if (!sel && Math.floor(t * 2.2) % 2 === 0) { x.fillStyle = INK; x.fillRect(fnField.X + 34 + tw, fnField.Y + 22, 4, fnField.h - 44); }
    button(fnBtn, 'OK', { def: true, focus: true, pressed: pressed(t, tF_click, .14), size: 44, weight: 700 });
    void e;
  }

  // ── кадр ──
  window.КАДР = t => {
    // камера: еле заметный наезд, кадр живёт, но пиксели не плывут
    const z = 1 + .03 * E.inOut(t / DUR);
    x.translate(W / 2, 900); x.scale(z, z); x.translate(-W / 2, -900);
    const desk = () => {
      desktop();
      let task = null;
      if (t < tA_z0) task = { s: BRAND || 'Внимание', on: true };
      else if (t < tB_z0) task = { s: `Установка ${BRAND}`, on: t >= tA_z1 };
      else if (t < tC_z0) task = { s: 'Просмотр изображений', on: t >= tB_z1 };
      else task = { s: EXE + (t >= cE ? ` (${nC})` : ''), on: t >= tC_z1 && t < cE };
      taskbar(t, task);
      if (t < tA_z0) sceneAlert(t);
      else if (t < tA_z1) ghosts(AL, IN, (t - tA_z0) / (tA_z1 - tA_z0));
      if (t >= tA_z1 - .02 && t < tB_z0) sceneInstall(t);
      else if (t >= tB_z0 && t < tB_z1) ghosts(IN, VW, (t - tB_z0) / (tB_z1 - tB_z0));
      if (t >= tB_z1 - .02 && t < tC_z0) sceneViewer(t);
      else if (t >= tC_z0 && t < tC_z1) ghosts(VW, cR(0, 0), (t - tC_z0) / (tC_z1 - tC_z0));
      if (t >= tC_z1 - .02 && t < cE) sceneCascade(t);
      if (t >= cE && t < cE + .28) for (let i = 0; i < nC; i++) ghosts(cR(i, 1), TASK, (t - cE) / .28 - i * .04);
      // предмет перелетает из шапки мастера в просмотрщик
      if (t >= tB_z0 && t < tB_z1 + .02) {
        const p = E.inOut(clamp((t - tB_z0) / (tB_z1 - tB_z0)));
        const vc = ctr(inR(pv, 2 * BV));
        const X0 = inHead.X + inHead.w - 118, Y0 = inHead.Y + inHead.h / 2;
        const fr = lerpR({ X: inHead.X + inHead.w - 230, Y: inHead.Y + 6, w: 224, h: inHead.h - 12 }, inR(pv, 2 * BV), p);
        const vi = inR(pv, 2 * BV), f = fitItem(palOf(0), vi.w - 2 * PAD, vi.h - 2 * PAD, PS);
        x.save(); x.beginPath(); x.rect(fr.X, fr.Y, fr.w, fr.h); x.clip(); checker(fr);
        x.translate(mix(X0, vc[0], p), mix(Y0, vc[1] + f.dy, p)); САЙТ.предмет(x, t, palOf(0), mix(82, f.s, p)); x.restore();
        x.lineWidth = 3; x.strokeStyle = DK; x.strokeRect(fr.X, fr.Y, fr.w, fr.h);
      }
    };
    if (t < tE_d1) desk();
    dissolve(clamp((t - tE_d0) / (tE_d1 - tE_d0)), () => screensaver(t));
    if (t >= tF_z0 && t < tF_z1) ghosts({ X: W / 2 - 60, Y: 940, w: 120, h: 80 }, FN, (t - tF_z0) / (tF_z1 - tF_z0));
    if (t >= tF_z1 - .02) sceneFinal(t);
    // курсор поверх всего
    const [cx, cy] = cursorAt(t);
    const busy = t >= tB_p0 && t < tB_p1;
    if (busy) sprite(GLASS, cx, cy, 4.4, 5.5, 7); else sprite(ARROW, cx, cy, 4.2);
  };
})();

  },
  telefon() {
// СТИЛЬ «Телефон-лента»: в кадре живой iPhone, нарисованный кодом, на экране — мобильная версия сайта из САЙТ.
// Сквозной мотив: элементы экрана вылетают из телефона к зрителю (пуши хука, цена, главная цифра) и возвращаются.
// Сцены: пуши хука вылетают из экрана блокировки 0–2,4 → свайп разблокировки 2,2–2,9 → hero, тап по кнопке 2,9–3,9 →
// свайп-скролл с инерцией до каталога 3,9–5 → карточка раскрывается на весь экран 5–5,6 → свайп по товарам,
// цена вылетает наружу 5,6–8,3 → лайк, сердечки и пуши «Новый заказ» 7,8–10 → экран статистики, главная цифра
// вылетает к зрителю 9,85–12,3 → телефон отъезжает, рядом призыв и домен, на экране кнопка 12,3–15.
// Все слова, цвета и цифры — из САЙТ (служебные слова интерфейса можно переопределить в САЙТ.интерфейс).
window.ИМЯ = 'telefon';
DUR = 15;
FONT = САЙТ.шрифт || FONT;
(() => {
  const S = САЙТ, C = S.цвета || {};
  const UI = Object.assign({ сейчас: 'сейчас', заказ: 'Новый заказ', время: '9:41' }, S.интерфейс || {});

  // ——— цвет ———
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b); return toHex(A.map((v, i) => mix(v, B[i], p))); };
  const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const readable = (col, bg, min, to) => { let c = col; for (let k = 1; k <= 10 && contrast(c, bg) < min; k++) c = mixHex(col, to, k * .1); return c; };
  const best = bg => contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111';

  const BG0 = isHex(C.фон) ? C.фон : null;
  const dark = S.тема ? !/светл/i.test(S.тема) : !(BG0 && lum(BG0) > .4);
  const BG = BG0 || (dark ? '#0b0b0c' : '#f6f5f2');
  let TX = isHex(C.текст) ? C.текст : (dark ? '#ffffff' : '#141414');
  if (contrast(TX, BG) < 4.5) TX = best(BG);
  let CARD = isHex(C.карта) ? C.карта : mixHex(BG, TX, .06);
  if (contrast(CARD, BG) < 1.04) CARD = mixHex(BG, TX, dark ? .07 : .045);
  const GR0 = isHex(C.серый) ? C.серый : mixHex(TX, BG, .45);
  const GR = readable(GR0, BG, 4, TX), GRC = readable(GR0, CARD, 4, TX);
  const AC = isHex(C.акцент) ? C.акцент : TX;
  const ACT = readable(AC, BG, 3.2, TX), ACTC = readable(AC, CARD, 3.2, TX);
  const onAC = best(AC);
  // фон вокруг телефона — цвет бренда
  const OB = dark ? mixHex(BG, AC, .13) : mixHex(BG, AC, .3);
  const OTX = contrast(TX, OB) >= 4.5 ? TX : best(OB);
  // стекло уведомлений
  const GL = dark ? mixHex(CARD, '#ffffff', .1) : '#ffffff';
  const GTX = contrast(TX, GL) >= 4.5 ? TX : best(GL);
  const GSUB = readable(GR0, GL, 4, GTX), GAC = readable(AC, GL, 3, GTX);
  // обои экрана блокировки
  const WP0 = dark ? mixHex(AC, '#000000', .55) : mixHex(AC, '#ffffff', .45);
  const WP1 = dark ? mixHex(BG, '#000000', .3) : mixHex(BG, '#ffffff', .4);
  const LTX = best(mixHex(WP0, WP1, .4));
  // корпус: натуральный титан
  const FR = dark ? ['#2a2b2e', '#80838a', '#45474c', '#36383c', '#90939a', '#28292c'] : ['#8d8f94', '#e9eaed', '#b5b7bc', '#a9abb0', '#eef0f2', '#8a8c91'];

  // ——— данные ———
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(s => s == null ? '' : String(s).trim()).filter(Boolean);
  const brand = String(S.бренд || S.домен || '').trim(), tail = String(S.хвостЛого || ''), domain = String(S.домен || '');
  const head = arr(S.заголовок); if (!head.length) head.push(brand);
  const accIdx = Number.isInteger(S.акцентСтрока) ? S.акцентСтрока : head.length - 1;
  let hook = arr(S.хук); if (!hook.length) hook = head.slice();
  if (hook.length > 3) hook = [hook[0], hook[1], hook.slice(2).join(' ')];
  if (hook.length === 1) hook = split2(hook[0]);
  let goods = (S.товары || []).filter(g => g && (g.имя || g.цена)).slice(0, 6);
  if (!goods.length) goods = [{ имя: head[0] || brand, цена: '' }];
  const pal = i => { const g = goods[i]; return g && g.палитра && typeof g.палитра === 'object' ? g.палитра : undefined; };
  const tint = i => { const p = pal(i); if (p) { for (const k of ['акцент', 'циферблат', 'корпус']) if (isHex(p[k])) return p[k]; const v = Object.values(p).filter(isHex); if (v.length) return v[0]; } return AC; };
  const stats = (S.цифры || []).filter(d => d && isFinite(+d.число)).slice(0, 3);
  const steps = arr(S.шаги).slice(0, 4), perks = arr(S.преимущества);
  const chips = (perks.length ? perks : steps).slice(0, 4);
  const sub = String(S.подзаголовок || '');
  let cta = arr(S.призыв).length ? arr(S.призыв) : arr(S.кнопка || brand);
  const btn = String(S.кнопка || cta.join(' ') || brand);
  const price = i => String((goods[i] || {}).цена || '');
  const hasPrice = goods.some((g, i) => price(i));
  const NP = Math.min(goods.length, 3);
  const initial = (brand.match(/[\p{L}\p{N}]/u) || ['•'])[0].toUpperCase();
  const statStr = (d, v) => num(v == null ? +d.число : v) + (d.плюс || '');

  // ——— телефон ———
  const BW = 652, BH = 1375, BZ = 16, SW = BW - 2 * BZ, SH = BH - 2 * BZ, RB = 112, RS = 96;
  const W0 = 552, K = 840 / W0;      // ширина пуша в телефоне и множитель «вылета к зрителю»

  // ——— матрицы (для вылета элементов из экрана) ———
  const M = (a, b, c, d, e, f) => ({ a, b, c, d, e, f });
  const mul = (A, B) => M(A.a * B.a + A.c * B.b, A.b * B.a + A.d * B.b, A.a * B.c + A.c * B.d, A.b * B.c + A.d * B.d, A.a * B.e + A.c * B.f + A.e, A.b * B.e + A.d * B.f + A.f);
  const tr = (X, Y) => M(1, 0, 0, 1, X, Y), sc = k => M(k, 0, 0, k, 0, 0), rot = r => M(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
  const chain = (...ms) => ms.reduce((A, B) => mul(A, B));
  const lerpM = (A, B, p) => M(mix(A.a, B.a, p), mix(A.b, B.b, p), mix(A.c, B.c, p), mix(A.d, B.d, p), mix(A.e, B.e, p), mix(A.f, B.f, p));
  const setM = m => x.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  const ptM = (m, X, Y) => [m.a * X + m.c * Y + m.e, m.b * X + m.d * Y + m.f];
  const liftM = (w, h, k) => chain(tr(w / 2, h / 2), sc(k), tr(-w / 2, -h / 2));

  // ——— текст ———
  function wrapLines(s, maxW, size, wt) {
    const out = []; let cur = '';
    for (const w of String(s).split(/\s+/).filter(Boolean)) { const tt = cur ? cur + ' ' + w : w; if (cur && textW(tt, size, wt) > maxW) { out.push(cur); cur = w; } else cur = tt; }
    if (cur) out.push(cur);
    // не оставлять короткий предлог в конце строки
    for (let i = 0; i < out.length - 1; i++) { const w = out[i].split(' '); const last = w[w.length - 1];
      if (w.length > 1 && last.length <= 2 && /^[\p{L}]+$/u.test(last)) { const nx = last + ' ' + out[i + 1]; if (textW(nx, size, wt) <= maxW) { out[i] = w.slice(0, -1).join(' '); out[i + 1] = nx; } } }
    return out;
  }
  // разбить строку на n частей примерно поровну по ширине, не обрывая на предлоге
  function split2(s, n = 2) {
    const w = String(s).split(/\s+/).filter(Boolean); if (w.length < 2) return [s];
    let bestI = 1, bestD = 1e9; const tot = s.length;
    for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '); let d = Math.abs(a.length - tot / 2); if (w[i - 1].length <= 2) d += 6; if (d < bestD) { bestD = d; bestI = i; } }
    return [w.slice(0, bestI).join(' '), w.slice(bestI).join(' ')];
  }
  function ell(l, maxW, sz, wt) { if (textW(l, sz, wt) <= maxW) return l; let s = l; while (s.length > 1 && textW(s + '…', sz, wt) > maxW) s = s.slice(0, -1).trimEnd(); return s + '…'; }
  function wrapFit(s, maxW, size, wt, maxL, minS) {
    const one = fit(s, maxW, size, wt);
    if (one >= size * .8 || maxL === 1 && one >= minS) return { lines: [s], size: Math.max(minS, Math.min(size, one)) };
    let sz = size, L = wrapLines(s, maxW, sz, wt);
    while (sz > minS && !(L.length <= maxL && L.every(l => textW(l, sz, wt) <= maxW))) { sz = Math.max(minS, sz * .94); L = wrapLines(s, maxW, sz, wt); }
    if (L.length > maxL) { L = L.slice(0, maxL); L[maxL - 1] = ell(L[maxL - 1] + ' …', maxW, sz, wt).replace(/\s…$/, '…'); }
    return { lines: L.map(l => ell(l, maxW, sz, wt)), size: sz };
  }

  // ——— тайминг ———
  const TM = {
    pop: i => .06 + i * .36, popD: .7,
    fly: i => 2.24 + i * .06, flyD: .44,
    unl0: 2.36, unl1: 2.9,
    tap1: 3.55, flk0: 3.95, flk1: 4.13, flkEnd: 4.98,
    tapCard: 5.0, exp0: 5.08, expD: .56,
    chip0: 5.72, chipD: .55, chipBack: 7.95,
    sw: k => 6.3 + (k - 1) * .62, swD: .44,
    like: 7.92,
    push: j => 8.12 + j * .45, pushOut: j => 9.55 + j * .05,
    st0: 9.85, st1: 10.35, cnt0: 9.98, stPop: 10.55, stBack: 11.92,
    fin: 12.3, finD: .72, tapCta: 13.85,
  };

  // ——— раскладка (один раз) ———
  let LAY = null;
  function lay() {
    if (LAY) return LAY;
    const L = {};
    // пуши хука
    L.hook = hook.map((s, i) => { const f = wrapFit(s, W0 - 48, 64, 900, 2, 34); return { kind: 'hook', last: i === hook.length - 1 && hook.length > 1, ...f, h: Math.round(98 + f.lines.length * f.size * 1.12 + 14) }; });
    let y = 410; L.lockY = L.hook.map(c => { const v = y; y += c.h + 14; return v; });
    const tot = L.hook.reduce((a, c) => a + c.h * K, 0) + 26 * (L.hook.length - 1);
    y = Math.max(290, 880 - tot / 2); L.bigY = L.hook.map(c => { const v = y + c.h * K / 2; y += c.h * K + 26; return v; });
    // пуши заказов
    L.orders = [0, 1, 2].map(j => { const gi = (j + 1) % goods.length; return { kind: 'order', gi, name: wrapFit(String(goods[gi].имя || ''), W0 - 48 - 132, 42, 900, 1, 30), price: price(gi), h: 206 }; });
    // сайт
    const CW = SW - 60;
    // заголовок: длинную строку переносим, а не ужимаем в мелочь
    L.title = []; head.forEach((l, i) => { const parts = fit(l, CW, 72, 900) < 50 ? wrapLines(l, CW, 50, 900) : [l]; parts.forEach(s => L.title.push({ s, acc: i === accIdx, src: i })); });
    if (L.title.length > 5) L.title = L.title.slice(0, 5);
    L.hs = clamp(Math.min(...L.title.map(r => fit(r.s, CW, 72, 900))), 34, 72);
    y = 210; L.titleY = L.title.map((r, i) => y + i * L.hs * 1.08);
    y = L.titleY[L.titleY.length - 1] + L.hs * .5 + 30;
    L.sub = wrapFit(sub, CW, 31, 500, 3, 28); L.subY = y + 16;
    y = L.subY + (L.sub.lines.length ? (L.sub.lines.length - 1) * 41 + 16 + 34 : 0);
    L.btnY = y; L.btnH = 104; y += L.btnH + 34;
    L.heroY = y; L.heroH = 520; y += L.heroH + 40;
    L.chipsY = y; y += 64 + 30;
    L.gridY = y; L.cw = goods.length === 1 ? SW - 40 : (SW - 40 - 16) / 2; L.ch = 440;
    L.cards = goods.map((g, i) => ({ X: 20 + (i % 2) * (L.cw + 16), Y: y + Math.floor(i / 2) * (L.ch + 16), name: wrapFit(String(g.имя || ''), L.cw - 40, 31, 800, 2, 28) }));
    L.scrollT = L.chipsY - 168;
    { const td = TM.flk1 - TM.flk0, Ti = TM.flkEnd - TM.flk1, n = 4; L.D1 = (n * L.scrollT / Ti) / (2 / td + n / Ti); }
    // страница товара
    L.page = goods.map(g => wrapFit(String(g.имя || ''), SW - 72, 64, 900, 2, 36));
    L.nameY0 = 936;
    L.pill = goods.map((g, k) => { const s = price(k), nl = L.page[k].lines.length, sz = L.page[k].size; return { s, w: s ? textW(s, 50, 900) + 70 : 0, y: L.nameY0 + (nl - 1) * sz * 1.08 + sz * .5 + 58 }; });
    L.heart = [SW - 36 - 52, 1262];
    // статистика
    L.c1 = { w: SW - 40, h: 420 };
    L.n1 = stats[0] ? fit(statStr(stats[0]), L.c1.w - 64, 112, 900) : 0;
    L.cap1 = stats[0] ? wrapFit(String(stats[0].подпись || ''), L.c1.w - 64, 32, 600, 1, 28) : null;
    const sw2 = stats.length === 2 ? SW - 40 : (SW - 40 - 16) / 2;
    L.small = stats.slice(1).map((d, i) => ({ X: 20 + i * (sw2 + 16), w: sw2, n: fit(statStr(d), sw2 - 48, 68, 900), cap: wrapFit(String(d.подпись || ''), sw2 - 48, 29, 600, 2, 28) }));
    L.stepsY = 190 + (stats.length ? L.c1.h + 30 : 0) + (stats.length > 1 ? 310 + 40 : 10);
    L.steps = steps.slice(0, Math.max(0, Math.min(4, Math.floor((SH - 60 - L.stepsY) / 82) + 1))).map(s => wrapFit(s, SW - 96 - 30, 31, 700, 1, 28));
    // финал: длинный призыв одной строкой — делим на две, чтобы было крупно
    if (cta.length === 1 && fit(cta[0], 840, 146, 900) < 104) cta = split2(cta[0]);
    L.cs = clamp(Math.min(...cta.map(l => fit(l, 840, 146, 900))), 56, 146);
    L.ctaY = cta.map((l, i) => 300 + L.cs * .5 + i * L.cs * 1.0);
    L.domS = domain ? fit(domain, 680, 54, 800) : 0;
    L.domY = L.ctaY[L.ctaY.length - 1] + L.cs * .5 + (domain ? 70 : 0);
    const top = L.domY + (domain ? 72 : 40);
    L.fs = clamp((1560 - top) / BH, .46, .66); L.fcy = top + BH * L.fs / 2;
    // жесты пальца (координаты экрана)
    const bc = [SW / 2, L.btnY + L.btnH / 2], c0 = L.cards[0], cc = [c0.X + L.cw / 2, c0.Y - L.scrollT + 180];
    L.gest = [
      { a: 2.16, b: 2.32, c: 2.72, z: 2.9, p0: [SW / 2, SH - 120], p1: [SW / 2, SH - 680], ease: E.inOut, after: 1 },
      { a: TM.tap1 - .32, b: TM.tap1, c: TM.tap1 + .14, z: TM.tap1 + .32, p0: bc, p1: bc, from: [bc[0] + 120, bc[1] + 230] },
      { a: TM.flk0 - .16, b: TM.flk0, c: TM.flk1, z: TM.flk1 + .22, p0: [SW / 2 + 60, 1110], p1: [SW / 2 + 60, 1110 - L.D1], ease: u => u * u, after: 1 },
      { a: TM.tapCard - .26, b: TM.tapCard, c: TM.tapCard + .12, z: TM.tapCard + .28, p0: cc, p1: cc, from: [cc[0] + 140, cc[1] + 200] },
      ...Array.from({ length: NP - 1 }, (_, i) => { const s0 = TM.sw(i + 1), d = TM.swD * .3; return { a: s0 - .14, b: s0, c: s0 + d, z: s0 + d + .18, p0: [SW - 130, 640], p1: [SW - 130 - .35 * SW, 640], ease: u => u * u, after: 1 }; }),
      { a: TM.like - .26, b: TM.like, c: TM.like + .08, z: TM.like + .14, p0: L.heart, p1: L.heart, from: [L.heart[0] - 120, L.heart[1] + 120] },
      { a: TM.like + .14, b: TM.like + .16, c: TM.like + .24, z: TM.like + .42, p0: L.heart, p1: L.heart },
      { a: TM.tapCta - .3, b: TM.tapCta, c: TM.tapCta + .15, z: TM.tapCta + .35, p0: [SW / 2, 1060], p1: [SW / 2, 1060], from: [SW / 2 + 130, 1260] },
    ];
    return LAY = L;
  }

  // ——— время сцен ———
  function scrollY(t) {
    const L = lay(), Tt = L.scrollT, td = TM.flk1 - TM.flk0, n = 4;
    if (t <= TM.flk0) return 0;
    if (t <= TM.flk1) { const u = (t - TM.flk0) / td; return L.D1 * u * u; }
    const u = prog(t, TM.flk1, TM.flkEnd); return L.D1 + (Tt - L.D1) * (1 - Math.pow(1 - u, n));
  }
  const expandP = t => E.out5(prog(t, TM.exp0, TM.exp0 + TM.expD));
  function pagePos(t) {
    let pos = 0;
    for (let k = 1; k < NP; k++) { const u = prog(t, TM.sw(k), TM.sw(k) + TM.swD); pos += u < .3 ? .35 * (u / .3) ** 2 : .35 + .65 * (1 - Math.pow(1 - (u - .3) / .7, 2.5)); }
    return pos;
  }
  const chipP = t => hasPrice ? E.out5(prog(t, TM.chip0, TM.chip0 + TM.chipD)) * (1 - E.inOut(prog(t, TM.chipBack, TM.chipBack + .4))) : 0;
  const statP = t => stats.length ? E.out5(prog(t, TM.stPop, TM.stPop + .55)) * (1 - E.inOut(prog(t, TM.stBack, TM.stBack + .4))) : 0;
  const pushOn = t => E.out(prog(t, TM.push(0), TM.push(0) + .35)) * (1 - prog(t, TM.pushOut(0), TM.pushOut(0) + .35));

  function phoneP(t) {
    const L = lay();
    const hk = E.out(prog(t, .06, .5)) * (1 - E.inOut(prog(t, 2.2, 2.75)));
    const f = E.inOut(prog(t, TM.fin, TM.fin + TM.finD));
    let s = 1 - .035 * hk, cy = 880;
    s = mix(s, L.fs, f); cy = mix(cy, L.fcy, f);
    let kick = 0; for (let k = 1; k < NP; k++) { const u = prog(t, TM.sw(k), TM.sw(k) + .8); kick += Math.sin(Math.PI * u) * (1 - u) * .16; }
    const ry = .08 * Math.sin(t * .85 + .6) + .03 * noise(3, t * .8) - kick;
    const rx = .03 * Math.sin(t * .63 + 1.3);
    const rz = .018 * Math.sin(t * .55 + 2.1) + .007 * noise(7, t * .9) + .012 * f;
    return { cx: 540 + 8 * noise(5, t * .45), cy: cy + 9 * Math.sin(t * .9 + .3), s, ry, rx, rz, hk };
  }
  const phoneM = P => chain(tr(P.cx, P.cy), rot(P.rz), M(Math.cos(P.ry), Math.sin(P.ry) * .55, 0, Math.cos(P.rx), 0, 0), sc(P.s), tr(-BW / 2, -BH / 2));

  // ——— примитивы ———
  function item(i, X, Y, s, t) {
    x.save(); x.translate(X, Y);
    try { if (typeof S.предмет === 'function') S.предмет(x, t, i >= 0 ? pal(i) : undefined, s); else { x.beginPath(); x.arc(0, 0, s, 0, 7); x.fillStyle = AC; x.fill(); } }
    finally { x.restore(); }
  }
  function appIcon(X, Y, s) {
    const g = x.createLinearGradient(0, Y, 0, Y + s); g.addColorStop(0, mixHex(AC, '#ffffff', .18)); g.addColorStop(1, AC);
    rr(X, Y, s, s, s * .26); x.fillStyle = g; x.fill();
    T(initial, X + s / 2, Y + s * .53, { size: s * .58, weight: 900, color: onAC });
  }
  function heart(X, Y, r) {
    x.beginPath(); x.moveTo(X, Y + r * .95);
    x.bezierCurveTo(X - r * 1.5, Y - r * .05, X - r * .8, Y - r * 1.25, X, Y - r * .45);
    x.bezierCurveTo(X + r * .8, Y - r * 1.25, X + r * 1.5, Y - r * .05, X, Y + r * .95); x.closePath();
  }
  function glowFill(X, Y, w, h, col, a) {
    const cx = X + w / 2, cy = Y + h * .45, R = Math.max(w, h) * .62;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }

  // ——— пуш-уведомление (локальные координаты, ширина W0) ———
  function drawNotif(c, big, t) {
    const w = W0, h = c.h;
    x.save();
    big = +big; shadow(mix(16, 56, big), `rgba(0,0,0,${dark ? mix(.3, .6, big) : mix(.1, .24, big)})`, mix(5, 26, big));
    rr(0, 0, w, h, 42); x.fillStyle = rgba(GL, dark ? .95 : .94); x.fill(); noShadow();
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgba(255,255,255,${dark ? .09 : .55})`); g.addColorStop(.55, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill();
    x.lineWidth = 1.5; x.strokeStyle = `rgba(255,255,255,${dark ? .16 : .9})`; x.stroke();
    appIcon(24, 22, 58);
    const tw = textW(UI.сейчас, 24, 500);
    if (c.kind === 'hook') {
      { const bs = Math.max(22, fit(brand, w - 98 - tw - 50, 27, 700)); T(ell(brand, w - 98 - tw - 50, bs, 700), 98, 52, { size: bs, weight: 700, color: GSUB, align: 'left' }); }
      T(UI.сейчас, w - 26, 52, { size: 24, weight: 500, color: GSUB, align: 'right' });
      c.lines.forEach((l, i) => T(l, 26, 100 + c.size * .52 + i * c.size * 1.12, { size: c.size, weight: 900, color: c.last ? GAC : GTX, align: 'left' }));
    } else {
      T(UI.заказ, 98, 52, { size: fit(UI.заказ, w - 98 - tw - 50, 29, 800), weight: 800, color: GTX, align: 'left' });
      T(UI.сейчас, w - 26, 52, { size: 24, weight: 500, color: GSUB, align: 'right' });
      c.name.lines.forEach(l => T(l, 26, 122, { size: c.name.size, weight: 900, color: GTX, align: 'left' }));
      if (c.price) T(c.price, 26, 172, { size: 40, weight: 900, color: GAC, align: 'left' });
      const s = 112, X = w - 24 - s, Y = 76;
      x.save(); rr(X, Y, s, s, 26); x.fillStyle = mixHex(CARD, tint(c.gi), .18); x.fill(); x.clip();
      glowFill(X, Y, s, s, tint(c.gi), .35); item(c.gi, X + s / 2, Y + s / 2, 36, t); x.restore();
    }
    x.restore();
  }

  // ——— экран блокировки ———
  function drawLock(t) {
    const L = lay(), u = E.inOut(prog(t, TM.unl0, TM.unl1));
    x.save(); x.translate(0, -SH * u);
    const g = x.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, WP0); g.addColorStop(1, WP1); x.fillStyle = g; x.fillRect(0, 0, SW, SH);
    glowFill(-200 + 60 * Math.sin(t * .7), 500, 800, 800, AC, dark ? .32 : .4);
    glowFill(160, 900 + 40 * Math.sin(t * .5), 700, 700, mixHex(AC, TX, .4), .16);
    T(UI.время, SW / 2, 262, { size: 168, weight: 700, color: LTX, track: -3 });
    L.hook.forEach((c, i) => { if (t >= TM.pop(i)) return; x.save(); x.translate(34, L.lockY[i]); x.scale((SW - 68) / W0, (SW - 68) / W0); drawNotif(c, false, t); x.restore(); });
    for (const bx of [96, SW - 96]) { x.beginPath(); x.arc(bx, SH - 150, 48, 0, 7); x.fillStyle = LTX === '#ffffff' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.1)'; x.fill(); }
    // фонарик и камера — простые знаки
    x.strokeStyle = LTX; x.lineWidth = 4; x.lineCap = 'round';
    rr(96 - 9, SH - 172, 18, 42, 6); x.stroke();
    rr(SW - 96 - 22, SH - 165, 44, 32, 8); x.stroke(); x.beginPath(); x.arc(SW - 96, SH - 149, 9, 0, 7); x.stroke();
    x.restore();
  }

  // ——— сайт ———
  function drawHeader(sy) {
    x.fillStyle = rgba(BG, .96); x.fillRect(0, 0, SW, 146);
    if (sy > 2) { x.fillStyle = rgba(TX, .08); x.fillRect(0, 145, SW, 2); }
    const bs = Math.max(28, fit(brand + tail, SW - 160, 36, 900)), bt = ell(brand, SW - 160 - textW(tail, bs, 900), bs, 900), bw = textW(bt, bs, 900);
    T(bt, 30, 108, { size: bs, weight: 900, color: TX, align: 'left' });
    if (tail) T(tail, 30 + bw, 108, { size: bs, weight: 900, color: ACT, align: 'left' });
    x.fillStyle = TX; for (let i = 0; i < 3; i++) { rr(SW - 76, 94 + i * 13 - 3, 44, 5, 2.5); x.fill(); }
  }
  function drawGridCard(i, X, Y, t, press) {
    const L = lay(), w = L.cw, h = L.ch, c = L.cards[i];
    x.save();
    if (press) { x.translate(X + w / 2, Y + h / 2); x.scale(1 - .035 * press, 1 - .035 * press); x.translate(-X - w / 2, -Y - h / 2); }
    rr(X, Y, w, h, 32); x.fillStyle = CARD; x.fill();
    x.save(); rr(X + 8, Y + 8, w - 16, 262, 26); x.fillStyle = mixHex(CARD, tint(i), dark ? .08 : .1); x.fill(); x.clip();
    glowFill(X, Y, w, 270, tint(i), .32); item(i, X + w / 2, Y + 140 + 4 * Math.sin(t * 1.3 + i), 84, t + i * 3); x.restore();
    c.name.lines.forEach((l, k) => T(l, X + 20, Y + 304 + k * 37, { size: c.name.size, weight: 800, color: TX, align: 'left' }));
    if (price(i)) T(price(i), X + 20, Y + 304 + c.name.lines.length * 37 + 22, { size: 33, weight: 900, color: ACTC, align: 'left' });
    x.restore();
  }
  function drawSite(t) {
    const L = lay(), e = expandP(t);
    if (e < 1) {
      const sy = scrollY(t);
      x.fillStyle = BG; x.fillRect(0, 0, SW, SH);
      x.save(); x.translate(0, -sy);
      // герой-карточка с предметом
      { const p = E.expo(prog(t, 2.5, 3.3)), Y = L.heroY + 90 * (1 - p);
        x.save(); x.globalAlpha = clamp(p * 1.5);
        rr(20, Y, SW - 40, L.heroH, 44); x.fillStyle = CARD; x.fill(); x.clip();
        glowFill(20, Y, SW - 40, L.heroH, AC, dark ? .2 : .26);
        item(-1, SW / 2, Y + L.heroH / 2 + 8 * Math.sin(t * 1.2), 158, t); x.restore(); }
      // кнопка с риплом
      { const p = E.expo(prog(t, 2.62, 3.35)), bump = Math.sin(Math.PI * prog(t, TM.tap1, TM.tap1 + .24)), Y = L.btnY + 70 * (1 - p);
        x.save(); x.globalAlpha = clamp(p * 1.5);
        x.translate(SW / 2, Y + L.btnH / 2); x.scale(1 - .045 * bump, 1 - .045 * bump); x.translate(-SW / 2, -Y - L.btnH / 2);
        rr(30, Y, SW - 60, L.btnH, L.btnH / 2); x.fillStyle = AC; x.fill(); x.clip();
        const r = prog(t, TM.tap1, TM.tap1 + .55); if (r > 0 && r < 1) { x.beginPath(); x.arc(SW / 2, Y + L.btnH / 2, 30 + 420 * E.out(r), 0, 7); x.fillStyle = rgba(onAC, .22 * (1 - r)); x.fill(); }
        const bs = fit(btn, SW - 200, 34, 800);
        T(btn, SW / 2 - 22, Y + L.btnH / 2 + 1, { size: bs, weight: 800, color: onAC });
        const ax = SW / 2 + textW(btn, bs, 800) / 2 + 6 + 6 * Math.sin(Math.PI * clamp((t - 3.3) * 1.2)), ay = Y + L.btnH / 2;
        x.strokeStyle = onAC; x.lineWidth = 4.5; x.lineCap = 'round'; x.lineJoin = 'round';
        x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax + 26, ay); x.moveTo(ax + 15, ay - 11); x.lineTo(ax + 26, ay); x.lineTo(ax + 15, ay + 11); x.stroke();
        x.restore(); }
      // подзаголовок
      L.sub.lines.forEach((l, i) => { const p = E.expo(prog(t, 2.6 + i * .04, 3.3 + i * .04)); T(l, 30, L.subY + i * 41 + 50 * (1 - p), { size: L.sub.size, weight: 500, color: GR, align: 'left', alpha: clamp(p * 1.4) }); });
      // заголовок, акцентная строка — цветом бренда
      L.title.forEach((r, i) => { const a = 2.5 + i * .07, p = E.expo(prog(t, a, a + .75)); T(r.s, 30, L.titleY[i] + 70 * (1 - p), { size: L.hs, weight: 900, color: r.acc ? ACT : TX, align: 'left', alpha: clamp(p * 1.4) }); });
      // преимущества плашками
      { let X = 20 - 60 * E.inOut(prog(t, 4.0, 5.2)); const Y = L.chipsY;
        chips.forEach(s => { const cs = 28, w = textW(s, cs, 700) + 64;
          rr(X, Y, w, 64, 32); x.fillStyle = CARD; x.fill(); x.lineWidth = 1.5; x.strokeStyle = rgba(TX, .1); x.stroke();
          x.beginPath(); x.arc(X + 28, Y + 32, 7, 0, 7); x.fillStyle = ACTC; x.fill();
          T(s, X + 46, Y + 33, { size: cs, weight: 700, color: TX, align: 'left' }); X += w + 12; }); }
      // каталог
      const press = clamp((t - TM.tapCard) / .05) * (1 - clamp((t - TM.tapCard - .12) / .08));
      L.cards.forEach((c, i) => { if (i === 0 && t >= TM.exp0) return; if (c.Y - sy > SH || c.Y + L.ch - sy < 0) return; drawGridCard(i, c.X, c.Y, t, i === 0 ? press : 0); });
      x.restore();
      drawHeader(sy);
    }
    if (t >= TM.exp0) drawProduct(t, e);
  }

  // ——— страница товара: раскрытие из карточки и свайп ———
  function drawProduct(t, e) {
    const L = lay(), c0 = L.cards[0], R0 = { X: c0.X, Y: c0.Y - L.scrollT, w: L.cw, h: L.ch };
    x.save();
    if (e < 1) shadow(50 * (1 - e) + 8, 'rgba(0,0,0,.35)', 12);
    rr(mix(R0.X, 0, e), mix(R0.Y, 0, e), mix(R0.w, SW, e), mix(R0.h, SH, e), mix(32, RS, e)); x.fillStyle = CARD; x.fill(); noShadow(); x.clip();
    const pos = pagePos(t), k0 = Math.floor(pos + 1e-6), hide = chipP(t) > .001;
    for (const k of [k0, k0 + 1]) { if (k >= NP) continue; const ox = (k - pos) * SW; if (Math.abs(ox) >= SW - .5) continue; drawPage(t, k, ox, k === 0 ? e : 1, R0, hide); }
    x.restore();
  }
  function drawPage(t, k, ox, e, R0, hide) {
    const L = lay(), nf = L.page[k], pl = L.pill[k], cn = L.cards[k].name, e2 = clamp((e - .25) / .5);
    const lp = (a, b) => mix(a, b, e);
    x.save(); x.translate(ox, 0);
    // фото-зона
    { const X = lp(R0.X + 8, 0), Y = lp(R0.Y + 8, 0), w = lp(R0.w - 16, SW), h = lp(262, 850);
      x.save(); rr(X, Y, w, h, lp(26, 48)); x.fillStyle = mixHex(CARD, tint(k), dark ? .1 : .12); x.fill(); x.clip();
      glowFill(X, Y, w, h, tint(k), .36);
      item(k, lp(R0.X + R0.w / 2, SW / 2) - ox * .45, lp(R0.Y + 140, 470) + 6 * Math.sin(t * 1.3 + k), lp(84, 208), t + k * 3);
      x.restore(); }
    // верхние кнопки
    if (e2 > 0) {
      x.globalAlpha = e2;
      x.beginPath(); x.arc(70, 130, 40, 0, 7); x.fillStyle = rgba(BG, .55); x.fill();
      x.strokeStyle = TX; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(78, 114); x.lineTo(62, 130); x.lineTo(78, 146); x.stroke();
      const lbl = `${k + 1} / ${NP}`, lw = textW(lbl, 28, 700) + 40;
      rr(SW - 30 - lw, 108, lw, 46, 23); x.fillStyle = rgba(BG, .55); x.fill(); T(lbl, SW - 30 - lw / 2, 132, { size: 28, weight: 700, color: TX });
      x.globalAlpha = 1;
    }
    // имя: из карточки в заголовок страницы
    { const nx = lp(R0.X + 20, 36);
      if (e2 < 1) cn.lines.forEach((l, i) => T(l, nx, lp(R0.Y + 304 + i * 37, L.nameY0 + i * nf.size * 1.08), { size: lp(cn.size, nf.size), weight: 800, color: TX, align: 'left', alpha: 1 - e2 }));
      if (e2 > 0) nf.lines.forEach((l, i) => T(l, nx, lp(R0.Y + 304 + i * 37, L.nameY0 + i * nf.size * 1.08), { size: lp(cn.size, nf.size), weight: 900, color: TX, align: 'left', alpha: e2 })); }
    // цена: текст карточки → плашка (когда вылетает наружу — тут пусто)
    if (pl.s && !hide) {
      const cy0 = R0.Y + 304 + cn.lines.length * 37 + 22, tw0 = textW(pl.s, 33, 900);
      const X = lp(R0.X + 20, 36), Y = lp(cy0 - 22, pl.y - 44), w = lp(tw0, pl.w), h = lp(44, 88);
      if (e2 > 0) { rr(X, Y, w, h, h / 2); x.fillStyle = rgba(AC, e2); x.fill(); }
      T(pl.s, X + w / 2, Y + h / 2 + 1, { size: lp(33, 50), weight: 900, color: e2 > .5 ? onAC : ACTC });
    }
    if (e2 > 0) {
      x.globalAlpha = e2;
      // точки страниц
      const pos = pagePos(t);
      for (let i = 0; i < NP; i++) { const a = clamp(1 - Math.abs(pos - i)), w = 14 + 26 * a; rr(SW / 2 - (NP * 26) / 2 + i * 26 + (14 - w) / 2 - ox, 1166, w, 14, 7); x.fillStyle = a > .5 ? ACT : rgba(TX, .25); x.fill(); }
      // кнопка и сердце
      const bw = SW - 72 - 128, bs = fit(btn, bw - 50, 32, 800);
      rr(36, 1212, bw, 100, 50); x.fillStyle = AC; x.fill(); T(btn, 36 + bw / 2, 1263, { size: bs, weight: 800, color: onAC });
      const [hx, hy] = L.heart, liked = prog(t, TM.like, TM.like + .3), pop = 1 + .35 * Math.sin(Math.PI * liked);
      x.beginPath(); x.arc(hx, hy, 50, 0, 7); x.fillStyle = liked > 0 ? rgba(AC, .18 * liked + (1 - liked) * .0) : rgba(TX, .08); x.fill();
      if (liked <= 0) { x.beginPath(); x.arc(hx, hy, 50, 0, 7); x.fillStyle = rgba(TX, .08); x.fill(); }
      heart(hx, hy + 2, 19 * pop);
      if (liked > 0) { x.fillStyle = AC; x.fill(); } else { x.strokeStyle = TX; x.lineWidth = 4; x.stroke(); }
      const r = prog(t, TM.like, TM.like + .5); if (r > 0 && r < 1) { x.beginPath(); x.arc(hx, hy, 50 + 60 * E.out(r), 0, 7); x.strokeStyle = rgba(AC, .6 * (1 - r)); x.lineWidth = 4; x.stroke(); }
      x.globalAlpha = 1;
    }
    x.restore();
  }

  // ——— статистика ———
  function chartPts(n) { const P = []; for (let i = 0; i < n; i++) { const u = i / (n - 1); P.push(.1 + .78 * Math.pow(u, 1.5) + .1 * (hash(i * 3.7 + 1) - .5) * (1 - u * .6)); } P[n - 1] = .95; return P; }
  const CH = chartPts(22);
  function drawCard1(t, big) {
    const L = lay(), w = L.c1.w, h = L.c1.h;
    rr(0, 0, w, h, 38); x.fillStyle = CARD; x.fill();
    if (big) { x.lineWidth = 2; x.strokeStyle = rgba(AC, .5 * big); x.stroke(); }
    const d = stats[0], q = E.out(prog(t, TM.cnt0, TM.cnt0 + 1.35));
    T(statStr(d, +d.число * q), 32, 96, { size: L.n1, weight: 900, color: TX, align: 'left' });
    if (L.cap1) T(L.cap1.lines[0] || '', 32, 168, { size: L.cap1.size, weight: 600, color: GRC, align: 'left' });
    // график
    const X0 = 28, X1 = w - 28, Y0 = 220, Y1 = h - 30, q2 = E.inOut(prog(t, TM.cnt0 + .05, TM.cnt0 + 1.45));
    x.fillStyle = rgba(TX, .06); for (let i = 0; i < 3; i++) x.fillRect(X0, Y0 + i * (Y1 - Y0) / 2, X1 - X0, 2);
    const pt = i => [X0 + (X1 - X0) * i / (CH.length - 1), Y1 - (Y1 - Y0) * CH[i]];
    const path = () => { x.beginPath(); let [a, b] = pt(0); x.moveTo(a, b); for (let i = 1; i < CH.length; i++) { const [c, dd] = pt(i), mx = (a + c) / 2; x.bezierCurveTo(mx, b, mx, dd, c, dd); a = c; b = dd; } };
    const hx = X0 + (X1 - X0) * q2;
    x.save(); x.beginPath(); x.rect(X0 - 10, Y0 - 30, hx - X0 + 10, Y1 - Y0 + 40); x.clip();
    path(); x.lineTo(X1, Y1); x.lineTo(X0, Y1); x.closePath();
    const g = x.createLinearGradient(0, Y0, 0, Y1); g.addColorStop(0, rgba(AC, .42)); g.addColorStop(1, rgba(AC, 0)); x.fillStyle = g; x.fill();
    path(); x.strokeStyle = AC; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
    x.restore();
    if (q2 > 0) { const fi = q2 * (CH.length - 1), i0 = Math.min(CH.length - 2, Math.floor(fi)), fr = fi - i0, u = fr * fr * (3 - 2 * fr);
      const hy = mix(pt(i0)[1], pt(i0 + 1)[1], u);
      x.beginPath(); x.arc(hx, hy, 22, 0, 7); x.fillStyle = rgba(AC, .25); x.fill();
      x.beginPath(); x.arc(hx, hy, 11, 0, 7); x.fillStyle = AC; x.fill(); }
  }
  function drawSmall(t, s, d, i, Y) {
    const h = 310;
    rr(s.X, Y, s.w, h, 34); x.fillStyle = CARD; x.fill();
    const q = E.out(prog(t, TM.cnt0 + .15 + i * .12, TM.cnt0 + 1.4 + i * .12));
    T(statStr(d, +d.число * q), s.X + 24, Y + 66, { size: s.n, weight: 900, color: TX, align: 'left' });
    s.cap.lines.forEach((l, k) => T(l, s.X + 24, Y + 132 + k * 35, { size: s.cap.size, weight: 600, color: GRC, align: 'left' }));
    const n = 7, bw = (s.w - 48 - (n - 1) * 10) / n;
    for (let b = 0; b < n; b++) { const gr = E.out5(prog(t, TM.cnt0 + .2 + b * .06 + i * .1, TM.cnt0 + .9 + b * .06 + i * .1)), hh = 74 * (.3 + .7 * b / (n - 1)) * (.82 + .18 * hash(b * 5.3 + i)) * gr;
      rr(s.X + 24 + b * (bw + 10), Y + h - 26 - hh, bw, Math.max(hh, .1), 6); x.fillStyle = b === n - 1 ? AC : rgba(AC, .32); x.fill(); }
  }
  function drawStats(t) {
    const L = lay(), u = E.out5(prog(t, TM.st0, TM.st1)), push = E.out5(prog(t, TM.fin, TM.fin + .5));
    if (u < 1) { x.fillStyle = `rgba(0,0,0,${.45 * u})`; x.fillRect(0, 0, SW, SH); }
    x.save(); x.translate(-SW * .3 * push, SH * (1 - u));
    shadow(40, 'rgba(0,0,0,.35)', -6); rr(0, 0, SW, SH + 80, [48, 48, 0, 0]); x.fillStyle = BG; x.fill(); noShadow();
    rr(SW / 2 - 40, 12, 80, 8, 4); x.fillStyle = rgba(TX, .2); x.fill();
    const bs = Math.max(28, fit(brand + tail, SW - 160, 38, 900)), bt = ell(brand, SW - 160 - textW(tail, bs, 900), bs, 900), bw = textW(bt, bs, 900);
    T(bt, 30, 126, { size: bs, weight: 900, color: TX, align: 'left' }); if (tail) T(tail, 30 + bw, 126, { size: bs, weight: 900, color: ACT, align: 'left' });
    const pulse = .5 + .5 * Math.sin(t * 6);
    x.beginPath(); x.arc(SW - 50, 126, 12 + 10 * pulse, 0, 7); x.fillStyle = rgba(AC, .25 * (1 - pulse)); x.fill();
    x.beginPath(); x.arc(SW - 50, 126, 11, 0, 7); x.fillStyle = AC; x.fill();
    if (stats.length) {
      x.save(); x.translate(20, 190);
      if (statP(t) > .001) { rr(0, 0, L.c1.w, L.c1.h, 38); x.fillStyle = rgba(TX, .04); x.fill(); x.setLineDash([10, 10]); x.lineWidth = 2; x.strokeStyle = rgba(TX, .12); x.stroke(); x.setLineDash([]); }
      else drawCard1(t, 0);
      x.restore();
      L.small.forEach((s, i) => drawSmall(t, s, stats[i + 1], i, 190 + L.c1.h + 30));
    }
    L.steps.forEach((f, i) => { const a = TM.st0 + .45 + i * .1, p = E.expo(prog(t, a, a + .7)), Y = L.stepsY + i * 82, X = 50 + 60 * (1 - p);
      x.globalAlpha = clamp(p * 1.4);
      x.beginPath(); x.arc(X, Y, 22, 0, 7); x.fillStyle = AC; x.fill();
      x.strokeStyle = onAC; x.lineWidth = 4.5; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(X - 9, Y + 1); x.lineTo(X - 2, Y + 8); x.lineTo(X + 10, Y - 7); x.stroke();
      T(f.lines[0] || '', X + 40, Y + 1, { size: f.size, weight: 700, color: TX, align: 'left' });
      x.globalAlpha = 1; });
    x.restore();
    if (push > 0) { x.fillStyle = `rgba(0,0,0,${.35 * push})`; x.fillRect(0, 0, SW, SH); }
  }

  // ——— экран призыва ———
  function drawCTA(t) {
    const u = E.out5(prog(t, TM.fin, TM.fin + .5));
    x.save(); x.translate(SW * (1 - u), 0);
    shadow(40, 'rgba(0,0,0,.35)', 0); x.fillStyle = BG; x.fillRect(0, 0, SW, SH); noShadow();
    glowFill(0, 200, SW, 900, AC, dark ? .22 : .28);
    const bs = Math.max(30, fit(brand + tail, SW - 100, 50, 900)), bt = ell(brand, SW - 100 - textW(tail, bs, 900), bs, 900), bw = textW(bt + tail, bs, 900);
    T(bt, SW / 2 - bw / 2, 168, { size: bs, weight: 900, color: TX, align: 'left' }); if (tail) T(tail, SW / 2 - bw / 2 + textW(bt, bs, 900), 168, { size: bs, weight: 900, color: ACT, align: 'left' });
    x.save(); rr(40, 236, SW - 80, 680, 52); x.fillStyle = CARD; x.fill(); x.clip(); glowFill(40, 236, SW - 80, 680, AC, .25); item(-1, SW / 2, 576 + 8 * Math.sin(t * 1.2), 168, t); x.restore();
    const pulse = t > TM.fin + 1 ? Math.sin((t - TM.fin - 1) * 4.2) : 0, bump = Math.sin(Math.PI * prog(t, TM.tapCta, TM.tapCta + .24));
    x.save(); x.translate(SW / 2, 1060); x.scale(1 + .025 * pulse - .05 * bump, 1 + .025 * pulse - .05 * bump);
    shadow(40 + 20 * pulse, rgba(AC, dark ? .55 : .45), 10); rr(-(SW - 80) / 2, -78, SW - 80, 156, 78); x.fillStyle = AC; x.fill(); noShadow(); x.clip();
    const r = prog(t, TM.tapCta, TM.tapCta + .6); if (r > 0 && r < 1) { x.beginPath(); x.arc(0, 0, 30 + 420 * E.out(r), 0, 7); x.fillStyle = rgba(onAC, .22 * (1 - r)); x.fill(); }
    T(btn, 0, 2, { size: fit(btn, SW - 160, 54, 900), weight: 900, color: onAC });
    x.restore();
    if (domain) T(domain, SW / 2, 1206, { size: fit(domain, SW - 100, 36, 700), weight: 700, color: GR });
    x.restore();
  }

  // ——— статус-бар, палец ———
  function statusBar(col) {
    T(UI.время, 84, 46, { size: 30, weight: 700, color: col });
    x.fillStyle = col;
    for (let i = 0; i < 4; i++) { rr(SW - 168 + i * 10, 54 - (8 + i * 5), 7, 8 + i * 5, 2); x.fill(); }
    x.strokeStyle = col; x.lineWidth = 4; x.lineCap = 'round';
    for (const r of [8, 15]) { x.beginPath(); x.arc(SW - 112, 54, r, -2.36, -.78); x.stroke(); }
    x.beginPath(); x.arc(SW - 112, 52, 3, 0, 7); x.fill();
    x.lineWidth = 2.5; rr(SW - 86, 34, 48, 24, 8); x.stroke(); rr(SW - 82, 38, 36, 16, 4); x.fill(); rr(SW - 35, 42, 4, 9, 2); x.fill();
  }
  function gest(g, t) {
    if (t < g.a || t > g.z) return null;
    let X, Y; const from = g.from || g.p0;
    if (t < g.b) { const u = E.out(prog(t, g.a, g.b)); X = mix(from[0], g.p0[0], u); Y = mix(from[1], g.p0[1], u); }
    else if (t <= g.c) { const u = (g.ease || (v => v))(prog(t, g.b, g.c)); X = mix(g.p0[0], g.p1[0], u); Y = mix(g.p0[1], g.p1[1], u); }
    else { const u = g.after ? E.out(prog(t, g.c, g.z)) * .3 : 0; X = g.p1[0] + (g.p1[0] - g.p0[0]) * u; Y = g.p1[1] + (g.p1[1] - g.p0[1]) * u; }
    const a = E.out(prog(t, g.a, g.a + .1)) * (1 - prog(t, g.c + .02, g.z));
    const pr = clamp((t - g.b) / .05) * (1 - clamp((t - g.c) / .07));
    return { X, Y, a, pr };
  }
  function drawFingers(t) {
    for (const g of lay().gest) { const f = gest(g, t); if (!f || f.a <= 0) continue;
      const r = 46 - 8 * f.pr;
      x.beginPath(); x.arc(f.X, f.Y, r, 0, 7); x.fillStyle = `rgba(150,150,150,${(.34 + .14 * f.pr) * f.a})`; x.fill();
      x.lineWidth = 3; x.strokeStyle = `rgba(255,255,255,${.8 * f.a})`; x.stroke(); }
  }

  // ——— экран целиком ———
  function drawScreen(t, P) {
    if (t >= TM.unl0 && t < TM.st1) drawSite(t);
    if (t >= TM.st0 && t < TM.fin + .5) drawStats(t);
    if (t >= TM.fin) drawCTA(t);
    if (t < TM.unl1) drawLock(t);
    const col = t < (TM.unl0 + TM.unl1) / 2 ? LTX : TX;
    statusBar(col);
    rr(SW / 2 - 72, SH - 22, 144, 9, 5); x.fillStyle = rgba(col, .5); x.fill();
    drawFingers(t);
    const dim = Math.max(P.hk * .42, statP(t) * .38, pushOn(t) * .3, chipP(t) * .12);
    if (dim > .002) { x.fillStyle = `rgba(0,0,0,${dim})`; x.fillRect(0, 0, SW, SH); }
  }
  // мягкая тень телефона — один раз в спрайт (живой shadowBlur на таком размере дорогой)
  const SHP = 150; let SHC = null;
  function phoneShadow() {
    if (SHC) return SHC;
    const k = .25, c2 = document.createElement('canvas'); c2.width = Math.ceil((BW + 2 * SHP) * k); c2.height = Math.ceil((BH + 2 * SHP) * k);
    const g = c2.getContext('2d'); g.scale(k, k);
    g.shadowColor = `rgba(0,0,0,${dark ? .6 : .3})`; g.shadowBlur = 110 * k; g.shadowOffsetX = 10000 * k;
    g.beginPath(); g.roundRect(SHP - 10000, SHP, BW, BH, RB); g.fillStyle = '#000'; g.fill();
    return SHC = c2;
  }
  function drawPhone(t, P, PM) {
    x.save(); setM(PM);
    const sx = -Math.sin(P.ry) * 150, sy = 8 + Math.sin(P.rx) * 60;
    x.drawImage(phoneShadow(), sx - SHP, sy + 46 - SHP, BW + 2 * SHP, BH + 2 * SHP);
    rr(sx, sy, BW, BH, RB); x.fillStyle = FR[0]; x.fill();
    x.fillStyle = FR[2];
    rr(-6, 270, 10, 66, 4); x.fill(); rr(-6, 380, 10, 124, 4); x.fill(); rr(-6, 524, 10, 124, 4); x.fill(); rr(BW - 4, 430, 10, 196, 4); x.fill();
    const g = x.createLinearGradient(0, 0, BW, 0); [0, .035, .12, .88, .965, 1].forEach((s, i) => g.addColorStop(s, FR[i]));
    rr(0, 0, BW, BH, RB); x.fillStyle = g; x.fill();
    rr(2, 2, BW - 4, BH - 4, RB - 2); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.stroke();
    rr(7, 7, BW - 14, BH - 14, RB - 7); x.fillStyle = '#030303'; x.fill();
    x.save(); x.translate(BZ, BZ); rr(0, 0, SW, SH, RS); x.clip();
    drawScreen(t, P);
    // динамический остров
    rr(SW / 2 - 92, 18, 184, 56, 28); x.fillStyle = '#000'; x.fill();
    x.beginPath(); x.arc(SW / 2 + 60, 46, 10, 0, 7); x.fillStyle = '#0d1424'; x.fill();
    x.beginPath(); x.arc(SW / 2 + 57, 43, 3, 0, 7); x.fillStyle = 'rgba(120,150,255,.5)'; x.fill();
    // блик на стекле, едет с наклоном
    const gx = SW * (.35 + Math.sin(P.ry) * 4 + .08 * Math.sin(t * .5));
    const gg = x.createLinearGradient(gx - 260, -140, gx + 260, 260);
    gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(.5, `rgba(255,255,255,${dark ? .07 : .1})`); gg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gg; x.fillRect(0, 0, SW, SH);
    // в финале по стеклу один раз проходит яркий блик
    const sw = prog(t, TM.fin + 1.0, TM.fin + 1.75);
    if (sw > 0 && sw < 1) { const sx = mix(-SW * .8, SW * 1.8, E.inOut(sw)), sg = x.createLinearGradient(sx - 160, 0, sx + 160, SH * .35);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, `rgba(255,255,255,${.22 * Math.sin(Math.PI * sw)})`); sg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sg; x.fillRect(0, 0, SW, SH); }
    const g2 = x.createLinearGradient(0, 0, SW * .6, SH * .35); g2.addColorStop(0, 'rgba(255,255,255,.06)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g2; x.fillRect(0, 0, SW, SH);
    x.restore();
    x.restore();
  }

  // ——— фон: цвет бренда с мягкими пятнами ———
  function bgTint(t) {
    if (!goods.some((g, i) => pal(i))) return AC;
    const w = prog(t, 5.2, 5.8) * (1 - prog(t, 9.6, 10.3)); if (w <= 0) return AC;
    const pos = pagePos(t), k = Math.min(NP - 1, Math.floor(pos)), fr = pos - k;
    const tc = mixHex(tint(k), tint(Math.min(NP - 1, k + 1)), fr);
    return mixHex(AC, tc, w * .85);
  }
  // фон мягкий — рисуем его в четверть размера и растягиваем (дёшево, на глаз не отличить)
  let BGC = null;
  function drawBG(t) {
    if (!BGC) { BGC = document.createElement('canvas'); BGC.width = W / 4; BGC.height = H / 4; }
    const g = BGC.getContext('2d'); g.setTransform(.25, 0, 0, .25, 0, 0);
    g.fillStyle = OB; g.fillRect(0, 0, W, H);
    const tc = bgTint(t);
    const blobs = [[230, 380, 640, tc, dark ? .58 : .55], [880, 860, 720, dark ? mixHex(AC, '#ffffff', .2) : '#ffffff', dark ? .22 : .6], [240, 1460, 760, tc, dark ? .38 : .45], [860, 1780, 620, dark ? mixHex(AC, '#000000', .55) : mixHex(AC, BG, .35), .5]];
    blobs.forEach(([bx, by, r, col, a], i) => {
      const X = bx + 110 * noise(i + 11, t * .22), Y = by + 130 * noise(i + 21, t * .2), R = r * (1 + .08 * Math.sin(t * .6 + i));
      const gr = g.createRadialGradient(X, Y, 0, X, Y, R); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(X - R, Y - R, 2 * R, 2 * R);
    });
    const v = g.createRadialGradient(540, 900, 500, 540, 900, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${dark ? .45 : .12})`); g.fillStyle = v; g.fillRect(0, 0, W, H);
    x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; x.drawImage(BGC, 0, 0, W, H); x.restore();
  }

  // ——— вылеты к зрителю ———
  function drawHookPops(t, SM) {
    const L = lay(), ks = (SW - 68) / W0;
    L.hook.forEach((c, i) => {
      const p0 = prog(t, TM.pop(i), TM.pop(i) + TM.popD); if (p0 <= 0) return;
      const f = E.in(prog(t, TM.fly(i), TM.fly(i) + TM.flyD)); if (f >= 1) return;
      const p = E.out5(p0), rz = [-.032, .024, -.016][i % 3], xo = [-8, 10, -4][i % 3];
      const A = chain(SM, tr(34, L.lockY[i]), sc(ks));
      const B = chain(tr(540 + xo, L.bigY[i]), rot(rz), sc(K), tr(-W0 / 2, -c.h / 2));
      let m = mul(lerpM(A, B, p), liftM(W0, c.h, 1 + .08 * Math.sin(Math.PI * clamp(p0 * 1.3))));
      if (f > 0) m = mul(tr((i - 1) * 90 * f, -1750 * f), m);
      x.save(); setM(m); drawNotif(c, clamp(p0 * 3), t); x.restore();
    });
  }
  function drawChip(t, SM) {
    const p = chipP(t); if (p <= .001) return;
    const L = lay(), pos = pagePos(t), k = Math.min(NP - 1, Math.floor(pos + 1e-6)), fr = k < NP - 1 ? pos - k : 0, ef = E.inOut(clamp(fr));
    const kc = Math.min(NP - 1, Math.round(pos)), w = mix(L.pill[k].w || 0, L.pill[Math.min(NP - 1, k + 1)].w || 0, ef), h = 88, KC = 1.55;
    const A = chain(SM, tr(36, L.pill[kc].y - 44));
    // наружу вылетает в свою же строку (под именем), правым краем за корпус — кнопку и точки страниц не закрывает
    const pY = ptM(SM, 0, (L.pill[kc].y - 58 + 1166) / 2)[1];   // середина между низом имени и точками
    const B = chain(tr(952 - w * KC, pY - h * KC / 2), rot(-.04), sc(KC));
    const m = mul(lerpM(A, B, p), liftM(w, h, 1 + .1 * Math.sin(Math.PI * p)));
    x.save(); setM(m);
    shadow(50 * p + 6, rgba(dark ? '#000000' : mixHex(AC, '#000000', .6), dark ? .55 : .3), 18 * p);
    rr(0, 0, w, h, h / 2); x.fillStyle = AC; x.fill(); noShadow(); x.clip();
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgba(255,255,255,${.28 * p})`); g.addColorStop(.5, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    // смена цены: старая уезжает вверх и гаснет, новая приходит снизу — без «хвостов» двух цен сразу
    const q = E.inOut(clamp((fr - .15) / .6)), oa = 1 - clamp(q * 2.2), na = clamp(q * 2.2 - 1.2);
    if (oa > 0) T(L.pill[k].s, w / 2, h / 2 + 1 - q * h * .6, { size: 50, weight: 900, color: onAC, alpha: oa });
    if (fr > 0 && na > 0) T(L.pill[k + 1].s, w / 2, h / 2 + 1 + (1 - q) * h * .6, { size: 50, weight: 900, color: onAC, alpha: na });
    x.restore();
  }
  function drawStatPop(t, SM) {
    const p = statP(t); if (p <= .001) return;
    const L = lay(), u = E.out5(prog(t, TM.st0, TM.st1)), push = E.out5(prog(t, TM.fin, TM.fin + .5));
    const A = chain(SM, tr(20 - SW * .3 * push, 190 + SH * (1 - u)));
    const B = chain(tr(540, 560), rot(-.028), sc(1.36), tr(-L.c1.w / 2, -L.c1.h / 2));
    const m = mul(lerpM(A, B, p), liftM(L.c1.w, L.c1.h, 1 + .06 * Math.sin(Math.PI * p)));
    x.save(); setM(m); shadow(70 * p + 8, `rgba(0,0,0,${dark ? .6 : .25})`, 26 * p); rr(0, 0, L.c1.w, L.c1.h, 38); x.fillStyle = CARD; x.fill(); noShadow();
    drawCard1(t, clamp(p * 3)); x.restore();
  }
  function drawPushes(t) {
    const L = lay(), n = L.orders.length, P = L.orders.map((c, j) => E.out5(prog(t, TM.push(j), TM.push(j) + .6)));
    for (let j = 0; j < n; j++) {
      if (P[j] <= 0) continue;
      const c = L.orders[j], f = E.in(prog(t, TM.pushOut(j), TM.pushOut(j) + .42)); if (f >= 1) continue;
      let off = 0; for (let m = j + 1; m < n; m++) off += (L.orders[m].h * K + 22) * P[m];
      const top = 290 + off - (1 - P[j]) * (290 + c.h * K + 120), rz = [.02, -.024, .014][j % 3];
      const m = chain(tr(0, -1800 * f), tr(540, top + c.h * K / 2), rot(rz * (1 - P[j] * .4)), sc(K * (1 + .06 * (1 - P[j]))), tr(-W0 / 2, -c.h / 2));
      x.save(); setM(m); drawNotif(c, true, t); x.restore();
    }
  }
  function drawHearts(t, SM) {
    const L = lay(), [bx, by] = ptM(SM, L.heart[0], L.heart[1]);
    for (let i = 0; i < 20; i++) {
      const t0 = TM.like + .04 + i * .045, q = prog(t, t0, t0 + 1.15); if (q <= 0 || q >= 1) continue;
      const hx = bx + (hash(i * 3 + 1) - .5) * 80 + Math.sin(q * 7 + i) * 26 * q + (hash(i * 7 + 2) - .1) * 230 * E.out(q);
      const hy = by - q * (650 + hash(i * 1.7) * 480);
      const r = (18 + 24 * hash(i * 5.1)) * (.4 + .6 * E.back(clamp(q * 4)));
      const a = clamp(q / .08) * (1 - E.in(q));
      x.save(); x.translate(hx, hy); x.rotate((hash(i * 9.1) - .5) * .7); x.globalAlpha = a;
      heart(0, 0, r); x.fillStyle = i % 3 === 1 ? mixHex(AC, '#ffffff', .45) : AC; x.fill(); x.lineWidth = 2; x.strokeStyle = rgba('#000000', .18); x.stroke();
      x.restore();
    }
  }
  function drawFinal(t) {
    const L = lay();
    cta.forEach((l, i) => { const a = TM.fin + .42 + i * .1, p = E.expo(prog(t, a, a + .9)); if (p <= 0) return;
      T(l, 540, L.ctaY[i] + 90 * (1 - p), { size: L.cs, weight: 900, color: OTX, alpha: clamp(p * 1.6), track: -1 }); });
    if (domain) { const p = E.out5(prog(t, TM.fin + .72, TM.fin + 1.4)); if (p > 0) {
      const w = textW(domain, L.domS, 800) + 130, h = 100, Y = L.domY + 40 * (1 - p);
      x.save(); x.globalAlpha = clamp(p * 1.5); x.translate(540, Y); x.scale(.9 + .1 * p, .9 + .1 * p);
      shadow(30, rgba(dark ? '#000000' : mixHex(AC, '#000000', .6), .35), 10); rr(-w / 2, -h / 2, w, h, h / 2); x.fillStyle = AC; x.fill(); noShadow();
      T(domain, -14, 2, { size: L.domS, weight: 800, color: onAC });
      const ax = w / 2 - 50; x.strokeStyle = onAC; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(ax - 10, 10); x.lineTo(ax + 8, -8); x.moveTo(ax - 6, -8); x.lineTo(ax + 8, -8); x.lineTo(ax + 8, 6); x.stroke();
      x.restore(); } }
  }

  window.КАДР = t => {
    const P = phoneP(t), PM = phoneM(P), SM = mul(PM, tr(BZ, BZ));
    drawBG(t);
    drawPhone(t, P, PM);
    drawHookPops(t, SM);
    drawChip(t, SM);
    drawStatPop(t, SM);
    drawHearts(t, SM);
    drawPushes(t);
    x.setTransform(1, 0, 0, 1, 0, 0);
    drawFinal(t);
  };
})();

  },
  zhurnal() {
// СТИЛЬ «ЖУРНАЛ»: ролик как глянцевый журнал уровня Vogue / Kinfolk / Monocle.
// Бумага (тёплый офф-уайт / чёрная мелованная), огромная антиква, гротеск мелко капсом, волосяные линейки,
// колонтитулы, номера страниц, буквица, колонки. Акцент бренда — единственный цвет: плашка и подчёркивание.
// Сцены: обложка 0–2,3 (бренд-заголовок, предмет перекрывает название, анонсы, стикер с ценой)
// → страница загибается (page curl) 2,3–3,15 → разворот: заголовок с курсивной строкой на плашке, фото, буквица, колонки
// → фото растёт в модный лукбук 5,85–6,6, камера листает полосы товаров до 9,2 → второй curl → инфографика с огромными цифрами
// → журнал отъезжает и переворачивается 11,35–12,45 → задняя обложка: призыв, кнопка, домен, штрихкод, № и цена.
// Все слова, цвета и цифры — из САЙТ. Кадр = чистая функция времени.
window.ИМЯ = 'zhurnal';
DUR = 15;
FONT = САЙТ.шрифт || FONT;

(() => {
  const S = САЙТ, C = S.цвета || {};

  // ——— цвет ———
  const hx = h => '#' + hex2rgb(h).map(v => v.toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, p) => { const A = hex2rgb(a), B = hex2rgb(b), q = clamp(p); return '#' + A.map((v, i) => Math.round(mix(v, B[i], q)).toString(16).padStart(2, '0')).join(''); };
  const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const BG = hx(C.фон || '#0b0b0b');
  const DARK = S.тема ? !/свет/i.test(S.тема) : lum(BG) < .4;
  // бумага: на тёмной теме — чёрная мелованная, на светлой — тёплый офф-уайт
  const PAPER = DARK ? mixHex(BG, '#17140f', .75) : mixHex(lum(BG) > .55 ? BG : '#f2ece2', '#f6f0e5', .25);
  let INK = hx(C.текст || (DARK ? '#ffffff' : '#141210'));
  if (DARK) INK = mixHex(INK, '#f1ebe0', .22);
  if (contrast(INK, PAPER) < 7) INK = DARK ? '#f1ebe0' : '#15120f';
  const GR0 = hx(C.серый || mixHex(INK, PAPER, .45));
  let GREY = GR0; for (let p = .1; contrast(GREY, PAPER) < 3.6 && p < 1; p += .1) GREY = mixHex(GR0, INK, p);
  const ACC = hx(C.акцент || '#c8102e');
  let ACCT = ACC; for (let p = .12; contrast(ACCT, PAPER) < 3 && p < 1; p += .1) ACCT = mixHex(ACC, INK, p);
  const ON = contrast('#ffffff', ACC) >= 3.2 ? '#ffffff' : '#0c0b0a';      // текст на акцентной плашке
  const RULE = mixHex(INK, PAPER, DARK ? .62 : .55);                         // волосяные линейки
  const STUDIO = DARK ? mixHex(PAPER, '#ffffff', .08) : mixHex(PAPER, '#5a4a3a', .1);
  const TABLE = DARK ? mixHex(BG, '#000000', .5) : mixHex(PAPER, '#4a4036', .32);
  const U = s => (S.капс ? String(s).toUpperCase() : String(s));

  const TV = (S.товары || []).filter(Boolean).slice(0, 5);
  const HERO = TV[0] && TV[0].палитра;
  const NUMS = (S.цифры || []).filter(Boolean).slice(0, 3);
  const ISSUE = '№ 01';

  // ——— шрифты: антиква. У Didot/Bodoni нет кириллицы — русские строки целиком идут в Baskerville/PT Serif ———
  const CYR = /[Ѐ-ӿ]/;
  const SER_L = '"Didot","Bodoni 72","Playfair Display","Georgia",serif';
  const SER_C = '"Playfair Display","Baskerville","PT Serif","Georgia",serif';
  const SF = s => (CYR.test(s) ? SER_C : SER_L);
  const wgt = (it, w) => (it ? 'italic ' : '') + (w || 400);
  const sW = (s, size, it, w, tr = 0) => textW(String(s), size, wgt(it, w), tr, SF(String(s)));
  const sFit = (s, maxW, size, it, w, tr = 0) => { const v = sW(s, size, it, w, tr); return v > maxW ? size * maxW / v : size; };
  // антиква (базовая линия — alphabetic)
  const ST = (s, X, Y, o = {}) => T(String(s), X, Y, { size: o.size || 40, weight: wgt(o.it, o.w), font: SF(String(s)), color: o.color || INK, align: o.align || 'left', alpha: o.alpha, track: o.track || 0, base: 'alphabetic' });
  // гротеск мелко капсом
  const capsTr = size => Math.round(size * .2);
  const capsW = (s, size, w = 600) => textW(String(s).toUpperCase(), size, w, capsTr(size));
  const caps = (s, X, Y, o = {}) => { const size = o.size || 20, tr = capsTr(size), str = String(s).toUpperCase();
    // у правого края letterSpacing даёт хвост — компенсируем
    const XX = o.align === 'right' ? X + tr : o.align === 'center' ? X + tr / 2 : X;
    return T(str, XX, Y, { size, weight: o.w || 600, color: o.color || GREY, align: o.align || 'left', alpha: o.alpha, track: tr, base: 'alphabetic' }); };
  const capsFit = (s, maxW, size, w = 600) => { const v = capsW(s, size, w); return v > maxW ? size * maxW / v : size; };

  // ——— мелочи рисования ———
  const hl = (x0, y0, x1, y1, col = RULE, lw = 2, a = 1) => { if (a <= 0 || Math.abs(x1 - x0) + Math.abs(y1 - y0) < .5) return; x.save(); x.globalAlpha *= a; x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.restore(); };
  const box = (X, Y, w, h, col, a = 1) => { if (a <= 0 || w <= 0) return; x.save(); x.globalAlpha *= a; x.fillStyle = col; x.fillRect(X, Y, w, h); x.restore(); };
  const eio = p => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
  const soft = p => mix(E.inOut(p), eio(p), .5);
  const lerpR = (a, b, p) => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p) });

  function wrapM(s, maxW, mw) {
    const out = []; let cur = '';
    for (const wd of String(s).split(/\s+/).filter(Boolean)) { const tr = cur ? cur + ' ' + wd : wd; if (cur && mw(tr) > maxW) { out.push(cur); cur = wd; } else cur = tr; }
    if (cur) out.push(cur); return out;
  }
  // перенос с разной шириной строк (для буквицы)
  function wrapVar(s, widthOf, mw) {
    const out = []; let cur = '';
    for (const wd of String(s).split(/\s+/).filter(Boolean)) { const tr = cur ? cur + ' ' + wd : wd; if (cur && mw(tr) > widthOf(out.length)) { out.push(cur); cur = wd; } else cur = tr; }
    if (cur) out.push(cur); return out;
  }
  // строки автора → ряды заголовка: держим авторские строки, пока кегль не мелкий; иначе переносим
  function block(lines, maxW, maxS, maxH, w, acc, pk = 1.04, minS = 40) {
    const it = i => i === acc;
    const keep = Math.min(maxS, maxH / (lines.length * pk), ...lines.map((r, i) => sFit(r, maxW, maxS, it(i), w)));
    const asIs = { size: keep, rows: lines.slice(), src: lines.map((_, i) => i) };
    if (keep >= maxS * .62 || lines.length >= 4) return asIs;
    for (let sz = maxS; sz > keep; sz -= 2) {
      const rows = [], src = [];
      lines.forEach((ln, i) => wrapM(ln, maxW, s2 => sW(s2, sz, it(i), w)).forEach(r => { rows.push(r); src.push(i); }));
      if (rows.length * sz * pk <= maxH && rows.every((r, j) => sW(r, sz, it(src[j]), w) <= maxW)) return { size: sz, rows, src };
    }
    return asIs;
  }

  // ——— время ———
  const C1 = [2.2, 3.3];             // curl: обложка → разворот
  const M0 = 5.85, M1 = 6.6;         // фото разворота растёт в лукбук
  const LK1 = 9.2;                   // конец лукбука
  const C2 = [9.15, 10.25];           // curl: лукбук → цифры
  const Z0 = 11.35, Z1 = 11.95;      // журнал отъезжает
  const F0 = 11.8, F1 = 12.45;       // переворот на заднюю обложку
  const NT = Math.max(1, TV.length);
  const arrive = i => i === 0 ? M1 - .2 : M1 + i * (LK1 - M1) / NT;     // момент, когда полоса i встала в центр
  const MD = .5;                                                          // длительность прокрутки к полосе

  // ——— замер предмета: рисуем его один раз на пустом холсте и снимаем силуэт по строкам ———
  // так стиль знает, где у чужого предмета верх, низ, «ядро» (самая широкая часть) и ширина на каждой высоте
  function measure() {
    const s0 = 110, oy = 960, M = { tu: -1.2, bd: 1.2, hw: 1.1, cu: -1, cd: 1, rows: [] };
    try {
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.translate(540, oy); S.предмет(x, 0, HERO, s0); x.restore();
      const d = x.getImageData(0, 0, W, H).data; let top = H, bot = 0, maxW = 0;
      for (let y = 0; y < H; y += 4) { let l0 = -1, r0 = -1;
        for (let X = 0; X < W; X += 2) if (d[(y * W + X) * 4 + 3] > 90) { if (l0 < 0) l0 = X; r0 = X; }
        if (l0 >= 0) { const hw = Math.max(540 - l0, r0 - 540) / s0; M.rows.push({ y: (y - oy) / s0, hw }); top = Math.min(top, y); bot = Math.max(bot, y); maxW = Math.max(maxW, hw); } }
      if (M.rows.length) {
        M.tu = (top - oy) / s0; M.bd = (bot - oy) / s0; M.hw = maxW;
        const core = M.rows.filter(r => r.hw >= maxW * .8); M.cu = core[0].y; M.cd = core[core.length - 1].y;
      }
    } catch (e) { /* без замера — умолчания */ }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.restore();
    return M;
  }
  // наибольшая полуширина предмета на отрезке высот экрана [y0, y1] при центре cy и масштабе s
  const halfAt = (M, cy, s, y0, y1) => { let m = 0; M.rows.forEach(r => { const Y = cy + r.y * s; if (Y >= y0 && Y <= y1) m = Math.max(m, r.hw * s); }); return m; };
  // масштаб предмета, чтобы ядро влезло в рамку фото
  const fitIn = (M, w, h, kw = .3, kh = .44) => Math.min(w * kw / M.hw, h * kh / Math.max(.4, (M.cd - M.cu) / 2));

  // ——— раскладка (один раз) ———
  let L = null;
  function layout() {
    const l = {}, M = measure(); l.M = M;
    // обложка
    l.mast = String(S.бренд || S.домен || '').toUpperCase();
    // название журнала: одна строка; длинное имя из нескольких слов — в две, если так заметно крупнее
    const mastLay = (maxW, maxS) => {
      let best = { rows: [l.mast], size: Math.min(maxS, sFit(l.mast, maxW, maxS * 1.1, false, 700)) };
      const ws = l.mast.split(/\s+/);
      if (ws.length > 1 && best.size < maxS * .6) for (let i = 1; i < ws.length; i++) {
        const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' ');
        const sz = Math.min(maxS * .6, sFit(a, maxW, maxS, false, 700), sFit(b, maxW, maxS, false, 700));
        if (sz > best.size * 1.2 && sz > (best.rows.length > 1 ? best.size : 0)) best = { rows: [a, b], size: sz };
      }
      best.pitch = best.size * .9; return best;
    };
    l.mastL = mastLay(840, 270); l.mastS = l.mastL.size;
    l.mastBase = 322 + l.mastS * .71 + (l.mastL.rows.length - 1) * l.mastL.pitch;
    const hook = ((S.хук && S.хук.length) ? S.хук : (S.заголовок || [S.бренд || ''])).map(U);
    l.hookAcc = S.хукАкцент ?? (hook.length > 1 ? hook.length - 1 : -1);
    l.hook = block(hook, 820, 104, 300, 400, l.hookAcc, 1.02);
    l.hookP = l.hook.size * 1.04;
    l.hookTop = 1484 - l.hook.rows.length * l.hookP;
    // предмет заходит на нижние 40% букв названия (классика обложек), ядро целиком над хуком
    // у фото верх срезан (браслет, край кадра) — он заходит на буквы и растворяется; рисованный предмет — классический заход на 24%
    const im = HERO && HERO.фото ? фото(HERO.фото) : null;
    l.fadeTop = !!im;
    const capH = l.mastS * .7, topY = l.mastBase - capH * (im ? .42 : .24), zB = l.hookTop - 34;
    const sCap = im ? Math.min(282, 1.5 * im.naturalWidth / (HERO.ширина || 2.25)) : 265;   // фото не раздуваем больше 1,5× исходника
    let s = Math.min(sCap, 330 / M.hw, (zB - 16 - topY) / Math.max(.5, M.cd - M.tu));
    s = Math.max(s, Math.min(175, 330 / M.hw));
    l.s = s; l.cx = 540;
    const fits = (M.bd - M.tu) * s <= zB - topY;
    l.cy = fits ? (topY + zB) / 2 - (M.tu + M.bd) / 2 * s : im ? topY - M.tu * s : zB - 16 - M.cd * s;
    l.fadeLen = capH * .62;
    // высокий предмет обрезаем снизу мягким уходом в бумагу; влезающий — не трогаем
    l.fade0 = fits ? l.cy + M.bd * s + 4 : l.cy + M.cd * s; l.fade1 = Math.min(l.hookTop + 30, l.fade0 + 110);
    l.capY = l.mastBase + 82;
    l.coverW = clamp(540 - halfAt(M, l.cy, s, l.capY - 50, l.capY + 150) - 30 - 120, 150, 300);
    l.covers = [0, 1].map(i => { const d = NUMS[i]; if (!d) return null;
      const big = (d.плюс || '').length <= 2, plus = big ? (d.плюс || '') : '';
      const cap = (big ? '' : String(d.плюс).trim() + ' ') + (d.подпись || '');
      const cw = l.coverW, str = num(d.число), nS = Math.min(84, sFit(str + plus, cw - 6, 84));
      const cs = Math.max(15, Math.min(19, capsFit(cap, cw, 19)));
      const cl = capsW(cap, cs) > cw ? wrapM(cap, cw, s2 => capsW(s2, cs)).slice(0, 2) : [cap];
      return { str, plus, nS, cs, cl }; });
    const by = l.cy + mix(M.cu, M.cd, .78) * s, bh = halfAt(M, l.cy, s, by - 90, by + 90);
    l.badge = TV[0] && TV[0].цена ? { r: 92, x: clamp(l.cx + bh * .95, 540 + 150, 960 - 96), y: Math.min(by, l.hookTop - 110) } : null;

    // разворот
    const head = ((S.заголовок && S.заголовок.length) ? S.заголовок : hook).map(U);
    l.headAcc = S.акцентСтрока ?? head.length - 1;
    l.head = block(head, 790, 112, 330, 400, l.headAcc, 1.06);
    l.headP = l.head.size * 1.06; l.headTop = 396;
    l.headBot = l.headTop + l.head.rows.length * l.headP;
    l.ph = { x: 120, y: l.headBot + 34, w: 840 };
    const phMax = clamp(1104 - l.ph.y, 280, 470), phMin = Math.min(phMax, 340);
    let colH = 1484 - (l.ph.y + phMax + 98); const colW = 392;
    const sub = String(S.подзаголовок || '').trim();
    const adv = (S.преимущества || []).filter(Boolean), steps = (S.шаги || []).filter(Boolean);
    const c1adv = steps.length ? adv : [], c2 = steps.length ? steps : adv, c2num = !!steps.length;
    const build = (bs, withAdv) => {
      const P = Math.round(bs * 1.36), items = [], c1a = withAdv ? c1adv : [];
      const letter = sub[0] || '', rest = sub.slice(1);
      const dcS = P * 2 + bs * .74, dcW = letter ? sW(letter, dcS, false, 400) + 14 : 0;
      let y1 = P * .8;
      if (letter) items.push({ k: 'dc', s: letter, X: 120, Y: y1 + P * 2, size: dcS });
      const body = wrapVar(rest, i => i < 3 ? colW - dcW : colW, s2 => sW(s2, bs, false, 400));
      body.forEach((r, i) => items.push({ k: 'b', s: r, X: 120 + (i < 3 ? dcW : 0), Y: y1 + i * P, size: bs, w: i < 3 ? colW - dcW : colW }));
      y1 += Math.max(letter ? 3 : 0, body.length) * P + (c1a.length ? P * .45 : 0);
      c1a.forEach(a => { wrapM('— ' + a, colW, s2 => sW(s2, bs, true, 400)).forEach(r => { items.push({ k: 'a', s: r, X: 120, Y: y1, size: bs }); y1 += P; }); });
      let y2 = P * .8; const ind = Math.round(bs * 1.7);
      c2.forEach((a, i) => {
        if (c2num) items.push({ k: 'n', s: String(i + 1).padStart(2, '0'), X: 562, Y: y2, size: bs });
        wrapM(c2num ? a : '— ' + a, colW - (c2num ? ind : 0), s2 => sW(s2, bs, !c2num, 400)).forEach(r => { items.push({ k: c2num ? 'b' : 'a', s: r, X: 562 + (c2num ? ind : 0), Y: y2, size: bs }); y2 += P; });
        y2 += P * .3;
      });
      const need = Math.max(y1 - P * .55, y2 - P * .85);
      return { items, bs, P, need, ok: need <= colH };
    };
    // кегль колонок 31–34: ради него фото разворота можно ужать до phMin; иначе как раньше —
    // ужимаем кегль до 25, потом убираем преимущества из колонки, потом режем хвост с «…»
    let cols = null, phH = phMax;
    big: for (let bs = 34; bs >= 31; bs--) { const c = build(bs, true), h = Math.min(phMax, 1484 - 98 - l.ph.y - c.need); if (h >= phMin) { cols = c; phH = h; colH = 1484 - (l.ph.y + h + 98); c.ok = true; break big; } }
    if (!cols) for (const withAdv of [true, false]) { for (let bs = 30; bs >= 25 && !(cols && cols.ok); bs--) cols = build(bs, withAdv); if (cols.ok) break; }
    if (!cols.ok) {
      const lim = colH - cols.P * .2; cols.items = cols.items.filter(it => it.k === 'dc' || it.Y <= lim);
      const lastB = cols.items.filter(it => it.k === 'b' && it.X < 540).pop();
      if (lastB) { let t2 = lastB.s.replace(/[\s,.:;—-]+$/, '') + '…'; while (t2.length > 2 && sW(t2, cols.bs, false, 400) > (lastB.w || colW)) t2 = t2.replace(/\s*\S+…$/, '…'); lastB.s = t2; }
    }
    l.cols = cols;
    l.ph.h = phH;
    l.phS = fitIn(M, l.ph.w, l.ph.h, .3, .39);
    l.capLine = l.ph.y + l.ph.h + 44;
    l.colTop = l.capLine + 54;
    // порядок появления: сверху вниз, колонки вперемешку
    l.cols.items.forEach(it => it.ord = it.Y + (it.X > 540 ? l.cols.P * .5 : 0));
    const ords = l.cols.items.map(it => it.ord).sort((a, b) => a - b);
    l.cols.items.forEach(it => it.rank = ords.indexOf(it.ord));

    // лукбук
    l.BH = 700; l.YC = 836; l.pw = 476; l.phh = 620;
    l.lkS = fitIn(M, l.pw, l.phh, .4, .42);
    l.looks = TV.map((tv, i) => {
      const left = i % 2 === 0, tw = 840 - l.pw - 46, tx = left ? 120 + l.pw + 46 : 120;
      const name = U(tv.имя || '');
      let ns = 84, rows = [name];
      for (ns = 84; ns >= 34; ns -= 2) { rows = wrapM(name, tw, s2 => sW(s2, ns, false, 400)); if (rows.length <= 3 && rows.every(r => sW(r, ns, false, 400) <= tw)) break; }
      ns = Math.min(ns, ...rows.map(r => sFit(r, tw, ns, false, 400)));
      const ps = Math.min(24, capsFit(tv.цена || '', tw, 24));
      const gh = 40 + 30 + rows.length * ns * 1.02 + 34 + 46;
      return { tv, left, tx, tw, ns, rows, ps, gh };
    });

    // цифры
    const nb = 1480, nn = Math.max(1, NUMS.length); l.nH = Math.min((nb - 372) / nn, 430);
    l.nTop = 372 + ((nb - 372) - l.nH * nn) * .4;   // мало цифр — блок ближе к центру, чуть выше середины
    l.nums = NUMS.map(d => {
      const str = num(d.число), big = (d.плюс || '').length <= 2, plus = big ? (d.плюс || '') : '';
      const cap = (big ? '' : String(d.плюс).trim() + ' ') + (d.подпись || '');
      let size = Math.min(270, l.nH * .56);
      const wAt = sz => sW(str, sz, false, 400) + (plus ? sW(plus, sz, true, 400) + sz * .05 : 0);
      if (wAt(size) > 840) size *= 840 / wAt(size);
      const capMax = 840 - 90; const cs = Math.max(15, Math.min(22, capsFit(cap, capMax, 22)));
      return { d, str, plus, cap, size, cs };
    });

    // задняя обложка
    l.bMastL = mastLay(660, 116); l.bMastS = l.bMastL.size;
    l.bMastBase = 316 + l.bMastS * .71 + (l.bMastL.rows.length - 1) * l.bMastL.pitch;
    const cta = ((S.призыв && S.призыв.length) ? S.призыв : [S.кнопка || S.бренд || '']).map(U);
    l.ctaAcc = cta.length > 1 ? cta.length - 1 : -1;
    l.cta = block(cta, 840, 168, 390, 400, l.ctaAcc, 1.02);
    l.ctaP = l.cta.size * 1.04;
    const ctaH = l.cta.rows.length * l.ctaP, top0 = l.bMastBase + 60, bot0 = 1040;
    l.ctaTop = (top0 + bot0) / 2 - ctaH / 2;
    l.btnTxt = String(S.кнопка || '').toUpperCase();
    l.btnS = Math.min(28, capsFit(l.btnTxt + '  →', 640, 28));
    l.btnW = capsW(l.btnTxt + '  →', l.btnS) + 112;
    l.domS = Math.min(58, sFit(S.домен || '', 780, 58, true, 400));
    // штрихкод: модули EAN-13 из хеша домена
    let seed = 7; for (const ch of String(S.домен || S.бренд || 'x')) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    l.bits = []; for (let i = 0; i < 95; i++) {
      const g = i < 3 || i > 91 || (i >= 45 && i <= 49);
      l.bits.push({ on: g ? (i < 3 ? i !== 1 : i > 91 ? i !== 93 : (i - 45) % 2 === 1) : hash(seed * .37 + i * 1.91) > .52, g });
    }
    l.digits = Array.from({ length: 13 }, (_, i) => Math.floor(hash(seed * .11 + i * 3.7) * 10)).join('');
    l.price = TV[0] && TV[0].цена ? String(TV[0].цена) : '';
    return l;
  }

  // ——— бумага, свет, глянец ———
  // свет на бумаге — под текстом (иначе он белит буквы), виньетка и корешок — поверх
  function paperFlat() { x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(280, 380, 0, 280, 380, 1500);
    g.addColorStop(0, DARK ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H); }
  function paperLight(gutter) {
    let g = x.createRadialGradient(540, 900, 500, 540, 960, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, DARK ? 'rgba(0,0,0,.38)' : 'rgba(80,60,40,.055)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // корешок: у правой страницы тень сгиба слева, у обложки — тонкий кант
    g = x.createLinearGradient(0, 0, gutter ? 110 : 26, 0);
    g.addColorStop(0, DARK ? 'rgba(0,0,0,.55)' : 'rgba(60,40,20,.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, gutter ? 110 : 26, H);
  }
  function gloss(p, a = 1) {
    if (p <= 0 || p >= 1) return;
    const c = mix(-700, W + 700, E.inOut(p)), al = (DARK ? .075 : .2) * a * Math.sin(p * Math.PI);
    x.save(); x.translate(c, 960); x.rotate(.42);
    const g = x.createLinearGradient(-300, 0, 300, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(-300, -1700, 600, 3400); x.restore();
  }
  // камера: медленный наезд и лёгкий дрейф (кадр не застывает)
  function cam(t, seed, z, fn) {
    x.save(); x.translate(540 + noise(seed, t * .35) * 4, 960 + noise(seed + 5, t * .3) * 5); x.scale(1 + z, 1 + z); x.translate(-540, -960);
    fn(); x.restore();
  }
  // фото: студийный фон (по палитре товара) + предмет
  function photo(R, pal, s, t, o = {}) {
    const a = o.alpha ?? 1; if (a <= 0 || R.w < 2 || R.h < 2) return;
    x.save(); x.globalAlpha *= a;
    x.beginPath(); x.rect(R.x, R.y, R.w, R.h * (o.reveal ?? 1)); x.clip();
    const tint = pal ? (pal.циферблат || pal.безель || pal.корпус) : null;
    const st = tint ? mixHex(STUDIO, tint, DARK ? .2 : .13) : STUDIO;
    let g = x.createLinearGradient(0, R.y, 0, R.y + R.h);
    g.addColorStop(0, mixHex(st, DARK ? '#000000' : '#ffffff', .1)); g.addColorStop(.64, st); g.addColorStop(1, mixHex(st, '#000000', DARK ? .3 : .1));
    x.fillStyle = g; x.fillRect(R.x, R.y, R.w, R.h);
    g = x.createRadialGradient(R.x + R.w * .45, R.y + R.h * .38, 0, R.x + R.w * .45, R.y + R.h * .38, Math.max(R.w, R.h) * .7);
    g.addColorStop(0, DARK ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(R.x, R.y, R.w, R.h);
    x.translate(R.x + R.w / 2 + (o.dx || 0), R.y + R.h / 2 + (o.dy || 0) - (L.M.cu + L.M.cd) / 2 * s);
    const z = o.zoom || 1; x.scale(z, z); x.rotate(o.rot || 0);
    shadow(46, DARK ? 'rgba(0,0,0,.6)' : 'rgba(60,40,20,.28)', 22);
    S.предмет(x, t, pal, s); noShadow();
    x.restore();
  }

  // модель обложки: фото с тенью по альфе; срезанный верх фото растворяется на буквах названия
  let OFF = null;
  function coverModel(t, lv) {
    const sc = 1 + .045 * lv, cy = L.cy + Math.sin(t * 1.1) * 5 - lv * 14, M = L.M, s = L.s * sc;
    const sh = () => shadow(DARK ? 70 : 60, DARK ? 'rgba(0,0,0,.7)' : 'rgba(70,50,30,.3)', DARK ? 30 : 26);
    if (!L.fadeTop) { x.save(); x.translate(L.cx, cy); x.scale(sc, sc); sh(); S.предмет(x, t + 2, HERO, L.s); x.restore(); noShadow(); return; }
    if (!OFF) { OFF = document.createElement('canvas'); OFF.width = W; OFF.height = H; }
    const o = OFF.getContext('2d');
    const bx = Math.max(0, Math.floor(L.cx - M.hw * s * 1.2 - 30)), bx1 = Math.min(W, Math.ceil(L.cx + M.hw * s * 1.2 + 30));
    const by = Math.max(0, Math.floor(cy + M.tu * s - 40)), by1 = Math.min(H, Math.ceil(cy + M.bd * s + 40));
    if (bx1 <= bx || by1 <= by) return;
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(bx, by, bx1 - bx, by1 - by);
    o.save(); o.translate(L.cx, cy); o.scale(sc, sc); S.предмет(o, t + 2, HERO, L.s); o.restore();
    const y0 = cy + M.tu * s, g = o.createLinearGradient(0, y0, 0, y0 + L.fadeLen);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.35, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    o.globalCompositeOperation = 'destination-out'; o.fillStyle = g; o.fillRect(bx, by, bx1 - bx, y0 + L.fadeLen - by); o.globalCompositeOperation = 'source-over';
    x.save(); sh(); x.drawImage(OFF, bx, by, bx1 - bx, by1 - by, bx, by, bx1 - bx, by1 - by); x.restore(); noShadow();
  }

  // ——— страница 1: обложка ———
  function pageCover(t) {
    paperFlat();
    const lv = 1 - E.out(prog(t, 0, 1.8));              // осадка обложки (кадр 0 уже готов)
    cam(t, 1, .006 + .028 * E.inOut(prog(t, 0, 3.2)), () => {
      // верхняя строка
      ST(ISSUE, 120, 290, { size: 34, it: true, color: ACCT });
      caps(S.домен || '', 960, 287, { size: 19, align: 'right' });
      hl(120, 312, 960, 312, RULE, 2);
      // название журнала = бренд
      x.save(); x.translate(0, lv * 8);
      const ML = L.mastL; ML.rows.forEach((r, i) => ST(r, 540, L.mastBase - (ML.rows.length - 1 - i) * ML.pitch, { size: L.mastS, w: 700, align: 'center', color: INK, track: lv * L.mastS * .012 }));
      x.restore();
      // модель обложки: предмет перекрывает название
      coverModel(t, lv);
      // низ предмета уходит в бумагу, как на вырезанной фотографии
      const f0 = L.fade0, f1 = L.fade1;
      if (f1 > f0) { const g = x.createLinearGradient(0, f0, 0, f1); g.addColorStop(0, rgba(PAPER, 0)); g.addColorStop(1, rgba(PAPER, 1)); x.fillStyle = g; x.fillRect(-40, f0, W + 80, f1 - f0); box(-40, f1, W + 80, H - f1 + 40, PAPER); }
      // анонсы по бокам
      L.covers.forEach((cv, i) => {
        if (!cv) return; const left = i === 0, X = left ? 120 : 960, al = left ? 'left' : 'right';
        const yy = L.capY - lv * 6 * (i + 1);
        box(left ? 120 : 960 - 32, yy - 30, 32, 4, ACC);
        cv.cl.forEach((r, j) => caps(r, X, yy + j * cv.cs * 1.3, { size: cv.cs, align: al }));
        const nb = yy + (cv.cl.length - 1) * cv.cs * 1.3 + 16 + cv.nS * .72;
        const wN = sW(cv.str, cv.nS, false, 400), wP = cv.plus ? sW(cv.plus, cv.nS, true, 400) + 4 : 0;
        const x0 = left ? 120 : 960 - wN - wP;
        ST(cv.str, x0, nb, { size: cv.nS });
        if (cv.plus) ST(cv.plus, x0 + wN + 4, nb, { size: cv.nS, it: true, color: ACCT });
      });
      // стикер с ценой
      if (L.badge) {
        const B = L.badge, tv = TV[0]; x.save(); x.translate(B.x, B.y); x.rotate(-.2 + lv * .35 + Math.sin(t * .9) * .025);
        shadow(26, 'rgba(0,0,0,.28)', 8); x.beginPath(); x.arc(0, 0, B.r, 0, 7); x.fillStyle = ACC; x.fill(); noShadow();
        x.beginPath(); x.arc(0, 0, B.r - 10, 0, 7); x.strokeStyle = rgba(ON, .45); x.lineWidth = 1.5; x.stroke();
        const ps = Math.min(44, sFit(tv.цена, B.r * 1.5, 44, true, 400));
        ST(tv.цена, 0, 16, { size: ps, it: true, align: 'center', color: ON });
        const nm = String(tv.имя || ''), ns = Math.min(15, capsFit(nm, B.r * 1.3, 15, 700));
        caps(nm, 0, -ps * .62, { size: ns, align: 'center', color: ON, w: 700 });
        x.restore();
      }
      // хук — главный анонс обложки
      const Hk = L.hook;
      Hk.rows.forEach((r, i) => {
        const isA = Hk.src[i] === L.hookAcc, base = L.hookTop + (i + 1) * L.hookP - Hk.size * .24;
        const tr = lv * Hk.size * .02;
        ST(r, 540, base, { size: Hk.size, it: isA, align: 'center', track: tr });
        if (isA) { const w = sW(r, Hk.size, true, 400, tr); hl(540 - w / 2, base + Hk.size * .13, 540 + w / 2, base + Hk.size * .13, ACC, Math.max(4, Hk.size * .065)); }
      });
    });
    paperLight(false);
    gloss(prog(t, .3, 1.9));
  }

  // ——— страница 2–3: разворот и лукбук (одна бумага, фото перетекает) ———
  function lookPanel(i, yc) { const lk = L.looks[i]; return { x: lk && !lk.left ? 960 - L.pw : 120, y: yc - L.phh / 2, w: L.pw, h: L.phh }; }
  function scrollAt(t) { let s = 0; for (let i = 1; i < TV.length; i++) s += soft(prog(t, arrive(i) - MD, arrive(i))); return s * L.BH; }
  function folio(t, pg, dy = 0, a = 1) {
    caps(S.домен || '', 120, 287 + dy, { size: 19, alpha: a });
    ST(pg, 960, 292 + dy, { size: 32, it: true, align: 'right', color: GREY, alpha: a });
    hl(120, 312 + dy, 960, 312 + dy, RULE, 2, a);
  }
  function drawSpread(t, k) {
    const a = 1 - E.out(clamp(k * 2.6)), dy = -170 * E.out(clamp(k * 1.4));
    if (a > 0) {
      x.save(); x.translate(0, dy); x.globalAlpha *= a;
      folio(t, '02');
      // рубрика
      const kq = E.out(prog(t, 2.75, 3.4));
      box(120, 352, 44 * kq, 5, ACC);
      caps(S.бренд || '', 182, 361, { size: 19, color: ACCT, alpha: kq });
      // заголовок: строки выезжают из-под маски, акцентная — курсивом на плашке
      const Hd = L.head;
      Hd.rows.forEach((r, i) => {
        const isA = Hd.src[i] === L.headAcc, base = L.headTop + (i + 1) * L.headP - Hd.size * .22;
        const q = E.expo(prog(t, 2.8 + i * .1, 3.7 + i * .1));
        x.save(); x.beginPath(); x.rect(80, base - Hd.size * 1.02, 920, Hd.size * 1.3); x.clip();
        x.translate(0, (1 - q) * Hd.size * 1.1);
        const pad = Hd.size * .16, X0 = 120 + (isA ? pad : 0);
        ST(r, X0, base, { size: Hd.size, it: isA });
        if (isA) {
          const wq = E.expo(prog(t, 3.3 + i * .06, 4.1 + i * .06)), pw = (sW(r, Hd.size, true, 400) + pad * 2.2) * wq;
          if (pw > 1) { x.save(); x.beginPath(); x.rect(120, base - Hd.size * .84, pw, Hd.size * 1.06); x.clip();
            box(120, base - Hd.size * .84, pw, Hd.size * 1.06, ACC); ST(r, X0, base, { size: Hd.size, it: true, color: ON }); x.restore(); }
        }
        x.restore();
      });
      // подпись к фото
      const cq = E.out(prog(t, 3.6, 4.2)), tv = TV[0];
      if (tv) {
        const yy = L.capLine + (1 - cq) * 10;
        const wi = caps(ISSUE, 120, yy, { size: 18, color: ACCT, alpha: cq });
        const ns = Math.min(30, sFit(tv.имя || '', 520, 30, true, 400));
        ST(tv.имя || '', 120 + wi + 18, yy + 1, { size: ns, it: true, alpha: cq });
        caps(tv.цена || '', 960, yy, { size: 18, align: 'right', alpha: cq });
      }
      hl(120, L.capLine + 24, 120 + 840 * E.out(prog(t, 3.55, 4.3)), L.capLine + 24, RULE, 1.5);
      // колонки: буквица, текст, шаги
      const Cl = L.cols, y0 = L.colTop;
      hl(541, y0 - 10, 541, y0 - 10 + (1484 - y0) * E.out(prog(t, 3.7, 4.7)), RULE, 1.5);
      Cl.items.forEach(it => {
        const q = E.out(prog(t, 3.72 + it.rank * .045, 4.22 + it.rank * .045)); if (q <= 0) return;
        const yy = y0 + it.Y + (1 - q) * 14;
        if (it.k === 'dc') { const dq = E.expo(prog(t, 3.65, 4.4)); ST(it.s, it.X, y0 + it.Y, { size: it.size, color: ACCT, alpha: dq }); return; }
        ST(it.s, it.X, yy, { size: it.size, it: it.k === 'a' || it.k === 'n', color: it.k === 'n' ? ACCT : INK, alpha: q });
      });
      x.restore();
    }
    // фото: на развороте → растёт и садится в первую полосу лукбука
    const R0 = L.ph, R1 = TV.length ? lookPanel(0, L.YC) : L.ph, q = k;
    const R = lerpR(R0, R1, q), rev = E.expo(prog(t, 3.0, 3.9));
    if (rev > 0) {
      const R2 = { x: R.x, y: R.y + dy * (1 - q) * 0, w: R.w, h: R.h };
      photo(R2, HERO, mix(L.phS, L.lkS, q), t, { reveal: rev, zoom: mix(1.14, 1, E.out(prog(t, 3.0, 4.8))) * (1 + .06 * Math.sin(q * Math.PI)), dy: Math.sin(t * 1.2) * 4 });
    }
  }
  function drawLook(t, k) {
    const ka = E.out(prog(k, .45, 1)), sc = scrollAt(t);
    folio(t, '03', -sc, ka);
    TV.forEach((tv, i) => {
      const lk = L.looks[i], yc = L.YC + i * L.BH - sc;
      if (yc < -520 || yc > H + 520) return;
      const R = lookPanel(i, yc);
      if (i > 0 || k >= 1) photo(R, tv.палитра, L.lkS, t + i * 1.7, { alpha: i === 0 ? 1 : ka, dy: (yc - L.YC) * -.18 + Math.sin(t * 1.2 + i) * 4 });
      // текстовая часть полосы
      const ar = arrive(i), q = prog(t, ar - .32, ar + .55); if (q <= 0) return;
      const al = i === 0 ? ka : 1, top = yc - lk.gh / 2, X = lk.tx;
      const qi = E.out(prog(q, 0, .6));
      ST('№ ' + String(i + 1).padStart(2, '0'), X, top + 34, { size: 38, it: true, color: ACCT, alpha: qi * al });
      lk.rows.forEach((r, j) => {
        const base = top + 70 + (j + 1) * lk.ns * 1.02 - lk.ns * .2, qq = E.expo(prog(q, .08 + j * .1, .75 + j * .1));
        x.save(); x.beginPath(); x.rect(X - 10, base - lk.ns * 1.05, lk.tw + 40, lk.ns * 1.32); x.clip();
        ST(r, X, base + (1 - qq) * lk.ns * 1.1, { size: lk.ns, alpha: al }); x.restore();
      });
      const yl = top + 70 + lk.rows.length * lk.ns * 1.02 + 30;
      hl(X, yl, X + lk.tw * E.out(prog(q, .3, 1)), yl, INK, 2, al);
      caps(tv.цена || '', X, yl + 46, { size: lk.ps, color: INK, w: 600, alpha: E.out(prog(q, .45, 1)) * al });
    });
  }
  function pageSL(t) {
    paperFlat();
    const k = TV.length ? soft(prog(t, M0, M1)) : 0;
    cam(t, 2, .004 + .022 * E.inOut(prog(t, 2.3, 9.6)), () => {
      if (k < 1) drawSpread(t, k);
      if (k > 0) drawLook(t, k);
    });
    paperLight(true);
  }

  // ——— страница 4: инфографика ———
  function pageNum(t) {
    paperFlat();
    cam(t, 4, .004 + .02 * E.inOut(prog(t, 9.2, 12.4)), () => {
      folio(t, '04');
      L.nums.forEach((n, i) => {
        const top = L.nTop + i * L.nH, t0 = 9.72 + i * .17;
        const lq = E.out(prog(t, t0 - .1, t0 + .7));
        hl(120, top, 120 + 840 * lq, top, INK, 2);
        const iq = E.out(prog(t, t0, t0 + .5));
        ST(String(i + 1).padStart(2, '0'), 120, top + 46 + (1 - iq) * 10, { size: 32, it: true, color: ACCT, alpha: iq });
        caps(n.cap, 960, top + 44 + (1 - iq) * 10, { size: n.cs, align: 'right', alpha: iq });
        // число считается и оседает
        const cq = E.out(prog(t, t0 + .05, t0 + 1.35)), sq = E.expo(prog(t, t0, t0 + .9));
        const str = num(n.d.число * cq), base = top + 74 + n.size * .72;
        x.save(); x.beginPath(); x.rect(100, top + 8, 900, n.size * 1.05 + 70); x.clip();
        const yy = base + (1 - sq) * n.size * .5;
        const wN = ST(str, 120, yy, { size: n.size, alpha: sq });
        if (n.plus) ST(n.plus, 120 + wN + n.size * .05, yy, { size: n.size, it: true, color: ACCT, alpha: E.out(prog(t, t0 + 1.1, t0 + 1.5)) });
        x.restore();
        // шкала-линейка под числом: деления + акцентная полоса бежит вместе со счётом
        const ry = base + 34;
        if (ry < top + L.nH - 10) {
          x.save(); x.globalAlpha *= lq; x.strokeStyle = RULE; x.lineWidth = 1.5; x.beginPath();
          for (let j = 0; j <= 40; j++) { const X = 120 + j * 21; if (X > 120 + 840 * lq) break; const hh = j % 10 === 0 ? 16 : j % 5 === 0 ? 11 : 6; x.moveTo(X, ry); x.lineTo(X, ry - hh); }
          x.stroke(); x.restore();
          box(120, ry - 2, 840 * cq, 5, ACC);
        }
      });
    });
    paperLight(true);
  }

  // ——— страница 5: задняя обложка ———
  function barcode(X, Y, w, h, p) {
    const m = w / 95;
    x.save(); x.beginPath(); x.rect(X - 4, Y - 4, (w + 8) * p, h + 60); x.clip();
    x.fillStyle = INK;
    for (let i = 0; i < 95;) { if (!L.bits[i].on) { i++; continue; } let j = i; while (j < 95 && L.bits[j].on && L.bits[j].g === L.bits[i].g) j++;
      x.fillRect(X + i * m, Y, (j - i) * m - .4, h + (L.bits[i].g ? 16 : 0)); i = j; }
    // цифры под штрихами
    const ds = 20, d = L.digits;
    T(d[0], X - 14, Y + h + 30, { size: ds, weight: 500, color: INK, align: 'center', base: 'alphabetic' });
    T(d.slice(1, 7), X + w * .27, Y + h + 30, { size: ds, weight: 500, color: INK, align: 'center', track: 6, base: 'alphabetic' });
    T(d.slice(7), X + w * .73, Y + h + 30, { size: ds, weight: 500, color: INK, align: 'center', track: 6, base: 'alphabetic' });
    x.restore();
    if (p > 0 && p < 1) hl(X + w * p, Y - 10, X + w * p, Y + h + 20, ACC, 4);
  }
  function pageBack(t) {
    paperFlat();
    cam(t, 6, .004 + .016 * E.out(prog(t, F0, 15)), () => {
      // шапка
      const BM = L.bMastL; BM.rows.forEach((r, i) => ST(r, 540, L.bMastBase - (BM.rows.length - 1 - i) * BM.pitch, { size: L.bMastS, w: 700, align: 'center' }));
      hl(120, L.bMastBase + 40, 960, L.bMastBase + 40, RULE, 2);
      // призыв
      const Ct = L.cta;
      Ct.rows.forEach((r, i) => {
        const isA = Ct.src[i] === L.ctaAcc, base = L.ctaTop + (i + 1) * L.ctaP - Ct.size * .24;
        const q = E.expo(prog(t, 12 + i * .1, 12.85 + i * .1));
        x.save(); x.beginPath(); x.rect(60, base - Ct.size * 1.02, 960, Ct.size * 1.32); x.clip();
        ST(r, 540, base + (1 - q) * Ct.size * 1.1, { size: Ct.size, it: isA, align: 'center' }); x.restore();
        if (isA) { const w = sW(r, Ct.size, true, 400), uq = E.expo(prog(t, 12.55, 13.3)); hl(540 - w / 2, base + Ct.size * .14, 540 - w / 2 + w * uq, base + Ct.size * .14, ACC, Math.max(5, Ct.size * .06)); }
      });
      // кнопка — акцентная плашка
      if (L.btnTxt) {
        const bq = E.expo(prog(t, 12.4, 13.1)), bw = L.btnW, by = 1112;
        x.save(); x.beginPath(); x.rect(540 - bw / 2 * bq, by - 46, bw * bq, 92); x.clip();
        box(540 - bw / 2, by - 46, bw, 92, ACC);
        caps(L.btnTxt + '  →', 540, by + L.btnS * .36, { size: L.btnS, color: ON, align: 'center', w: 700 });
        x.restore();
      }
      // домен
      const dq = E.out(prog(t, 12.65, 13.3));
      ST(S.домен || '', 540, 1240 + (1 - dq) * 14, { size: L.domS, it: true, align: 'center', alpha: dq });
      hl(120, 1292, 120 + 840 * E.out(prog(t, 12.5, 13.4)), 1292, RULE, 2);
      // угол задней обложки: номер выпуска, цена, штрихкод
      const nq = E.out(prog(t, 12.7, 13.3));
      ST(ISSUE, 120, 1392, { size: 66, alpha: nq });
      if (L.price) caps(L.price, 122, 1440, { size: 22, color: INK, alpha: nq });
      barcode(612, 1322, 348, 108, E.inOut(prog(t, 12.75, 13.4)));
    });
    paperLight(false);
    gloss(prog(t, 13.1, 14.7));
  }

  // ——— page curl: правый край страницы загибается и уходит влево ———
  function curl(p, under, over) {
    const e = E.inOut(p);
    const tilt = 40 + 240 * Math.sin(Math.PI * Math.min(1, p * 1.05));
    const u = mix(W + tilt + 20, -tilt - 80, e);
    const ft = u + tilt, fb = u - tilt;                 // линия сгиба у верхнего и нижнего края
    const fx = y => ft + (fb - ft) * (y / H);
    const dx = fb - ft, len = Math.hypot(dx, H), dX = dx / len, dY = H / len;
    const nX = -dY, nY = dX;                             // нормаль влево от сгиба
    under();
    // тень на новой странице у сгиба
    x.save(); x.beginPath(); x.moveTo(fx(-80), -80); x.lineTo(W + 80, -80); x.lineTo(W + 80, H + 80); x.lineTo(fx(H + 80), H + 80); x.closePath(); x.clip();
    const mx = (ft + fb) / 2, my = H / 2;
    let g = x.createLinearGradient(mx, my, mx - nX * 150, my - nY * 150);
    g.addColorStop(0, `rgba(0,0,0,${(DARK ? .6 : .3) * Math.min(1, (1 - p) * 5, p * 8)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(-100, -100, W + 200, H + 200); x.restore();
    // старая страница — слева от сгиба
    x.save(); x.beginPath(); x.moveTo(-80, -80); x.lineTo(fx(-80), -80); x.lineTo(fx(H + 80), H + 80); x.lineTo(-80, H + 80); x.closePath(); x.clip();
    over(); x.restore();
    // клапан: часть страницы справа от сгиба, отражённая и сжатая (изгиб)
    const k = mix(.5, .8, e);
    const side = (X, Y) => (X - ft) * nX + (Y - 0) * nY;     // >0 — слева от сгиба
    let poly = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
    for (let i = 0; i < 4; i++) { const A = poly[i], B = poly[(i + 1) % 4], sa = side(...A), sb = side(...B);
      if (sa <= 0) out.push(A); if ((sa < 0) !== (sb < 0)) { const r = sa / (sa - sb); out.push([mix(A[0], B[0], r), mix(A[1], B[1], r)]); } }
    if (out.length < 3) return;
    const fl = out.map(([X, Y]) => { const d = side(X, Y); return [X - nX * d * (1 + k), Y - nY * d * (1 + k)]; });
    const path = () => { x.beginPath(); fl.forEach(([X, Y], i) => i ? x.lineTo(X, Y) : x.moveTo(X, Y)); x.closePath(); };
    let maxD = 1; out.forEach(([X, Y]) => { maxD = Math.max(maxD, -side(X, Y) * k); });
    x.save(); shadow(46, `rgba(0,0,0,${DARK ? .7 : .32})`, 0); x.shadowOffsetX = -14; path(); x.fillStyle = PAPER; x.fill(); x.restore(); noShadow();
    g = x.createLinearGradient(mx, my, mx + nX * maxD, my + nY * maxD);
    const back = DARK ? mixHex(PAPER, '#ffffff', .06) : mixHex(PAPER, '#ffffff', .25);
    g.addColorStop(0, mixHex(back, '#000000', DARK ? .45 : .2));
    g.addColorStop(.12, mixHex(back, '#ffffff', DARK ? .1 : .5));
    g.addColorStop(.45, back);
    g.addColorStop(1, mixHex(back, '#000000', DARK ? .3 : .12));
    path(); x.fillStyle = g; x.fill();
    path(); x.strokeStyle = DARK ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; x.lineWidth = 1.5; x.stroke();
  }

  // ——— журнал отъезжает и переворачивается ———
  function magazine(t) {
    x.fillStyle = TABLE; x.fillRect(0, 0, W, H);
    // после переворота журнал не замирает: медленно доворачивается (лёгкий наклон в перспективе), подъезжает, свет плывёт по столу
    const life = E.inOut(prog(t, F1 - .25, F1 + .9)), lt = Math.max(0, t - F1);
    const yaw = life * .2 * Math.sin(lt * 1.05 + .25), roll = life * (-.022 + .03 * Math.sin(lt * .8 + 1.1));
    const lx = 540 + 260 * Math.sin(lt * .7 - .6) * life;
    let g = x.createRadialGradient(lx, 760, 100, 540, 960, 1300);
    g.addColorStop(0, DARK ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const zo = E.inOut(prog(t, Z0, Z1));
    const m = mix(1, .865, zo) + .02 * E.out(prog(t, F1, 15)) + .03 * life * prog(t, F1, 15);
    const th = Math.PI * soft(prog(t, F0, F1)), cth = Math.cos(th), sn = Math.sin(th);
    const front = cth >= 0, sx = Math.max(.003, Math.abs(cth)) * Math.cos(yaw), cy = 960 - 22 * zo;
    const sk = (front ? -1 : 1) * .06 * sn + .09 * Math.sin(yaw), sy = 1 + .05 * sn + .025 * Math.abs(Math.sin(yaw));
    const tf = () => { x.translate(540, cy); x.rotate(roll); x.scale(m, m); x.transform(sx, sk, 0, sy, 0, 0); x.translate(-540, -960); };
    // тень журнала на столе
    x.save(); tf(); shadow(90 * zo + 10, `rgba(0,0,0,${DARK ? .8 : .45})`, 36 * zo); x.fillStyle = PAPER; x.fillRect(0, 0, W, H); x.restore(); noShadow();
    x.save(); tf(); x.beginPath(); x.rect(0, 0, W, H); x.clip();
    if (front) pageNum(t); else pageBack(t);
    if (life > 0) {
      // блик по мелованной бумаге идёт за поворотом
      const c = 540 + 900 * Math.sin(lt * 1.05 + .25 - .9), al = (DARK ? .06 : .16) * life;
      g = x.createLinearGradient(c - 420, 0, c + 420, 260);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      g = x.createLinearGradient(0, 0, W, 0); const sd = .22 * Math.abs(Math.sin(yaw)) * 4;
      g.addColorStop(0, `rgba(0,0,0,${yaw > 0 ? sd * .3 : sd})`); g.addColorStop(1, `rgba(0,0,0,${yaw > 0 ? sd : sd * .3})`);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    if (sn > .001) {
      g = x.createLinearGradient(0, 0, W, 0);
      const dk = .5 * sn;
      g.addColorStop(0, `rgba(0,0,0,${front ? dk * .3 : dk})`); g.addColorStop(1, `rgba(0,0,0,${front ? dk : dk * .3})`);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    x.restore();
    // кант страницы (видно край бумаги)
    x.save(); tf(); x.strokeStyle = DARK ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'; x.lineWidth = 2 / Math.max(.2, m * sx); x.strokeRect(0, 0, W, H); x.restore();
  }

  window.КАДР = t => {
    if (!L) L = layout();
    if (t < C1[0]) pageCover(t);
    else if (t < C1[1]) curl(prog(t, C1[0], C1[1]), () => pageSL(t), () => pageCover(t));
    else if (t < C2[0]) pageSL(t);
    else if (t < C2[1]) curl(prog(t, C2[0], C2[1]), () => pageNum(t), () => pageSL(t));
    else if (t < Z0) pageNum(t);
    else magazine(t);
  };
})();

  },
  shveyc() {
// ШВЕЙЦАРСКИЙ ПЛАКАТ: International Typographic Style (Мюллер-Брокманн, Experimental Jetset).
// Модульная сетка 6×10 ровно по безопасной зоне (модуль 140×124), гротеск флагом влево, огромные цифры,
// геометрия (круг, полосы, линейки), палитра фон + текст + один яркий акцент.
// Движение механическое: шаги на целые модули, маски-полосы, вращение круга. Без пружин, без размытий.
// Все тексты, цвета и цифры берутся из САЙТ.
window.ИМЯ = 'shveyc';
DUR = 16;
FONT = САЙТ.шрифт || FONT;
(() => {
  const C = САЙТ.цвета, U = s => САЙТ.капс === false ? String(s ?? '') : String(s ?? '').toUpperCase();

  // ——— цвет: контраст, насыщенность, акцент ———
  const lin = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const lum = h => { const [r, g, b] = hex2rgb(h).map(lin); return .2126 * r + .7152 * g + .0722 * b; };
  const con = (a, b) => { const A = lum(a), Q = lum(b); return (Math.max(A, Q) + .05) / (Math.min(A, Q) + .05); };
  const sat = h => { const [r, g, b] = hex2rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
  const BG = C.фон, INK = C.текст, LIGHT = lum(BG) > .4;
  const vivid = sat(C.акцент) >= .45 && con(C.акцент, BG) >= 1.5;
  const ACC = vivid ? C.акцент : '#E30613';            // яркий акцент: бренд или классический швейцарский красный
  const pick = (bg, list) => list.reduce((a, b) => con(bg, b) > con(bg, a) ? b : a);
  const ON = [INK, BG].find(c => con(ACC, c) >= 4.5) || pick(ACC, [INK, BG, '#000000', '#ffffff']); // текст на акценте
  const HI = con(ACC, BG) >= 2.2 ? ACC : INK;           // акцентный текст на фоне
  const MARK = con(C.акцент, BG) >= 1.8 ? C.акцент : ACC; // мелкие метки бренда

  // ——— сетка: 6 колонок × 10 рядов ровно по безопасной зоне ———
  const MX = 140, MY = 124, GX = i => 120 + i * MX, GY = j => 260 + j * MY;

  // ——— текст ———
  const MC = new Map();
  function met(s, F, wt = 700, tr = -.03) {
    const k = s + '|' + F.toFixed(1) + '|' + wt + '|' + tr; let m = MC.get(k);
    if (!m) { x.save(); x.font = `${wt} ${F}px ${FONT}`; x.letterSpacing = (tr * F) + 'px'; const q = x.measureText(s); m = { w: q.width - tr * F, a: q.actualBoundingBoxAscent, d: q.actualBoundingBoxDescent }; x.restore(); MC.set(k, m); }
    return m;
  }
  const capH = (F, wt = 700) => met('H', F, wt).a;
  const tw = (s, F, wt = 700, tr = -.03) => met(s, F, wt, tr).w;
  const fitF = (s, maxW, cap, wt = 700, tr = -.03) => Math.min(cap, maxW / Math.max(1, tw(s, 100, wt, tr)) * 100);
  function TX(s, X, base, F, o = {}) {
    const a = o.alpha ?? 1; if (a <= 0 || !s) return;
    const wt = o.wt || 700, tr = (o.tr ?? -.03) * F;
    x.save(); x.globalAlpha *= a; x.font = `${wt} ${F}px ${FONT}`; x.letterSpacing = tr + 'px';
    x.textBaseline = 'alphabetic'; x.textAlign = o.align || 'left'; x.fillStyle = o.color || INK;
    x.fillText(s, o.align === 'right' ? X - tr : X, base); x.restore();
  }
  // перенос по словам в колонку
  function wrap(s, maxW, F, wt = 500, tr = 0, maxL = 9) {
    const ws = String(s).split(/\s+/).filter(Boolean), out = []; let cur = '';
    for (const w of ws) { const c = cur ? cur + ' ' + w : w; if (cur && tw(c, F, wt, tr) > maxW) { out.push(cur); cur = w; } else cur = c; }
    if (cur) out.push(cur);
    return out.slice(0, maxL);
  }
  // крупный набор: строки флагом влево, длинные бьются надвое, базовые линии на полумодулях
  function bigSet(src, top, bottom, maxW, cap, spread = false) {
    const S = src.map(U), H2 = MY / 2;
    const fitB = (s, mw, c) => { if (mw <= 840) return fitF(s, mw, c); const F0 = fitF(s, mw, c); return fitF(s, 960 + clamp(F0 * .13, 0, mw - 960), c); };
    // для каждой строки: целиком или надвое (лучший разрез)
    // каждую строку можно разбить на 1…5 частей: лучший разрез — с самым крупным наименьшим кеглем (динамика)
    const core = w => w.replace(/[^\p{L}\p{N}]/gu, ''), allShort = a => a.every(w => core(w).length <= 2);
    function cuts(ws) {
      const N = ws.length, memo = new Map();
      const best = (i, n) => {
        const key = i + ',' + n; if (memo.has(key)) return memo.get(key);
        let r = null;
        if (n === 1) { const s = ws.slice(i).join(' '), F = fitB(s, maxW, cap); r = { m: F * (allShort(ws.slice(i)) ? .55 : 1), ls: [{ s, F }] }; }
        else for (let j = i + 1; j <= N - n + 1; j++) {
          // строка не должна кончаться коротким словом-«висяком» (и, в, не, а…)
          const a = ws.slice(i, j).join(' '), Fa = fitB(a, maxW, cap), rest = best(j, n - 1), hang = allShort(ws.slice(i, j)) ? .55 : core(ws[j - 1]).length <= 2 ? .8 : 1, m = Math.min(Fa * hang, rest.m);
          if (!r || m > r.m) r = { m, ls: [{ s: a, F: Fa }, ...rest.ls] };
        }
        memo.set(key, r); return r;
      };
      const o = []; for (let n = 1; n <= Math.min(5, N); n++) o.push(best(0, n).ls); return o;
    }
    const opts = S.map(s => cuts(s.split(' ')));
    const place = (lines, k) => {
      let y = top; return lines.map((l, i) => {
        const F = l.F * k, ch = capH(F), gap = i ? Math.max(H2 * .3, F * .2) : 0;
        const base = Math.ceil((y + gap + ch - 260) / H2) * H2 + 260;
        y = base + F * .04; return { s: l.s, F, base, ch };
      });
    };
    const fitPlace = lines => {
      let r = place(lines, 1); if (r[r.length - 1].base <= bottom) return r;
      let lo = .15, hi = 1;
      for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (place(lines, m).at(-1).base <= bottom) lo = m; else hi = m; }
      return place(lines, lo);
    };
    let best = null, bs = -1, strict = true;
    const NC = Math.pow(5, S.length);
    for (let m = 0; m < NC; m++) {
      const lines = []; let ok = true;
      S.forEach((s, i) => { const k = Math.floor(m / Math.pow(5, i)) % 5; if (k >= opts[i].length) ok = false; else lines.push(...opts[i][k]); });
      if (!ok || lines.length > 6 || (strict && lines.some(l => l.F < 40))) continue;
      { const mn = Math.min(...lines.map(l => l.F)); lines.forEach((l, i) => { if (l.F > mn * 2.2) lines[i] = { ...l, F: mn * 2.2 }; }); }
      const r = fitPlace(lines), sc = r.reduce((a, l) => a + tw(l.s, l.F) * l.ch, 0) * (1 - .02 * r.length);
      if (sc > bs) { bs = sc; best = r; }
      if (m === NC - 1 && !best && strict) { strict = false; m = -1; }
    }
    // остаток высоты раздаём между строками целыми полумодулями (не больше модуля на зазор)
    if (spread && best.length > 1) {
      const left = bottom - best.at(-1).base, per = Math.min(MY, Math.floor(left / (best.length - 1) / H2) * H2);
      if (per > 0) best.forEach((l, i) => l.base += per * i);
    }
    return best;
  }

  // ——— движение ———
  const steps = (p, n) => { p = clamp(p); if (p >= 1) return 1; const q = p * n, i = Math.floor(q); return (i + E.inOut(q - i)) / n; };
  const io = (t, a, b) => E.inOut(prog(t, a, b));
  const ex = (t, a, b) => E.expo(prog(t, a, b));

  // ——— геометрия ———
  function rect(X, Y, w, h, col, a = 1) { x.save(); x.globalAlpha *= a; x.fillStyle = col; x.fillRect(X, Y, w, h); x.restore(); }
  function hline(X0, X1, Y, lw, col, a = 1) { if (X1 <= X0) return; rect(X0, Y - lw / 2, X1 - X0, lw, col, a); }
  // текст по окружности: str повторяется ровно по длине окружности
  const CW = new Map();
  const cw = (ch, F) => { const k = ch + F; let w = CW.get(k); if (w == null) { x.save(); x.font = `700 ${F}px ${FONT}`; x.letterSpacing = '0px'; w = x.measureText(ch).width; x.restore(); CW.set(k, w); } return w; };
  function ring(cx, cy, R, str, F, rot, col, alpha = 1, reveal = 1) {
    if (!str || alpha <= 0 || reveal <= 0) return;
    const ch = [...str], trk = F * .14, ws = ch.map(c => cw(c, F) + trk), unit = ws.reduce((a, b) => a + b, 0);
    const circ = Math.PI * 2 * R, n = Math.max(1, Math.round(circ / unit)), extra = (circ - n * unit) / (n * ch.length);
    x.save(); x.globalAlpha *= alpha; x.font = `700 ${F}px ${FONT}`; x.letterSpacing = '0px'; x.fillStyle = col;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.translate(cx, cy);
    let a = 0; const lim = reveal * Math.PI * 2;
    for (let k = 0; k < n; k++) for (let i = 0; i < ch.length; i++) {
      const w = ws[i] + extra, m = a + w / 2 / R; a += w / R;
      if (m > lim) break;
      if (ch[i] === ' ') continue;
      x.save(); x.rotate(rot + m); x.fillText(ch[i], 0, -R); x.restore();
    }
    x.restore();
  }
  function item(cx, cy, s, t, pal) { x.save(); x.translate(cx, cy); САЙТ.предмет(x, t, pal, s); x.restore(); noShadow(); }

  // ——— данные ———
  const hookSrc = САЙТ.хук && САЙТ.хук.length ? САЙТ.хук : (САЙТ.заголовок || [САЙТ.бренд]);
  const titles = (САЙТ.заголовок && САЙТ.заголовок.length ? САЙТ.заголовок : [САЙТ.бренд]).map(U);
  const accIdx = Number.isInteger(САЙТ.акцентСтрока) ? САЙТ.акцентСтрока : titles.length - 1;
  const goods = (САЙТ.товары || []).slice(0, 6), NG = goods.length;
  const stats = (САЙТ.цифры || []).slice(0, 3), NS = stats.length;
  const cta = САЙТ.призыв && САЙТ.призыв.length ? САЙТ.призыв : [САЙТ.кнопка || САЙТ.бренд];
  const brand = U(САЙТ.бренд || ''), dom = САЙТ.домен || '';
  const ringBase = [brand, dom, U(САЙТ.кнопка || '')].filter(Boolean).join('  ·  ') + '  ·  ';
  const pad2 = n => String(n).padStart(2, '0');

  // ——— тайминг сцен ———
  const T1 = 2.35, T2 = 4.55, T3 = 6.65, T4 = 9.55, T5 = 13.55;   // цифрам 4 с: по ~1,2 с на число
  const NSC = 6;

  let L = null;
  function layout() {
    L = {};
    L.hook = bigSet(hookSrc, GY(1), GY(10) - 20, 840, 380, true);   // строго в безопасной зоне
    L.cta = bigSet(cta, GY(1), GY(7) - 30, 840, 340);
    // заголовок: один кегль на все строки, флаг влево в ширину 6 модулей
    let F = Math.min(...titles.map(s => fitF(s, 840, 150)));
    const tl = titles.map(s => ({ s, long: fitF(s, 840, 150) < 70 && s.includes(' ') }));
    let tls = [];
    tl.forEach((l, i) => {
      if (l.long) { const ws = l.s.split(' '), h = Math.ceil(ws.length / 2); tls.push({ s: ws.slice(0, h).join(' '), acc: i === accIdx }, { s: ws.slice(h).join(' '), acc: i === accIdx }); }
      else tls.push({ s: l.s, acc: i === accIdx });
    });
    F = Math.min(...tls.map(l => fitF(l.s, 840, 150)));
    const lead = Math.max(MY / 2, Math.ceil(capH(F) * 1.32 / (MY / 2)) * (MY / 2));
    while (GY(5) + 40 + capH(F) + lead * (tls.length - 1) > GY(10) - 10 && F > 30) F *= .95;
    const lead2 = Math.max(MY / 2, Math.ceil(capH(F) * 1.32 / (MY / 2)) * (MY / 2));
    const b0 = Math.ceil((GY(5) + 36 + capH(F) - 260) / (MY / 2)) * (MY / 2) + 260;
    L.title = tls.map((l, i) => ({ ...l, F, base: b0 + i * lead2, ch: capH(F) }));
    // подзаголовок: колонка 3 модуля
    let sf = 36; L.sub = wrap(САЙТ.подзаголовок || '', 380, sf, 500);
    while (L.sub.length > 6 && sf > 24) { sf -= 2; L.sub = wrap(САЙТ.подзаголовок || '', 380, sf, 500); }
    L.subF = sf;
    // цифры
    L.stats = stats.map(st => {
      const s = num(st.число || 0) + (st.плюс || ''), F2 = fitF(s, 960, 700, 700, -.04), w = tw(s, F2, 700, -.04);
      const x0 = w > 840 ? (W - w) / 2 : 120;
      const chars = []; let cx = x0;
      for (const c of s) { const cwid = tw(c, F2, 700, -.04); chars.push({ c, x: cx, w: cwid, d: /\d/.test(c) ? +c : -1 }); cx += cwid - .04 * F2; }
      const lines = wrap(U(st.подпись || ''), 840, 52, 700, -.01, 3);
      return { s, F: F2, ch: capH(F2), chars, lines };
    });
  }

  // ——— сетка 6×10: прочерчивается и исчезает ———
  function grid(t, draw, fade, a = 1) {
    if (a <= 0) return;
    x.save(); x.fillStyle = rgba(INK, .26 * a);
    for (let i = 0; i <= 6; i++) {
      const g = E.inOut(clamp(draw * 1.6 - i * .1)), f = E.inOut(clamp(fade * 1.6 - (6 - i) * .1));
      const y0 = H * f, y1 = H * g; if (y1 > y0) x.fillRect(GX(i) - .75, y0, 1.5, y1 - y0);
    }
    for (let j = 0; j <= 10; j++) {
      const g = E.inOut(clamp(draw * 1.6 - j * .06)), f = E.inOut(clamp(fade * 1.6 - (10 - j) * .06));
      const x0 = W * f, x1 = W * g; if (x1 > x0) x.fillRect(x0, GY(j) - .75, x1 - x0, 1.5);
    }
    x.restore();
  }
  // мелкая служебная строка плаката (ряд 0)
  function meta(idx, mid, right, a = 1, col = INK, dy = 0) {
    if (a <= 0) return;
    const y = GY(0) + 30 + dy;
    TX(`${pad2(idx)}/${pad2(NSC)}`, GX(0), y, 24, { wt: 700, tr: .04, color: col, alpha: a });
    if (mid) TX(mid, GX(1), y, 24, { wt: 700, tr: .04, color: col, alpha: a });
    if (right) TX(right, GX(6), y, 24, { wt: 500, tr: .02, color: col, alpha: a * .75, align: 'right' });
  }

  // ——— КРУГ-АКЦЕНТ: сквозной герой, ключевые позиции по сценам ———
  // квадрат-модуль в хуке → круг с предметом → вверх вправо → (полосы) → финал
  function circleState(t) {
    const A = { x: GX(5) + MX / 2, y: GY(0) + MY / 2, r: 62, sq: 1 };          // модуль в ряду 0
    const B = { x: 540, y: 860, r: 330, sq: 0 };                                 // центр, предмет
    const Cc = { x: 715, y: 585, r: 225, sq: 0 };                                // заголовок и товары
    const Dd = { x: 785, y: 1265, r: 175, sq: 0 };                               // финал
    if (t < T1 - .15) return A;
    if (t < T2 - .1) { const p = io(t, T1 - .15, T1 + .6); return { x: mix(A.x, B.x, p), y: mix(A.y, B.y, p), r: mix(A.r, B.r, E.inOut(prog(t, T1 - .05, T1 + .7))), sq: 1 - E.inOut(prog(t, T1 - .15, T1 + .35)) }; }
    if (t < T4) { const p = steps(prog(t, T2 - .1, T2 + .55), 2); return { x: mix(B.x, Cc.x, p), y: mix(B.y, Cc.y, p), r: mix(B.r, Cc.r, p), sq: 0 }; }
    const p = steps(prog(t, T5 - .05, T5 + .65), 2);
    return { x: mix(W + 260, Dd.x, p), y: Dd.y, r: Dd.r, sq: 0 };
  }
  function drawCircle(s) {
    x.save(); x.fillStyle = ACC;
    const w = s.r * 2 * mix(1, MX / (s.r * 2), s.sq), h = s.r * 2 * mix(1, MY / (s.r * 2), s.sq);
    if (s.sq > .001) { x.beginPath(); x.roundRect(s.x - w / 2, s.y - h / 2, w, h, Math.min(w, h) / 2 * (1 - s.sq)); x.fill(); }
    else { x.beginPath(); x.arc(s.x, s.y, s.r, 0, Math.PI * 2); x.fill(); }
    x.restore();
  }

  // ===== 1. ХУК 0–2.35: сетка прочерчивается, слова занимают модули, обрез справа =====
  function sHook(t) {
    const draw = prog(t, -.55, 1.0), fade = prog(t, 1.75, 2.75);
    grid(t, draw, fade);
    const hl = L.hook;
    // уход: каждая строка стирается шторкой слева направо (кромка — акцентная планка), строки по очереди
    const wipe = i => io(t, T1 - .3 + i * .07, T1 + .12 + i * .07);
    meta(1, brand, null, 1 - E.inOut(prog(t, T1 - .3, T1)));
    hl.forEach((l, i) => {
      const w = tw(l.s, l.F), d = -t * 4, wp = wipe(i);
      if (wp >= 1) return;
      const X = GX(0) + d;
      // модули, которые заняло слово: заливаются по одному, потом гаснут
      const nC = Math.min(7, Math.ceil((w + 20) / MX)), rowT = l.base - l.ch, nR = Math.max(1, Math.round(l.ch / (MY / 2)));
      const fillA = 1 - E.inOut(prog(t, 1.45 + i * .06, 2.0 + i * .06));
      if (fillA > 0) for (let c = 0; c < nC; c++) {
        const k = prog(t, .2 + i * .16 + c * .045, .32 + i * .16 + c * .045);
        if (k <= 0) continue;
        const X0 = GX(0) + c * MX;
        x.save(); x.globalAlpha = fillA; x.fillStyle = rgba(ACC, LIGHT ? .16 : .13);
        x.fillRect(X0 + 1, rowT, (MX - 2) * E.inOut(k), nR * MY / 2); x.restore();
        x.save(); x.globalAlpha = fillA * E.inOut(k); x.fillStyle = ACC; x.fillRect(X0 + 1, rowT - 1, MX - 2, 3); x.restore();
      }
      const ex0 = X - 12 + (w + 30) * wp, top = l.base - l.ch - l.F * .12, hh = l.ch + l.F * .36;
      x.save();
      if (wp > 0) { x.beginPath(); x.rect(ex0, top, W, hh); x.clip(); }
      TX(l.s, X, l.base, l.F, { color: i === hl.length - 1 ? HI : INK });
      x.restore();
      if (wp > 0) rect(ex0 - 4, top, 8, hh, ACC);
    });
    // подвал плаката: жирная линейка и выходные данные — низ кадра не пустой
    const lb = hl[hl.length - 1].base, fy = Math.min(GY(10) - 34, Math.max(lb + 64, GY(9) + MY / 2)), fw = 1 - io(t, T1 - .1, T1 + .3);
    if (fw > 0 && fy > lb + 40) {
      hline(GX(0), GX(0) + 840 * fw, fy, 8, INK);
      TX(dom, GX(0), fy + 44, 24, { wt: 700, tr: .04, alpha: fw });
      TX(`${brand} — Nº ${pad2(1)}`, GX(6), fy + 44, 24, { wt: 500, tr: .04, alpha: fw * .75, align: 'right' });
    }
  }

  // ===== 2. ПРЕДМЕТ 2.35–4.55: круг акцента, предмет из маски, радиальная подпись вращается =====
  function sItem(t, cs) {
    const a = 1 - E.inOut(prog(t, T2 - .15, T2 + .3));
    // перекрестье через центр круга, как на плакате
    const k = io(t, T1 + .2, T1 + .85);
    if (k > 0 && a > 0) {
      x.save(); x.globalAlpha = a * .45; x.fillStyle = INK;
      x.fillRect(cs.x - W * k, cs.y - .75, W * 2 * k, 1.5); x.fillRect(cs.x - .75, cs.y - H * k, 1.5, H * 2 * k); x.restore();
      TX(`${pad2(2)}/${pad2(NSC)}`, GX(0), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: a * k });
      TX(brand, GX(1), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: a * k });
      TX(dom, GX(6), GY(0) + 30, 24, { wt: 500, tr: .02, alpha: a * k * .75, align: 'right' });
      // подписи осей
      TX(`Y — ${Math.round(cs.y)}`, cs.x + 14, GY(10) - 10, 22, { wt: 500, tr: .04, alpha: a * k * .7 });
    }
    // заголовок-превью внизу: первая строка заголовка, мелко, флаг влево
    const k2 = ex(t, T1 + .7, T1 + 1.4);
    if (k2 > 0 && a > 0) {
      const s = titles[0], F = fitF(s, 560, 44);
      x.save(); x.beginPath(); x.rect(GX(0), GY(9) - 60, 840, 70); x.clip();
      TX(s, GX(0), GY(9) + mix(60, 0, k2), F, { alpha: a, wt: 700 });
      x.restore();
      hline(GX(0), GX(0) + 840 * k2, GY(9) + 26, 6, INK, a);
    }
  }

  // предмет и кольцо поверх круга — живут со 2-й по 4-ю сцену
  function hero(t, cs) {
    if (t < T1 || t > T4 + .4) return;
    // активный товар: фото не перекрашиваются — при смене старое уезжает вверх из круга, новое въезжает снизу,
    // кольцо доворачивается на шаг (поворот круга)
    let pal = goods[0] && goods[0].палитра, pal2 = null, sw = 0, turn = 0, ringStr = ringBase, ringStr2 = null, mixR = 0;
    if (t > T3 - .1 && NG) {
      const g = goodsState(t); pal = goods[g.i] && goods[g.i].палитра;
      if (g.j !== g.i && g.p > 0) { pal2 = goods[g.j] && goods[g.j].палитра; sw = g.p; }
      turn = (g.i + g.p) * Math.PI / 3;
      const it = goods[g.i], jt = goods[g.j];
      ringStr = U(it.имя) + '  ·  ' + (it.цена || '') + '  ·  '; ringStr2 = U(jt.имя) + '  ·  ' + (jt.цена || '') + '  ·  '; mixR = g.p;
      const into = io(t, T3 - .1, T3 + .3); if (into < 1) { ringStr2 = ringStr; ringStr = ringBase; mixR = into; }
    }
    if (!goods.length) pal = pal2 = undefined;
    const s = cs.r * .5;
    // предмет поднимается из полосы-маски
    const rv = io(t, T1 + .08, T1 + .75), lift = (1 - rv) * cs.r * .5;
    const kill = E.inOut(prog(t, T4 - .1, T4 + .3));
    // радиальная подпись
    const rev = io(t, T1 + .3, T1 + 1.1), rot = t * .28 - 1.2 + turn, R = cs.r + Math.max(26, cs.r * .11), F = Math.max(20, Math.min(30, cs.r * .085));
    // предмет живёт внутри кольца: всё, что дальше подписи, срезано окружностью
    x.save();
    x.beginPath(); x.arc(cs.x, cs.y, R - F * .8, 0, Math.PI * 2); x.clip();
    if (rv < 1) { x.beginPath(); const yT = mix(cs.y + cs.r * 2.4, cs.y - cs.r * 2.6, rv); x.rect(0, yT, W, H); x.clip(); }
    if (sw > 0) {
      const D = R * 2.2;
      item(cs.x, cs.y + lift - sw * D, s, t, pal);
      item(cs.x, cs.y + lift + (1 - sw) * D, s, t, pal2);
      // шов между фото — тонкая линейка, как разрез плаката
      rect(cs.x - R, cs.y + (1 - sw) * D - D / 2 - 1.5, R * 2, 3, INK, .5 * Math.sin(sw * Math.PI));
    } else item(cs.x, cs.y + lift, s, t, pal);
    x.restore();
    const fadeR = 1 - kill;
    if (ringStr2 != null) { ring(cs.x, cs.y, R, ringStr, F, rot, INK, fadeR * (1 - mixR), rev); ring(cs.x, cs.y, R, ringStr2, F, rot, INK, fadeR * mixR, rev); }
    else ring(cs.x, cs.y, R, ringStr, F, rot, INK, fadeR, rev);
  }

  // ===== 3. ЗАГОЛОВОК 4.55–6.65: жирная линейка, колонки по сетке =====
  function sTitle(t) {
    const rule = ex(t, T2 + .1, T2 + .7);
    if (t < T4) hline(GX(0), GX(0) + 840 * rule, GY(5), 10, INK);
    const outT = i => io(t, T3 - .42 + i * .05, T3 - .06 + i * .05);
    L.title.forEach((l, i) => {
      const k = ex(t, T2 + .3 + i * .09, T2 + 1.05 + i * .09), o = outT(i);
      if (k <= 0 || o >= 1) return;
      x.save(); x.beginPath(); x.rect(GX(0) - 10, l.base - l.ch - 14, 1000, l.ch + l.F * .3 + 14); x.clip();
      TX(l.s, GX(0), l.base + (1 - k) * (l.ch + 30) - o * (l.ch + 30), l.F, { color: l.acc ? HI : INK });
      x.restore();
    });
    // колонка подзаголовка: 3 модуля слева сверху
    const sf = L.subF, lh = Math.round(sf * 1.3), n = L.sub.length, y0 = GY(5) - 40 - (n - 1) * lh;
    const ko = io(t, T3 - .45, T3 - .08);
    const kr = ex(t, T2 + .55, T2 + 1.1);
    if (ko < 1 && kr > 0) {
      hline(GX(0), GX(0) + MX * kr, y0 - sf - 40, 10, ACC, 1 - ko);
      TX(pad2(3) + '/' + pad2(NSC), GX(0), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: (1 - ko) * kr });
      TX(brand, GX(1), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: (1 - ko) * kr });
    }
    L.sub.forEach((s, i) => {
      const k = ex(t, T2 + .6 + i * .06, T2 + 1.2 + i * .06); if (k <= 0 || ko >= 1) return;
      x.save(); x.beginPath(); x.rect(GX(0), y0 + i * lh - sf, 420, sf * 1.35); x.clip();
      TX(s, GX(0) - (1 - k) * MX - ko * 420, y0 + i * lh, sf, { wt: 500, tr: 0, color: INK, alpha: 1 });
      x.restore();
    });
  }

  // ===== 4. ТОВАРЫ 6.65–9.55: таблица, ряды перестраиваются, номер огромный =====
  const G0 = T3 + .25, GD = NG ? (T4 - .35 - G0) / NG : 1;
  function goodsState(t) {
    const q = clamp((t - G0) / GD, 0, NG - 1 + .999), i = Math.floor(q), j = Math.min(NG - 1, i + 1);
    const p = i === j ? 0 : E.inOut(clamp((q - i - .62) / .38));
    return { i, j, p };
  }
  function sGoods(t) {
    if (!NG) return;
    const into = t => ex(t, T3 - .05, T3 + .55), g = goodsState(t);
    const act = goods.map((_, k) => k === g.i ? 1 - g.p : k === g.j ? g.p : 0);
    if (g.i === g.j) act[g.i] = 1;
    const top = GY(5), bot = GY(10), total = bot - top, hIn = NG > 1 ? Math.min(MY, (total - 2 * MY) / (NG - 1)) : 0, hA = Math.min(total - hIn * (NG - 1), MY * 2.4);
    const hs = act.map(a => mix(hIn, hA, a));
    const outA = io(t, T4 - .3, T4 + .05);
    const ys = []; { let y = top; hs.forEach(h => { ys.push(y); y += h; }); }
    hline(GX(0), GX(6), top, 10, INK);
    // плашка акцента не перетекает цветом, а едет из ряда в ряд; текст под ней перекрашивается маской
    const hy = mix(ys[g.i], ys[g.j], g.p), hh = mix(hs[g.i], hs[g.j], g.p);
    const row = (k, col) => {
      const gd = goods[k], h = hs[k], y = ys[k], a = act[k];
      const name = U(gd.имя), price = gd.цена || '';
      const nF = mix(32, 30, a), nmF0 = 36, pF0 = 32;
      const pw0 = tw(price, pF0, 500, 0);
      const bigN = clamp(hA * .27, 56, 92), nmF = Math.min(mix(nmF0, bigN, a), fitF(name, mix(840 - 140 - pw0 - 40, 840 - 170, a), mix(nmF0, bigN, a)));
      const pF = mix(pF0, Math.min(52, bigN * .7), a);
      const midY = y + h / 2 + capH(nmF) / 2 + 3;
      const nmBase = mix(midY, y + 26 + capH(nmF) + 18, a);
      const prBase = mix(midY, nmBase + capH(pF) + 26, a);
      const prX = mix(GX(6) - tw(price, pF, 500, 0), GX(1) + 10, a);
      TX(pad2(k + 1), GX(0) + 16, mix(midY, y + 26 + capH(nF) + 18, a), nF, { wt: 700, tr: .02, color: col });
      TX(name, GX(1) + 10, nmBase, nmF, { wt: 700, tr: -.02, color: col });
      TX(price, prX, prBase, pF, { wt: 500, tr: 0, color: col, alpha: col === ON ? 1 : .7 });
    };
    goods.forEach((gd, k) => {
      const h = hs[k], y = ys[k], kin = ex(t, T3 - .08 + k * .07, T3 + .52 + k * .07);
      if (kin <= 0) return;
      x.save(); x.beginPath(); x.rect(GX(0), y, 840 * kin, h); x.clip();
      row(k, INK);
      // часть ряда под плашкой
      x.beginPath(); x.rect(GX(0), hy + 6, 840, hh - 6); x.clip();
      x.fillStyle = ACC; x.fillRect(GX(0), y, 840, h);
      row(k, ON);
      x.restore();
      if (k < NG - 1) { const yb = y + h, near = Math.min(Math.abs(yb - hy), Math.abs(yb - hy - hh)); hline(GX(0), GX(0) + 840 * kin, yb, 2, INK, .35 * clamp(near / 30)); }
    });
    // огромный номер активного товара: перещёлкивается вверх по модулю
    const F = 330, ch = capH(F), base = GY(5) - 44;
    x.save(); x.beginPath(); x.rect(GX(0) - 20, base - ch - 10, 470, ch + 20); x.clip();
    const sh = (ch + 40), q = g.p;
    const k0 = into(t);
    TX(pad2(g.i + 1), GX(0) - 8, base + (1 - k0) * sh - q * sh, F, { wt: 700, tr: -.06, color: HI });
    if (g.j !== g.i) TX(pad2(g.j + 1), GX(0) - 8, base + sh - q * sh, F, { wt: 700, tr: -.06, color: HI });
    x.restore();
    TX(`${pad2(4)}/${pad2(NSC)}`, GX(0), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: k0 });
    TX(`${pad2(g.p > .5 ? g.j + 1 : g.i + 1)} — ${pad2(NG)}`, GX(1), GY(0) + 30, 24, { wt: 700, tr: .04, alpha: k0 });
  }

  // ===== полосы-шторки: 10 полос по 192 px, по очереди =====
  function bands(p, col, dir = 1, stag = .045) {
    x.save(); x.fillStyle = col;
    for (let j = 0; j < 10; j++) {
      const k = E.inOut(clamp((p - j * stag) / (1 - 9 * stag)));
      if (k <= 0) continue;
      const w = W * k; x.fillRect(dir > 0 ? 0 : W - w, j * 192, w, 193);
    }
    x.restore();
  }
  function bandsOff(p, col, dir = 1, stag = .045) {
    x.save(); x.fillStyle = col;
    for (let j = 0; j < 10; j++) {
      const k = E.inOut(clamp((p - j * stag) / (1 - 9 * stag)));
      if (k >= 1) continue;
      const w = W * (1 - k); x.fillRect(dir > 0 ? W - w : 0, j * 192, w, 193);
    }
    x.restore();
  }

  // ===== 5. ЦИФРЫ 9.55–12.55: одна цифра на весь кадр, барабаны перещёлкивают по ряду =====
  function sStats(t) {
    if (!NS) return;
    const s0 = T4 + .2, sd = (T5 - .25 - s0) / NS;
    const ki = clamp(Math.floor((t - s0) / sd), 0, NS - 1);
    // барабаны: залитая цифра видна только в окне-полосе, за окном та же лента контуром (обрез сверху/снизу кадра)
    const rd = Math.min(.85, sd * .55);
    const drawStat = (k, lt, shift, ga, ca) => {
      const S = L.stats[k], P = S.ch * 1.42, cy = 830, base = cy + S.ch / 2 + shift;
      const ghostN = Math.ceil(H / P) + 2, st = Math.min(.05, sd * .14 / Math.max(1, S.chars.length));
      const font = `700 ${S.F}px ${FONT}`;
      x.save(); x.font = font; x.letterSpacing = (-.04 * S.F) + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      const reels = S.chars.map((c, ci) => {
        if (c.d < 0) return null;
        const pr = clamp((lt - (k ? .14 : .06) - ci * st) / rd), q = c.d * E.out(pr), i0 = Math.floor(q), f = q - i0;
        const pos = pr >= 1 ? c.d : i0 + E.inOut(clamp(f * 1.6));
        return { fl: Math.floor(pos), fr: pos - Math.floor(pos) };
      });
      // контуры ленты
      if (ga > 0) {
        x.globalAlpha = ga * .17; x.strokeStyle = ON; x.lineWidth = 2;
        S.chars.forEach((c, ci) => { const R = reels[ci]; if (!R) return;
          for (let r = -ghostN; r <= ghostN; r++) { const yy = base + (r - R.fr) * P; if (yy - S.ch > H + 10 || yy < -10 || (r === 0 && R.fr < .02)) continue; x.strokeText(String(((R.fl + r) % 10 + 10) % 10), c.x, yy); } });
      }
      // окно
      x.globalAlpha = 1; x.beginPath(); x.rect(0, cy - P / 2, W, P); x.clip(); x.fillStyle = ON;
      S.chars.forEach((c, ci) => { const R = reels[ci];
        if (!R) { x.fillText(c.c, c.x, base); return; }
        for (let r = 0; r <= (R.fr > .001 ? 1 : 0); r++) x.fillText(String(((R.fl + r) % 10 + 10) % 10), c.x, base + (r - R.fr) * P); });
      x.restore();
      // подпись под цифрой
      if (ca <= 0) return;
      const yb = cy + P * .5 + S.ch * .3;
      x.save(); x.globalAlpha = ca; x.fillStyle = ON; x.fillRect(GX(0), yb - 5, 840 * E.expo(clamp(lt / .5)), 10); x.restore();
      S.lines.forEach((s, i) => {
        const kk = E.expo(clamp((lt - .12 - i * .06) / .5));
        x.save(); x.beginPath(); x.rect(GX(0), yb + 20 + i * 64, 900, 66); x.clip();
        TX(s, GX(0), yb + 70 + i * 64 + (1 - kk) * 64, 52, { wt: 700, tr: -.01, color: ON, alpha: ca });
        x.restore();
      });
    };
    const lt = t - (s0 + ki * sd);
    // переход между цифрами: старая уезжает вверх из окна на целый ряд, новая въезжает снизу
    if (ki > 0 && lt < .32) {
      const p = E.inOut(clamp(lt / .32)), Pp = L.stats[ki - 1].ch * 1.42;
      drawStat(ki - 1, sd + lt, -p * Pp, 1 - p, 1 - clamp(lt / .1));
      drawStat(ki, lt, (1 - p) * L.stats[ki].ch * 1.42, p, 1);
    } else {
      const outP = io(t, T5 - .32, T5 + .02);
      drawStat(ki, lt, -outP * L.stats[ki].ch * 1.42, 1 - outP, 1 - clamp(outP * 3));
    }
    const a = 1 - io(t, T5 - .3, T5);
    TX(`${pad2(5)}/${pad2(NSC)}`, GX(0), GY(0) + 30, 24, { wt: 700, tr: .04, color: ON, alpha: a });
    TX(brand, GX(1), GY(0) + 30, 24, { wt: 700, tr: .04, color: ON, alpha: a });
    TX(`${pad2(ki + 1)} — ${pad2(NS)}`, GX(6), GY(0) + 30, 24, { wt: 700, tr: .04, color: ON, alpha: a, align: 'right' });
  }

  // ===== 6. ФИНАЛ 12.55–15: плакат — призыв, линейка, лого, домен, круг; подпись сетки мелко =====
  function sFinal(t) {
    const lt = t - T5;
    // кресты сетки
    const kx = io(t, T5 + .3, T5 + 1.1);
    if (kx > 0) {
      x.save(); x.fillStyle = rgba(INK, .28 * kx);
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 10; j++) { const s = 9; x.fillRect(GX(i) - s, GY(j) - .75, s * 2, 1.5); x.fillRect(GX(i) - .75, GY(j) - s, 1.5, s * 2); }
      x.restore();
    }
    meta(6, brand, dom, ex(t, T5 + .2, T5 + .7));
    const cl = L.cta;
    cl.forEach((l, i) => {
      const k = ex(t, T5 + .1 + i * .1, T5 + .85 + i * .1);
      x.save(); x.beginPath(); x.rect(GX(0) - 20, l.base - l.ch - 30, W, l.ch + l.F * .32 + 30); x.clip();
      const d = -lt * 3;
      TX(l.s, GX(0) + d, l.base + (1 - k) * (l.ch + 40), l.F, { color: i === cl.length - 1 ? HI : INK });
      x.restore();
    });
    const ry = Math.max(GY(5), Math.ceil((cl[cl.length - 1].base + 60 - 260) / MY) * MY + 260);
    hline(GX(0), GX(0) + 840 * ex(t, T5 + .45, T5 + 1.1), ry, 10, INK);
    // лого, домен, кнопка — колонка из 3 модулей
    const ka = ex(t, T5 + .65, T5 + 1.3), kb = ex(t, T5 + .75, T5 + 1.4), kc = ex(t, T5 + .85, T5 + 1.5);
    const tail = САЙТ.хвостЛого || '', lw = 400, lF = Math.min(76, fitF(brand + tail, lw, 76, 800, -.03));
    const ly = ry + 30 + capH(lF);
    x.save(); x.beginPath(); x.rect(GX(0), ry + 8, 460, 480); x.clip();
    const bw = tw(brand, lF, 800, -.03);
    TX(brand, GX(0) - (1 - ka) * MX * 3, ly, lF, { wt: 800, tr: -.03 });
    if (tail) TX(tail, GX(0) + bw - (1 - ka) * MX * 3, ly, lF, { wt: 800, tr: -.03, color: HI });
    const dF = Math.min(40, fitF(dom, 400, 40, 600, 0));
    TX(dom, GX(0) - (1 - kb) * MX * 3, ly + 70, dF, { wt: 600, tr: 0 });
    // кнопка: строка со стрелкой и подчёркиванием
    const btn = U(САЙТ.кнопка || ''); if (btn) {
      const bF = Math.min(28, fitF('→ ' + btn, 400, 28, 700, .02)), by = ly + 160;
      TX('→ ' + btn, GX(0) - (1 - kc) * MX * 3, by, bF, { wt: 700, tr: .02, color: INK });
      hline(GX(0), GX(0) + tw('→ ' + btn, bF, 700, .02) * kc, by + 14, 3, ACC);
    }
    x.restore();
    // финальный круг с предметом и кольцом
    const cs = circleState(t);
    const k2 = ex(t, T5 + .5, T5 + 1.3);
    const cyF = Math.min(1500 - cs.r * .2, Math.max(ry + cs.r + 70, cs.y));
    const C2 = { ...cs, y: cyF };
    drawCircle(C2);
    x.save(); x.beginPath(); x.arc(C2.x, C2.y, C2.r + 26 - 22 * .8, 0, Math.PI * 2); x.clip();
    item(C2.x, C2.y, C2.r * .5, t, goods.length ? goods[(NG - 1) % NG].палитра : undefined);
    x.restore();
    ring(C2.x, C2.y, C2.r + 26, ringBase, 22, t * .3, INK, k2, k2);
    // подпись сетки мелко, как на постере
    const kp = ex(t, T5 + 1.0, T5 + 1.6);
    const capY = GY(10) - 8;
    TX(`${brand} — Nº ${pad2(1)}`, GX(0), capY - 30, 20, { wt: 700, tr: .06, alpha: kp * .6 });
    TX(`${pad2(6)}×${pad2(10)} — ${W}×${H}`, GX(0), capY, 20, { wt: 500, tr: .06, alpha: kp * .6 });
  }

  // ===== КАДР =====
  window.КАДР = t => {
    if (!L) layout();
    x.fillStyle = BG; x.fillRect(0, 0, W, H);
    if (t < T5 - .05) {
      const cs = circleState(t);
      if (t < T1 + .6) sHook(t);
      if (t > T3 - .4) sGoods(t);
      drawCircle(cs);
      if (t > T1 - .1 && t < T2 + .4) sItem(t, cs);
      if (t > T2 - .1 && t < T3 + .3) sTitle(t);
      hero(t, cs);
    }
    // цифры на поле акцента, полосы заходят слева и уходят вправо
    if (t > T4 - .35 && t < T5 + .6) {
      const pin = prog(t, T4 - .35, T4 + .2);
      if (pin < 1) bands(pin, ACC, 1);
      else {
        if (t > T5 - .05) { x.fillStyle = BG; x.fillRect(0, 0, W, H); sFinal(t); bandsOff(prog(t, T5 - .05, T5 + .5), ACC, 1); }
        else { x.fillStyle = ACC; x.fillRect(0, 0, W, H); sStats(t); }
      }
    } else if (t >= T5 + .6) sFinal(t);
  };
})();

  },
};
let ТЕКУЩИЙ = 'apple';
function ЗАПУСК_СТИЛЯ() { СТИЛИ_ФН[ТЕКУЩИЙ](); }
// — фото: с сайта (если сайт не отдаёт картинку — через прокси images.weserv.nl), замена своим файлом —
function грузитьКартинку(src) {
  return new Promise(res => {
    const попытка = (url, дальше) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      const таймер = setTimeout(() => { im.src = ''; дальше ? попытка(дальше, null) : res(null); }, 9000);
      im.onload = () => { clearTimeout(таймер); res(im); };
      im.onerror = () => { clearTimeout(таймер); дальше ? попытка(дальше, null) : res(null); };
      im.src = url;
    };
    const прокси = /^https?:/.test(src) ? 'https://images.weserv.nl/?url=' + encodeURIComponent(src.replace(/^https?:\/\//, '')) : null;
    попытка(src, прокси);
  });
}
function цветаИзФото(im) {
  const k = document.createElement('canvas'); k.width = k.height = 48; const g = k.getContext('2d');
  g.drawImage(im, 0, 0, 48, 48); let d; try { d = g.getImageData(0, 0, 48, 48).data; } catch (e) { return {}; }
  const px = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return {};
  const ср = a => [0, 1, 2].map(j => a.reduce((s, p) => s + p[j], 0) / a.length);
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const тёмные = px.filter(p => p[0] + p[1] + p[2] < 300); const тм = ср(тёмные.length ? тёмные : px);
  const насыщ = px.reduce((b, p) => (Math.max(...p) - Math.min(...p) > Math.max(...b) - Math.min(...b) ? p : b), px[0]);
  return { корпус: hex(ср(px)), циферблат: hex(тм), циферблат2: hex(тм.map(v => v * .5)), метки: '#f4f4f4', акцент: hex(насыщ) };
}
async function подготовитьФото() {
  await Promise.all((САЙТ.товары || []).map(async т => {
    т.палитра = т.палитра || {};
    const src = т.палитра.фото || т.фото; if (!src) return;
    const im = await грузитьКартинку(src);
    if (!im) { delete т.палитра.фото; return; }
    ФОТО[src] = im; т.палитра.фото = src;
    const ц = цветаИзФото(im); for (const k in ц) if (!(k in т.палитра)) т.палитра[k] = ц[k];
  }));
}
function рядФото() {
  const ряд = document.getElementById('фото'); ряд.innerHTML = '';
  (САЙТ.товары || []).forEach(т => {
    const l = document.createElement('label'), im = т.палитра && т.палитра.фото && ФОТО[т.палитра.фото];
    l.innerHTML = (im ? `<img src="${im.src}">` : '<div class="нет"></div>') + `<b>${т.имя || ''}</b><span>заменить фото</span><input type="file" accept="image/*">`;
    l.querySelector('input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const url = URL.createObjectURL(f), img = await грузитьКартинку(url); if (!img) return;
      ФОТО[url] = img; т.палитра = Object.assign({}, т.палитра, цветаИзФото(img), { фото: url });
      запустить();
    };
    document.getElementById('фото').appendChild(l);
  });
}
if (!САЙТ.предмет) САЙТ.предмет = (x, t, p, s) => предметФото(x, t, p || (САЙТ.товары && САЙТ.товары[0] && САЙТ.товары[0].палитра), s);
function запустить() { DUR = 15; FONT = '"Helvetica Neue",Helvetica,Arial,sans-serif'; ЗАПУСК_СТИЛЯ(); рядФото(); draw(0); }
// режим «все»: кнопки стилей над плеером
if (typeof СТИЛИ_ФН !== 'undefined') {
  const ИМЕНА = { apple: 'Apple', steklo: 'Стекло', kinetika: 'Кинетика', neon: 'Неон', morf: 'Морф', chertezh: 'Чертёж', retro: 'Windows 98', telefon: 'Телефон', zhurnal: 'Журнал', shveyc: 'Плакат' };
  const ряд = document.createElement('div'); ряд.className = 'row стили';
  const css = document.createElement('style'); css.textContent = '.sv .стили button{padding:9px 13px;font-size:13.5px;background:#1c1f24;color:#eef1f4}.sv .стили button.on{background:#6EC1F0;color:#04121c}'; document.head.appendChild(css);
  Object.keys(СТИЛИ_ФН).forEach((k, i) => { const b = document.createElement('button'); b.textContent = (i + 1) + '. ' + ИМЕНА[k]; b.dataset.k = k;
    b.onclick = () => { ТЕКУЩИЙ = k; ряд.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === k)); stop(); запустить(); }; ряд.appendChild(b); });
  document.querySelector('.sv').insertBefore(ряд, document.getElementById('c'));
  ряд.firstChild.classList.add('on');
}
подготовитьФото().then(() => { запустить(); старт(); });

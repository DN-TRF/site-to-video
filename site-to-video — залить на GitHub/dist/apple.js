/* site-to-video · apple · MIT · github.com/DN-TRF/site-to-video */
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

function ЗАПУСК_СТИЛЯ() {
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

}
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

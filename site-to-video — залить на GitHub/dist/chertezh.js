/* site-to-video · chertezh · MIT · github.com/DN-TRF/site-to-video */
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

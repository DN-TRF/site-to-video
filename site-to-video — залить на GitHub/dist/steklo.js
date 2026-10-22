/* site-to-video · steklo · MIT · github.com/DN-TRF/site-to-video */
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

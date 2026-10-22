/* site-to-video · neon · MIT · github.com/DN-TRF/site-to-video */
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

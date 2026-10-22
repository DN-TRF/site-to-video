/* site-to-video · kinetika · MIT · github.com/DN-TRF/site-to-video */
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

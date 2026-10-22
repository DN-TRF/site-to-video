/* site-to-video · shveyc · MIT · github.com/DN-TRF/site-to-video */
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

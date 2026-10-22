/* site-to-video · zhurnal · MIT · github.com/DN-TRF/site-to-video */
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

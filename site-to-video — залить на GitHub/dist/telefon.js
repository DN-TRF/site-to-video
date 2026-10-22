/* site-to-video · telefon · MIT · github.com/DN-TRF/site-to-video */
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

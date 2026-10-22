/* site-to-video · retro · MIT · github.com/DN-TRF/site-to-video */
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

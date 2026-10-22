/* site-to-video · morf · MIT · github.com/DN-TRF/site-to-video */
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

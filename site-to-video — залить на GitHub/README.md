# site-to-video

Вертикальный моушен-ролик 1080×1920 (15 с) про любой сайт — в одном из 10 стилей.
Страница пишет только данные сайта (`const САЙТ = {…}`) и подключает стиль:

```html
<script src="https://cdn.jsdelivr.net/gh/DN-TRF/site-to-video@main/dist/zhurnal.js"></script>
```

Стили: apple, steklo, kinetika, neon, morf, chertezh, retro, telefon, zhurnal, shveyc или «все» — десять с переключателем.
Кнопка «Скачать видео» собирает mp4 прямо в браузере. Данные по ссылке на сайт делает Claude по скиллу «Сайт в видео».

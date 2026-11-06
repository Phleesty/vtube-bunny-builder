// VTube Unuasha — Bunny Animator & Sequence Builder
// Высокопроизводительный покадровый движок на HTML5 Canvas (8 FPS Native)

(function () {
  'use strict';

  // Константы размеров кадра художника
  const SPRITE_WIDTH = 800;
  const SPRITE_HEIGHT = 560;

  // Глобальное состояние настроек
  const state = {
    mode: 'walk_fall',      // 'walk_fall', 'walk_move', 'walk_static', 'fall_static'
    base: 'fartuk',         // 'fartuk', 'nude'
    hat: 'hat1',            // 'none', 'hat1', 'hat2'
    accessory: 'bowl',      // 'none', 'bowl'
    hand: 'cake',           // 'none', 'cake', 'coffee', 'cup'
    fps: 8,                 // Ровно 8 FPS по умолчанию
    speed: 14,              // Сдвиг по X (пикселей за кадр походки)
    walkFrames: 20,         // Шагов до падения в режиме walk_fall
    holdTime: 2.0,          // Длительность паузы на полу (секунды)
    isPlaying: true
  };

  // Внутреннее состояние воспроизведения
  const runtime = {
    currentAction: 'walk',  // 'walk', 'fall', 'hold'
    frame: 1,               // 1..5 для walk, 1..15 для fall
    walkStepsCount: 0,      // Накопленное количество кадров походки
    posX: 0,                // Текущая позиция по горизонтали
    holdElapsed: 0,         // Накопленное время удержания в секундах
    lastTimestamp: 0,
    accumulator: 0
  };

  // Кэш предзагруженных картинок
  const imageCache = new Map();

  function getCachedImage(src) {
    if (imageCache.has(src)) {
      return imageCache.get(src);
    }
    const img = new Image();
    img.src = src;
    imageCache.set(src, img);
    return img;
  }

  // DOM Элементы
  const canvas = document.getElementById('stage-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // Сохраняем идеальную пиксельную резкость

  const stageViewport = document.getElementById('stage-viewport');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnPlayIcon = document.getElementById('btn-play-icon');
  const btnPlayText = document.getElementById('btn-play-text');
  const btnStep = document.getElementById('btn-step');
  const btnReset = document.getElementById('btn-reset');

  const infoMode = document.getElementById('info-mode');
  const infoFrame = document.getElementById('info-frame');
  const infoPos = document.getElementById('info-pos');
  const badgeStatus = document.getElementById('badge-status');
  const badgeFps = document.getElementById('badge-fps');

  const inputFps = document.getElementById('input-fps');
  const valFps = document.getElementById('val-fps');
  const inputSpeed = document.getElementById('input-speed');
  const valSpeed = document.getElementById('val-speed');
  const inputWalkFrames = document.getElementById('input-walk-frames');
  const valWalkFrames = document.getElementById('val-walk-frames');
  const inputHoldTime = document.getElementById('input-hold-time');
  const valHoldTime = document.getElementById('val-hold-time');

  const textPresetId = document.getElementById('text-preset-id');
  const textPresetJson = document.getElementById('text-preset-json');
  const textPresetUrl = document.getElementById('text-preset-url');
  const toast = document.getElementById('toast');

  // Предзагрузка ключевых слоев
  async function preloadAssets() {
    badgeStatus.textContent = 'Кэширование кадров...';
    badgeStatus.classList.remove('ready');

    const urls = [];
    // Все кадры походки (5 кадров)
    for (let f = 1; f <= 5; f++) {
      urls.push(`./assets/bunny/walk/walk-base-fartuk-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-base-nude-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-hat-1-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-hat-2-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-bowl-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-hand-cake-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-hand-coffee-${f}.png`);
      urls.push(`./assets/bunny/walk/walk-hand-cup-${f}.png`);
    }

    // Все кадры падения (15 кадров)
    for (let f = 1; f <= 15; f++) {
      urls.push(`./assets/bunny/fall/fall-base-fartuk-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-base-nude-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-hat-1-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-hat-2-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-bowl-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-hand-cake-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-hand-coffee-${f}.png`);
      urls.push(`./assets/bunny/fall/fall-hand-cup-${f}.png`);
    }

    const promises = urls.map(url => {
      return new Promise(resolve => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          imageCache.set(url, img);
          resolve();
        };
        img.onerror = () => {
          console.warn('[Bunny Builder] Не удалось предзагрузить:', url);
          resolve();
        };
      });
    });

    await Promise.all(promises);
    badgeStatus.textContent = `Готово (160 кадров)`;
    badgeStatus.classList.add('ready');
  }

  // Сброс позиции и фазы анимации
  function resetPlayback() {
    runtime.frame = 1;
    runtime.walkStepsCount = 0;
    runtime.holdElapsed = 0;
    runtime.accumulator = 0;

    if (state.mode === 'walk_static') {
      runtime.currentAction = 'walk';
      runtime.posX = (canvas.width - SPRITE_WIDTH) / 2;
    } else if (state.mode === 'fall_static') {
      runtime.currentAction = 'fall';
      runtime.posX = (canvas.width - SPRITE_WIDTH) / 2;
    } else if (state.mode === 'walk_move') {
      runtime.currentAction = 'walk';
      // Старт у правого края: нос/предмет сразу показываются на правом краю и идут налево
      runtime.posX = canvas.width - 300;
    } else if (state.mode === 'walk_fall') {
      runtime.currentAction = 'walk';
      // Зайка идет налево: стартуем справа, чтобы упасть в районе центра холста
      const totalWalkDistance = state.walkFrames * state.speed;
      const targetFallX = (canvas.width - SPRITE_WIDTH) / 2;
      runtime.posX = targetFallX + totalWalkDistance;
    }
  }

  // Переход к следующему кадру (логика конечного автомата)
  function stepFrame(deltaSeconds = 0) {
    if (runtime.currentAction === 'hold') {
      runtime.holdElapsed += deltaSeconds;
      if (runtime.holdElapsed >= state.holdTime) {
        resetPlayback();
      }
      return;
    }

    if (runtime.currentAction === 'walk') {
      runtime.frame = (runtime.frame % 5) + 1;
      runtime.walkStepsCount++;

      // Смещение по X (движение строго НАЛЕВО в сторону взгляда персонажа)
      if (state.mode === 'walk_move' || state.mode === 'walk_fall') {
        runtime.posX -= state.speed;
      }

      // Проверка окончания походки
      if (state.mode === 'walk_fall') {
        if (runtime.walkStepsCount >= state.walkFrames) {
          runtime.currentAction = 'fall';
          runtime.frame = 1; // Бесшовно начинаем падение в этой точке!
        }
      } else if (state.mode === 'walk_move') {
        // Мгновенное бесшовное появление с правого края без задержек:
        // Правый край спрайта (хвостик) выходит за левый край (posX + 760 <= 0),
        // в этот же момент левый край (нос/предмет на 300px) появляется справа (canvas.width - 300)
        if (runtime.posX + 760 <= 0) {
          runtime.posX = canvas.width - 300;
        }
      }
    } else if (runtime.currentAction === 'fall') {
      if (runtime.frame < 15) {
        runtime.frame++;
      } else {
        // Достигли последнего 15-го кадра — переходим в паузу лежания на полу
        runtime.currentAction = 'hold';
        runtime.holdElapsed = 0;
      }
    }
  }

  // Отрисовка составных слоев на холсте
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const action = runtime.currentAction === 'hold' ? 'fall' : runtime.currentAction;
    const frameNum = runtime.currentAction === 'hold' ? 15 : runtime.frame;
    const posX = Math.round(runtime.posX);
    const posY = 0; // Все слои 800x560 садятся на нулевую высоту сцены

    // Слои по порядку Z-Index:
    // 1. Базовое тело
    const baseSrc = `./assets/bunny/${action}/${action}-base-${state.base}-${frameNum}.png`;
    const baseImg = getCachedImage(baseSrc);
    if (baseImg.complete && baseImg.naturalWidth > 0) {
      ctx.drawImage(baseImg, posX, posY);
    }

    // 2. Головной убор (если выбран)
    if (state.hat !== 'none') {
      const hatNum = state.hat === 'hat1' ? '1' : '2';
      const hatSrc = `./assets/bunny/${action}/${action}-hat-${hatNum}-${frameNum}.png`;
      const hatImg = getCachedImage(hatSrc);
      if (hatImg.complete && hatImg.naturalWidth > 0) {
        ctx.drawImage(hatImg, posX, posY);
      }
    }

    // 3. Аксессуар (бантик на ушко)
    if (state.accessory === 'bowl') {
      const bowlSrc = `./assets/bunny/${action}/${action}-bowl-${frameNum}.png`;
      const bowlImg = getCachedImage(bowlSrc);
      if (bowlImg.complete && bowlImg.naturalWidth > 0) {
        ctx.drawImage(bowlImg, posX, posY);
      }
    }

    // 4. Предмет в лапках
    if (state.hand !== 'none') {
      const handSrc = `./assets/bunny/${action}/${action}-hand-${state.hand}-${frameNum}.png`;
      const handImg = getCachedImage(handSrc);
      if (handImg.complete && handImg.naturalWidth > 0) {
        ctx.drawImage(handImg, posX, posY);
      }
    }

    // Обновление индикаторов UI
    const actionLabel = runtime.currentAction === 'hold' ? 'Fall (Пауза)' : (runtime.currentAction === 'walk' ? 'Walk' : 'Fall');
    const totalFrames = action === 'walk' ? 5 : 15;
    infoMode.textContent = `Фаза: ${actionLabel}`;
    infoFrame.textContent = `Кадр: ${frameNum} / ${totalFrames}`;
    infoPos.textContent = `X: ${posX} px`;
  }

  // Главный игровой цикл с точным таймингом на requestAnimationFrame
  function gameLoop(timestamp) {
    if (!runtime.lastTimestamp) runtime.lastTimestamp = timestamp;
    const deltaMs = timestamp - runtime.lastTimestamp;
    runtime.lastTimestamp = timestamp;

    if (state.isPlaying) {
      const frameIntervalMs = 1000 / state.fps;
      runtime.accumulator += deltaMs;

      while (runtime.accumulator >= frameIntervalMs) {
        stepFrame(frameIntervalMs / 1000);
        runtime.accumulator -= frameIntervalMs;
      }
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // Синхронизация пресета, генерация ID, JSON и URL
  function updateExportData() {
    // 1. Компактный ID
    const compactId = `${state.mode}:${state.base}:${state.hat}:${state.accessory}:${state.hand}:${state.fps}fps:spd${state.speed}`;
    textPresetId.value = compactId;

    // 2. Полный JSON
    const exportConfig = {
      mode: state.mode,
      base: state.base,
      hat: state.hat,
      accessory: state.accessory,
      hand: state.hand,
      fps: state.fps,
      speed: state.speed,
      walkFrames: state.walkFrames,
      holdTime: state.holdTime
    };
    textPresetJson.value = JSON.stringify(exportConfig, null, 2);

    // 3. Прямая ссылка для шеринга
    const url = new URL(window.location.href);
    Object.keys(exportConfig).forEach(key => {
      url.searchParams.set(key, exportConfig[key]);
    });
    textPresetUrl.value = url.toString();
    window.history.replaceState({}, '', url.toString());
  }

  // Показ всплывающего тоста
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // Копирование в буфер
  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast(successMsg));
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(successMsg);
    }
  }

  // Загрузка настроек из URL query параметров при старте
  function loadFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('mode')) state.mode = params.get('mode');
    if (params.has('base')) state.base = params.get('base');
    if (params.has('hat')) state.hat = params.get('hat');
    if (params.has('accessory')) state.accessory = params.get('accessory');
    if (params.has('hand')) state.hand = params.get('hand');
    if (params.has('fps')) state.fps = parseInt(params.get('fps'), 10) || 8;
    if (params.has('speed')) state.speed = parseInt(params.get('speed'), 10) || 14;
    if (params.has('walkFrames')) state.walkFrames = parseInt(params.get('walkFrames'), 10) || 20;
    if (params.has('holdTime')) state.holdTime = parseFloat(params.get('holdTime')) || 2.0;

    // Синхронизация радиокнопок
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      if (state[radio.name] !== undefined) {
        radio.checked = state[radio.name] === radio.value;
      }
    });

    // Синхронизация слайдеров
    inputFps.value = state.fps;
    valFps.textContent = `${state.fps} кадр/с`;
    badgeFps.textContent = `${state.fps} FPS`;

    inputSpeed.value = state.speed;
    valSpeed.textContent = `${state.speed} px/кадр`;

    inputWalkFrames.value = state.walkFrames;
    valWalkFrames.textContent = `${state.walkFrames} кадров (${state.walkFrames / 5} шагов)`;

    inputHoldTime.value = state.holdTime;
    valHoldTime.textContent = `${state.holdTime.toFixed(1)} сек`;
  }

  // Привязка обработчиков событий
  function initEvents() {
    // Радиокнопки
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state[e.target.name] = e.target.value;
        resetPlayback();
        updateExportData();
      });
    });

    // Слайдер FPS
    inputFps.addEventListener('input', (e) => {
      state.fps = parseInt(e.target.value, 10);
      valFps.textContent = `${state.fps} кадр/с`;
      badgeFps.textContent = `${state.fps} FPS`;
      updateExportData();
    });

    // Слайдер Скорости шага
    inputSpeed.addEventListener('input', (e) => {
      state.speed = parseInt(e.target.value, 10);
      valSpeed.textContent = `${state.speed} px/кадр`;
      updateExportData();
    });

    // Слайдер Дистанции шага до падения
    inputWalkFrames.addEventListener('input', (e) => {
      state.walkFrames = parseInt(e.target.value, 10);
      valWalkFrames.textContent = `${state.walkFrames} кадров (${Math.round(state.walkFrames / 5)} шагов)`;
      resetPlayback();
      updateExportData();
    });

    // Слайдер Паузы на полу
    inputHoldTime.addEventListener('input', (e) => {
      state.holdTime = parseFloat(e.target.value);
      valHoldTime.textContent = `${state.holdTime.toFixed(1)} сек`;
      updateExportData();
    });

    // Кнопка Пауза / Старт
    btnPlayPause.addEventListener('click', () => {
      state.isPlaying = !state.isPlaying;
      btnPlayIcon.textContent = state.isPlaying ? '⏸️' : '▶️';
      btnPlayText.textContent = state.isPlaying ? 'Пауза' : 'Старт';
    });

    // Кнопка Следующий шаг (при паузе)
    btnStep.addEventListener('click', () => {
      state.isPlaying = false;
      btnPlayIcon.textContent = '▶️';
      btnPlayText.textContent = 'Старт';
      stepFrame(1 / state.fps);
      render();
    });

    // Кнопка Сброс
    btnReset.addEventListener('click', () => {
      resetPlayback();
      render();
    });

    // Переключение фона
    document.querySelectorAll('.bg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const bgType = btn.dataset.bg;
        stageViewport.className = `stage-viewport bg-${bgType}`;
      });
    });

    // Кнопки копирования
    document.getElementById('btn-copy-id').addEventListener('click', () => {
      copyToClipboard(textPresetId.value, 'ID пресета скопирован!');
    });

    document.getElementById('btn-copy-json').addEventListener('click', () => {
      copyToClipboard(textPresetJson.value, 'JSON конфиг скопирован!');
    });

    document.getElementById('btn-copy-url').addEventListener('click', () => {
      copyToClipboard(textPresetUrl.value, 'Ссылка со всеми настройками скопирована!');
    });

    // Горячие клавиши (Пробел — пауза)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        btnPlayPause.click();
      }
    });
  }

  // Инициализация
  async function init() {
    loadFromUrlParams();
    initEvents();
    resetPlayback();
    updateExportData();
    await preloadAssets();
    requestAnimationFrame(gameLoop);
  }

  init();
})();

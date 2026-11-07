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

    // Слои по порядку отрисовки (Z-Index снизу вверх):

    // 1. Предмет в лапках (строго на ЗАДНЕМ плане, чтобы лапки тела обхватывали предмет спереди)
    if (state.hand !== 'none') {
      const handSrc = `./assets/bunny/${action}/${action}-hand-${state.hand}-${frameNum}.png`;
      const handImg = getCachedImage(handSrc);
      if (handImg.complete && handImg.naturalWidth > 0) {
        ctx.drawImage(handImg, posX, posY);
      }
    }

    // 2. Базовое тело (основа: фартук или тело, рисуется поверх предмета в лапках)
    const baseSrc = `./assets/bunny/${action}/${action}-base-${state.base}-${frameNum}.png`;
    const baseImg = getCachedImage(baseSrc);
    if (baseImg.complete && baseImg.naturalWidth > 0) {
      ctx.drawImage(baseImg, posX, posY);
    }

    // 3. Головной убор (если выбран, садится поверх головы)
    if (state.hat !== 'none') {
      const hatNum = state.hat === 'hat1' ? '1' : '2';
      const hatSrc = `./assets/bunny/${action}/${action}-hat-${hatNum}-${frameNum}.png`;
      const hatImg = getCachedImage(hatSrc);
      if (hatImg.complete && hatImg.naturalWidth > 0) {
        ctx.drawImage(hatImg, posX, posY);
      }
    }

    // 4. Аксессуар (бантик на ушко)
    if (state.accessory === 'bowl') {
      const bowlSrc = `./assets/bunny/${action}/${action}-bowl-${frameNum}.png`;
      const bowlImg = getCachedImage(bowlSrc);
      if (bowlImg.complete && bowlImg.naturalWidth > 0) {
        ctx.drawImage(bowlImg, posX, posY);
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

    // Выпадающее меню сохранения анимации
    const btnExportDropdown = document.getElementById('btn-export-dropdown');
    const exportDropdownMenu = document.getElementById('export-dropdown-menu');

    btnExportDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.stage-export-actions')) {
        exportDropdownMenu.classList.add('hidden');
      }
    });

    document.getElementById('btn-download-apng').addEventListener('click', () => {
      exportDropdownMenu.classList.add('hidden');
      exportAPNG();
    });

    document.getElementById('btn-download-gif').addEventListener('click', () => {
      exportDropdownMenu.classList.add('hidden');
      exportGIF();
    });

    // Горячие клавиши (Пробел — пауза)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        btnPlayPause.click();
      }
    });
  }

  // === СБОРКА И ЭКСПОРТ АНИМАЦИЙ (APNG / GIF) ===

  // Таблица CRC32 для генерации корректных PNG/APNG чанков
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
  }

  function crc32(typeBytes, dataBytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < typeBytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ typeBytes[i]) & 0xFF];
    }
    for (let i = 0; i < dataBytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ dataBytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(typeStr, dataUint8) {
    const typeBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) typeBytes[i] = typeStr.charCodeAt(i);
    const dataLen = dataUint8 ? dataUint8.length : 0;
    const chunk = new Uint8Array(4 + 4 + dataLen + 4);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, dataLen, false); // Длина данных
    chunk.set(typeBytes, 4);           // Тип чанка (4 символа)
    if (dataUint8) chunk.set(dataUint8, 8); // Сами данные
    const crcVal = crc32(typeBytes, dataUint8 || new Uint8Array(0));
    view.setUint32(8 + dataLen, crcVal, false); // Контрольная сумма CRC32
    return chunk;
  }

  function parsePngChunks(pngBuffer) {
    const bytes = new Uint8Array(pngBuffer);
    let idx = 8; // Пропускаем 8 байт заголовка PNG
    const chunks = [];
    const view = new DataView(pngBuffer);
    while (idx < bytes.length) {
      const length = view.getUint32(idx, false);
      const typeStr = String.fromCharCode(bytes[idx + 4], bytes[idx + 5], bytes[idx + 6], bytes[idx + 7]);
      const data = bytes.subarray(idx + 8, idx + 8 + length);
      chunks.push({ type: typeStr, data: data });
      idx += 12 + length;
    }
    return chunks;
  }

  function assembleAPNGBlob(pngBuffers, delayMs = 125) {
    const parsedFrames = pngBuffers.map(b => parsePngChunks(b));
    const ihdrChunk = parsedFrames[0].find(c => c.type === 'IHDR');
    const ihdrView = new DataView(ihdrChunk.data.buffer, ihdrChunk.data.byteOffset, ihdrChunk.data.byteLength);
    const width = ihdrView.getUint32(0, false);
    const height = ihdrView.getUint32(4, false);

    const parts = [];
    // 1. Сигнатура PNG
    parts.push(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    // 2. IHDR
    parts.push(makeChunk('IHDR', ihdrChunk.data));
    // 3. acTL (кол-во кадров, 0 = бесконечный цикл)
    const acTLData = new Uint8Array(8);
    const acTLView = new DataView(acTLData.buffer);
    acTLView.setUint32(0, pngBuffers.length, false);
    acTLView.setUint32(4, 0, false);
    parts.push(makeChunk('acTL', acTLData));

    let seqNumber = 0;
    parsedFrames.forEach((frame, frameIdx) => {
      // fcTL
      const fcTLData = new Uint8Array(26);
      const fcTLView = new DataView(fcTLData.buffer);
      fcTLView.setUint32(0, seqNumber++, false);
      fcTLView.setUint32(4, width, false);
      fcTLView.setUint32(8, height, false);
      fcTLView.setUint32(12, 0, false); // x_offset
      fcTLView.setUint32(16, 0, false); // y_offset
      fcTLView.setUint16(20, delayMs, false); // delay_num
      fcTLView.setUint16(22, 1000, false);    // delay_den
      fcTLData[24] = 0; // dispose_op (0 = none)
      fcTLData[25] = 0; // blend_op (0 = source)
      parts.push(makeChunk('fcTL', fcTLData));

      // IDAT / fdAT
      const idats = frame.filter(c => c.type === 'IDAT');
      idats.forEach(idat => {
        if (frameIdx === 0) {
          parts.push(makeChunk('IDAT', idat.data));
        } else {
          const fdATData = new Uint8Array(4 + idat.data.length);
          const fdATView = new DataView(fdATData.buffer);
          fdATView.setUint32(0, seqNumber++, false);
          fdATData.set(idat.data, 4);
          parts.push(makeChunk('fdAT', fdATData));
        }
      });
    });

    // IEND
    parts.push(makeChunk('IEND', null));
    return new Blob(parts, { type: 'image/png' });
  }

  // Рендеринг последовательности кадров выбранной комбинации персонажа
  function renderCompositeFrames() {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = SPRITE_WIDTH;
    offCanvas.height = SPRITE_HEIGHT;
    const offCtx = offCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = false;

    // Определяем список кадров в зависимости от режима:
    // walk_static, walk_move: 5 кадров походки
    // fall_static: 15 кадров падения
    // walk_fall: 5 кадров походки + 15 кадров падения (20 кадров)
    let sequence = [];
    if (state.mode === 'fall_static') {
      for (let f = 1; f <= 15; f++) sequence.push({ action: 'fall', frame: f });
    } else if (state.mode === 'walk_fall') {
      for (let f = 1; f <= 5; f++) sequence.push({ action: 'walk', frame: f });
      for (let f = 1; f <= 15; f++) sequence.push({ action: 'fall', frame: f });
    } else {
      for (let f = 1; f <= 5; f++) sequence.push({ action: 'walk', frame: f });
    }

    const frameCanvases = [];
    for (const item of sequence) {
      offCtx.clearRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);

      // 1. Предмет в лапках (задний план)
      if (state.hand !== 'none') {
        const handImg = getCachedImage(`./assets/bunny/${item.action}/${item.action}-hand-${state.hand}-${item.frame}.png`);
        if (handImg.complete && handImg.naturalWidth > 0) offCtx.drawImage(handImg, 0, 0);
      }
      // 2. Базовое тело
      const baseImg = getCachedImage(`./assets/bunny/${item.action}/${item.action}-base-${state.base}-${item.frame}.png`);
      if (baseImg.complete && baseImg.naturalWidth > 0) offCtx.drawImage(baseImg, 0, 0);
      // 3. Головной убор
      if (state.hat !== 'none') {
        const hatNum = state.hat === 'hat1' ? '1' : '2';
        const hatImg = getCachedImage(`./assets/bunny/${item.action}/${item.action}-hat-${hatNum}-${item.frame}.png`);
        if (hatImg.complete && hatImg.naturalWidth > 0) offCtx.drawImage(hatImg, 0, 0);
      }
      // 4. Аксессуар (бантик)
      if (state.accessory === 'bowl') {
        const bowlImg = getCachedImage(`./assets/bunny/${item.action}/${item.action}-bowl-${item.frame}.png`);
        if (bowlImg.complete && bowlImg.naturalWidth > 0) offCtx.drawImage(bowlImg, 0, 0);
      }

      // Создаем копию кадра
      const copy = document.createElement('canvas');
      copy.width = SPRITE_WIDTH;
      copy.height = SPRITE_HEIGHT;
      copy.getContext('2d').drawImage(offCanvas, 0, 0);
      frameCanvases.push(copy);
    }

    return frameCanvases;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Экспорт в APNG
  async function exportAPNG() {
    const btnDropdown = document.getElementById('btn-export-dropdown');
    btnDropdown.classList.add('loading');
    btnDropdown.textContent = '⏳ Создание APNG...';

    try {
      const frames = renderCompositeFrames();
      const delayMs = Math.round(1000 / state.fps);

      // Получаем ArrayBuffer для каждого кадра через toBlob
      const pngBuffers = await Promise.all(
        frames.map(c => new Promise(resolve => {
          c.toBlob(blob => blob.arrayBuffer().then(resolve), 'image/png');
        }))
      );

      const apngBlob = assembleAPNGBlob(pngBuffers, delayMs);
      const filename = `unuasha-bunny-${state.mode}-${state.base}-${state.hat}-${state.hand}.png`;
      downloadBlob(apngBlob, filename);
      showToast('✨ APNG анимация успешно сохранена!');
    } catch (e) {
      console.error('[Export APNG] Ошибка:', e);
      showToast('❌ Ошибка создания APNG!');
    } finally {
      btnDropdown.classList.remove('loading');
      btnDropdown.textContent = '💾 Скачать ▾';
    }
  }

  // Экспорт в GIF
  async function exportGIF() {
    const btnDropdown = document.getElementById('btn-export-dropdown');
    btnDropdown.classList.add('loading');
    btnDropdown.textContent = '⏳ Создание GIF...';

    try {
      const { GIFEncoder, quantize, applyPalette } = await import('./assets/libs/gifenc.esm.js');
      const frames = renderCompositeFrames();
      const delayMs = Math.round(1000 / state.fps);
      const gif = GIFEncoder();

      for (const c of frames) {
        const ctx2 = c.getContext('2d');
        const { data, width, height } = ctx2.getImageData(0, 0, c.width, c.height);

        // Квантование в 256-цветовую палитру с поддержкой 1-bit прозрачности
        const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
        const index = applyPalette(data, palette);

        // Индекс прозрачного цвета
        const transparentIndex = palette.findIndex(color => color[3] === 0);

        gif.writeFrame(index, width, height, {
          palette,
          delay: delayMs,
          transparent: transparentIndex !== -1,
          transparentIndex: transparentIndex !== -1 ? transparentIndex : 0,
          dispose: 2 // Очистка кадра для сохранения прозрачности
        });
      }

      gif.finish();
      const gifBlob = new Blob([gif.bytes()], { type: 'image/gif' });
      const filename = `unuasha-bunny-${state.mode}-${state.base}-${state.hat}-${state.hand}.gif`;
      downloadBlob(gifBlob, filename);
      showToast('🎞️ GIF анимация успешно сохранена!');
    } catch (e) {
      console.error('[Export GIF] Ошибка:', e);
      showToast('❌ Ошибка создания GIF!');
    } finally {
      btnDropdown.classList.remove('loading');
      btnDropdown.textContent = '💾 Скачать ▾';
    }
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

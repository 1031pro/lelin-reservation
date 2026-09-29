(function () {
  var config = window.RESERVATION_CONFIG || {};
  var screens = Array.prototype.slice.call(document.querySelectorAll('[data-screen]'));
  var availabilityGrid = document.getElementById('availabilityGrid');
  var slotHeading = document.getElementById('slotHeading');
  var weekRange = document.getElementById('weekRange');
  var prevWeekButton = document.getElementById('prevWeekButton');
  var weekLoading = document.getElementById('weekLoading');
  var reservationForm = document.getElementById('reservationForm');
  var submitLoading = document.getElementById('submitLoading');
  var selectedDateTime = document.getElementById('selectedDateTime');
  var selectedMenuName = document.getElementById('selectedMenuName');
  var completeReservationId = document.getElementById('completeReservationId');
  var completeDateTime = document.getElementById('completeDateTime');
  var completeName = document.getElementById('completeName');
  var toast = document.getElementById('toast');
  var submitButton = document.querySelector('[form="reservationForm"]');
  var menuSection = document.getElementById('menuSection');
  var menuList = document.getElementById('menuList');
  var startButton = document.getElementById('startButton');

  var slotScreenIdleTimeoutMs = Number(config.SLOT_SCREEN_IDLE_TIMEOUT_MS) || 600000;

  var state = {
    weekOffset: 0,
    availability: null,
    selectedMenu: null,
    selectedSlot: null,
    toastTimer: null,
    slotIdleTimer: null,
    userId: '',
    accessToken: '',
    liffReady: false,
    savedName: '',
    pendingSubmissionId: '',
    pendingSubmissionFingerprint: ''
  };


  document.addEventListener('DOMContentLoaded', function () {
    var launch = window.reservationLaunch || {};
    if (isReservationManagementLaunch() || launch.manage || launch.authReturn) {
      initializeLaunchRouting();
      return;
    }
    startBookingScreen();
  });

  function initializeLaunchRouting() {
    loadLiffSdk(function () {
      if (typeof liff === 'undefined' || !config.LIFF_ID) { showLaunchError(); return; }
      liff.init({liffId:config.LIFF_ID}).then(function () {
        window.reservationLiffInitialized = true;
        if (isReservationManagementLaunch() || (window.reservationLaunch || {}).manage) {
          window.location.replace('reservations.html');
          return;
        }
        startBookingScreen();
        document.documentElement.style.visibility = '';
      }).catch(showLaunchError);
    }, showLaunchError);
  }

  function showLaunchError() {
    // Do not expose the booking form if management initialization failed.
    var main = document.querySelector('main');
    if (main) main.textContent = 'LINEの読み込みに失敗しました。画面を閉じて、LINEから開き直してください。';
    document.documentElement.style.visibility = '';
  }

  function startBookingScreen() {
    applyConfigText();
    setupMenuSelection();
    setupLiff();
    document.addEventListener('pointerdown', handleSlotScreenActivity, { passive: true });
    document.addEventListener('keydown', handleSlotScreenActivity);
    window.addEventListener('scroll', handleSlotScreenActivity, { passive: true });
  }

  function hasApiUrl() {
    return config.GAS_WEBAPP_URL && config.GAS_WEBAPP_URL.indexOf('__') !== 0;
  }

  function applyConfigText() {
    document.querySelectorAll('[data-config]').forEach(function (el) {
      var key = el.getAttribute('data-config');
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        el.textContent = config[key] || '';
      }
      if (key === 'RESERVATION_NOTICE' && !config[key]) {
        el.hidden = true;
      }
    });
  }

  function setupMenuSelection() {
    var menus = Array.isArray(config.MENUS) ? config.MENUS : [];
    var requestedMenuId = getLaunchParameter('menu_id');
    if (!config.MENU_SELECTION_ENABLED) {
      state.selectedMenu = menus[0] || {
        id: 'default',
        name: config.SERVICE_NAME || '予約',
        durationMinutes: 60,
        durationLabel: config.SERVICE_DURATION_LABEL || '60分',
        price: 0
      };
      menuSection.hidden = true;
      return;
    }

    menuSection.hidden = false;
    if (config.EXTENSION_SELECTION_ENABLED) {
      setupExtensionSelection(menus);
      return;
    }

    startButton.textContent = 'メニューを選んで空き時間を見る';
    startButton.disabled = true;
    menuList.innerHTML = '';
    menus.forEach(function (menu) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-card';
      button.innerHTML = '<strong>' + escapeHtml(menu.name) + '</strong>'
        + '<span>' + escapeHtml(menu.description || '') + '</span>'
        + '<small>' + escapeHtml(menu.durationLabel || (menu.durationMinutes + '分'))
        + (menu.price ? ' / ' + Number(menu.price).toLocaleString() + '円' : '') + '</small>';
      button.addEventListener('click', function () {
        state.selectedMenu = menu;
        document.querySelectorAll('.menu-card').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        button.classList.add('is-selected');
        startButton.disabled = false;
        startButton.textContent = 'このメニューで空き時間を見る';
        updateServiceSummary(menu);
      });
      menuList.appendChild(button);
      if (requestedMenuId && menu.id === requestedMenuId) button.click();
    });
  }

  function isReservationManagementLaunch() {
    return getLaunchParameter('mode') === 'manage';
  }

  function getLaunchParameter(name) {
    var direct = new URLSearchParams(window.location.search).get(name);
    if (direct) return direct;

    var liffState = new URLSearchParams(window.location.search).get('liff.state');
    if (!liffState) return '';
    try {
      var decoded = decodeURIComponent(liffState);
      var queryStart = decoded.indexOf('?');
      var query = queryStart >= 0 ? decoded.slice(queryStart + 1) : decoded.replace(/^\?/, '');
      return new URLSearchParams(query).get(name) || '';
    } catch (error) {
      return '';
    }
  }

  function setupExtensionSelection(menus) {
    if (!menus.length) {
      startButton.disabled = true;
      startButton.textContent = '予約メニューを確認してください';
      return;
    }

    var baseMenu = menus[0];
    state.selectedMenu = baseMenu;
    menuList.innerHTML = '<div class="extension-menu">'
      + '<div class="extension-menu__base">'
      + '<span>基本メニュー</span>'
      + '<strong>' + escapeHtml(baseMenu.name) + '</strong>'
      + '<small>' + escapeHtml(baseMenu.durationLabel || (baseMenu.durationMinutes + '分'))
      + (baseMenu.price ? ' / ' + Number(baseMenu.price).toLocaleString() + '円' : '') + '</small>'
      + '</div>'
      + '<label for="extensionSelect">延長時間</label>'
      + '<select id="extensionSelect" class="extension-menu__select"></select>'
      + '<p>延長は15分ごとに1,500円追加されます。</p>'
      + '</div>';

    var select = document.getElementById('extensionSelect');
    menus.forEach(function (menu, index) {
      var option = document.createElement('option');
      option.value = menu.id;
      var extensionMinutes = Math.max(0, Number(menu.durationMinutes) - Number(baseMenu.durationMinutes));
      var extensionLabel = index === 0 ? '延長なし' : '＋' + extensionMinutes + '分';
      option.textContent = extensionLabel + '（合計' + Number(menu.durationMinutes) + '分'
        + (menu.price ? '／' + Number(menu.price).toLocaleString() + '円' : '') + '）';
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      state.selectedMenu = menus.find(function (menu) {
        return menu.id === select.value;
      }) || baseMenu;
      updateServiceSummary(state.selectedMenu);
    });

    startButton.disabled = false;
    startButton.textContent = '空き時間を見る';
    updateServiceSummary(baseMenu);
  }

  function updateServiceSummary(menu) {
    var serviceName = document.querySelector('[data-config="SERVICE_NAME"]');
    var durationLabel = document.querySelector('[data-config="SERVICE_DURATION_LABEL"]');
    if (serviceName) serviceName.textContent = menu.name;
    if (durationLabel) durationLabel.textContent = menu.durationLabel || (menu.durationMinutes + '分');
  }

  function setupLiff() {
    if (!config.LIFF_ID) return;
    loadLiffSdk(function () {
      if (typeof liff === 'undefined') return;
      var initialized = window.reservationLiffInitialized
        ? Promise.resolve() : liff.init({ liffId: config.LIFF_ID });
      initialized.then(function () {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        state.accessToken = liff.getAccessToken() || '';
        return liff.getProfile().then(function (profile) {
          state.userId = profile.userId || '';
          state.liffReady = true;
          callApi({ action: 'customerName', access_token: state.accessToken }, function (err, data) {
            if (err || !data || !data.success) return;
            state.savedName = data.name || '';
            var nameInput = document.getElementById('guestName');
            if (nameInput && !nameInput.value.trim()) nameInput.value = state.savedName;
            var hint = document.getElementById('savedNameHint');
            if (hint && state.savedName) hint.textContent = '保存済みのお名前を表示しています。修正する場合は書き換えてください。';
          });
        });
      }).catch(function () {
        state.liffReady = false;
      });
    });
  }

  function loadLiffSdk(done, failed) {
    if (typeof liff !== 'undefined') {
      done();
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = done;
    script.onerror = failed || function () {};
    document.head.appendChild(script);
  }

  function showScreen(name) {
    screens.forEach(function (screen) {
      screen.classList.toggle('is-active', screen.dataset.screen === name);
    });
    if (name === 'slots') {
      restartSlotIdleTimer();
    } else {
      stopSlotIdleTimer();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isSlotScreenActive() {
    var slotScreen = document.querySelector('[data-screen="slots"]');
    return !!(slotScreen && slotScreen.classList.contains('is-active'));
  }

  function handleSlotScreenActivity() {
    if (isSlotScreenActive()) restartSlotIdleTimer();
  }

  function stopSlotIdleTimer() {
    window.clearTimeout(state.slotIdleTimer);
    state.slotIdleTimer = null;
  }

  function restartSlotIdleTimer() {
    stopSlotIdleTimer();
    state.slotIdleTimer = window.setTimeout(expireSlotScreen, slotScreenIdleTimeoutMs);
  }

  function expireSlotScreen() {
    if (!isSlotScreenActive()) return;
    state.availability = null;
    state.selectedSlot = null;
    state.weekOffset = 0;
    setWeekLoading(false);
    showScreen('home');
    showToast('空き状況を更新するため、メニュー選択画面に戻りました');
  }

  function callApi(params, callback, options) {
    if (!hasApiUrl()) {
      callback(new Error('予約システムの接続先が未設定です。'));
      return;
    }

    window.ReservationApiClient.request(
      config.GAS_WEBAPP_URL,
      params,
      callback,
      options
    );
  }

  function startAvailabilityLoad() {
    if (config.MENU_SELECTION_ENABLED && !state.selectedMenu) {
      showToast('メニューを選択してください');
      return;
    }
    showScreen('loading');
    state.weekOffset = 0;
    loadWeekFromApi(0, function (success) {
      showScreen(success ? 'slots' : 'home');
    });
  }

  function loadWeek(offset, done) {
    loadWeekFromApi(offset, done);
  }

  function loadWeekFromApi(offset, done) {
    setWeekLoading(true);
    setWeekButtonsDisabled(true);
    fetchAvailabilityWeek(offset, function (err, data) {
      setWeekLoading(false);
      setWeekButtonsDisabled(false);
      if (err || !data || data.error) {
        showToast(
          data && data.error
            ? data.error
            : '空き時間の取得に時間がかかっています。もう一度お試しください。'
        );
        if (done) done(false);
        return;
      }
      applyWeek(offset, data);
      if (done) done(true);
    });
  }

  function fetchAvailabilityWeek(offset, callback) {
    callApi({
      action: 'weekAvailability',
      week_offset: offset,
      menu_id: state.selectedMenu ? state.selectedMenu.id : ''
    }, callback, {
      timeoutMs: 15000,
      maxAttempts: 2,
      retryDelayMs: 500,
      retryOnErrorResponse: true
    });
  }

  function applyWeek(offset, data) {
    state.weekOffset = offset;
    state.availability = data;
    renderAvailability(data);
    setWeekButtonsDisabled(false);
  }

  function setWeekLoading(loading) {
    weekLoading.hidden = !loading;
    weekLoading.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function setWeekButtonsDisabled(disabled) {
    prevWeekButton.disabled = disabled || state.weekOffset === 0;
    document.getElementById('nextWeekButton').disabled =
      disabled || !!(state.availability && state.availability.canNext === false);
  }

  function switchWeek(direction) {
    var nextOffset = Math.max(0, state.weekOffset + direction);
    if (nextOffset === state.weekOffset && direction < 0) return;
    loadWeek(nextOffset);
  }

  function renderAvailability(data) {
    availabilityGrid.innerHTML = '';
    slotHeading.textContent = data.startLabel + '〜' + data.endLabel + ' の空き状況';
    weekRange.textContent = data.startLabel + '〜' + data.endLabel;
    prevWeekButton.disabled = state.weekOffset === 0;

    var topLeft = document.createElement('div');
    topLeft.className = 'availability-cell is-head';
    topLeft.textContent = '時間';
    availabilityGrid.appendChild(topLeft);

    data.dates.forEach(function (dateItem) {
      var dayCell = document.createElement('div');
      dayCell.className = 'availability-cell is-head';
      dayCell.innerHTML = '<span>' + escapeHtml(dateItem.label) + '</span><small>' + escapeHtml(dateItem.weekday) + '</small>';
      availabilityGrid.appendChild(dayCell);
    });

    data.rows.forEach(function (row) {
      // 表示上限のみ。営業時間・施術後の清掃を含む予約可否は変更しない。
      if (row.time > '18:30') return;
      var timeCell = document.createElement('div');
      timeCell.className = 'availability-cell is-time';
      timeCell.textContent = row.time;
      availabilityGrid.appendChild(timeCell);

      row.cells.forEach(function (slot) {
        var cell = document.createElement('div');
        cell.className = 'availability-cell';
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'availability-button ' + (slot.available ? 'is-open' : 'is-booked');
        button.textContent = slot.available ? '○' : '×';
        button.setAttribute('aria-label', slot.displayDate + ' ' + slot.time + (slot.available ? ' を選択' : ' 予約不可'));
        if (slot.available) {
          button.addEventListener('click', function () {
            selectSlot(slot);
          });
        } else {
          button.disabled = true;
        }
        cell.appendChild(button);
        availabilityGrid.appendChild(cell);
      });
    });
  }

  function selectSlot(slot) {
    state.selectedSlot = slot;
    selectedDateTime.textContent = window.ReservationTime.formatDateTimeRange(
      slot.displayDate,
      slot.time,
      state.selectedMenu ? state.selectedMenu.durationMinutes : 60
    );
    selectedMenuName.textContent = state.selectedMenu ? state.selectedMenu.name : '';
    showScreen('form');
  }

  function submitForm(event) {
    event.preventDefault();
    if (!state.selectedSlot) {
      showToast('日時を選択してください');
      showScreen('slots');
      return;
    }
    if (!reservationForm.checkValidity()) {
      showToast('必須項目を入力してください');
      reservationForm.reportValidity();
      return;
    }
    if (!state.liffReady || !state.accessToken) {
      showToast('LINEでの本人確認が完了していません。画面を開き直してください');
      return;
    }

    var submittedName = document.getElementById('guestName').value.trim();
    var fingerprint = [state.selectedSlot.date, state.selectedSlot.time,
      state.selectedMenu && state.selectedMenu.id, submittedName].join('|');
    if (state.pendingSubmissionFingerprint !== fingerprint) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      state.pendingSubmissionId = Array.prototype.map.call(bytes, function (byte) {
        return ('0' + byte.toString(16)).slice(-2);
      }).join('');
      state.pendingSubmissionFingerprint = fingerprint;
    }

    var params = {
      action: 'submitReservation',
      date: state.selectedSlot.date,
      time: state.selectedSlot.time,
      name: submittedName,
      submission_id: state.pendingSubmissionId,
      access_token: state.accessToken,
      menu_id: state.selectedMenu ? state.selectedMenu.id : '',
      menu_name: state.selectedMenu ? state.selectedMenu.name : (config.SERVICE_NAME || ''),
      duration_minutes: state.selectedMenu ? state.selectedMenu.durationMinutes : 60
    };

    submitLoading.classList.add('is-visible');
    submitButton.disabled = true;
    callApi(params, function (err, data) {
      submitLoading.classList.remove('is-visible');
      submitButton.disabled = false;
      if (err || !data || !data.success) {
        showToast(data && (data.message || data.error)
          ? (data.message || data.error)
          : err && err.message
            ? err.message
            : '予約結果を確認できませんでした。お店へお問い合わせください。');
        return;
      }
      state.savedName = params.name;
      showComplete(data, params);
    });
  }

  function showComplete(data, params) {
    var slot = state.selectedSlot || {};
    completeReservationId.textContent = data.reservationId || '-';
    completeDateTime.textContent = window.ReservationTime.formatDateTimeRange(
      data.displayDate || slot.displayDate || '',
      data.time || slot.time || '',
      params.duration_minutes || 60
    );
    completeName.textContent = params.name || document.getElementById('guestName').value.trim();
    showScreen('complete');
  }

  function resetForm() {
    reservationForm.reset();
    document.getElementById('guestName').value = state.savedName;
    state.selectedSlot = null;
    state.pendingSubmissionId = '';
    state.pendingSubmissionFingerprint = '';
    if (config.MENU_SELECTION_ENABLED) {
      applyConfigText();
      if (config.EXTENSION_SELECTION_ENABLED) {
        var extensionSelect = document.getElementById('extensionSelect');
        if (extensionSelect) extensionSelect.selectedIndex = 0;
        state.selectedMenu = (config.MENUS || [])[0] || null;
        startButton.disabled = !state.selectedMenu;
        startButton.textContent = '空き時間を見る';
        if (state.selectedMenu) updateServiceSummary(state.selectedMenu);
      } else {
        state.selectedMenu = null;
        document.querySelectorAll('.menu-card').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        startButton.disabled = true;
        startButton.textContent = 'メニューを選んで空き時間を見る';
      }
    }
    selectedDateTime.textContent = '未選択';
    selectedMenuName.textContent = '';
    completeReservationId.textContent = '-';
    completeDateTime.textContent = '未選択';
    completeName.textContent = '未入力';
  }

  function closeWindow() {
    if (typeof liff !== 'undefined' && liff.isInClient()) {
      liff.closeWindow();
    } else {
      window.close();
    }
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  document.addEventListener('click', function (event) {
    var actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    var action = actionTarget.dataset.action;
    if (action === 'start') startAvailabilityLoad();
    if (action === 'home') showScreen('home');
    if (action === 'backToSlots') showScreen('slots');
    if (action === 'prevWeek') switchWeek(-1);
    if (action === 'nextWeek') switchWeek(1);
    if (action === 'close') closeWindow();
    if (action === 'restart') {
      resetForm();
      showScreen('home');
    }
  });

  reservationForm.addEventListener('submit', submitForm);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
})();

(function () {
  var config = window.RESERVATION_CONFIG || {};
  var loginView = document.getElementById('loginView');
  var dashboard = document.getElementById('dashboard');
  var loader = document.getElementById('loader');
  var reservationRows = document.getElementById('reservationRows');
  var adminKeyInput = document.getElementById('adminKey');
  var loginError = document.getElementById('loginError');

  var state = {
    key: '',
    reservations: [],
    pendingCancellation: null,
    cancelling: false
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-config]').forEach(function (el) {
      var key = el.getAttribute('data-config');
      if (config[key]) el.textContent = config[key];
    });

    document.getElementById('loginButton').addEventListener('click', login);
    document.getElementById('refreshButton').addEventListener('click', loadAll);
    document.getElementById('registerNotificationButton').addEventListener('click', registerNotification);
    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('statusFilter').addEventListener('change', renderReservations);
    document.getElementById('dateFilter').addEventListener('change', renderReservations);
    document.getElementById('searchInput').addEventListener('input', renderReservations);
    document.getElementById('confirmCancelButton').addEventListener('click', executeCancellation);
    document.getElementById('dismissCancelButton').addEventListener('click', function () {
      state.pendingCancellation = null;
      document.getElementById('cancelConfirmation').style.display = 'none';
    });
    var saved = sessionStorage.getItem(config.ADMIN_SESSION_KEY || 'reservationAdminKey');
    if (saved) {
      adminKeyInput.value = saved;
      login();
    }
  });

  function hasApiUrl() {
    return config.GAS_WEBAPP_URL && config.GAS_WEBAPP_URL.indexOf('__') !== 0;
  }

  function login() {
    var key = adminKeyInput.value.trim();
    if (!key) return;
    state.key = key;
    showLoader(true);
    callApi({ action: 'adminList', key: key }, function (err, data) {
      showLoader(false);
      if (err || !data || data.error) {
        loginError.textContent = data && data.error ? data.error : '通信エラーが発生しました';
        loginError.style.display = 'block';
        return;
      }
      sessionStorage.setItem(config.ADMIN_SESSION_KEY || 'reservationAdminKey', key);
      loginError.style.display = 'none';
      loginView.style.display = 'none';
      dashboard.style.display = 'block';
      state.reservations = data.reservations || [];
      renderReservations();
    });
  }

  function logout() {
    sessionStorage.removeItem(config.ADMIN_SESSION_KEY || 'reservationAdminKey');
    location.reload();
  }

  function loadAll(afterLoad) {
    showLoader(true);
    callApi({ action: 'adminList', key: state.key }, function (err, data) {
      showLoader(false);
      if (err || !data || data.error) {
        if (typeof afterLoad === 'function') afterLoad(false);
        else setOperationMessage(data && data.error ? data.error : '一覧を取得できませんでした。更新して再度ご確認ください。');
        return;
      }
      state.reservations = data.reservations || [];
      renderReservations();
      if (typeof afterLoad === 'function') afterLoad(true);
    });
  }

  function renderReservations() {
    var status = document.getElementById('statusFilter').value;
    var date = document.getElementById('dateFilter').value;
    var query = document.getElementById('searchInput').value.trim().toLowerCase();

    var rows = state.reservations.filter(function (item) {
      if (status === 'active' && item.status === 'キャンセル') return false;
      if (status === 'cancelled' && item.status !== 'キャンセル') return false;
      if (date && item.date !== date) return false;
      if (query) {
        var haystack = [item.reservationId, item.name, item.menuName].join(' ').toLowerCase();
        if (haystack.indexOf(query) < 0) return false;
      }
      return true;
    });

    if (!rows.length) {
      reservationRows.innerHTML = '<tr><td class="empty" colspan="7">該当する予約はありません</td></tr>';
      return;
    }

    reservationRows.innerHTML = rows.map(function (item) {
      var cancelled = item.status === 'キャンセル';
      return '<tr>'
        + '<td>' + escapeHtml(item.reservationId) + '</td>'
        + '<td>' + escapeHtml(item.date) + '</td>'
        + '<td>' + escapeHtml(item.time) + '</td>'
        + '<td>' + escapeHtml(item.menuName || '-') + '<br><small>' + escapeHtml(item.durationMinutes || '') + '分</small></td>'
        + '<td>' + escapeHtml(item.name) + '</td>'
        + '<td><span class="status ' + (cancelled ? 'cancelled' : '') + '">' + escapeHtml(item.status || '-') + '</span></td>'
        + '<td>' + (cancelled ? '-' : '<button class="danger" type="button" data-cancel="' + escapeHtml(item.reservationId) + '" data-cancel-name="' + escapeAttr(item.name || '') + '">キャンセル</button>') + '</td>'
        + '</tr>';
    }).join('');

    reservationRows.querySelectorAll('[data-cancel]').forEach(function (button) {
      button.addEventListener('click', function () {
        cancelReservation(
          button.getAttribute('data-cancel'),
          button.getAttribute('data-cancel-name')
        );
      });
    });
  }

  function cancelReservation(reservationId, reservationName) {
    if (state.cancelling) return;
    state.pendingCancellation = reservationId;
    document.getElementById('cancelConfirmationText').textContent = reservationName + '（' + reservationId + '）をキャンセルしますか？';
    document.getElementById('cancelConfirmation').style.display = 'block';
    document.getElementById('confirmCancelButton').focus();
  }

  function registerNotification() {
    if (!state.key || !config.LIFF_ID) {
      setOperationMessage('LINE通知の設定を確認してください。');
      return;
    }
    function run() {
      window.liff.init({ liffId: config.LIFF_ID }).then(function () {
        if (!window.liff.isLoggedIn()) {
          window.liff.login({ redirectUri: window.location.href });
          return;
        }
        var accessToken = window.liff.getAccessToken();
        if (!accessToken) throw new Error('LINE認証を確認できませんでした。');
        showLoader(true);
        callApi({ action: 'adminRegisterNotification', key: state.key,
          access_token: accessToken }, function (err, data) {
          showLoader(false);
          setOperationMessage(err ? err.message : data && data.success
            ? 'このLINEアカウントを予約通知先へ登録しました。'
            : data && (data.error || data.message) || '通知先を登録できませんでした。');
        });
      }).catch(function (error) {
        setOperationMessage(error.message || 'LINE認証を確認できませんでした。');
      });
    }
    if (window.liff) { run(); return; }
    var script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = run;
    script.onerror = function () { setOperationMessage('LINEの読み込みに失敗しました。'); };
    document.head.appendChild(script);
  }

  function setOperationMessage(message) {
    document.getElementById('operationMessage').textContent = message;
  }

  function executeCancellation() {
    if (state.cancelling || !state.pendingCancellation) return;
    var reservationId = state.pendingCancellation;
    state.pendingCancellation = null;
    state.cancelling = true;
    document.getElementById('cancelConfirmation').style.display = 'none';
    setOperationMessage('取消処理中です。');
    showLoader(true);
    callApi({
      action: 'adminCancel',
      key: state.key,
      reservation_id: reservationId
    }, function (err, data) {
      showLoader(false);
      if (err || !data || data.error) {
        var detail = data && data.error ? data.error : (err && err.message ? err.message : '取消結果を確認できませんでした。');
        setOperationMessage(detail + ' 保存された状態を確認しています。');
        loadAll(function (loaded) {
          state.cancelling = false;
          var item = state.reservations.find(function (row) { return row.reservationId === reservationId; });
          if (loaded && item && item.status === 'キャンセル') {
            setOperationMessage('予約番号 ' + reservationId + '：キャンセル済みであることを一覧で確認しました。通知の送信結果は未確認です。');
          } else {
            setOperationMessage(detail + (loaded && item
              ? ' 一覧の現在の状態：' + item.status + '。キャンセル完了は確認できていません。'
              : ' 保存された取消結果を確認できませんでした。時間をおいて一覧を更新してください。'));
          }
        });
        return;
      }
      state.cancelling = false;
      if (data.lineNotificationSent) {
        setOperationMessage('キャンセルしました。お客様へLINE通知を送信しました。');
      } else if (data.lineNotificationAvailable) {
        setOperationMessage('キャンセルしましたが、LINE通知の送信に失敗しました。お客様への連絡をご確認ください。');
      } else {
        setOperationMessage('キャンセルしました。LINE通知先がない予約のため、お客様への連絡をご確認ください。');
      }
      loadAll();
    });
  }

  function callApi(params, callback) {
    if (!hasApiUrl()) {
      callback(new Error('予約システムの接続先が未設定です。'));
      return;
    }
    window.ReservationApiClient.request(
      config.GAS_WEBAPP_URL,
      params,
      callback,
      {
        timeoutMs: 15000,
        maxAttempts: params.action === 'adminList' ? 2 : 1,
        retryDelayMs: 500,
        retryOnErrorResponse: false
      }
    );
  }

  function showLoader(show) {
    loader.style.display = show ? 'grid' : 'none';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }
})();

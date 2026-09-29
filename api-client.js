(function (global) {
  'use strict';

  function request(baseUrl, params, callback, options) {
    var settings = options || {};
    var timeoutMs = Math.max(1000, parseInt(settings.timeoutMs || '15000', 10));
    var maxAttempts = Math.max(1, parseInt(settings.maxAttempts || '1', 10));
    var retryDelayMs = Math.max(0, parseInt(settings.retryDelayMs || '500', 10));
    var retryOnErrorResponse = settings.retryOnErrorResponse === true;
    var attempt = 0;
    var requestStartedAt = Date.now();

    function runAttempt() {
      attempt += 1;
      requestOnce(baseUrl, params, timeoutMs, function (err, data, requestId) {
        var shouldRetry = attempt < maxAttempts && (
          !!err || !!(retryOnErrorResponse && data && data.error)
        );

        if (shouldRetry) {
          console.warn('[reservation-api] retry', {
            action: params.action || '',
            attempt: attempt,
            reason: err ? err.message : String(data.error || '')
          });
          global.setTimeout(runAttempt, retryDelayMs);
          return;
        }

        callback(err, data, {
          attempts: attempt,
          requestId: requestId,
          durationMs: Date.now() - requestStartedAt
        });
      });
    }

    runAttempt();
  }

  function requestOnce(baseUrl, params, timeoutMs, callback) {
    var controller = new AbortController();
    var completed = false;
    var timer = null;

    function communicationError(code) {
      var message = code === 'timeout' ? '通信がタイムアウトしました。' : '通信エラーが発生しました。';
      var error = new Error(message + '処理結果は未確認です。お店へお問い合わせください。（' + code + '）');
      error.code = code;
      return error;
    }

    function finish(err, data) {
      if (completed) return;
      completed = true;
      if (timer !== null) global.clearTimeout(timer);
      callback(err, data, body.get('request_id'));
    }

    var body = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      body.set(key, String(params[key] == null ? '' : params[key]));
    });

    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    body.set('request_id', Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join(''));
    timer = global.setTimeout(function () {
      controller.abort();
      finish(communicationError('timeout'));
    }, timeoutMs);
    // Simple CORS POST: credentials are in the body, never in the request URL.
    global.fetch(baseUrl, {
      method: 'POST', body: body, credentials: 'omit', redirect: 'follow',
      referrerPolicy: 'no-referrer', signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw communicationError('http_' + response.status);
      return response.json().catch(function () { throw communicationError('invalid_json'); });
    }).then(function (data) {
      finish(null, data);
    }).catch(function (error) {
      finish(error && error.code ? error : communicationError('network'));
    });
  }

  global.ReservationApiClient = {
    request: request
  };
})(window);

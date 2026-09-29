(function (global) {
  'use strict';

  function addMinutes(time, durationMinutes) {
    var parts = String(time || '').split(':');
    if (parts.length !== 2) return String(time || '');

    var hours = Number(parts[0]);
    var minutes = Number(parts[1]);
    var duration = Number(durationMinutes);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(duration)) {
      return String(time || '');
    }

    var totalMinutes = hours * 60 + minutes + duration;
    var endHours = Math.floor(totalMinutes / 60) % 24;
    var endMinutes = totalMinutes % 60;
    return String(endHours).padStart(2, '0') + ':' + String(endMinutes).padStart(2, '0');
  }

  function formatTimeRange(startTime, durationMinutes) {
    return String(startTime || '') + '〜' + addMinutes(startTime, durationMinutes);
  }

  function formatDateTimeRange(displayDate, startTime, durationMinutes) {
    return String(displayDate || '') + ' ' + formatTimeRange(startTime, durationMinutes);
  }

  global.ReservationTime = {
    addMinutes: addMinutes,
    formatTimeRange: formatTimeRange,
    formatDateTimeRange: formatDateTimeRange
  };
})(window);

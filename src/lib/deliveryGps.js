// A denied/unavailable fix must not fabricate a pickup or delivery location.
export function captureDeliveryGps(geolocation = globalThis.navigator?.geolocation) {
  if (!geolocation) return Promise.resolve({ gps_reason: 'unavailable' });
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ gps_reason: 'timeout' }), 5500);
    const finish = value => { clearTimeout(timer); resolve(value); };
    try {
      geolocation.getCurrentPosition(({ coords, timestamp }) => {
        const { latitude, longitude } = coords || {};
        const age = Date.now() - timestamp;
        finish(Number.isFinite(latitude) && Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
          Number.isFinite(age) && age >= -5000 && age <= 120000 &&
          Number.isFinite(coords.accuracy) && coords.accuracy >= 0 && coords.accuracy <= 100
          ? { latitude, longitude, gps_timestamp: timestamp, gps_accuracy: coords.accuracy }
          : { gps_reason: 'stale_or_inaccurate_fix' });
      }, error => finish({ gps_reason: error?.code === 1 ? 'permission_denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
    } catch { finish({ gps_reason: 'unavailable' }); }
  });
}

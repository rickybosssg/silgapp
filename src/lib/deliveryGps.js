// A denied/unavailable fix must not fabricate a pickup or delivery location.
export function captureDeliveryGps(geolocation = globalThis.navigator?.geolocation) {
  if (!geolocation) return Promise.resolve({});
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({}), 5500);
    const finish = value => { clearTimeout(timer); resolve(value); };
    try {
      geolocation.getCurrentPosition(({ coords }) => {
        const { latitude, longitude } = coords || {};
        finish(Number.isFinite(latitude) && Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
          ? { latitude, longitude } : {});
      }, () => finish({}), { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    } catch { finish({}); }
  });
}

export function validatedDeliveryGps(latitude: unknown, longitude: unknown) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// A heartbeat is not a location timestamp. Only use an actual, recent GPS fix.
export function resolveDeliveryGps(body: any, driver: any, now = Date.now()) {
  const fresh = (value: any, timestamp: any, accuracy: any) => {
    const time = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    return value && Number.isFinite(time) && now - time >= -5000 && now - time <= 120000 &&
      typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100;
  };
  if (body?.gps_reason === 'permission_denied') return { gps: null, reason: 'permission_denied' };
  const direct = validatedDeliveryGps(body?.latitude, body?.longitude);
  if (fresh(direct, body?.gps_timestamp, body?.gps_accuracy)) return { gps: direct, reason: 'device_fix' };
  const stored = validatedDeliveryGps(driver?.latitude, driver?.longitude);
  if (fresh(stored, driver?.derniere_position_date, driver?.gps_accuracy)) return { gps: stored, reason: 'recent_driver_fix' };
  return { gps: null, reason: body?.gps_reason || 'missing_stale_or_inaccurate_fix' };
}

const ACTIONS = new Set(['config', 'catalog', 'track', 'create', 'cancel', 'retry_dispatch', 'consent', 'admin_list', 'set_enabled', 'revoke']);
const ENTITIES = new Set(['GuestOrderRegistry', 'GuestOrderControl', 'Country', 'Quartier', 'CourseExterne', 'SystemConfig', 'AppConfig', 'Livreur', 'CourseSearchActivity', 'DispatchNotification']);
const METHODS = new Set(['filter', 'get', 'list', 'create', 'update', 'updateMany', 'delete', 'bulkCreate']);
const CODES = new Set(['VALIDATION_ERROR', 'INVALID_QUERY', 'INVALID_FILTER', 'INVALID_ID', 'BAD_REQUEST', 'SCHEMA_VALIDATION_ERROR', 'PERMISSION_DENIED', 'UNAUTHORIZED', 'NOT_FOUND', 'RATE_LIMITED', 'RATE_LIMIT_EXCEEDED', 'ECONNRESET', 'ETIMEDOUT', 'ERR_NETWORK', 'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE']);

export function guestDiagnostic() {
  let action = 'unparsed';
  const failures = new WeakMap();
  const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
  const bind = (target, key) => typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  function entities(source) {
    return new Proxy({}, { get(_target, name) {
      const entity = source[name];
      if (!object(entity) || typeof name !== 'string') return entity;
      return new Proxy({}, { get(_entity, method) {
        if (!METHODS.has(method) || typeof entity[method] !== 'function') return bind(entity, method);
        return async (...args) => {
          try { return await entity[method](...args); }
          catch (error) {
            if (object(error)) failures.set(error, `entity.${ENTITIES.has(name) ? name : 'other'}.${method}`);
            throw error;
          }
        };
      } });
    } });
  }
  return {
    setAction(value) { action = ACTIONS.has(value) ? value : 'unknown'; },
    /** @param {any} api @returns {any} */
    wrap(api) {
      const service = api.asServiceRole;
      const wrappedEntities = entities(service.entities);
      const wrappedService = new Proxy({}, { get(_target, key) { return key === 'entities' ? wrappedEntities : bind(service, key); } });
      return new Proxy({}, { get(_target, key) { return key === 'asServiceRole' ? wrappedService : bind(api, key); } });
    },
    fields(error) {
      const codes = [error?.response?.data?.code, error?.response?.data?.error_code, error?.code];
      return { diagnostic_version: 'guest-diag-v1', action,
        stage: object(error) && failures.has(error) ? failures.get(error) : `action.${action}`,
        technical_code: codes.find(code => CODES.has(code)) || 'UNCLASSIFIED' };
    },
  };
}

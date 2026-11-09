import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { COMMERCE_CLIENT_MIGRATION_ENABLED, clientCommercePollingInterval, clientCommerceQueryKey, flattenClientCommercePages, loadCommerceClientContext, readClientCommercePage } from '@/lib/commerceClientMigration';

export function useClientCommerceProfile(enabled = true, requireCountry = true) {
  const [state, setState] = useState({ context: null, error: null, isLoading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    if (!enabled) { setState({ context: null, error: null, isLoading: false }); return; }
    setState({ context: null, error: null, isLoading: true });
    loadCommerceClientContext(base44, COMMERCE_CLIENT_MIGRATION_ENABLED, requireCountry).then(context => {
      if (current) setState({ context, error: null, isLoading: false });
    }).catch(error => {
      if (current) setState({ context: null, error, isLoading: false });
    });
    return () => { current = false; };
  }, [attempt, enabled, requireCountry]);
  return { ...state, profile: state.context?.profile, retry: () => setAttempt(value => value + 1) };
}
/** @param {any} context @param {string} type @param {string} action @param {any} [parentId] @param {boolean} [enabled] @param {{ pollInterval?: number | false, legacyPollInterval?: number | false }} [options] */
export function useClientCommercePage(context, type, action, parentId = undefined, enabled = true, { pollInterval = false, legacyPollInterval = false } = {}) {
  const secure = COMMERCE_CLIENT_MIGRATION_ENABLED;
  const query = useInfiniteQuery({
    queryKey: clientCommerceQueryKey(context, { type, action, parentId, secure }),
    queryFn: ({ pageParam }) => readClientCommercePage(base44, context, { type, action, parentId, offset: pageParam, secure }),
    initialPageParam: 0,
    getNextPageParam: page => page.hasMore ? page.nextOffset : undefined,
    enabled: !!context?.profile?.id && enabled,
    retry: false,
    refetchInterval: secure ? (pollInterval ? query => clientCommercePollingInterval(query, pollInterval) : false) : legacyPollInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: secure ? false : true,
  });
  return { ...query, rows: secure && query.isError ? [] : flattenClientCommercePages(query.data) };
}

import { useCallback, useEffect, useState } from 'react';
import { emptyArcData, loadArcData } from '../api/repository';
import { hasSupabaseEnv } from '../lib/supabase';
import type { ArcData } from '../types';

export function useArcData(enabled: boolean) {
  const [data, setData] = useState<ArcData>(emptyArcData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !hasSupabaseEnv) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadArcData();
      setData(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : '資料載入失敗';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

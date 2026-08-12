import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "./api";

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await apiRequest<T>(path));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This view could not load.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => void reload(), [reload]);
  return { data, error, loading, reload, setData };
}

import { useCallback, useEffect, useState } from 'react';

type State<T> = { key: string; data?: T; error?: string };

export function useJson<T>(url: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State<T> | null>(null);
  const key = `${url}#${attempt}`;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json() as Promise<T>;
      })
      .then((data) => setState({ key, data }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setState((previous) => ({ key, data: previous?.data, error: error.message }));
        }
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const settled = state?.key === key;

  return {
    data: url ? state?.data : undefined,
    error: url && settled ? state.error : undefined,
    loading: url !== null && !settled,
    retry,
  };
}

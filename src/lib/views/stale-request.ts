export type StaleRequestTracker = {
  begin: () => number;
  isLatest: (token: number) => boolean;
};

export function createStaleRequestTracker(): StaleRequestTracker {
  let latestToken = 0;

  return {
    begin: () => {
      latestToken += 1;
      return latestToken;
    },
    isLatest: (token) => token === latestToken,
  };
}

export async function runGuardedRequest<T>(params: {
  id: string;
  tracker: StaleRequestTracker;
  onStart: () => void;
  request: () => Promise<T>;
  onSuccess: (result: T) => void;
  onError: (error: unknown) => void;
  onFinally: () => void;
}): Promise<void> {
  const token = params.tracker.begin();
  params.onStart();

  try {
    const result = await params.request();
    if (!params.tracker.isLatest(token)) return;
    params.onSuccess(result);
  } catch (error) {
    if (!params.tracker.isLatest(token)) return;
    params.onError(error);
  } finally {
    if (!params.tracker.isLatest(token)) return;
    params.onFinally();
  }
}


export const hasGoogleOAuth = (status) => status?.features?.googleOAuth === true;

export const fetchGoogleOAuthAvailability = async (
  statusUrl,
  { fetchImpl = globalThis.fetch, signal } = {}
) => {
  if (typeof fetchImpl !== 'function') return false;

  try {
    const response = await fetchImpl(statusUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal
    });

    if (!response.ok) return false;
    return hasGoogleOAuth(await response.json());
  } catch {
    return false;
  }
};

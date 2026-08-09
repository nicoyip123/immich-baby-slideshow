const FAMILY_LINK_FRAGMENT = /^#family=([a-f0-9]{64})$/;

export function takeFamilyLinkToken(
  location: Pick<Location, "hash" | "pathname" | "search"> = window.location,
  history: Pick<History, "state" | "replaceState"> = window.history
): string | undefined {
  const hash = location.hash;
  if (!hash) return undefined;

  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return FAMILY_LINK_FRAGMENT.exec(hash)?.[1];
}

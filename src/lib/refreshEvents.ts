export const PUBLIC_DATA_REFRESH_EVENT = 'rt:refresh-public-data';

export function requestPublicDataRefresh() {
  window.dispatchEvent(new Event(PUBLIC_DATA_REFRESH_EVENT));
}

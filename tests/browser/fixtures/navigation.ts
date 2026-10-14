// Standalone component harnesses have no Next router; each stays on one fixture URL.
export function usePathname() {
  return window.location.pathname;
}

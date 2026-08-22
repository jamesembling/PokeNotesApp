export function shouldLoadSidebarProfile(input: { isDesktop: boolean; openMobile: boolean }) {
  return input.isDesktop || input.openMobile;
}

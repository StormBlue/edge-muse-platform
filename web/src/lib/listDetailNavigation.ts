import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from "vue-router";

export function listDetailEntryState(route: RouteLocationNormalizedLoaded) {
  return { listReturnPath: route.query.session ? null : route.fullPath };
}

export async function returnToList(
  router: Router,
  route: RouteLocationNormalizedLoaded,
  query: LocationQueryRaw,
  replace = false
) {
  const returnPath = router.options.history.state.listReturnPath;
  if (!replace && typeof returnPath === "string") {
    const target = router.resolve(returnPath);
    if (target.path === route.path && !target.query.session) {
      router.back();
      return;
    }
  }
  await router.replace({ path: route.path, query, state: { listReturnPath: null } });
}

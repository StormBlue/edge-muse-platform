// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "./Profile.vue";
import Security from "./Security.vue";

const mocks = vi.hoisted(() => ({ updateProfile: vi.fn(), apiFetch: vi.fn() }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { nickname: "Alice" }, updateProfile: mocks.updateProfile })
}));
vi.mock("@/api/client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

async function render(page: "profile" | "security") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/settings/profile", component: Profile },
      { path: "/settings/security", component: Security }
    ]
  });
  await router.push(`/settings/${page}`);
  await router.isReady();
  const wrapper = mount(page === "profile" ? Profile : Security, {
    global: { plugins: [router], stubs: { AppShell: { template: "<main><slot /></main>" } } }
  });
  return { wrapper, router };
}

beforeEach(() => vi.resetAllMocks());

describe("settings", () => {
  it("exposes both settings routes with the current page indicated", async () => {
    const { wrapper, router } = await render("profile");
    expect(wrapper.get('a[aria-current="page"]').attributes("href")).toBe("/settings/profile");
    await wrapper.get('a[href="/settings/security"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings/security");
    expect(wrapper.get('label[for="settings-nickname"]').text()).toBe("auth.nickname");
    expect(wrapper.get("input").attributes("maxlength")).toBe("40");
  });

  it("prevents duplicate saves, displays server errors, and allows retry", async () => {
    let rejectSave!: (reason: unknown) => void;
    mocks.updateProfile.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectSave = reject;
      })
    );
    const { wrapper } = await render("profile");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    rejectSave({ error: { message: "Please retry" } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Please retry");
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeUndefined();
    mocks.updateProfile.mockResolvedValueOnce(undefined);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe("settings.saved");
  });

  it("keeps passwords on failure and clears them only after a successful change", async () => {
    const { wrapper } = await render("security");
    const oldPassword = wrapper.get<HTMLInputElement>("#settings-old-password");
    const newPassword = wrapper.get<HTMLInputElement>("#settings-new-password");
    expect(oldPassword.attributes("autocomplete")).toBe("current-password");
    expect(newPassword.attributes("minlength")).toBe("8");
    await oldPassword.setValue("old-password");
    await newPassword.setValue("short");
    await wrapper.get("form").trigger("submit");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await newPassword.setValue("new-password");
    mocks.apiFetch.mockRejectedValueOnce(new TypeError("Network failed"));
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("common.failed");
    expect(newPassword.element.value).toBe("new-password");
    mocks.apiFetch.mockResolvedValueOnce(undefined);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.apiFetch).toHaveBeenLastCalledWith("/auth/password/change", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "old-password", newPassword: "new-password" })
    });
    expect(oldPassword.element.value).toBe("");
    expect(newPassword.element.value).toBe("");
    expect(wrapper.get('[role="status"]').text()).toBe("settings.passwordChanged");
  });
});

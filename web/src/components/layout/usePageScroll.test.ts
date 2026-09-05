// @vitest-environment happy-dom
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageScroll } from "./usePageScroll";

const mocks = vi.hoisted(() => ({ route: null as unknown as { fullPath: string } }));
vi.mock("vue-router", () => ({ useRoute: () => mocks.route }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "scroll-user" } }) }));

const wrappers: VueWrapper[] = [];
const observers: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
let routeNumber = 0;

function setup(height = 1200) {
  const element = document.createElement("div");
  element.append(document.createElement("main"));
  let contentHeight = height;
  let top = 0;
  Object.defineProperties(element, {
    clientHeight: { get: () => 200 },
    scrollHeight: { get: () => contentHeight },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, contentHeight - 200));
      }
    }
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        usePageScroll(ref(element));
        return () => h("div");
      }
    })
  );
  wrappers.push(wrapper);
  const observer = observers.at(-1)!;
  return {
    element,
    wrapper,
    observer,
    resize(height: number) {
      contentHeight = height;
      observer.callback();
    }
  };
}

function savePosition(position: number) {
  const page = setup();
  page.element.scrollTop = position;
  page.wrapper.unmount();
}

beforeEach(() => {
  mocks.route = reactive({ fullPath: `/scroll-test-${++routeNumber}` });
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      callback: () => void;
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: () => void) {
        this.callback = callback;
        observers.push(this);
      }
    }
  );
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe("page scroll restoration", () => {
  it("waits for asynchronous content height before completing restoration", () => {
    savePosition(600);
    const page = setup(100);
    expect(page.element.scrollTop).toBe(0);
    page.resize(400);
    expect(page.element.scrollTop).toBe(200);
    page.resize(1200);
    expect(page.element.scrollTop).toBe(600);
    page.element.scrollTop = 300;
    page.resize(1400);
    expect(page.element.scrollTop).toBe(300);
  });

  it("preserves a pending position when leaving before content finishes loading", () => {
    savePosition(600);
    const pending = setup(100);
    pending.wrapper.unmount();
    expect(pending.observer.disconnect).toHaveBeenCalledOnce();
    const restored = setup();
    expect(restored.element.scrollTop).toBe(600);
  });

  it("saves separate positions across same-shell path changes", async () => {
    const firstPath = mocks.route.fullPath;
    const page = setup();
    page.element.scrollTop = 450;
    mocks.route.fullPath = `${firstPath}?page=2`;
    await nextTick();
    await nextTick();
    expect(page.element.scrollTop).toBe(0);
    page.element.scrollTop = 200;
    mocks.route.fullPath = firstPath;
    await nextTick();
    await nextTick();
    expect(page.element.scrollTop).toBe(450);
  });

  it.each(["wheel", "touchstart", "pointerdown"])("lets %s cancel pending restoration", (type) => {
    savePosition(600);
    const page = setup(300);
    page.element.dispatchEvent(new Event(type));
    page.element.scrollTop = 30;
    page.resize(1200);
    expect(page.element.scrollTop).toBe(30);
  });

  it("lets keyboard scrolling cancel pending restoration", () => {
    savePosition(600);
    const page = setup(300);
    page.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    page.element.scrollTop = 0;
    page.resize(1200);
    expect(page.element.scrollTop).toBe(0);
  });
});

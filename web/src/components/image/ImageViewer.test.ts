// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImageViewer from "./ImageViewer.vue";
import type { ImageAttachment } from "@/stores/session";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn() }
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImageViewer", () => {
  it("renders the image directly before measurements are available", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        disconnect() {}
      }
    );

    const wrapper = mount(ImageViewer, {
      attachTo: document.body,
      props: {
        image: image({ width: null, height: null }),
        images: []
      }
    });
    await nextTick();

    const viewerImage = document.body.querySelector<HTMLImageElement>(".viewer-image");
    expect(viewerImage?.getAttribute("src")).toBe("/image.png");
    expect(viewerImage?.getAttribute("style")).toContain("scale(1)");
    wrapper.unmount();
  });

  it("zooms around the mouse position when using the wheel", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if ((this as HTMLElement).classList.contains("viewer-stage")) {
        return rect({ width: 1000, height: 500 });
      }
      if ((this as HTMLElement).classList.contains("viewer-image")) {
        return rect({ width: 1000, height: 500 });
      }
      return rect({ width: 0, height: 0 });
    });

    const wrapper = mount(ImageViewer, {
      attachTo: document.body,
      props: {
        image: image({ width: 1000, height: 500 }),
        images: []
      }
    });
    await nextTick();
    await nextTick();

    const stage = document.body.querySelector<HTMLElement>(".viewer-stage");
    expect(stage).toBeTruthy();
    stage?.dispatchEvent(wheelEvent({ clientX: 250, clientY: 250, deltaY: -100 }));
    await nextTick();

    const style = document.body.querySelector<HTMLElement>(".viewer-image")?.getAttribute("style");
    expect(style).toContain("translate3d(12.5px, 0px, 0)");
    expect(style).toContain("scale(1.05)");
    wrapper.unmount();
  });
});

function image(overrides: Partial<ImageAttachment> = {}): ImageAttachment {
  return {
    id: "image-1",
    url: "/image.png",
    mime: "image/png",
    width: 1000,
    height: 500,
    byteSize: 100,
    ...overrides
  };
}

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: overrides.top ?? 0,
    height: 0,
    left: 0,
    right: overrides.left ?? 0,
    top: 0,
    width: 0,
    x: overrides.left ?? 0,
    y: overrides.top ?? 0,
    toJSON: () => ({}),
    ...overrides
  };
}

function wheelEvent(input: { clientX: number; clientY: number; deltaY: number }) {
  const event = new Event("wheel", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    deltaY: { value: input.deltaY }
  });
  return event;
}

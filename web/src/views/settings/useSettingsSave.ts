import { ref } from "vue";
import { useI18n } from "vue-i18n";

export function useSettingsSave() {
  const { t } = useI18n();
  const saving = ref(false);
  const error = ref("");
  const success = ref("");

  async function save(action: () => Promise<unknown>, successKey: string) {
    if (saving.value) return;
    saving.value = true;
    error.value = "";
    success.value = "";
    try {
      await action();
      success.value = t(successKey);
    } catch (cause) {
      const body = cause as { error?: { message?: unknown } } | null;
      error.value =
        typeof body?.error?.message === "string" ? body.error.message : t("common.failed");
    } finally {
      saving.value = false;
    }
  }

  return { saving, error, success, save };
}

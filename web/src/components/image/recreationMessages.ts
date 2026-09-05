export const recreationMessages = {
  "zh-CN": {
    recreate: {
      params: "沿用参数",
      reference: "作为参考图",
      adjusted: "原任务的部分参数不适用于当前生成能力，已调整，请确认后生成。",
      removed: "移除参考图",
      elapsed: "已等待 {seconds} 秒",
      loaded: "已载入原任务参数",
      cancelled: "排队任务已取消",
      missingReferences: "原任务还缺少 {count} 张参考图，请补图或确认使用当前参考图继续。",
      confirmReferences: "确认使用当前参考图"
    }
  },
  en: {
    recreate: {
      params: "Reuse parameters",
      reference: "Use as reference",
      adjusted:
        "Some original settings are unavailable with the current capabilities. Review the adjusted settings before generating.",
      removed: "Remove reference",
      elapsed: "Elapsed: {seconds}s",
      loaded: "Original task settings loaded",
      cancelled: "Queued task cancelled",
      missingReferences:
        "The original task is missing {count} reference image(s). Add replacements or confirm the current references.",
      confirmReferences: "Confirm current references"
    }
  }
};

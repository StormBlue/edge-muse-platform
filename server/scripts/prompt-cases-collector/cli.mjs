function intArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function limitBySource(items, max) {
  const zh = items.filter((item) => item.locale === "zh-CN");
  const en = items.filter((item) => item.locale === "en-US");
  const selected = [];
  const seen = new Set();
  for (const item of zh) {
    if (selected.length >= max) break;
    selected.push(item);
    seen.add(item.id);
    const enId = item.id.replace(/_zh$/, "_en");
    const enMatch = en.find((candidate) => candidate.id === enId);
    if (enMatch && selected.length < max) {
      selected.push(enMatch);
      seen.add(enMatch.id);
    }
  }
  for (const item of en) {
    if (selected.length >= max) break;
    if (seen.has(item.id)) continue;
    selected.push(item);
  }
  return selected;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

export { formatDate, intArg, limitBySource, parseArgs };

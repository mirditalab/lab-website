const MONTH_MAP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const PAGE_SIZE = 5;
let allEntries = [];
let visibleCount = PAGE_SIZE;
let publicationList = null;
let showMoreButton = null;

async function loadPublications() {
  publicationList = document.getElementById("publication-list");
  showMoreButton = document.getElementById("show-more-pubs");
  if (!publicationList) return;
  try {
    const response = await fetch("static/zotero.bib");
    const text = await response.text();
    const entries = parseBibEntries(text);
    allEntries = entries;
    visibleCount = Math.min(PAGE_SIZE, allEntries.length);
    renderVisibleEntries();
    initShowMoreButton();
  } catch (error) {
    console.error("Failed to load publications", error);
    publicationList.innerHTML = "<li>Unable to load publications.</li>";
    if (showMoreButton) showMoreButton.hidden = true;
  }
}

function renderVisibleEntries() {
  if (!publicationList) return;
  const visibleEntries = allEntries.slice(0, visibleCount);
  renderPublications(visibleEntries, publicationList);
  updateShowMoreState();
}

function initShowMoreButton() {
  if (!showMoreButton) return;
  if (showMoreButton.dataset.bound === "true") {
    updateShowMoreState();
    return;
  }
  showMoreButton.dataset.bound = "true";
  showMoreButton.addEventListener("click", () => {
    visibleCount = Math.min(visibleCount + PAGE_SIZE, allEntries.length);
    renderVisibleEntries();
  });
  updateShowMoreState();
}

function updateShowMoreState() {
  if (!showMoreButton) return;
  const shouldHide = visibleCount >= allEntries.length || !allEntries.length;
  showMoreButton.hidden = shouldHide;
}

function renderPublications(entries, list) {
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = "<li>No publications found.</li>";
    updateShowMoreState();
    return;
  }

  list.innerHTML = entries
    .map((entry, index) => createPublicationMarkup(entry, index))
    .join("");
  bindCopyButtons(entries, list);
}

function createPublicationMarkup(entry, index) {
  const copyButton = `<button type="button" class="copy-bibtex" data-entry-index="${index}" aria-label="Copy BibTeX" title="Copy BibTeX">&#10697;</button>`;
  const doiMarkup = entry.doi
    ? ` · <a href="https://doi.org/${entry.doi}" target="_blank" rel="noopener">DOI</a> ${copyButton}`
    : ` · ${copyButton}`;

  const titleLink = entry.url || (entry.doi ? `https://doi.org/${entry.doi}` : "");
  const titleMarkup = titleLink
    ? `<a href="${titleLink}" target="_blank" rel="noopener">${entry.title}</a>`
    : entry.title;

  const authorTitle = entry.fullAuthors ? ` title="${escapeHtml(entry.fullAuthors.join(", "))}"` : "";

  return `
    <li>
      <p class="pub-title">
        ${titleMarkup}
      </p>
      <p class="pub-meta">
        <span class="pub-authors"${authorTitle}>${entry.authors}</span>. ${entry.journal || entry.type} (${entry.displayDate})
        ${doiMarkup}
      </p>
    </li>
  `;
}

function bindCopyButtons(entries, container) {
  const buttons = container.querySelectorAll(".copy-bibtex");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.entryIndex);
      const entry = entries[index];
      if (!entry) return;
      const success = await copyTextToClipboard(entry.bibtex);
      showCopyFeedback(button, success);
    });
  });
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.error("Clipboard write failed", error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (error) {
    console.error("Legacy clipboard copy failed", error);
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
}

function showCopyFeedback(button, success) {
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = success ? "Copied!" : "Copy failed";
  button.disabled = true;
  setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1500);
}

function parseBibEntries(text) {
  if (!text) return [];
  const rawEntries = text
    .split(/(?=@\w+)/g)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const entries = rawEntries
    .map((entryText) => {
      const normalizedEntry = entryText.startsWith("@") ? entryText : `@${entryText}`;
      const typeMatch = normalizedEntry.match(/^@(\w+)/);
      const type = typeMatch ? typeMatch[1] : "Article";
      const fields = extractFields(normalizedEntry);
      const year = parseInt(fields.year, 10) || 0;
      const month = monthToNumber(fields.month);
      const authorList = parseAuthorList(fields.author);

      return {
        type,
        title: cleanupText(fields.title || "Untitled"),
        authors: formatAuthors(authorList),
        journal: cleanupText(fields.journal || ""),
        year,
        month,
        displayDate: buildDisplayDate(year),
        url: cleanupUri(fields.url),
        doi: cleanupUri(fields.doi),
        bibtex: normalizedEntry.trim(),
        fullAuthors: authorList,
      };
    })
    .filter((entry) => entry.year);

  return entries.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return (b.month || 0) - (a.month || 0);
  });
}

function extractFields(entryText) {
  const start = entryText.indexOf("{");
  if (start === -1) return {};

  const fields = {};
  let i = start + 1;

  while (i < entryText.length) {
    const char = entryText[i];
    if (char === "}") break;
    if (char === "," || /\s/.test(char)) {
      i++;
      continue;
    }

    const keyStart = i;
    while (i < entryText.length && /[\w-]/.test(entryText[i])) {
      i++;
    }
    const key = entryText.slice(keyStart, i).toLowerCase();
    if (!key) {
      i++;
      continue;
    }

    while (i < entryText.length && /\s/.test(entryText[i])) {
      i++;
    }
    if (entryText[i] !== "=") {
      while (i < entryText.length && !/[,\n}]/.test(entryText[i])) {
        i++;
      }
      continue;
    }
    i++;

    while (i < entryText.length && /\s/.test(entryText[i])) {
      i++;
    }

    const { value, nextIndex } = readFieldValue(entryText, i);
    fields[key] = value.replace(/\s+/g, " ").trim();
    i = nextIndex;
  }

  return fields;
}

function readFieldValue(text, startIndex) {
  let i = startIndex;
  let value = "";

  if (text[i] === "{") {
    let depth = 0;
    i++;
    while (i < text.length) {
      const char = text[i];
      if (char === "{") {
        depth++;
        value += char;
      } else if (char === "}") {
        if (depth === 0) break;
        depth--;
        value += char;
      } else {
        value += char;
      }
      i++;
    }
    return { value: value.trim(), nextIndex: Math.min(i + 1, text.length) };
  }

  if (text[i] === '"') {
    i++;
    while (i < text.length) {
      const char = text[i];
      if (char === '"') break;
      if (char === "\\" && i + 1 < text.length) {
        value += text[i + 1];
        i += 2;
        continue;
      }
      value += char;
      i++;
    }
    return { value: value.trim(), nextIndex: Math.min(i + 1, text.length) };
  }

  while (i < text.length && !/[,\n}]/.test(text[i])) {
    value += text[i];
    i++;
  }
  return { value: value.trim(), nextIndex: i };
}

function monthToNumber(value) {
  const key = normalizeMonthKey(value);
  if (!key) return 0;
  if (MONTH_MAP[key]) return MONTH_MAP[key];
  const numeric = parseInt(key, 10);
  return Number.isNaN(numeric) ? 0 : Math.min(Math.max(numeric, 1), 12);
}

function buildDisplayDate(year) {
  return year ? String(year) : "";
}

function normalizeMonthKey(value) {
  if (!value) return "";
  return value.replace(/[{}"]/g, "").trim().toLowerCase();
}

function cleanupText(value = "") {
  if (!value) return "";
  return value.replace(/\s+/g, " ").replace(/[{}]/g, "").trim();
}

function cleanupUri(value = "") {
  if (!value) return "";
  return value.replace(/[{}]/g, "").trim();
}

function parseAuthorList(value = "") {
  const authors = value ? value.replace(/\s+/g, " ").trim() : "";
  if (!authors) return [];
  return authors
    .split(/\s+and\s+/i)
    .map((author) => reorderAuthorName(cleanupText(author)))
    .filter(Boolean);
}

function formatAuthors(authors = []) {
  if (!authors.length) return "Unknown author";
  if (authors.length > 10) return `${authors[0]} et al`;
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  const leading = authors.slice(0, -1).join(", ");
  const last = authors[authors.length - 1];
  return `${leading}, and ${last}`;
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function reorderAuthorName(name = "") {
  if (!name) return "";
  if (!name.includes(",")) return name;
  const [last, ...rest] = name.split(",");
  const first = rest.join(",").trim();
  const lastName = last.trim();
  const reordered = [first, lastName].filter(Boolean).join(" ");
  return reordered.replace(/\s+/g, " ").trim();
}

function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

onReady(() => {
  loadPublications();
});

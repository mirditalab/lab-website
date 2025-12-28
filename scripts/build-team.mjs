#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEAM_DIR = path.join(ROOT_DIR, "team");
const TEMPLATE_PATH = path.join(ROOT_DIR, "index.template.html");
const OUTPUT_PATH = path.join(ROOT_DIR, "index.html");
const BIB_PATH = path.join(ROOT_DIR, "static", "zotero.bib");
const STATIC_TEAM_DIR = path.join(ROOT_DIR, "static", "team");
const AVATAR_SIZE = 336;
const GRID_START = "<!-- team:grid:start -->";
const GRID_END = "<!-- team:grid:end -->";
const DETAILS_START = "<!-- team:details:start -->";
const DETAILS_END = "<!-- team:details:end -->";
const ALUMNI_SECTION_START = "<!-- alumni:section:start -->";
const ALUMNI_SECTION_END = "<!-- alumni:section:end -->";
const ALUMNI_GRID_START = "<!-- alumni:grid:start -->";
const ALUMNI_GRID_END = "<!-- alumni:grid:end -->";
const ALUMNI_DETAILS_START = "<!-- alumni:details:start -->";
const ALUMNI_DETAILS_END = "<!-- alumni:details:end -->";
const PUBS_LIST_START = "<!-- pubs:list:start -->";
const PUBS_LIST_END = "<!-- pubs:list:end -->";
const PUBS_DATA_START = "<!-- pubs:data:start -->";
const PUBS_DATA_END = "<!-- pubs:data:end -->";
const GRID_INDENT = "            ";
const DETAIL_INDENT = `${GRID_INDENT}      `;
const DETAIL_INNER_INDENT = `${GRID_INDENT}        `;
const PUB_LIST_INDENT = "            ";
const PUB_INNER_INDENT = "              ";
const PUB_DEEP_INDENT = "                ";
const PUB_DATA_INDENT = "          ";
const PLACEHOLDER_COUNT = 1;
const PLACEHOLDER_LABEL = "You?";
const PLACEHOLDER_ROLE = "Join us";
const PLACEHOLDER_LINK = "mailto:milot@mirdita.org";
const PUB_PAGE_SIZE = 5;
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

function stripInlineComment(line) {
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuotes = false;
      }
    }
    if (char === "#" && !inQuotes) {
      return line.slice(0, i);
    }
  }
  return line;
}

function splitFrontMatter(raw) {
  const lines = raw.split(/\r?\n/);
  const delimiter = lines[0]?.trim();
  if (delimiter !== "+++" && delimiter !== "---") {
    return { frontMatter: "", body: raw.trim(), delimiter: null };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === delimiter) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return { frontMatter: "", body: raw.trim(), delimiter: null };
  }
  return {
    frontMatter: lines.slice(1, endIndex).join("\n"),
    body: lines.slice(endIndex + 1).join("\n").trim(),
    delimiter,
  };
}

function splitOnCommaOutsideQuotes(text) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if ((char === '"' || char === "'") && (i === 0 || text[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuotes = false;
      }
    }
    if (char === "," && !inQuotes) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function splitOnColonOutsideQuotes(text) {
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if ((char === "\"" || char === "'") && (i === 0 || text[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuotes = false;
      }
    }
    if (char === ":" && !inQuotes) {
      return [text.slice(0, i), text.slice(i + 1)];
    }
  }
  return [text, ""];
}

function parseInlineTable(raw) {
  const inner = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  const entries = splitOnCommaOutsideQuotes(inner);
  const result = {};
  entries.forEach((entry) => {
    const match = entry.match(/^([^=]+?)=(.+)$/);
    if (!match) return;
    const key = match[1].trim();
    const value = parseValue(match[2].trim());
    result[key] = value;
  });
  return result;
}

function parseInlineArray(raw) {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  const tableMatches = Array.from(inner.matchAll(/\{[^}]*\}/g));
  if (tableMatches.length) {
    return tableMatches.map((match) => parseInlineTable(match[0]));
  }
  return splitOnCommaOutsideQuotes(inner).map((value) => parseValue(value));
}

function parseValue(raw) {
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (/^(true|false)$/i.test(raw)) {
    return raw.toLowerCase() === "true";
  }
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return parseInlineArray(raw);
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return parseInlineTable(raw);
  }
  return raw;
}

function ensureNestedArray(target, pathParts) {
  let node = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const part = pathParts[i];
    if (!node[part] || typeof node[part] !== "object") {
      node[part] = {};
    }
    node = node[part];
  }
  const last = pathParts[pathParts.length - 1];
  if (!Array.isArray(node[last])) {
    node[last] = [];
  }
  const entry = {};
  node[last].push(entry);
  return entry;
}

function parseTomlFrontMatter(text) {
  const result = {};
  let currentTable = null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cleaned = stripInlineComment(line).trim();
    if (!cleaned) continue;
    const tableMatch = cleaned.match(/^\[\[(.+)]]$/);
    if (tableMatch) {
      const pathParts = tableMatch[1].trim().split(".").filter(Boolean);
      currentTable = ensureNestedArray(result, pathParts);
      continue;
    }
    const match = cleaned.match(/^([^=]+?)=(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = parseValue(match[2].trim());
    if (currentTable) {
      currentTable[key] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parseYamlValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseInlineArray(trimmed);
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseInlineTable(trimmed);
  }
  return parseValue(trimmed);
}

function parseInlineYamlObject(text) {
  const [left, right] = splitOnColonOutsideQuotes(text);
  if (!right) return null;
  const key = left.trim();
  if (!key) return null;
  return { [key]: parseYamlValue(right) };
}

function parseYamlFrontMatter(text) {
  const root = {};
  const lines = text.split(/\r?\n/);
  const stack = [{ indent: -1, value: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const cleanedLine = stripInlineComment(lines[index]);
    if (!cleanedLine.trim()) continue;
    const indent = cleanedLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = cleanedLine.trim();

    while (indent <= stack[stack.length - 1].indent && stack.length > 1) {
      stack.pop();
    }

    const current = stack[stack.length - 1];
    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(current.value)) continue;
      const itemText = trimmed.slice(2).trim();
      if (!itemText) {
        const item = {};
        current.value.push(item);
        stack.push({ indent, value: item });
        continue;
      }
      const inlineObject = parseInlineYamlObject(itemText);
      if (inlineObject) {
        current.value.push(inlineObject);
        stack.push({ indent, value: inlineObject });
        continue;
      }
      current.value.push(parseYamlValue(itemText));
      continue;
    }

    const [left, right] = splitOnColonOutsideQuotes(trimmed);
    const key = left.trim();
    if (!key) continue;
    if (right.trim()) {
      current.value[key] = parseYamlValue(right);
      continue;
    }

    let nextLine = "";
    for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
      const candidate = stripInlineComment(lines[lookahead]);
      if (candidate.trim()) {
        nextLine = candidate;
        break;
      }
    }

    const nextTrimmed = nextLine.trim();
    if (nextTrimmed.startsWith("- ")) {
      const arr = [];
      current.value[key] = arr;
      stack.push({ indent, value: arr });
    } else {
      const obj = {};
      current.value[key] = obj;
      stack.push({ indent, value: obj });
    }
  }

  return root;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getImageMagickCommand() {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return "magick";
  } catch {
    try {
      execFileSync("convert", ["-version"], { stdio: "ignore" });
      return "convert";
    } catch {
      return null;
    }
  }
}

function buildAvatar(command, inputPath, outputPath, isJpeg) {
  const args = [
    inputPath,
    "-resize",
    `${AVATAR_SIZE}x${AVATAR_SIZE}^`,
    "-gravity",
    "center",
    "-extent",
    `${AVATAR_SIZE}x${AVATAR_SIZE}`,
    "-strip",
  ];

  if (isJpeg) {
    args.push("-interlace", "Plane", "-quality", "85");
  }

  args.push(outputPath);
  execFileSync(command, args, { stdio: "ignore" });
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

  if (text[i] === "\"") {
    i++;
    while (i < text.length) {
      const char = text[i];
      if (char === "\"") break;
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

function reorderAuthorName(name = "") {
  if (!name) return "";
  if (!name.includes(",")) return name;
  const [last, ...rest] = name.split(",");
  const first = rest.join(",").trim();
  const lastName = last.trim();
  const reordered = [first, lastName].filter(Boolean).join(" ");
  return reordered.replace(/\s+/g, " ").trim();
}

function serializeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderPublicationMarkup(entry, index) {
  const copyButton =
    `<button type="button" class="copy-bibtex" data-entry-index="${index}" aria-label="Copy BibTeX" title="Copy BibTeX">&#10697;</button>`;
  const doiMarkup = entry.doi
    ? ` · <a href="https://doi.org/${escapeHtml(entry.doi)}" target="_blank" rel="noopener">DOI</a> ${copyButton}`
    : ` · ${copyButton}`;

  const titleLink = entry.url || (entry.doi ? `https://doi.org/${entry.doi}` : "");
  const titleMarkup = titleLink
    ? `<a href="${escapeHtml(titleLink)}" target="_blank" rel="noopener">${escapeHtml(entry.title)}</a>`
    : escapeHtml(entry.title);

  const authorTitle = entry.fullAuthors?.length
    ? ` title="${escapeHtml(entry.fullAuthors.join(", "))}"`
    : "";

  return (
    `${PUB_LIST_INDENT}<li>` +
    `\n${PUB_INNER_INDENT}<p class="pub-title">` +
    `\n${PUB_DEEP_INDENT}${titleMarkup}` +
    `\n${PUB_INNER_INDENT}</p>` +
    `\n${PUB_INNER_INDENT}<p class="pub-meta">` +
    `\n${PUB_DEEP_INDENT}<span class="pub-authors"${authorTitle}>${escapeHtml(entry.authors)}</span>. ${escapeHtml(entry.journal || entry.type)} (${escapeHtml(entry.displayDate)})` +
    `\n${PUB_DEEP_INDENT}${doiMarkup}` +
    `\n${PUB_INNER_INDENT}</p>` +
    `\n${PUB_LIST_INDENT}</li>`
  );
}

function renderPublicationList(entries) {
  if (!entries.length) {
    return `${PUB_LIST_INDENT}<li>No publications found.</li>`;
  }
  return entries.map(renderPublicationMarkup).join("\n");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function initialsFor(name) {
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function buildIconClass(icon, pack) {
  if (!icon) return "";
  if (pack === "ai") {
    return `ai ai-${icon}`;
  }
  const safePack = pack || "fas";
  return `${safePack} fa-${icon}`;
}

function buildLabel(icon, alt) {
  if (alt) return alt;
  if (!icon) return "Profile link";
  return icon
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMemberFile(memberDir) {
  const entries = await fs.readdir(memberDir);
  const preferred = [
    "profile.md",
    "profile.toml",
    "profile.yaml",
    "profile.yml",
    "index.md",
    "index.toml",
    "index.yaml",
    "index.yml",
  ];
  for (const name of preferred) {
    if (entries.includes(name)) {
      return path.join(memberDir, name);
    }
  }
  const fallback = entries.find((name) => /\.(md|toml|yaml|yml)$/.test(name));
  return fallback ? path.join(memberDir, fallback) : null;
}

async function findAvatar(memberDir) {
  const candidates = ["avatar.jpg", "avatar.png", "avatar.jpeg"];
  for (const name of candidates) {
    const fullPath = path.join(memberDir, name);
    if (await exists(fullPath)) {
      return {
        path: fullPath,
        ext: path.extname(fullPath).toLowerCase(),
      };
    }
  }
  return null;
}

async function buildTeamAvatars(members) {
  const avatars = members.filter((member) => member.avatarInfo);
  if (!avatars.length) return;

  const command = getImageMagickCommand();
  if (!command) {
    throw new Error("ImageMagick (magick/convert) is required to build team avatars.");
  }

  await fs.mkdir(STATIC_TEAM_DIR, { recursive: true });

  avatars.forEach((member) => {
    const avatarInfo = member.avatarInfo;
    if (!avatarInfo) return;
    const outputPath = path.join(STATIC_TEAM_DIR, `${member.slug}${avatarInfo.ext}`);
    const isJpeg = avatarInfo.ext === ".jpg" || avatarInfo.ext === ".jpeg";
    buildAvatar(command, avatarInfo.path, outputPath, isJpeg);
  });
}

function renderOrganizations(organizations) {
  if (!Array.isArray(organizations) || !organizations.length) {
    return "";
  }
  const orgs = organizations
    .map((org) => {
      if (!org || !org.name) return "";
      const name = escapeHtml(org.name);
      if (org.url) {
        return `${DETAIL_INNER_INDENT}<a href="${escapeHtml(org.url)}" target="_blank" rel="noopener">${name}</a>`;
      }
      return `${DETAIL_INNER_INDENT}<span>${name}</span>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!orgs) return "";
  return `\n${DETAIL_INDENT}<div class="team-orgs">\n${orgs}\n${DETAIL_INDENT}</div>`;
}

function renderSocialLinks(social) {
  if (!Array.isArray(social) || !social.length) {
    return "";
  }
  const links = social
    .map((item) => {
      if (!item || !item.link || !item.icon) return "";
      const iconClass = buildIconClass(item.icon, item.icon_pack);
      if (!iconClass) return "";
      const label = escapeHtml(buildLabel(item.icon, item.alt));
      const href = escapeHtml(item.link);
      return `${DETAIL_INNER_INDENT}<a href="${href}" aria-label="${label}" target="_blank" rel="noopener">` +
        `<i class="${iconClass} big-icon"></i></a>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!links) return "";
  return `\n${DETAIL_INDENT}<div class="pi-links">\n${links}\n${DETAIL_INDENT}</div>`;
}

function renderEducation(courses) {
  if (!Array.isArray(courses) || !courses.length) return "";
  const items = courses
    .map((course) => {
      if (!course || !course.course) return "";
      const title = escapeHtml(course.course);
      const institution = course.institution ? escapeHtml(course.institution) : "";
      const year = course.year ? escapeHtml(course.year) : "";
      return (
        `${DETAIL_INNER_INDENT}<li>` +
        `\n${DETAIL_INNER_INDENT}  <span class="team-education-course">${title}</span>` +
        (institution
          ? `\n${DETAIL_INNER_INDENT}  <span class="team-education-institution">${institution}</span>`
          : "") +
        (year
          ? `\n${DETAIL_INNER_INDENT}  <span class="team-education-year">${year}</span>`
          : "") +
        `\n${DETAIL_INNER_INDENT}</li>`
      );
    })
    .filter(Boolean)
    .join("\n");
  if (!items) return "";
  return `\n${DETAIL_INDENT}<div class="team-education">` +
    `\n${DETAIL_INNER_INDENT}<h3>Education</h3>` +
    `\n${DETAIL_INNER_INDENT}<ul class="team-education-list">` +
    `\n${items}` +
    `\n${DETAIL_INNER_INDENT}</ul>` +
    `\n${DETAIL_INDENT}</div>`;
}

function renderMemberCard(member) {
  const avatar = member.avatarSrc
    ? `<img src="${escapeHtml(member.avatarSrc)}" alt="${escapeHtml(member.name)}" loading="lazy" />`
    : `<span class="team-avatar-initials">${escapeHtml(member.initials)}</span>`;
  return (
    `${GRID_INDENT}<div class="team-card" role="button" tabindex="0" data-team-target="${member.detailId}" aria-controls="${member.detailId}" aria-expanded="false" aria-label="View ${escapeHtml(member.name)} details">` +
    `\n${GRID_INDENT}  <span class="team-avatar">${avatar}</span>` +
    `\n${GRID_INDENT}  <span class="team-name">${escapeHtml(member.name)}</span>` +
    `\n${GRID_INDENT}  <span class="team-title">${escapeHtml(member.role || "")}</span>` +
    `\n${GRID_INDENT}</div>`
  );
}

function renderPlaceholderCard(index) {
  const label = escapeHtml(PLACEHOLDER_LABEL);
  const role = escapeHtml(PLACEHOLDER_ROLE);
  const ariaLabel = `Join the team (${index + 1})`;
  return (
    `${GRID_INDENT}<a class="team-card placeholder" href="${escapeHtml(PLACEHOLDER_LINK)}" aria-label="${escapeHtml(ariaLabel)}">` +
    `\n${GRID_INDENT}  <span class="team-avatar placeholder" aria-hidden="true">+</span>` +
    `\n${GRID_INDENT}  <span class="team-name">${label}</span>` +
    `\n${GRID_INDENT}  <span class="team-title">${role}</span>` +
    `\n${GRID_INDENT}</a>`
  );
}

function renderMemberDetail(member) {
  const avatar = member.avatarSrc
    ? `<img src="${escapeHtml(member.avatarSrc)}" alt="${escapeHtml(member.name)}" loading="lazy" />`
    : `<span class="team-avatar-initials">${escapeHtml(member.initials)}</span>`;
  const organizationsMarkup = renderOrganizations(member.organizations);
  const socialMarkup = renderSocialLinks(member.social);
  const educationMarkup = renderEducation(member.educationCourses);
  const bodyMarkup = member.bioHtml || "";
  const detailNameId = `team-detail-name-${member.slug}`;
  return (
    `${GRID_INDENT}<article id="${member.detailId}" class="team-detail" aria-hidden="true" aria-labelledby="${detailNameId}" hidden>` +
    `\n${GRID_INDENT}  <div class="pi-layout team-detail-layout">` +
    `\n${GRID_INDENT}    <div class="pi-summary">` +
    `\n${GRID_INDENT}      <div class="pi-avatar">${avatar}</div>` +
    `\n${GRID_INDENT}      <p id="${detailNameId}" class="pi-name">${escapeHtml(member.name)}</p>` +
    `${organizationsMarkup}` +
    `${socialMarkup}` +
    `\n${GRID_INDENT}    </div>` +
    `\n${GRID_INDENT}    <div class="pi-copy">` +
    (bodyMarkup ? `\n${GRID_INDENT}      <div class="team-bio">\n${bodyMarkup}\n${GRID_INDENT}      </div>` : "") +
    `${educationMarkup}` +
    `\n${GRID_INDENT}    </div>` +
    `\n${GRID_INDENT}  </div>` +
    `\n${GRID_INDENT}</article>`
  );
}

function replaceBetweenMarkers(source, startMarker, endMarker, replacement) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing markers ${startMarker} / ${endMarker} in ${TEMPLATE_PATH}`);
  }
  const startLineIndex = source.lastIndexOf("\n", startIndex);
  const startIndent = startLineIndex === -1 ? "" : source.slice(startLineIndex + 1, startIndex);
  const endLineIndex = source.lastIndexOf("\n", endIndex);
  const endIndent = endLineIndex === -1 ? "" : source.slice(endLineIndex + 1, endIndex);
  const indent = endIndent || startIndent;
  const before = source.slice(0, startIndex + startMarker.length);
  const after = source.slice(endIndex);
  return `${before}\n${replacement}\n${indent}${after}`;
}

function removeBetweenMarkers(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return source;
  }
  const before = source.slice(0, startIndex);
  const after = source.slice(endIndex + endMarker.length);
  if (before.endsWith("\n") && after.startsWith("\n")) {
    return `${before}${after.slice(1)}`;
  }
  return `${before}${after}`;
}

async function loadMembers() {
  let entries = [];
  try {
    entries = await fs.readdir(TEAM_DIR, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read team directory: ${TEAM_DIR}`);
    throw error;
  }

  const members = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const memberDir = path.join(TEAM_DIR, entry.name);
    const memberFile = await findMemberFile(memberDir);
    if (!memberFile) {
      console.warn(`No profile file found in ${memberDir}`);
      continue;
    }
    const raw = await fs.readFile(memberFile, "utf8");
    const { frontMatter, body, delimiter } = splitFrontMatter(raw);
    if (!frontMatter) {
      console.warn(`No front matter in ${memberFile}`);
      continue;
    }
    const data =
      delimiter === "---" ? parseYamlFrontMatter(frontMatter) : parseTomlFrontMatter(frontMatter);
    const name = data.name || entry.name;
    const slug = slugify(entry.name);
    const avatarInfo = await findAvatar(memberDir);
    const avatarSrc = avatarInfo ? `static/team/${slug}${avatarInfo.ext}` : "";
    const bioHtml = body
      ? body
      : data.bio
        ? `<p>${escapeHtml(data.bio)}</p>`
        : "";

    members.push({
      slug,
      detailId: `team-detail-${slug}`,
      name,
      role: data.role || "",
      isAlumni: Boolean(data.alumni),
      organizations: data.organizations || [],
      educationCourses: data.education?.courses || [],
      social: data.social || [],
      avatarInfo,
      avatarSrc,
      initials: initialsFor(name),
      bioHtml,
    });
  }

  return members;
}

async function main() {
  const members = await loadMembers();
  await buildTeamAvatars(members);
  const activeMembers = members.filter((member) => !member.isAlumni);
  const alumniMembers = members.filter((member) => member.isAlumni);
  const placeholders = Array.from({ length: PLACEHOLDER_COUNT }, (_, index) =>
    renderPlaceholderCard(index)
  );
  const gridMarkup = activeMembers.map(renderMemberCard).concat(placeholders).join("\n");
  const detailsMarkup = activeMembers.map(renderMemberDetail).join("\n");

  const source = await fs.readFile(TEMPLATE_PATH, "utf8");
  let updated = replaceBetweenMarkers(source, GRID_START, GRID_END, gridMarkup);
  updated = replaceBetweenMarkers(updated, DETAILS_START, DETAILS_END, detailsMarkup);
  if (alumniMembers.length) {
    const alumniGridMarkup = alumniMembers.map(renderMemberCard).join("\n");
    const alumniDetailsMarkup = alumniMembers.map(renderMemberDetail).join("\n");
    updated = replaceBetweenMarkers(updated, ALUMNI_GRID_START, ALUMNI_GRID_END, alumniGridMarkup);
    updated = replaceBetweenMarkers(updated, ALUMNI_DETAILS_START, ALUMNI_DETAILS_END, alumniDetailsMarkup);
  } else {
    updated = removeBetweenMarkers(updated, ALUMNI_SECTION_START, ALUMNI_SECTION_END);
  }

  let bibText = "";
  try {
    bibText = await fs.readFile(BIB_PATH, "utf8");
  } catch (error) {
    console.warn(`Unable to read ${BIB_PATH}: ${error.message}`);
  }
  const bibEntries = parseBibEntries(bibText);
  const publicationListMarkup = renderPublicationList(bibEntries);
  const publicationDataMarkup = `${PUB_DATA_INDENT}<script type="application/json" id="publication-data">${serializeJsonForHtml(bibEntries)}</script>`;

  updated = replaceBetweenMarkers(updated, PUBS_LIST_START, PUBS_LIST_END, publicationListMarkup);
  updated = replaceBetweenMarkers(updated, PUBS_DATA_START, PUBS_DATA_END, publicationDataMarkup);
  await fs.writeFile(OUTPUT_PATH, updated);

  console.log(
    `Updated team section with ${activeMembers.length} member(s) and ${alumniMembers.length} alumni.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

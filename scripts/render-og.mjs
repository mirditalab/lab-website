#!/usr/bin/env node
import http from "http";
import { createReadStream } from "fs";
import { stat, unlink } from "fs/promises";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const WAIT_MS = Number.parseInt(process.env.OG_WAIT_MS || "15000", 10);
const OUTPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT_DIR, "static", "og.png");
const OG_URL = `http://127.0.0.1:${PORT}/og-image.html`;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdb": "chemical/x-pdb",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

async function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const safePath = path
      .normalize(decodeURIComponent(url.pathname))
      .replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(ROOT_DIR, safePath === "/" ? "/index.html" : safePath);

    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Length": fileStat.size,
        "Cache-Control": "no-cache",
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  return server;
}

async function main() {
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch (error) {
    console.error("Puppeteer not found. Install it with: npm install --save-dev puppeteer");
    process.exit(1);
  }

  const server = await startServer();
  let browser;
  try {
    const args = [
      "--use-gl=swiftshader",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-gpu-sandbox",
    ];
    if (process.env.CI) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }
    browser = await puppeteer.launch({ headless: true, args });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    page.on("console", (msg) => console.log("PAGE:", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
    page.on("response", (res) => { if (res.status() >= 400) console.error(`HTTP ${res.status()}:`, res.url()); });

    await page.goto(OG_URL, { waitUntil: "domcontentloaded" });

    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {
      // Ignore font readiness errors in older Firefox/Chromium builds.
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

    const hiresPath = OUTPUT_PATH.replace(/\.png$/, ".2x.png");
    await page.screenshot({ path: hiresPath, type: "png" });
    let imCmd = "magick";
    try { execFileSync("magick", ["-version"], { stdio: "ignore" }); } catch { imCmd = "convert"; }
    execFileSync(imCmd, [hiresPath, "-resize", "1200x630", "-quality", "95", OUTPUT_PATH]);
    await unlink(hiresPath);
    console.log(`Wrote ${OUTPUT_PATH}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

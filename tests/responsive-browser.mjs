import { createRequire } from "node:module";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import http from "node:http";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const sizes = [
  [320, 568],
  [360, 640],
  [390, 844],
  [640, 360],
  [844, 390],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1366, 768],
  [1920, 1080],
];
const fixtures = resolve(process.argv[2] || "/tmp/horaria-responsive");
const output = resolve(process.argv[3] || "/tmp/horaria-responsive-results");
mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = pathname.startsWith("/assets/")
    ? resolve("public", pathname.slice(8))
    : existsSync(resolve(fixtures, pathname.slice(1)))
      ? resolve(fixtures, pathname.slice(1))
      : resolve("public", pathname.slice(1));
  try {
    response.setHeader(
      "Content-Type",
      file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".png")
          ? "image/png"
          : "image/svg+xml",
    );
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage();
await page.route(/^https?:\/\//, (route) =>
  route.request().url().startsWith(origin) ? route.continue() : route.abort(),
);
const results = [];
try {
  for (const file of readdirSync(fixtures).filter(
    (file) =>
      file.endsWith(".html") &&
      (!process.env.RESPONSIVE_PAGES ||
        process.env.RESPONSIVE_PAGES.split(",").includes(file)),
  )) {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/${file}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => {
        // Disable the safety clipping to find the underlying overflow.
        document.body.style.overflowX = "visible";
        const visible = (element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            element.getClientRects().length &&
            !element.closest(
              '[aria-hidden="true"], .anti-bot-field, .booking-honeypot',
            )
          );
        };
        const overflow = [...document.querySelectorAll("body *")]
          .filter((element) => {
            if (
              !visible(element) ||
              element.closest("thead") ||
              element instanceof SVGElement
            )
              return false;
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1;
          })
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            text: element.textContent.trim().slice(0, 55),
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right),
          }));
        const scrollContainers = [
          ...document.querySelectorAll(
            "main, section, form, article, nav, td, .card, .panel",
          ),
        ]
          .filter(
            (element) =>
              visible(element) && element.scrollWidth > element.clientWidth + 2,
          )
          .map((element) => ({
            class: element.className,
            excess: element.scrollWidth - element.clientWidth,
          }));
        const cut = [
          ...document.querySelectorAll("input, button, a, h1, h2, p, label"),
        ]
          .filter((element) => {
            if (!visible(element)) return false;
            const rect = element.getBoundingClientRect();
            let parent = element.parentElement;
            while (parent && parent !== document.body) {
              const style = getComputedStyle(parent);
              const bounds = parent.getBoundingClientRect();
              if (
                ["hidden", "clip"].includes(style.overflowY) &&
                (rect.bottom > bounds.bottom + 2 || rect.top < bounds.top - 2)
              )
                return true;
              parent = parent.parentElement;
            }
            return false;
          })
          .map((element) => ({
            class: element.className,
            text: element.textContent.trim().slice(0, 50),
          }));
        const touch =
          innerWidth < 768
            ? [
                ...document.querySelectorAll(
                  'button, a, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select',
                ),
              ]
                .filter((element) => {
                  if (!visible(element)) return false;
                  const rect = element.getBoundingClientRect();
                  return rect.height < 43.9 || rect.width < 43.9;
                })
                .map((element) => ({
                  class: element.className,
                  text: element.textContent.slice(0, 40),
                  width: element.getBoundingClientRect().width,
                  height: element.getBoundingClientRect().height,
                }))
            : [];
        return {
          documentWidth: document.documentElement.scrollWidth,
          overflow: overflow.slice(0, 14),
          scrollContainers: scrollContainers.slice(0, 10),
          cut: cut.slice(0, 8),
          touch,
          tableCells: document.querySelectorAll("td[data-label]").length,
        };
      });
      results.push({ page: file, width, height, ...result });
      if (
        result.documentWidth > width + 1 ||
        result.overflow.length ||
        result.scrollContainers.length ||
        result.cut.length ||
        result.touch.length
      )
        console.log(JSON.stringify(results.at(-1)));
      if (
        [
          "inicio.html",
          "cadastro.html",
          "painel.html",
          "financeiro.html",
          "adm.html",
          "nova-os-2.html",
          "portal.html",
        ].includes(file) &&
        [320, 820, 1366].includes(width)
      )
        await page.screenshot({
          path: resolve(output, file.replace(".html", `-${width}.png`)),
          fullPage: true,
        });
    }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
writeFileSync(
  resolve(output, "results.json"),
  JSON.stringify(results, null, 2),
);
const failed = results.filter(
  (row) =>
    row.documentWidth > row.width + 1 ||
    row.overflow.length ||
    row.scrollContainers.length ||
    row.cut.length ||
    row.touch.length,
);
console.log(
  `${results.length} viewport checks; ${failed.length} with layout issues.`,
);
if (failed.length) process.exitCode = 1;

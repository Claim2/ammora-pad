// Simple screenshot: load URL, wait for network idle + settle, save JPEG.
// Usage: node shot-simple.mjs <url> <out.jpg> [width] [height] [waitMs]
import { chromium } from "playwright-core";

const [url, out, wArg, hArg, waitArg] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node shot-simple.mjs <url> <out.jpg> [width=1280] [height=720] [waitMs=3000]");
  process.exit(2);
}
const width = Number(wArg ?? 1280);
const height = Number(hArg ?? 720);
const waitMs = Number(waitArg ?? 3000);

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page error]", msg.text());
  });
  page.on("pageerror", (err) => console.error("[pageerror]", String(err)));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: out, type: "jpeg", quality: 80 });
  console.log(`saved ${out} (${width}x${height})`);
} finally {
  await browser.close();
}

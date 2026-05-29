import { chromium } from 'playwright';
import { LensPage }  from './lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);

await lens.loadCSV('playwright/TimelineData.csv');
await lens.importMappings('playwright/mappings.json');
await lens.page.waitForTimeout(600);

// Open detail and enter folder mode
await lens.openRepoDetail('backend-api');
await lens.page.waitForTimeout(400);
const rc = await lens.page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('svg circle'))
    .find(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45');
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
await lens.page.mouse.click(rc.x, rc.y);
await lens.page.waitForTimeout(500);

// Measure folder rect width
const folderWidth = await lens.page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('svg rect')).find(r => r.getAttribute('fill-opacity') === '0.45');
  return r ? parseFloat(r.getAttribute('width')) : null;
});
console.log('Folder rect width (expect ~152):', folderWidth);

// Check name is inside the rect (text centered, not below)
const nameInside = await lens.page.evaluate(() => {
  const rects = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.45"]'));
  if (!rects.length) return null;
  const rect = rects[0];
  const rectBox = rect.getBoundingClientRect();
  const g = rect.closest('g');
  const nameText = Array.from(g.querySelectorAll('text'))
    .find(t => t.getAttribute('font-weight') === '600');
  if (!nameText) return null;
  const textBox = nameText.getBoundingClientRect();
  const textCy = textBox.y + textBox.height / 2;
  const rectCy = rectBox.y + rectBox.height / 2;
  return { insideRect: Math.abs(textCy - rectCy) < 10, textCy, rectCy, text: nameText.textContent };
});
console.log('Name inside rect:', nameInside);
await lens.screenshot('out/fw01-folder-wide.png');

// Drill into src, then hover a sub-folder and check tooltip path
const dt = await lens.page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent.trim() === '›');
  if (!a) return null;
  const g = a.closest('g'); const b = g.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
await lens.page.mouse.click(dt.x, dt.y);
await lens.page.waitForTimeout(500);
await lens.screenshot('out/fw02-subfolders.png');

// Hover the first folder node, check tooltip for path
const firstFolder = await lens.page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.45"]'))[0];
  if (!r) return null;
  const b = r.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
await lens.page.mouse.move(firstFolder.x, firstFolder.y);
await lens.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 3000 });
await lens.page.waitForTimeout(200);
const tipHtml = await lens.page.locator('.graph-tooltip').innerHTML();
const tipText = await lens.page.locator('.graph-tooltip').textContent();
const hasPath = await lens.page.locator('.tt-path').isVisible();
const pathText = hasPath ? await lens.page.locator('.tt-path').textContent() : null;
console.log('Tooltip text:', tipText);
console.log('tt-path visible:', hasPath, '| path:', pathText);
console.log('Path contains slash:', pathText?.includes('/'));
await lens.screenshot('out/fw03-folder-tooltip.png');

console.log('\nChecks:');
console.log(folderWidth >= 150 ? '  ✅ Folder rect ~152px wide' : `  ❌ Width wrong: ${folderWidth}`);
console.log(nameInside?.insideRect ? '  ✅ Name rendered inside rect' : `  ❌ Name not inside rect: ${JSON.stringify(nameInside)}`);
console.log(hasPath ? '  ✅ tt-path element visible on hover' : '  ❌ tt-path not visible');
console.log(pathText?.includes('/') ? '  ✅ Path shows full folder path with slash' : `  ❌ Path missing slash: "${pathText}"`);

await browser.close();

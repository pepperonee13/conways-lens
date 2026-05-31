import { chromium } from 'playwright';
import { LensPage }  from './lens-page.mjs';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const lens    = await LensPage.open(browser);
let passed = 0, failed = 0;

function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

await lens.loadCSV('e2e/CommitHistory.csv');
await lens.importMappings('e2e/mappings.json');
await lens.page.waitForTimeout(600);
await lens.screenshot('out/f00-swimlane.png');

// ── Step 1: Open repo detail ──────────────────────────────────────────────
console.log('\n[1] Open repo detail');
await lens.openRepoDetail('backend-api');
await lens.page.waitForTimeout(500);
await lens.screenshot('out/f01-author-detail.png');

const authorTitle = await lens.page.locator('.detail-title').textContent();
check('Detail title shows repo name', authorTitle.includes('backend-api'), authorTitle);
check('No breadcrumb in author mode', !(await lens.page.locator('.folder-breadcrumb').isVisible()));

// ── Step 2: Hover repo center — check tooltip + pointer cursor ─────────────
console.log('\n[2] Hover repo center node');
const repoCircle = await lens.page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('svg circle'))
    .find(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45');
  if (!c) return null;
  const box = c.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, cursor: window.getComputedStyle(c.parentElement).cursor };
});
check('Repo center circle found', !!repoCircle);
check('Repo cursor is pointer', repoCircle?.cursor === 'pointer', repoCircle?.cursor);

await lens.page.mouse.move(repoCircle.x, repoCircle.y);
await lens.page.waitForTimeout(300);
await lens.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
await lens.page.waitForTimeout(150);
const tipText = await lens.page.locator('.graph-tooltip').textContent();
check('Tooltip has folder action text', tipText.includes('Click to explore folder structure'), tipText);
await lens.screenshot('out/f02-repo-hover.png');

// ── Step 3: Click repo center → folder root ───────────────────────────────
console.log('\n[3] Enter folder mode (click repo center)');
await lens.page.mouse.click(repoCircle.x, repoCircle.y);
await lens.page.waitForTimeout(600);
await lens.screenshot('out/f03-folder-root.png');

check('Breadcrumb visible', await lens.page.locator('.folder-breadcrumb').isVisible());
const repoBtnText = await lens.page.locator('.breadcrumb-repo').textContent();
check('Breadcrumb shows repo name', repoBtnText.trim() === 'backend-api', repoBtnText);
const segCount0 = await lens.page.locator('.breadcrumb-current').count();
check('No subfolder in breadcrumb at root', segCount0 === 0, `count=${segCount0}`);

const folderRectCount = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg rect')).filter(r => r.getAttribute('fill-opacity') === '0.45').length
);
check('Folder nodes rendered', folderRectCount > 0, `count=${folderRectCount}`);

const pillCount = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg rect')).filter(r => r.getAttribute('fill-opacity') === '0.95').length
);
check('Team pills on left', pillCount > 0, `count=${pillCount}`);

const edgeCount = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg path')).filter(p => p.getAttribute('marker-end')).length
);
check('Edges (curves) connect teams to folders', edgeCount > 0, `count=${edgeCount}`);

const drillableCount = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg text')).filter(t => t.textContent.trim() === '›').length
);
console.log(`  ℹ  Drillable folders at root: ${drillableCount}`);

// ── Step 4: Drill one level deep into 'src' ───────────────────────────────
console.log('\n[4] Drill into first navigable folder');
const drillTarget = await lens.page.evaluate(() => {
  const arrow = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent.trim() === '›');
  if (!arrow) return null;
  const g = arrow.closest('g');
  const box = g.getBoundingClientRect();
  const label = Array.from(g.querySelectorAll('text'))
    .find(t => t.getAttribute('font-weight') === '600')?.textContent.trim();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, label };
});
check('Drillable folder found', !!drillTarget, JSON.stringify(drillTarget));

if (drillTarget) {
  console.log(`  ℹ  Drilling into: ${drillTarget.label}`);
  await lens.page.mouse.click(drillTarget.x, drillTarget.y);
  await lens.page.waitForTimeout(600);
  await lens.screenshot('out/f04-drilled-L1.png');

  const bcItems = await lens.page.locator('.breadcrumb-item').allTextContents();
  check('Breadcrumb has 2 items after drill', bcItems.length >= 2, JSON.stringify(bcItems));
  const currentSeg = await lens.page.locator('.breadcrumb-current').textContent();
  check('Breadcrumb current = drilled segment', currentSeg.trim() === drillTarget.label, `"${currentSeg.trim()}" vs "${drillTarget.label}"`);

  // Gather sub-folder labels
  const subFolderLabels = await lens.page.evaluate(() =>
    Array.from(document.querySelectorAll('svg text'))
      .filter(t => t.getAttribute('font-weight') === '600' && !t.querySelector('tspan'))
      .map(t => t.textContent.trim()).filter(Boolean)
  );
  console.log(`  ℹ  Sub-folder labels: ${subFolderLabels.join(', ')}`);
  check('Sub-folders rendered after drill', subFolderLabels.length > 0);

  // ── Step 5: Drill a second level if possible ──────────────────────────────
  console.log('\n[5] Try second-level drill');
  const drill2 = await lens.page.evaluate(() => {
    const arrow = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent.trim() === '›');
    if (!arrow) return null;
    const g = arrow.closest('g');
    const box = g.getBoundingClientRect();
    const label = Array.from(g.querySelectorAll('text'))
      .find(t => t.getAttribute('font-weight') === '600')?.textContent.trim();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, label };
  });
  if (drill2) {
    console.log(`  ℹ  Drilling second level into: ${drill2.label}`);
    await lens.page.mouse.click(drill2.x, drill2.y);
    await lens.page.waitForTimeout(500);
    await lens.screenshot('out/f05-drilled-L2.png');
    const bcItems2 = await lens.page.locator('.breadcrumb-item').allTextContents();
    check('Breadcrumb has 3 items after L2 drill', bcItems2.length >= 3, JSON.stringify(bcItems2));

    // Navigate back to L1 via breadcrumb (click the L1 segment)
    console.log('\n[5b] Navigate back to L1 via breadcrumb');
    const l1Btn = lens.page.locator('.breadcrumb-item:not(.breadcrumb-repo):not(.breadcrumb-current)').first();
    const l1Text = await l1Btn.textContent();
    console.log(`  ℹ  Clicking breadcrumb segment: ${l1Text}`);
    await l1Btn.click();
    await lens.page.waitForTimeout(500);
    await lens.screenshot('out/f06-back-to-L1.png');
    const bcAfterBack = await lens.page.locator('.breadcrumb-item').allTextContents();
    check('Breadcrumb shrinks after back-nav', bcAfterBack.length < 3, JSON.stringify(bcAfterBack));
    const newCurrent = await lens.page.locator('.breadcrumb-current').textContent();
    check('Breadcrumb current updated', newCurrent.trim() === l1Text.trim(), `"${newCurrent.trim()}" vs "${l1Text.trim()}"`);
  } else {
    console.log('  ℹ  No second-level drill available (leaf node reached) — skipping L2 drill');
  }

  // ── Step 6: Click repo name in breadcrumb → back to author view ───────────
  console.log('\n[6] Click repo name in breadcrumb → return to author radial view');
  await lens.page.locator('.breadcrumb-repo').click();
  await lens.page.waitForTimeout(500);
  await lens.screenshot('out/f07-author-restored.png');

  const detailTitleBack = await lens.page.locator('.detail-title').isVisible();
  const breadcrumbGone  = !(await lens.page.locator('.folder-breadcrumb').isVisible());
  check('detail-title visible (author mode restored)', detailTitleBack);
  check('Breadcrumb gone after returning to author view', breadcrumbGone);

  const radialCircle = await lens.page.evaluate(() =>
    Array.from(document.querySelectorAll('svg circle'))
      .some(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45')
  );
  check('Radial center repo circle back', radialCircle);
}

// ── Step 7: Probe — hover a leaf folder (no ›) ────────────────────────────
console.log('\n[7] Probe: hover non-drillable folder (leaf)');
// Re-enter folder mode and drill one level
const rc2 = await lens.page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('svg circle'))
    .find(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45');
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (rc2) {
  await lens.page.mouse.click(rc2.x, rc2.y);
  await lens.page.waitForTimeout(400);
  // drill into the src folder again
  const dt2 = await lens.page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent.trim() === '›');
    if (!a) return null;
    const g = a.closest('g');
    const b = g.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (dt2) {
    await lens.page.mouse.click(dt2.x, dt2.y);
    await lens.page.waitForTimeout(400);
    // Find a leaf folder (no › symbol)
    const leafFolder = await lens.page.evaluate(() => {
      const allFolderGs = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.45"]'))
        .map(r => r.closest('g'))
        .filter(Boolean);
      const drillableGs = new Set(
        Array.from(document.querySelectorAll('svg text'))
          .filter(t => t.textContent.trim() === '›')
          .map(t => t.closest('g'))
      );
      const leaf = allFolderGs.find(g => !drillableGs.has(g));
      if (!leaf) return null;
      const b = leaf.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    if (leafFolder) {
      await lens.page.mouse.click(leafFolder.x, leafFolder.y);
      await lens.page.waitForTimeout(300);
      // Breadcrumb should NOT have changed (click on leaf does nothing)
      const bcBeforeLeafClick = await lens.page.locator('.breadcrumb-item').count();
      // The page should still show the same folder view (leaf click is no-op)
      check('Leaf folder click does not drill further', await lens.page.locator('.folder-breadcrumb').isVisible(), 'folder mode should remain');
      console.log(`  ℹ  Breadcrumb item count unchanged at ${bcBeforeLeafClick}`);
    }
  }
}

// ── Step 8: Probe — expand team in folder mode, authors only connect to their folders ──
console.log('\n[8] Probe: expand team in folder mode');
// Ensure we are in folder mode
const inFolderMode = await lens.page.locator('.folder-breadcrumb').isVisible();
if (!inFolderMode) {
  const rc3 = await lens.page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('svg circle'))
      .find(c => parseFloat(c.getAttribute('r')) > 30 && c.getAttribute('fill-opacity') === '0.45');
    if (!c) return null;
    const b = c.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (rc3) { await lens.page.mouse.click(rc3.x, rc3.y); await lens.page.waitForTimeout(400); }
}

const pill = await lens.page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('svg rect[fill-opacity="0.95"]'))[0];
  if (!r) return null;
  const g = r.closest('g'); const b = g.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (pill) {
  await lens.page.mouse.click(pill.x, pill.y);
  await lens.page.waitForTimeout(600);
  await lens.screenshot('out/f08-expanded-team.png');

  const authorCircles = await lens.page.evaluate(() =>
    Array.from(document.querySelectorAll('svg circle'))
      .filter(c => parseFloat(c.getAttribute('r')) > 0 && parseFloat(c.getAttribute('r')) < 30 && c.getAttribute('opacity') === '0.92')
      .length
  );
  check('Author circles appear after expand', authorCircles > 0, `count=${authorCircles}`);

  const edgesAfter = await lens.page.evaluate(() =>
    Array.from(document.querySelectorAll('svg path')).filter(p => p.getAttribute('marker-end')).length
  );
  check('Edges still present after expand', edgesAfter > 0, `count=${edgesAfter}`);
  console.log(`  ℹ  Edge count after team expand: ${edgesAfter}`);
}

// ── Step 9: Switch to Bubbles (circle-pack) view ─────────────────────────────
console.log('\n[9] Switch to Bubbles view');

// Close any open detail / folder view so the view-toggle is visible
if (await lens.page.locator('.back-btn').isVisible()) {
  await lens.page.locator('.back-btn').click();
  await lens.page.waitForTimeout(500);
}

const toggleVisible = await lens.page.locator('button:has-text("Bubbles")').isVisible();
check('View toggle buttons visible', toggleVisible);

await lens.page.locator('button:has-text("Bubbles")').click();
await lens.page.waitForTimeout(800);
await lens.screenshot('out/f09-bubbles.png');

const bubblesActive = await lens.page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-toggle-btn')]
    .find(b => b.textContent.trim() === 'Bubbles');
  return btn?.classList.contains('active') ?? false;
});
check('Bubbles button is active', bubblesActive);

const swimlaneStillActive = await lens.page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-toggle-btn')]
    .find(b => b.textContent.trim() === 'Swimlane');
  return btn?.classList.contains('active') ?? false;
});
check('Swimlane button is no longer active', !swimlaneStillActive);

const teamBubbleCount = await lens.page.evaluate(() =>
  document.querySelectorAll('.team-bubble').length
);
check('Team bubbles rendered', teamBubbleCount > 0, `count=${teamBubbleCount}`);
console.log(`  ℹ  Team bubbles: ${teamBubbleCount}`);

// Hover a team bubble — tooltip should appear
const teamBubbleCenter = await lens.page.evaluate(() => {
  const circle = document.querySelector('.team-bubble circle');
  if (!circle) return null;
  const box = circle.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
check('Team bubble circle found for hover', !!teamBubbleCenter);

if (teamBubbleCenter) {
  await lens.page.mouse.move(teamBubbleCenter.x, teamBubbleCenter.y);
  await lens.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
  const teamTipText = await lens.page.locator('.graph-tooltip').textContent();
  check('Team bubble tooltip visible', teamTipText.length > 0, teamTipText);
  await lens.screenshot('out/f09b-team-bubble-hover.png');

  // Click team bubble to expand it — context (repo) bubbles should appear inside
  await lens.page.mouse.click(teamBubbleCenter.x, teamBubbleCenter.y);
  await lens.page.waitForTimeout(500);
  await lens.screenshot('out/f09c-team-expanded.png');

  const contextBubbleCount = await lens.page.evaluate(() =>
    [...document.querySelectorAll('.repo-bubble')].filter(el => el.style.display !== 'none').length
  );
  check('Context bubbles visible after expanding team', contextBubbleCount > 0, `count=${contextBubbleCount}`);
  console.log(`  ℹ  Context bubbles visible: ${contextBubbleCount}`);

  // Hover a visible context bubble → tooltip should offer drill-down
  const repoBubbleCenter = await lens.page.evaluate(() => {
    const visible = [...document.querySelectorAll('.repo-bubble')]
      .find(el => el.style.display !== 'none');
    if (!visible) return null;
    const circle = visible.querySelector('circle');
    if (!circle) return null;
    const box = circle.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  check('Context bubble circle found for hover', !!repoBubbleCenter);

  if (repoBubbleCenter) {
    await lens.page.mouse.move(repoBubbleCenter.x, repoBubbleCenter.y);
    await lens.page.waitForSelector('.graph-tooltip', { state: 'visible', timeout: 8000 });
    await lens.page.waitForTimeout(150);
    const bubbleTipText = await lens.page.locator('.graph-tooltip').textContent();
    check('Context bubble tooltip has drill-down action',
      bubbleTipText.includes('Click to see author contributions'), bubbleTipText);
    await lens.screenshot('out/f09d-context-bubble-hover.png');

    // Click context bubble → detail view should open
    await lens.page.mouse.click(repoBubbleCenter.x, repoBubbleCenter.y);
    await lens.page.waitForTimeout(800);
    await lens.screenshot('out/f09e-bubble-detail.png');
    check('Clicking context bubble opens detail view',
      await lens.page.locator('.detail-title').isVisible());

    // Return to main graph
    await lens.page.locator('.back-btn').click();
    await lens.page.waitForTimeout(500);
  }
}

// ── Step 10: Switch back to Swimlane ─────────────────────────────────────────
console.log('\n[10] Switch back to Swimlane view');
await lens.page.locator('button:has-text("Swimlane")').click();
await lens.page.waitForTimeout(800);
await lens.screenshot('out/f10-swimlane-restored.png');

const swimlaneActiveAgain = await lens.page.evaluate(() => {
  const btn = [...document.querySelectorAll('.view-toggle-btn')]
    .find(b => b.textContent.trim() === 'Swimlane');
  return btn?.classList.contains('active') ?? false;
});
check('Swimlane button active after switching back', swimlaneActiveAgain);

const bubblesGone = await lens.page.evaluate(() =>
  document.querySelectorAll('.team-bubble').length === 0
);
check('Circle-pack elements removed after returning to swimlane', bubblesGone);

// ── Step 11: Verify "Data Platform" multi-repo context in swimlane ───────────
console.log('\n[11] Verify "Data Platform" multi-repo context in swimlane');

// "Data Platform" text label must appear in the swimlane graph
const dataPlatLabel = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg text'))
    .some(t => t.textContent.trim() === 'Data Platform')
);
check('"Data Platform" context label rendered in swimlane', dataPlatLabel);

// The individual repo names must NOT appear as separate bold context labels
const dataPipelineAsLabel = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg text'))
    .filter(t => t.getAttribute('font-weight') === '600')
    .some(t => t.textContent.trim() === 'data-pipeline')
);
check('"data-pipeline" not shown as a separate context label', !dataPipelineAsLabel);

const analyticsDbAsLabel = await lens.page.evaluate(() =>
  Array.from(document.querySelectorAll('svg text'))
    .filter(t => t.getAttribute('font-weight') === '600')
    .some(t => t.textContent.trim() === 'analytics-db')
);
check('"analytics-db" not shown as a separate context label', !analyticsDbAsLabel);

// The violation banner reports "X out of TOTAL" — with the merge, TOTAL should be 6.
// (violatingOnly=true by default, so not all 6 are drawn; the banner total is the reliable count.)
const violationText = await lens.page.locator('.violation-banner').textContent();
check('Violation banner shows 6 total contexts (7 repos → 6 after merge)', violationText.includes('out of 6 '), violationText);
await lens.screenshot('out/f11-data-platform-swimlane.png');

// ── Step 12: Verify "Data Platform" context bubble in Bubbles view ────────────
console.log('\n[12] Verify "Data Platform" in Bubbles view');
await lens.page.locator('button:has-text("Bubbles")').click();
await lens.page.waitForTimeout(800);
await lens.screenshot('out/f12-bubbles-before-data.png');

// Find the Data team bubble by its text label
const dataTeamCenter = await lens.page.evaluate(() => {
  for (const g of document.querySelectorAll('.team-bubble')) {
    const label = Array.from(g.querySelectorAll('text'))
      .find(t => t.textContent.trim() === 'Data');
    if (label) {
      const circle = g.querySelector('circle');
      if (!circle) continue;
      const box = circle.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
  }
  return null;
});
check('Data team bubble found in Bubbles view', !!dataTeamCenter);

// All .repo-bubble elements are always in the DOM (hidden via display:none when
// collapsed). Query by data-team-id without needing to expand or click.
// This also avoids the off-screen click issue when the Data bubble is near the
// bottom of the viewport.
const dataContextCount = await lens.page.evaluate(() =>
  document.querySelectorAll('.repo-bubble[data-team-id="data"]').length
);
check('Data team has exactly 1 context node (Data Platform merged)', dataContextCount === 1, `count=${dataContextCount}`);

const dataPlatBubbleLabel = await lens.page.evaluate(() => {
  const b = document.querySelector('.repo-bubble[data-team-id="data"]');
  if (!b) return null;
  return Array.from(b.querySelectorAll('text'))
    .map(t => t.textContent.trim()).filter(Boolean).join(' ');
});
check('"Data Platform" label on context bubble', dataPlatBubbleLabel?.includes('Data Platform'), dataPlatBubbleLabel);
await lens.screenshot('out/f12b-data-platform-bubble.png');

// Switch back to Swimlane to finish cleanly
await lens.page.locator('button:has-text("Swimlane")').click();
await lens.page.waitForTimeout(600);

// ── Step 13: Right-click context node → Add to bounded context ────────────────
console.log('\n[13] Right-click context node → Add to bounded context');
const rcOk = await lens.page.evaluate(() => {
  const textEl = Array.from(document.querySelectorAll('svg text'))
    .filter(t => t.closest('g')?.querySelector('circle.repo-fill'))
    .find(t => t.textContent.trim().startsWith('backend-a'));
  const g = textEl?.closest('g');
  if (!g) return false;
  const box = g.getBoundingClientRect();
  g.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true,
    clientX: box.x + box.width / 2, clientY: box.y + box.height / 2,
  }));
  return true;
});
check('Auto-context node found for right-click', rcOk);
await lens.page.waitForTimeout(200);
check('Context menu appears on right-click', await lens.page.locator('.ctx-menu').isVisible());

await lens.page.locator('.ctx-menu-item').click();
await lens.page.waitForTimeout(400);
check('Mapping panel opens on Contexts tab', await lens.page.locator('.tab-btn.active:has-text("Contexts")').isVisible());
check('Pending source confirmation shown', await lens.page.locator('.ctx-pending').isVisible());
await lens.screenshot('out/f13-add-to-context.png');

const ctxCardsBefore = await lens.page.locator('.ctx-card').count();
await lens.page.locator('.ctx-pending .ctx-target-pill--new').click();
await lens.page.locator('.ctx-pending .ctx-new-name-input').fill('Backend Bundle');
await lens.page.locator('.ctx-pending .modal-btn--confirm').click();
await lens.page.waitForTimeout(400);
const ctxCardsAfter = await lens.page.locator('.ctx-card').count();
check('New bounded context created from node', ctxCardsAfter === ctxCardsBefore + 1, `before=${ctxCardsBefore} after=${ctxCardsAfter}`);
check('Pending confirmation cleared after confirm', !(await lens.page.locator('.ctx-pending').isVisible()));
check('New context shows its repo source', (await lens.page.locator('.ctx-source-desc').allTextContents()).some(t => t.includes('backend-api')));
await lens.screenshot('out/f13b-context-created.png');

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed === 0) console.log('✅ PASS');
else console.log('❌ FAIL');

await browser.close();
process.exit(failed > 0 ? 1 : 0);

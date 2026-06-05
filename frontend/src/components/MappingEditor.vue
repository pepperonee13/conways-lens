<template>
  <FabButton v-if="!open" class="fixed right-6 bottom-6 z-40"
    label="Mapping" :badge="teams.length || null" color="orange" expand="left"
    title="Edit mappings" data-testid="fab-mapping"
    @click="store.markMappingOpened(); open = true"
  >
    <MapIcon :size="18" />
  </FabButton>

  <transition name="backdrop-fade">
    <div v-if="open" class="backdrop" @click="open = false"></div>
  </transition>

  <transition name="slide-panel">
    <div v-if="open" class="panel">
      <div class="panel-header">
        <h2 class="panel-title"><MapIcon :size="20" class="title-icon" /> Team Mapping</h2>
        <button class="close-btn" @click="open = false" title="Close"><X :size="18" /></button>
      </div>

      <div class="panel-tabs">
        <button :class="['tab-btn', { active: tab === 'teams' }]"   @click="tab = 'teams'">Teams</button>
        <button :class="['tab-btn', { active: tab === 'contexts' }]" @click="tab = 'contexts'">
          Contexts
          <span v-if="contexts.length" class="tab-badge">{{ contexts.length }}</span>
        </button>
        <button :class="['tab-btn', { active: tab === 'aliases' }]" @click="tab = 'aliases'">
          Author Aliases
          <span v-if="normalizationCount" class="tab-badge">{{ normalizationCount }}</span>
        </button>
        <button :class="['tab-btn', { active: tab === 'ignored' }]" @click="tab = 'ignored'">
          Ignored
          <span v-if="ignoredAuthors.length" class="tab-badge tab-badge--red">{{ ignoredAuthors.length }}</span>
        </button>
      </div>

      <div class="panel-body">

        <!-- ── Teams ── -->
        <template v-if="tab === 'teams'">
          <p class="panel-hint">
            Assign authors and repositories to teams. Team color is applied to their nodes in the graph.
          </p>

          <div v-if="teams.length && (unassignedAuthors.length || unassignedContexts.length)" class="unassigned-section">
            <button class="unassigned-title" @click="unassignedExpanded = !unassignedExpanded">
              <ChevronRight :size="14" class="chevron" :class="{ rotated: unassignedExpanded }" />
              <AlertTriangle :size="14" />
              Unassigned
              <span class="unassigned-count">{{ unassignedAuthors.length + unassignedContexts.length }}</span>
            </button>
            <transition name="team-body">
              <div v-if="unassignedExpanded">
                <div class="unassigned-hint">Tip: drag any item below onto a team card to assign it.</div>
                <div v-if="unassignedAuthors.length" class="unassigned-group">
                  <span class="unassigned-label">Authors not in any team:</span>
                  <div class="unassigned-chips">
                    <span
                      v-for="a in unassignedAuthors"
                      :key="a"
                      :class="['unassigned-chip', 'unassigned-chip--draggable', { 'unassigned-chip--dragging': unassignedDrag?.kind === 'authors' && unassignedDrag?.value === a }]"
                      draggable="true"
                      @dragstart="onUnassignedDragStart('authors', a, $event)"
                      @dragend="onUnassignedDragEnd"
                    >{{ a }}</span>
                  </div>
                </div>
                <div v-if="unassignedContexts.length" class="unassigned-group">
                  <span class="unassigned-label">Bounded contexts not in any team:</span>
                  <div class="unassigned-chips">
                    <span
                      v-for="c in unassignedContexts"
                      :key="c.id"
                      :class="['unassigned-chip', 'unassigned-chip--draggable', { 'unassigned-chip--dragging': unassignedDrag?.kind === 'contexts' && unassignedDrag?.value === c.id }]"
                      draggable="true"
                      @dragstart="onUnassignedDragStart('contexts', c.id, $event)"
                      @dragend="onUnassignedDragEnd"
                    >{{ c.name }}</span>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- ── New Team Draft Card ── -->
          <div v-if="newTeamDraft" class="new-team-draft">
            <div class="new-team-draft-header">
              <span class="new-team-draft-title">New Team</span>
              <button class="remove-team-btn" @click="newTeamDraft = null" title="Cancel"><X :size="16" /></button>
            </div>
            <div class="new-team-draft-row">
              <input type="color"
                v-model="newTeamDraft.color"
                class="color-picker" :title="newTeamDraft.color" />
              <input
                v-model="newTeamDraft.name"
                class="team-name-input"
                placeholder="Team name" />
            </div>

            <div class="section-label">
              Authors
              <span class="draft-required">required</span>
            </div>
            <div class="assigned-chips" v-if="newTeamDraft.authors.length">
              <span v-for="a in newTeamDraft.authors" :key="a" class="assigned-chip author-chip">
                {{ a }}<button class="chip-remove" @click="removeDraftItem('authors', a)" title="Remove"><X :size="11" /></button>
              </span>
            </div>
            <div class="available-list" v-if="draftAvailableAuthors.length">
              <div class="available-label">Add author:</div>
              <div class="available-pills">
                <button v-for="a in draftAvailableAuthors" :key="a" class="available-pill" @click="addDraftItem('authors', a)">
                  + {{ a }}
                </button>
              </div>
            </div>
            <span v-if="!newTeamDraft.authors.length && !draftAvailableAuthors.length" class="empty-hint">No authors available — upload a CSV first.</span>

            <div class="section-label">
              Bounded Contexts
              <span class="draft-required">required</span>
            </div>
            <div class="assigned-chips" v-if="newTeamDraft.contexts.length">
              <span v-for="c in newTeamDraft.contexts" :key="c" class="assigned-chip repo-chip">
                {{ contextName(c) }}<button class="chip-remove" @click="removeDraftItem('contexts', c)" title="Remove"><X :size="11" /></button>
              </span>
            </div>
            <div class="available-list" v-if="draftAvailableContexts.length">
              <div class="available-label">Add bounded context:</div>
              <div class="available-pills">
                <button v-for="c in draftAvailableContexts" :key="c.id" class="available-pill repo-pill" @click="addDraftItem('contexts', c.id)">
                  + {{ c.name }}
                </button>
              </div>
            </div>
            <span v-if="!newTeamDraft.contexts.length && !draftAvailableContexts.length" class="empty-hint">No bounded contexts available — upload a CSV first.</span>

            <div class="new-team-actions">
              <button class="modal-btn modal-btn--secondary" @click="newTeamDraft = null">Cancel</button>
              <button
                class="modal-btn modal-btn--confirm"
                :disabled="!canSaveNewTeam"
                :title="canSaveNewTeam ? 'Save team' : 'Assign at least one author and one bounded context first'"
                @click="confirmNewTeam">
                Save Team
              </button>
            </div>
          </div>

          <button v-else class="add-team-btn" @click="startAddTeam">+ Add Team</button>

          <div class="teams-list">
            <div
              v-for="(team, idx) in teams"
              :key="team.id"
              :class="['team-card', { 'team-card--drop-target': dropTargetTeamId === team.id }]"
              @dragover.prevent="onTeamDragOver(team.id)"
              @dragleave="onTeamDragLeave(team.id, $event)"
              @drop.prevent="onTeamDrop(team)"
            >
              <div class="team-card-header">
                <button class="team-toggle" @click="toggleTeam(team.id)" :title="isExpanded(team.id) ? 'Collapse' : 'Expand'">
                  <ChevronRight :size="16" class="chevron" :class="{ rotated: isExpanded(team.id) }" />
                </button>
                <input type="color"
                  :value="draftColor[team.id] ?? team.color"
                  @input="onColorInput(team, $event.target.value)"
                  @change="onColorChange(team, $event.target.value)"
                  class="color-picker" :title="draftColor[team.id] ?? team.color" />
                <input
                  :value="draftName[team.id] ?? team.name"
                  @input="onNameInput(team, $event.target.value)"
                  @blur="onNameBlur(team, $event.target.value)"
                  class="team-name-input" :placeholder="'Team ' + (idx + 1)" />
                <span v-if="!isExpanded(team.id)" class="team-summary">
                  {{ team.authors.length }} authors · {{ team.contexts.length }} contexts
                </span>
                <button class="remove-team-btn" @click="askDeleteTeam(team)" title="Delete team"><Trash2 :size="16" /></button>
              </div>

              <transition name="team-body">
                <div v-if="isExpanded(team.id)" class="team-body">
                  <div class="section-label">Authors ({{ team.authors.length }})</div>
                  <div class="assigned-chips">
                    <span v-for="a in [...team.authors].sort()" :key="a" class="assigned-chip author-chip">
                      {{ a }}<button
                        class="chip-remove"
                        :disabled="team.authors.length === 1"
                        :title="team.authors.length === 1 ? 'A team must have at least one author' : 'Remove'"
                        @click="team.authors.length > 1 && removeFrom(team, 'authors', a)"><X :size="11" /></button>
                    </span>
                    <span v-if="!team.authors.length" class="empty-hint">No authors assigned</span>
                  </div>
                  <div class="available-list" v-if="availableAuthorGroups(team).free.length || availableAuthorGroups(team).shared.length">
                    <template v-if="availableAuthorGroups(team).free.length">
                      <div class="available-label">Add author:</div>
                      <div class="available-pills">
                        <button v-for="a in availableAuthorGroups(team).free" :key="a" class="available-pill" @click="addTo(team, 'authors', a)">
                          + {{ a }}
                        </button>
                      </div>
                    </template>
                    <template v-if="availableAuthorGroups(team).shared.length">
                      <div class="available-label available-label--shared">Also in another team:</div>
                      <div class="available-pills">
                        <button v-for="a in availableAuthorGroups(team).shared" :key="a" class="available-pill available-pill--shared" @click="addTo(team, 'authors', a)">
                          + {{ a }}
                        </button>
                      </div>
                    </template>
                  </div>

                  <div class="section-label">Bounded Contexts ({{ team.contexts.length }})</div>
                  <div class="assigned-chips">
                    <span v-for="r in [...team.contexts].sort()" :key="r" class="assigned-chip repo-chip">
                      {{ contextName(r) }}<button
                        class="chip-remove"
                        :disabled="team.contexts.length === 1"
                        :title="team.contexts.length === 1 ? 'A team must have at least one bounded context' : 'Remove'"
                        @click="team.contexts.length > 1 && removeFrom(team, 'contexts', r)"><X :size="11" /></button>
                    </span>
                    <span v-if="!team.contexts.length" class="empty-hint">No bounded contexts assigned</span>
                  </div>
                  <div class="available-list" v-if="availableContexts(team).length">
                    <div class="available-label">Add bounded context:</div>
                    <div class="available-pills">
                      <button v-for="c in availableContexts(team)" :key="c.id" class="available-pill repo-pill" @click="addTo(team, 'contexts', c.id)">
                        + {{ c.name }}
                      </button>
                    </div>
                  </div>

                </div>
              </transition>
            </div>
          </div>

          <div v-if="!teams.length" class="no-teams">
            <p>No teams defined yet.</p>
            <p>Click <strong>+ Add Team</strong> to create your first team, then assign authors and repositories to it.</p>
            <p class="hint-text">Authors and repositories are discovered automatically from the loaded data.</p>
          </div>

        </template>

        <!-- ── Author Aliases ── -->
        <template v-if="tab === 'aliases'">
          <p class="panel-hint">
            Drag an author pill onto another to alias it. The pill you drop onto becomes the canonical name.
            Useful when the same person appears under multiple git identities.
          </p>

          <div class="alias-groups">
            <div v-for="group in aliasAuthorGroups" :key="group.team.id" class="alias-group">
              <div class="alias-group-header">
                <span class="alias-group-swatch" :style="{ backgroundColor: group.team.color }"></span>
                <span class="alias-group-name">{{ group.team.name }}</span>
                <span class="alias-group-count">{{ group.authors.length }}</span>
              </div>
              <div class="author-pills-grid">
                <div
                  v-for="author in group.authors"
                  :key="author"
                  :class="['author-pill', {
                    'pill-mapped':       isMapped(author),
                    'pill-dragging':     dragSource === author,
                    'pill-drop-target':  dragTarget === author,
                    'pill-teamed':       !isMapped(author) && !!aliasPillColor(author),
                    'pill-unassigned':   group.team.id === '__unassigned__',
                  }]"
                  :style="!isMapped(author) && aliasPillColor(author) ? { backgroundColor: aliasPillColor(author) } : null"
                  draggable="true"
                  @dragstart="dragSource = author"
                  @dragend="dragSource = null; dragTarget = null"
                  @dragover.prevent="onDragOver(author)"
                  @dragleave.self="onDragLeave(author)"
                  @drop.prevent="onDrop(author)"
                >
                  <span class="pill-name">{{ author }}</span>
                  <span v-if="isMapped(author)" class="pill-alias-badge">→ {{ authorNormalizations[author] }}</span>
                </div>
              </div>
            </div>
          </div>

          <template v-if="normalizationCount">
            <div class="section-label" style="margin-top:1.25rem">Active aliases ({{ normalizationCount }})</div>
            <div class="alias-list">
              <div v-for="[raw, canonical] in sortedNormalizations" :key="raw" class="alias-row">
                <span class="alias-raw">{{ raw }}</span>
                <span class="alias-arrow-sm">→</span>
                <span class="alias-canonical">{{ canonical }}</span>
                <button class="alias-remove" @click="store.removeNormalization(raw)" title="Remove alias"><X :size="12" /></button>
              </div>
            </div>
          </template>
          <p v-else class="hint-text" style="margin-top:0.75rem;text-align:center">
            No aliases yet — drag one pill onto another to create one.
          </p>
        </template>

        <!-- ── Ignored Authors ── -->
        <template v-if="tab === 'ignored'">
          <p class="panel-hint">
            Click a pill to ignore an author (removes them from the graph entirely). Uses canonical names (after alias mappings are applied).
          </p>

          <template v-if="ignoredAuthorsSorted.length">
            <div class="section-label section-label--ignored">Ignored ({{ ignoredAuthorsSorted.length }})</div>
            <div class="author-pills-grid ignored-group">
              <button
                v-for="a in ignoredAuthorsSorted"
                :key="a"
                class="author-pill author-pill--ignored"
                :style="teamColor(a) ? { borderColor: teamColor(a), color: teamColor(a) } : null"
                @click="store.unignoreAuthor(a)"
                title="Click to unignore"
              >
                <span class="pill-name">{{ a }}</span>
                <X :size="11" class="pill-x" />
              </button>
            </div>
          </template>

          <div v-if="activeAuthors.length" class="section-label" :class="{ 'mt-5': ignoredAuthorsSorted.length }">
            Active ({{ activeAuthors.length }})
          </div>
          <div class="alias-groups">
            <div v-for="group in activeAuthorGroups" :key="group.team.id" class="alias-group">
              <div class="alias-group-header">
                <span class="alias-group-swatch" :style="{ backgroundColor: group.team.color }"></span>
                <span class="alias-group-name">{{ group.team.name }}</span>
                <span class="alias-group-count">{{ group.authors.length }}</span>
              </div>
              <div class="author-pills-grid">
                <button
                  v-for="a in group.authors"
                  :key="a"
                  :class="['author-pill', 'author-pill--active', {
                    'pill-teamed':     !!teamColor(a),
                    'pill-unassigned': group.team.id === '__unassigned__',
                  }]"
                  :style="teamColor(a) ? { backgroundColor: teamColor(a) } : null"
                  @click="store.ignoreAuthor(a)"
                  title="Click to ignore"
                >
                  <span class="pill-name">{{ a }}</span>
                </button>
              </div>
            </div>
          </div>

          <p v-if="!allAuthors.length" class="hint-text" style="text-align:center;margin-top:2rem">
            No authors found. Upload a CSV first.
          </p>
        </template>

        <!-- ── Bounded Contexts ── -->
        <template v-if="tab === 'contexts'">
          <p class="panel-hint">
            A bounded context groups one or more repositories (or sub-paths) under a single
            identity that teams can own. Any repository not placed in a context here maps to an
            automatic context named after itself.
          </p>

          <!-- Pending source: "Create new context" hand-off from right-click menu -->
          <div v-if="pendingContextSource" class="ctx-pending">
            <div class="ctx-pending-title">Create new bounded context</div>

            <div class="ctx-pending-source-row">
              <span class="ctx-source-type" :class="`ctx-source-type--${pendingContextSource.source.type}`">
                {{ pendingContextSource.source.type }}
              </span>
              <span class="ctx-source-desc">{{ pendingContextSource.label }}</span>
            </div>

            <input
              v-model="pendingNewName"
              class="ctx-new-name-input"
              placeholder="Context name"
              @keyup.enter="canConfirmPending && confirmPending()"
              ref="pendingNameInput"
            />

            <!-- Duplicate-name confirmation -->
            <div v-if="pendingNameDuplicate && !pendingNameDuplicateDismissed" class="ctx-dupe-warning">
              <AlertTriangle :size="13" class="flex-shrink-0 text-amber-500" />
              <span>A context named <strong>{{ pendingNameDuplicate.name }}</strong> already exists.</span>
              <div class="ctx-dupe-actions">
                <button class="ctx-dupe-btn ctx-dupe-btn--assign"
                  @click="assignToDuplicate">Assign to it</button>
                <button class="ctx-dupe-btn ctx-dupe-btn--new"
                  @click="pendingNameDuplicateDismissed = true">Create new</button>
              </div>
            </div>

            <div class="ctx-pending-actions">
              <button class="modal-btn modal-btn--confirm"
                :disabled="!canConfirmPending"
                @click="confirmPending">
                Create &amp; assign
              </button>
              <button class="modal-btn modal-btn--secondary"
                @click="store.clearPendingContextSource()">Cancel</button>
            </div>
          </div>

          <button class="add-team-btn" @click="store.addContext('New context')">+ New bounded context</button>

          <div v-for="c in contexts" :key="c.id" class="ctx-card">
            <div class="ctx-card-header">
              <input
                :value="c.name"
                @input="store.updateContext(c.id, { name: $event.target.value })"
                class="team-name-input" placeholder="Context name" />
              <button class="remove-team-btn" @click="store.removeContext(c.id)" title="Delete context"><Trash2 :size="16" /></button>
            </div>

            <div class="ctx-sources">
              <div v-for="(s, i) in c.sources" :key="i" class="ctx-source-row">
                <span class="ctx-source-type" :class="`ctx-source-type--${s.type}`">{{ s.type }}</span>
                <span class="ctx-source-desc">{{ sourceLabel(s) }}</span>
                <button class="chip-remove" @click="store.removeContextSource(c.id, i)" title="Remove source"><X :size="11" /></button>
              </div>
              <span v-if="!c.sources.length" class="empty-hint">No sources yet — this context matches nothing.</span>
            </div>

            <div class="ctx-add-source" v-if="draftSource[c.id]">
              <div class="ctx-type-pills">
                <button
                  v-for="t in ['repo', 'path', 'glob']" :key="t"
                  :class="['ctx-type-pill', `ctx-type-pill--${t}`, { 'ctx-type-pill--active': draftSource[c.id].type === t }]"
                  @click="draftSource[c.id].type = t"
                >{{ t }}</button>
              </div>
              <div class="ctx-repo-pills">
                <button
                  v-for="r in allRepos" :key="r"
                  :class="['ctx-repo-pill', { 'ctx-repo-pill--selected': draftSource[c.id].repo === r }]"
                  @click="draftSource[c.id].repo = r"
                >{{ r }}</button>
              </div>
              <input
                v-if="draftSource[c.id].type === 'path'"
                v-model="draftSource[c.id].path" class="ctx-input-sm" placeholder="e.g. src/auth" />
              <input
                v-if="draftSource[c.id].type === 'glob'"
                v-model="draftSource[c.id].pattern" class="ctx-input-sm" placeholder="e.g. **/*.sql" />
              <button class="available-pill" :disabled="!canAddSource(c.id)" @click="addSourceFromDraft(c.id)">+ source</button>
              <span v-if="draftConflict(c.id)" class="ctx-conflict ctx-conflict--inline">
                Already in <strong>{{ draftConflict(c.id).name }}</strong>
              </span>
            </div>
          </div>

          <div v-if="!contexts.length && !pendingContextSource" class="no-teams">
            <p>No user-defined bounded contexts yet.</p>
            <p>Every repository maps to an automatic 1:1 context until you group them here, or
              right-click a node in the graph and choose <strong>Add to bounded context</strong>.</p>
          </div>
        </template>

      </div>

      <!-- ── Footer: Import / Export ── -->
      <div class="panel-footer">
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleImport" />
        <span v-if="importError" class="import-error">{{ importError }}</span>
        <button class="footer-btn footer-btn--secondary" @click="fileInput.click()"><Upload :size="14" /> Import JSON</button>
        <button class="footer-btn footer-btn--primary"   @click="handleExport"><Download :size="14" /> Export JSON</button>
      </div>
    </div>
  </transition>

  <!-- Author alias merge confirmation modal -->
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="aliasMergeConfirm" class="modal-backdrop" @click.self="cancelAliasMerge">
        <div class="modal-dialog" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3 class="modal-title">Merge author aliases?</h3>
          </div>
          <p class="modal-body">
            <strong>{{ aliasMergeConfirm.raw }}</strong> will become an alias for
            <strong>{{ aliasMergeConfirm.canonical }}</strong>.
            All contributions from <em>{{ aliasMergeConfirm.raw }}</em> will be attributed to
            <em>{{ aliasMergeConfirm.canonical }}</em> in the graph.
          </p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--secondary" @click="cancelAliasMerge">Cancel</button>
            <button class="modal-btn modal-btn--confirm" @click="confirmAliasMerge">Merge</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>

  <!-- Team deletion confirmation modal -->
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="teamToDelete" class="modal-backdrop" @click.self="teamToDelete = null">
        <div class="modal-dialog" role="dialog" aria-modal="true">
          <div class="modal-header">
            <span class="modal-swatch" :style="{ backgroundColor: teamToDelete.color }"></span>
            <h3 class="modal-title">Delete team?</h3>
          </div>
          <p class="modal-body">
            This will remove the team <strong>{{ teamToDelete.name }}</strong>
            ({{ teamToDelete.authors.length }} authors, {{ teamToDelete.contexts.length }} contexts).
            Members are not deleted — they'll appear as Unassigned.
          </p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--secondary" @click="teamToDelete = null">Cancel</button>
            <button class="modal-btn modal-btn--danger" @click="confirmDeleteTeam">Delete</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useLensStore } from '../stores/useLensStore';
import {
  Map as MapIcon, X, ChevronRight, Trash2, AlertTriangle,
  Upload, Download,
} from '@lucide/vue';
import FabButton from './FabButton.vue';

const store = useLensStore();
const { teams, authorNormalizations, ignoredAuthors, allRawAuthors, allAuthors, allContexts, allRepos, contexts, pendingContextSource, nodeColors } = storeToRefs(store);


function contextName(id) {
  return allContexts.value.find(c => c.id === id)?.name ?? id;
}

function teamColor(canonicalAuthor) {
  return nodeColors.value[`author:${canonicalAuthor}`] ?? null;
}
function aliasPillColor(rawAuthor) {
  const canonical = authorNormalizations.value[rawAuthor] ?? rawAuthor;
  return nodeColors.value[`author:${canonical}`] ?? null;
}

// Groups raw author pills by team (via canonical name), with an Unassigned
// bucket at the bottom. Used by the Author Aliases tab.
const aliasAuthorGroups = computed(() => {
  const canonicalToTeam = {}; // canonicalName → team
  for (const t of teams.value) {
    for (const a of (t.authors ?? [])) canonicalToTeam[a] = t;
  }
  const groups = new Map(); // teamId → { team, authors[] }
  const unassigned = [];
  for (const raw of allRawAuthors.value) {
    if (raw in authorNormalizations.value) continue; // shown in "Active aliases" list
    const team = canonicalToTeam[raw];
    if (!team) { unassigned.push(raw); continue; }
    if (!groups.has(team.id)) groups.set(team.id, { team, authors: [] });
    groups.get(team.id).authors.push(raw);
  }
  const ordered = teams.value
    .map(t => groups.get(t.id))
    .filter(Boolean);
  if (unassigned.length) {
    ordered.push({ team: { id: '__unassigned__', name: 'Unassigned', color: '#9CA3AF' }, authors: unassigned });
  }
  return ordered;
});
const open = ref(false);
const tab  = ref('teams');

// ── Team name / color debouncing ──────────────────────────────────────────
// Local draft values update immediately (keeping the input responsive), while
// writes to the store are debounced so graphData only recomputes after the
// user pauses (400 ms for text, 150 ms for colour).
const draftName  = reactive({});
const draftColor = reactive({});
const _nameTimers  = {};
const _colorTimers = {};

// Initialize drafts for new teams; remove drafts for deleted teams.
// Shallow watch — fires on push/splice/replace but NOT on property mutations
// (which are our own debounced writes, so we don't want to re-init then).
watch(teams, (newTeams) => {
  const live = new Set(newTeams.map(t => t.id));
  for (const id of Object.keys(draftName)) {
    if (!live.has(id)) {
      clearTimeout(_nameTimers[id]);  delete _nameTimers[id];
      clearTimeout(_colorTimers[id]); delete _colorTimers[id];
      delete draftName[id]; delete draftColor[id];
    }
  }
  for (const t of newTeams) {
    if (!(t.id in draftName)) { draftName[t.id] = t.name; draftColor[t.id] = t.color; }
  }
}, { immediate: true });

function onNameInput(team, val) {
  draftName[team.id] = val;
  clearTimeout(_nameTimers[team.id]);
  _nameTimers[team.id] = setTimeout(() => { team.name = val; }, 400);
}
function onNameBlur(team, val) {
  clearTimeout(_nameTimers[team.id]);
  delete _nameTimers[team.id];
  if (team.name !== val) team.name = val;
}
function onColorInput(team, val) {
  draftColor[team.id] = val;
  clearTimeout(_colorTimers[team.id]);
  _colorTimers[team.id] = setTimeout(() => { team.color = val; }, 150);
}
function onColorChange(team, val) {
  // Flush immediately when the colour picker closes (mouseup / change event).
  clearTimeout(_colorTimers[team.id]);
  delete _colorTimers[team.id];
  draftColor[team.id] = val;
  if (team.color !== val) team.color = val;
}

// ── Teams ──────────────────────────────────────────────────────────────────
const expandedTeams = ref(new Set());
function isExpanded(id) { return expandedTeams.value.has(id); }
function toggleTeam(id) {
  const s = new Set(expandedTeams.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedTeams.value = s;
}

// ── New team draft ──────────────────────────────────────────────────────────
// Teams require ≥1 author AND ≥1 context before being saved to the list.
const newTeamDraft = ref(null);

function startAddTeam() {
  const defaults = store.nextTeamDefaults();
  newTeamDraft.value = { ...defaults, authors: [], contexts: [] };
}

function addDraftItem(field, value) {
  if (!newTeamDraft.value[field].includes(value))
    newTeamDraft.value[field].push(value);
}

function removeDraftItem(field, value) {
  newTeamDraft.value[field] = newTeamDraft.value[field].filter(v => v !== value);
}

const draftAvailableAuthors = computed(() => {
  if (!newTeamDraft.value) return [];
  const assigned = new Set(teams.value.flatMap(t => t.authors));
  const inDraft  = new Set(newTeamDraft.value.authors);
  return allAuthors.value.filter(a => !assigned.has(a) && !inDraft.has(a) && !ignoredSet.value.has(a));
});

const draftAvailableContexts = computed(() => {
  if (!newTeamDraft.value) return [];
  const assigned = new Set(teams.value.flatMap(t => t.contexts));
  const inDraft  = new Set(newTeamDraft.value.contexts);
  return allContexts.value.filter(c => !assigned.has(c.id) && !inDraft.has(c.id));
});

const canSaveNewTeam = computed(() =>
  (newTeamDraft.value?.authors.length ?? 0) > 0 &&
  (newTeamDraft.value?.contexts.length ?? 0) > 0
);

function confirmNewTeam() {
  if (!canSaveNewTeam.value || !newTeamDraft.value) return;
  store.addTeam(newTeamDraft.value);
  const addedTeam = teams.value[teams.value.length - 1];
  if (addedTeam) expandedTeams.value = new Set([...expandedTeams.value, addedTeam.id]);
  newTeamDraft.value = null;
}

// Team deletion is gated behind a confirmation modal — clicking the X or
// the in-body delete button stages the team here; the modal commits or cancels.
const aliasMergeConfirm = ref(null); // { raw, canonical } — staged alias merge awaiting confirmation
const teamToDelete = ref(null);
function askDeleteTeam(team) { teamToDelete.value = team; }
function confirmDeleteTeam() {
  if (teamToDelete.value) store.removeTeam(teamToDelete.value.id);
  teamToDelete.value = null;
}
const onModalKeydown = e => {
  if (e.key === 'Escape') { teamToDelete.value = null; aliasMergeConfirm.value = null; }
};
watch([teamToDelete, aliasMergeConfirm], ([t, a]) => {
  if (t || a) window.addEventListener('keydown', onModalKeydown);
  else        window.removeEventListener('keydown', onModalKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onModalKeydown);
  for (const id in _nameTimers)  clearTimeout(_nameTimers[id]);
  for (const id in _colorTimers) clearTimeout(_colorTimers[id]);
});

const ignoredSet = computed(() => new Set(ignoredAuthors.value));

function availableAuthorGroups(team) {
  const otherTeamAuthors = new Set(
    teams.value.filter(t => t.id !== team.id).flatMap(t => t.authors)
  );
  const free = [], shared = [];
  for (const a of allAuthors.value) {
    if (team.authors.includes(a) || ignoredSet.value.has(a)) continue;
    (otherTeamAuthors.has(a) ? shared : free).push(a);
  }
  return { free, shared };
}

function availableContexts(team) {
  const takenElsewhere = new Set(
    teams.value.filter(t => t.id !== team.id).flatMap(t => t.contexts)
  );
  return allContexts.value.filter(c => !team.contexts.includes(c.id) && !takenElsewhere.has(c.id));
}
function addTo(team, field, value) {
  if (!team[field].includes(value)) team[field].push(value);
}
function removeFrom(team, field, value) {
  team[field] = team[field].filter(v => v !== value);
}

const unassignedAuthors = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.authors));
  return allAuthors.value.filter(a => !assigned.has(a));
});
const unassignedContexts = computed(() => {
  const assigned = new Set(teams.value.flatMap(t => t.contexts));
  return allContexts.value.filter(c => !assigned.has(c.id));
});

const unassignedExpanded = ref(false);

// ── Drag unassigned author/repo → team ──
const unassignedDrag = ref(null); // { kind: 'authors' | 'contexts', value: string }
const dropTargetTeamId = ref(null);

function onUnassignedDragStart(kind, value, e) {
  unassignedDrag.value = { kind, value };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', value);
  }
}
function onUnassignedDragEnd() {
  unassignedDrag.value = null;
  dropTargetTeamId.value = null;
}
function onTeamDragOver(teamId) {
  if (unassignedDrag.value) dropTargetTeamId.value = teamId;
}
function onTeamDragLeave(teamId, e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  if (dropTargetTeamId.value === teamId) dropTargetTeamId.value = null;
}
function onTeamDrop(team) {
  const drag = unassignedDrag.value;
  if (drag) addTo(team, drag.kind, drag.value);
  unassignedDrag.value = null;
  dropTargetTeamId.value = null;
}

// ── Author Aliases ──
const dragSource = ref(null);
const dragTarget = ref(null);

const normalizationCount = computed(() => Object.keys(authorNormalizations.value).length);
const sortedNormalizations = computed(() =>
  Object.entries(authorNormalizations.value).sort(([a], [b]) => a.localeCompare(b))
);

function isMapped(author) { return author in authorNormalizations.value; }

function onDragOver(author) { if (author !== dragSource.value) dragTarget.value = author; }
function onDragLeave(author) { if (dragTarget.value === author) dragTarget.value = null; }

function onDrop(canonical) {
  if (dragSource.value && dragSource.value !== canonical) {
    aliasMergeConfirm.value = { raw: dragSource.value, canonical };
  }
  dragSource.value = null;
  dragTarget.value = null;
}

function confirmAliasMerge() {
  if (aliasMergeConfirm.value) {
    store.setNormalization(aliasMergeConfirm.value.raw, aliasMergeConfirm.value.canonical);
  }
  aliasMergeConfirm.value = null;
}

function cancelAliasMerge() {
  aliasMergeConfirm.value = null;
}

// ── Bounded Contexts ─────────────────────────────────────────────────────────
function sourceLabel(s) {
  if (s.type === 'repo') return s.repo;
  if (s.type === 'path') return `${s.repo} / ${s.path}`;
  if (s.type === 'glob') return `${s.repo} : ${s.pattern}`;
  return s.repo;
}

// Per-context draft for the "add source" form. Kept in sync with the context
// list the same way team name/colour drafts are.
const draftSource = reactive({});
function freshDraft() { return { type: 'repo', repo: '', path: '', pattern: '' }; }
watch(contexts, (list) => {
  const live = new Set(list.map(c => c.id));
  for (const id of Object.keys(draftSource)) if (!live.has(id)) delete draftSource[id];
  for (const c of list) if (!(c.id in draftSource)) draftSource[c.id] = freshDraft();
}, { immediate: true, deep: false });

function draftToSource(id) {
  const d = draftSource[id];
  if (!d || !d.repo) return null;
  if (d.type === 'path') return d.path.trim() ? { type: 'path', repo: d.repo, path: d.path.trim() } : null;
  if (d.type === 'glob') return d.pattern.trim() ? { type: 'glob', repo: d.repo, pattern: d.pattern.trim() } : null;
  return { type: 'repo', repo: d.repo };
}
function draftConflict(id) {
  const src = draftToSource(id);
  return src ? store.contextForSource(src) : null;
}
function canAddSource(id) {
  return !!draftToSource(id) && !draftConflict(id);
}
function addSourceFromDraft(id) {
  const source = draftToSource(id);
  if (!source || !canAddSource(id)) return;
  store.addContextSource(id, source);
  draftSource[id] = freshDraft();
}

// Right-click "Create new context" hand-off.
const pendingNewName = ref('');
const pendingNameInput = ref(null);
const pendingNameDuplicateDismissed = ref(false);

const pendingNameDuplicate = computed(() => {
  const trimmed = pendingNewName.value.trim().toLowerCase();
  if (!trimmed || pendingNameDuplicateDismissed.value) return null;
  return contexts.value.find(c => c.name.trim().toLowerCase() === trimmed) ?? null;
});

const canConfirmPending = computed(
  () => pendingNewName.value.trim().length > 0 && !pendingNameDuplicate.value
);

watch(pendingContextSource, async (p) => {
  if (!p) return;
  open.value = true;
  tab.value  = 'contexts';
  pendingNewName.value = p.label ?? '';
  pendingNameDuplicateDismissed.value = false;
  await nextTick();
  pendingNameInput.value?.focus();
});

// Reset duplicate-dismissed flag when the name changes
watch(pendingNewName, () => { pendingNameDuplicateDismissed.value = false; });

function confirmPending() {
  const p = pendingContextSource.value;
  if (!p || !canConfirmPending.value) return;
  store.createContextWithSource(pendingNewName.value.trim(), p.source);
  store.clearPendingContextSource();
}

function assignToDuplicate() {
  const p = pendingContextSource.value;
  const dup = pendingNameDuplicate.value;
  if (!p || !dup) return;
  store.moveContextSource(p.source, dup.id);
  store.clearPendingContextSource();
}

// ── Ignored Authors ──
function isIgnored(name) { return ignoredAuthors.value.includes(name); }
const ignoredAuthorsSorted = computed(() =>
  allAuthors.value.filter(isIgnored).sort((a, b) => a.localeCompare(b))
);
const activeAuthors = computed(() =>
  allAuthors.value.filter(a => !isIgnored(a))
);

// Group active (non-ignored) canonical authors by team, with Unassigned last.
const activeAuthorGroups = computed(() => {
  const canonicalToTeam = {};
  for (const t of teams.value) {
    for (const a of (t.authors ?? [])) canonicalToTeam[a] = t;
  }
  const groups = new Map();
  const unassigned = [];
  for (const a of activeAuthors.value) {
    const team = canonicalToTeam[a];
    if (!team) { unassigned.push(a); continue; }
    if (!groups.has(team.id)) groups.set(team.id, { team, authors: [] });
    groups.get(team.id).authors.push(a);
  }
  const ordered = teams.value.map(t => groups.get(t.id)).filter(Boolean);
  if (unassigned.length) {
    ordered.push({ team: { id: '__unassigned__', name: 'Unassigned', color: '#9CA3AF' }, authors: unassigned });
  }
  return ordered;
});

// ── Import / Export ──
const fileInput   = ref(null);
const importError = ref('');

function handleExport() {
  const blob = new Blob([store.exportMappings()], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'conwaylens-mappings.json' });
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImport(e) {
  importError.value = '';
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    // Clear all draft state before import so drafts reinitialise from the new store values.
    for (const id in _nameTimers)  { clearTimeout(_nameTimers[id]);  delete _nameTimers[id]; }
    for (const id in _colorTimers) { clearTimeout(_colorTimers[id]); delete _colorTimers[id]; }
    for (const id of Object.keys(draftName))  delete draftName[id];
    for (const id of Object.keys(draftColor)) delete draftColor[id];
    store.importMappings(JSON.parse(text));
    e.target.value = '';
  } catch (err) {
    importError.value = err.message;
  }
}
</script>

<style scoped>

.backdrop {
  @apply fixed inset-0 bg-black/50 backdrop-blur-sm z-40;
}
.backdrop-fade-enter-active, .backdrop-fade-leave-active { transition: opacity 0.3s ease; }
.backdrop-fade-enter-from, .backdrop-fade-leave-to { opacity: 0; }

.panel {
  @apply fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col;
  width: 520px; max-width: 95vw;
}
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-enter-from, .slide-panel-leave-to { transform: translateX(100%); }

.panel-header {
  @apply bg-gradient-to-r from-brand-orange-dark to-brand-orange text-white
         px-6 py-5 flex items-center justify-between shadow-lg flex-shrink-0;
}
.panel-title { @apply flex items-center gap-2 text-2xl font-bold m-0; }
.close-btn {
  @apply text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center
         justify-center text-2xl font-bold transition-all duration-200 cursor-pointer;
}

.panel-tabs { @apply flex border-b border-gray-200 flex-shrink-0 bg-white; }
.tab-btn {
  @apply flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-brand-orange
         transition-colors duration-150 relative flex items-center justify-center gap-1.5 cursor-pointer;
}
.tab-btn.active { @apply text-brand-orange border-b-2 border-brand-orange -mb-px; }
.tab-badge {
  @apply bg-brand-orange text-white text-xs font-bold px-2 py-0.5 rounded-full;
}
.tab-badge--red { @apply bg-red-500; }

.panel-body {
  @apply flex-1 overflow-y-auto p-5;
  scrollbar-width: thin; scrollbar-color: rgba(240,130,35,0.3) transparent;
}
.panel-hint { @apply text-sm text-gray-500 mb-4 leading-relaxed; }

/* ── Teams ── */
.add-team-btn {
  @apply w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-brand-orange text-white
         hover:bg-brand-orange-dark transition-all duration-150 mb-4 cursor-pointer;
}
/* ── New Team Draft Card ── */
.new-team-draft {
  @apply border border-brand-orange bg-orange-50 rounded-xl p-4 mb-4 flex flex-col gap-3;
}
.new-team-draft-header {
  @apply flex items-center justify-between;
}
.new-team-draft-title {
  @apply text-sm font-bold text-gray-800;
}
.new-team-draft-row {
  @apply flex items-center gap-2;
}
.draft-required {
  @apply ml-1 text-[10px] font-bold uppercase tracking-wide text-brand-orange;
}
.new-team-actions {
  @apply flex items-center justify-end gap-2 mt-1;
}

/* ── Bounded Contexts tab ── */
.ctx-card { @apply bg-gray-50 border border-gray-200 rounded-xl p-4 mb-3; }
.ctx-card-header { @apply flex items-center gap-2 mb-2; }
.ctx-sources { @apply flex flex-col gap-1.5 mb-3; }
.ctx-source-row { @apply flex items-center gap-2 text-sm; }
.ctx-source-type {
  @apply text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded
         bg-gray-200 text-gray-600 flex-shrink-0;
}
.ctx-source-type--repo { @apply bg-blue-100 text-blue-700; }
.ctx-source-type--path { @apply bg-teal-100 text-teal-700; }
.ctx-source-type--glob { @apply bg-orange-100 text-orange-700; }
.ctx-source-desc { @apply font-mono text-gray-700 truncate; }
.ctx-add-source { @apply flex flex-col gap-2; }
.ctx-input, .ctx-input-sm {
  @apply border border-gray-300 rounded px-2 py-1 text-sm bg-white;
}
.ctx-input-sm { @apply text-xs py-0.5; }
.ctx-input { @apply flex-1 min-w-0; }
.ctx-pending {
  @apply border border-brand-orange bg-orange-50 rounded-xl p-4 mb-4 flex flex-col gap-3;
}
.ctx-pending-title {
  @apply text-sm font-semibold text-gray-800;
}
.ctx-pending-source-row {
  @apply flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2;
}
.ctx-new-name-input {
  @apply border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white w-full
         focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange;
}
.ctx-dupe-warning {
  @apply flex flex-wrap items-start gap-1.5 text-xs text-amber-800 bg-amber-50
         border border-amber-200 rounded-lg px-3 py-2;
}
.ctx-dupe-actions { @apply flex gap-2 w-full mt-1; }
.ctx-dupe-btn {
  @apply px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-100 cursor-pointer;
}
.ctx-dupe-btn--assign {
  @apply border-brand-teal text-brand-teal bg-white hover:bg-brand-teal hover:text-white;
}
.ctx-dupe-btn--new {
  @apply border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:text-gray-800;
}
.ctx-pending-actions { @apply flex items-center gap-2 justify-end; }
.ctx-conflict { @apply text-xs text-red-600; }
.ctx-conflict--inline { @apply w-full; }
/* Type toggle pills */
.ctx-type-pills { @apply flex items-center gap-1; }
.ctx-type-pill {
  @apply px-2.5 py-0.5 rounded-full text-xs font-semibold border cursor-pointer
         border-gray-300 text-gray-500 bg-white hover:border-gray-400 transition-all duration-100;
}
.ctx-type-pill--repo.ctx-type-pill--active { @apply bg-blue-100 border-blue-400 text-blue-700; }
.ctx-type-pill--path.ctx-type-pill--active { @apply bg-teal-100 border-teal-400 text-teal-700; }
.ctx-type-pill--glob.ctx-type-pill--active { @apply bg-orange-100 border-orange-400 text-orange-700; }
/* Repo pills in add-source form */
.ctx-repo-pills { @apply flex flex-wrap gap-1; }
.ctx-repo-pill {
  @apply px-2 py-0.5 rounded-full text-xs font-mono border border-brand-teal
         text-brand-teal bg-white hover:bg-brand-teal hover:text-white
         transition-all duration-100 cursor-pointer;
}
.ctx-repo-pill--selected { @apply bg-brand-teal text-white; }

.teams-list { @apply flex flex-col gap-4; }
.team-card { @apply bg-gray-50 border border-gray-200 rounded-xl p-4; }
.team-card-header { @apply flex items-center gap-2 mb-1; }
.team-toggle {
  @apply flex items-center justify-center w-6 h-6 rounded text-gray-400
         hover:text-brand-orange hover:bg-orange-50 transition-all flex-shrink-0 cursor-pointer;
}
.chevron { transition: transform 0.2s ease; color: #6B7280; }
.chevron.rotated { transform: rotate(90deg); }
.title-icon { @apply text-gray-700; }
.team-summary { @apply text-xs text-gray-400 italic flex-1 min-w-0 truncate; }
.team-body { @apply mt-3; }
.team-name-row { @apply flex items-center gap-2 flex-1; }
.team-name-input {
  @apply flex-1 px-3 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg
         focus:outline-none focus:border-brand-orange transition-all;
}
.color-picker { @apply w-8 h-8 rounded-full cursor-pointer border-2 border-gray-300 p-0.5; }
.remove-team-btn {
  @apply w-7 h-7 flex items-center justify-center rounded-full text-gray-400
         hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-sm font-bold
         cursor-pointer flex-shrink-0;
}
.section-label { @apply text-xs font-bold text-gray-500 uppercase tracking-wide mt-3 mb-2; }
.assigned-chips { @apply flex flex-wrap gap-1.5 min-h-[28px]; }
.assigned-chip {
  @apply flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white;
}
.author-chip { @apply bg-brand-blue; }
.repo-chip   { @apply bg-brand-teal; }
.chip-remove {
  @apply ml-0.5 w-4 h-4 flex items-center justify-center rounded-full
         hover:bg-white/30 text-white cursor-pointer font-bold text-xs leading-none;
}
.chip-remove:disabled {
  @apply opacity-30 cursor-not-allowed;
  pointer-events: auto;
}
.empty-hint { @apply text-xs text-gray-400 italic self-center; }
.available-list { @apply mt-2; }
.available-label { @apply text-xs text-gray-400 mb-1; }
.available-pills { @apply flex flex-wrap gap-1; }
.available-pill {
  @apply px-2 py-0.5 rounded-full text-xs font-medium border border-brand-blue text-brand-blue
         bg-white hover:bg-brand-blue hover:text-white transition-all duration-100 cursor-pointer;
}
.available-pill.repo-pill {
  @apply border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white;
}
.available-label--shared { @apply text-amber-600 mt-2; }
.available-pill--shared {
  @apply border-amber-400 text-amber-700 bg-amber-50
         hover:bg-amber-400 hover:text-white hover:border-amber-400;
}
.no-teams { @apply text-center text-gray-500 py-10 space-y-2; }
.hint-text { @apply text-xs text-gray-400; }
.unassigned-section { @apply mt-6 mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden; }
.unassigned-title {
  @apply flex items-center gap-1.5 text-sm font-bold text-amber-700 w-full px-4 py-3
         cursor-pointer hover:bg-amber-100/70 transition-colors duration-150;
}
.unassigned-count {
  @apply ml-auto text-xs font-bold text-amber-600/70 bg-amber-200/60 px-2 py-0.5 rounded-full;
}
.unassigned-hint { @apply text-xs text-amber-600/80 italic mb-3 flex items-center gap-1 px-4; }
.unassigned-hint::before { content: '✋'; font-style: normal; }
.unassigned-group { @apply mb-3 px-4; }
.unassigned-group:last-child { @apply pb-3; }
.unassigned-label { @apply block text-xs text-amber-600 font-medium mb-1.5; }
.unassigned-chips { @apply flex flex-wrap gap-1.5; }
.unassigned-chip {
  @apply px-3 py-1 rounded-full text-xs font-semibold;
  background-color: rgba(156, 163, 175, 0.18);
  color: #4B5563;
  border: 1px dashed #9CA3AF;
}
.unassigned-chip--draggable { @apply cursor-grab select-none; }
.unassigned-chip--draggable:active { @apply cursor-grabbing; }
.unassigned-chip--dragging { @apply opacity-40; }
.team-card { @apply transition-all duration-150; }
.team-card--drop-target {
  @apply ring-2 ring-brand-orange ring-offset-1 bg-orange-50 border-brand-orange;
}
.team-card--drop-target * { pointer-events: none; }

/* ── Team body transition ── */
.team-body-enter-active { transition: max-height 0.25s ease, opacity 0.2s ease; }
.team-body-leave-active { transition: max-height 0.2s ease, opacity 0.15s ease; }
.team-body-enter-from, .team-body-leave-to { max-height: 0; opacity: 0; overflow: hidden; }
.team-body-enter-to, .team-body-leave-from { max-height: 800px; overflow: hidden; }

/* ── Author Aliases ── */
.alias-groups { @apply flex flex-col gap-3; }
.alias-group { @apply flex flex-col gap-1.5; }
.alias-group-header { @apply flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide; }
.alias-group-swatch { @apply inline-block w-2.5 h-2.5 rounded-full; }
.alias-group-name { @apply text-gray-600; }
.alias-group-count { @apply text-gray-400 font-mono normal-case tracking-normal; }
.author-pills-grid { @apply flex flex-wrap gap-2; }
.author-pill {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
         bg-brand-blue text-white cursor-grab select-none transition-all duration-150;
}
.author-pill span { pointer-events: none; }
.author-pill.pill-mapped      { @apply bg-gray-300 text-gray-600; }
.author-pill.pill-dragging    { @apply opacity-40 cursor-grabbing; }
.author-pill.pill-drop-target { @apply ring-2 ring-offset-1 ring-brand-orange scale-105 bg-brand-orange; }
.pill-alias-badge { @apply text-gray-500 font-normal italic text-[10px]; }
.pill-mapped .pill-alias-badge { color: inherit; }

.alias-list { @apply flex flex-col gap-1.5; }
.alias-row  { @apply flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2; }
.alias-raw       { @apply text-xs text-gray-500 font-mono flex-1 truncate; }
.alias-arrow-sm  { @apply text-gray-400 font-bold flex-shrink-0; }
.alias-canonical { @apply text-xs font-semibold text-brand-blue flex-1 truncate; }
.alias-remove {
  @apply w-6 h-6 flex items-center justify-center rounded-full text-gray-400
         hover:bg-red-100 hover:text-red-600 transition-all duration-150 text-xs
         font-bold cursor-pointer flex-shrink-0;
}

/* ── Footer ── */
.panel-footer {
  @apply flex items-center gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0;
}
.footer-btn {
  @apply inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150;
}
.footer-btn--primary {
  @apply bg-brand-orange text-white hover:bg-brand-orange-dark ml-auto;
}
.footer-btn--secondary {
  @apply border border-gray-300 text-gray-600 bg-white hover:border-brand-orange hover:text-brand-orange;
}
.import-error { @apply text-xs text-red-600 flex-1 truncate; }

/* ── Ignored Authors ── */
.section-label--ignored { @apply text-red-600 mt-0; }
.ignored-group {
  @apply p-3 bg-red-50/60 border border-red-200 rounded-xl;
}
.author-pill--active {
  @apply border-0 cursor-pointer hover:bg-red-500 hover:text-white;
}
.author-pill--ignored {
  @apply bg-red-100 text-red-700 border border-red-300 cursor-pointer
         hover:bg-red-200 transition-all;
}
.author-pill--ignored .pill-name { @apply line-through; }
.pill-x { @apply text-red-500 font-bold text-[10px]; }

/* Unassigned authors — match the "Unassigned Contributors" team styling */
.author-pill.pill-unassigned {
  background-color: rgba(156, 163, 175, 0.18);
  color: #4B5563;
  border: 1px dashed #9CA3AF;
  /* compensate for the added border so layout matches solid pills */
  padding-top: calc(0.375rem - 1px);
  padding-bottom: calc(0.375rem - 1px);
}
.author-pill.pill-unassigned:hover {
  background-color: rgba(156, 163, 175, 0.3);
}
.author-pill--active.pill-unassigned:hover {
  background-color: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

/* ── Confirmation modal ── */
.modal-backdrop {
  @apply fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm;
}
.modal-dialog {
  @apply bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-[92%] p-6;
}
.modal-header { @apply flex items-center gap-3 mb-3; }
.modal-swatch { @apply inline-block w-3 h-3 rounded-full flex-shrink-0; }
.modal-title  { @apply text-lg font-bold text-gray-800; }
.modal-body   { @apply text-sm text-gray-600 leading-relaxed; }
.modal-actions { @apply mt-5 flex justify-end gap-2; }
.modal-btn {
  @apply px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer;
}
.modal-btn--secondary {
  @apply bg-white text-gray-600 border border-gray-200 hover:bg-gray-50;
}
.modal-btn--danger {
  @apply bg-red-500 text-white hover:bg-red-600;
}
.modal-btn--confirm {
  @apply bg-brand-blue text-white hover:bg-brand-blue/85;
}
.modal-btn--confirm:disabled {
  @apply opacity-40 cursor-not-allowed;
  pointer-events: auto;
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.15s ease; }
.modal-fade-enter-active .modal-dialog, .modal-fade-leave-active .modal-dialog {
  transition: transform 0.15s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-from .modal-dialog, .modal-fade-leave-to .modal-dialog {
  transform: scale(0.96);
}
</style>

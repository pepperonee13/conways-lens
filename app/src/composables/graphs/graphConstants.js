// ── Shared graph constants ─────────────────────────────────────────────────

export const EDGE = {
  COLOR:            '#94a3b8',
  HL_COLOR:         '#225EA9',
  HL_OPACITY:       0.9,
  CROSS_OPACITY:    0.75,  // cross-team edge opacity (author-contribution graph)
  SAME_OPACITY:     0.18,  // same-team edge opacity  (author-contribution graph)
  WIDTH:            1.5,
  WIDTH_LOG_K:      0.9,
};

export const NODE = {
  STROKE:        '#fff',
  STROKE_WIDTH:  2.5,
  STROKE_WIDTH_TEAM: 3,
  LABEL_COLOR:   '#374151',
  LABEL_SIZE:    '11px',
  LABEL_SIZE_SM: '10px',
  OPACITY:       0.92,
  OPACITY_TEAM:  0.95,
};

export const ARROW = {
  VIEWBOX:  '0 -5 10 10',
  REF_X:    10,
  REF_Y:    0,
  SIZE:     12,  // compact/static layouts (Conway, Swimlane)
  SIZE_LG:  14,  // force-directed layout (Author-Contribution) — longer edges suit larger arrowhead
};

export const TOOLTIP_OFFSET = { x: 14, y: -10 };

export const NODE_LABEL_OFFSET = 13; // px gap between node boundary and label baseline

export const REPO_DETAIL = {
  REPO_R:          44,   // radius of central repo circle
  AUTHOR_R_MIN:     8,   // rScale range min
  AUTHOR_R_MAX:    22,   // rScale range max
  EDGE_REPO_GAP:   30,   // clearance beyond repo square boundary to arrow tail
  ARC_SLOT_MAX:    12,   // 2π / this = max arc per slot (~30°)
  ARC_SLOT_MIN:    40,   // 2π / this = min arc per slot (~9°)
  ARC_FILL_FRAC:  0.6,   // fraction of full circle used for node slots
  PILL_W:         100,   // collapsed team pill width
  PILL_H:          44,   // collapsed team pill height
  PILL_RX:         10,   // collapsed team pill corner radius
  BLUR_STD:        22,   // feGaussianBlur stdDeviation for hull aura
};

export const TEAM_PILL_PAD = 14;  // extra half-width on each side of team pill shape

export const VIOLATION_ARC = {
  INNER_PAD: 3,
  OUTER_PAD: 9,
};

export const FOLDER_GRAPH = {
  FOLDER_HALF_W: 38,
  FOLDER_H:      32,
  FOLDER_RX:      7,
  EDGE_GAP:      10,
};

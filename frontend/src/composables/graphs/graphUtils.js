import { EDGE } from './graphConstants.js';

export function calcEdgeWidth(commits, edgeWeightOn) {
  return edgeWeightOn ? Math.max(1, 1 + Math.log1p(commits) * EDGE.WIDTH_LOG_K) : EDGE.WIDTH;
}

export function toPct(commits, total) {
  return ((commits / total) * 100).toFixed(1).replace(/\.0$/, '');
}

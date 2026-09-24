// 持久化层：拓扑与审批路线分开存储，互不影响
import { seed } from './seed.js';

const TOPO_KEY = 'topology';
const ROUTES_KEY = 'topology.routes';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ---- 拓扑 ----
export function loadTopology() {
  const data = readJson(TOPO_KEY, null);
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return seed;
  return data;
}

export function saveTopology(data) {
  try {
    localStorage.setItem(TOPO_KEY, JSON.stringify(data));
  } catch {
    /* 存储不可用时静默降级 */
  }
}

// ---- 已审批路线（固化记录，设备删除后保留并标记失效）----
export function loadRoutes() {
  const data = readJson(ROUTES_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function saveRoutes(routes) {
  try {
    localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
  } catch {
    /* 存储不可用时静默降级 */
  }
}

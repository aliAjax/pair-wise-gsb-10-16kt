// 持久化层：只管 localStorage 读写与数据规范化/种子数据，
// 不含任何业务判定。拓扑与放行路线分开存，互不污染。

const TOPO_KEY = 'topology';
const ROUTES_KEY = 'topology.routes.v1';

// 为 1.0 老数据补默认值（passDir/action），并清理引用不存在节点的边。
export function normalizeTopology(raw) {
  const nodes = (raw?.nodes || []).map((n) => ({
    passDir: 'both',
    action: 'allow',
    denyReason: '',
    ...n,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (raw?.edges || [])
    .filter(
      (e) =>
        Array.isArray(e) &&
        e.length === 2 &&
        ids.has(e[0]) &&
        ids.has(e[1]) &&
        e[0] !== e[1],
    )
    .map(([a, b]) => [a, b]);
  return { nodes, edges };
}

function defaultTopology() {
  return {
    nodes: [
      { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 200, ip: '10.0.0.1', passDir: 'both', action: 'allow', denyReason: '' },
      { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 360, ip: '10.0.1.1', passDir: 'both', action: 'allow', denyReason: '' },
      { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 360, ip: '10.0.2.1', passDir: 'out', action: 'allow', denyReason: '' },
      { id: 'web', name: 'Web Server', type: 'server', x: 120, y: 520, ip: '10.0.1.10', passDir: 'both', action: 'allow', denyReason: '' },
      { id: 'db', name: 'Database', type: 'server', x: 420, y: 540, ip: '10.0.1.20', passDir: 'both', action: 'deny', denyReason: '仅允许应用服务器 4455 访问 1521 端口' },
      { id: 'user', name: '办公终端', type: 'device', x: 820, y: 520, ip: '10.0.2.22' },
    ],
    edges: [
      ['gw', 'sw1'],
      ['gw', 'sw2'],
      ['sw1', 'web'],
      ['sw1', 'db'],
      ['sw2', 'user'],
    ],
  };
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时静默降级，编辑功能仍可在内存中使用。
  }
}

export function loadTopology() {
  return normalizeTopology(read(TOPO_KEY, null) || defaultTopology());
}

export function saveTopology(data) {
  write(TOPO_KEY, data);
}

export function loadRoutes() {
  const list = read(ROUTES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveRoutes(routes) {
  write(ROUTES_KEY, routes);
}

export function defaultSeed() {
  return defaultTopology();
}

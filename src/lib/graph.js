// 计算层：纯函数，不碰 DOM、不碰 localStorage，方便单测与复用。
// 无向图结构：edges 为 [a, b] 二元组。

export function buildAdjacency(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  edges.forEach(([a, b]) => {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a).add(b);
      adj.get(b).add(a);
    }
  });
  return adj;
}

// 广度优先求 source -> target 的最短路径（节点 id 数组，含两端）。
// 不可达时返回 null。
export function shortestPath(nodes, edges, source, target) {
  if (source === target) return [source];
  const adj = buildAdjacency(nodes, edges);
  if (!adj.has(source) || !adj.has(target)) return null;
  const queue = [source];
  const prev = new Map([[source, null]]);
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur)) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === target) {
        const path = [target];
        let p = cur;
        while (p !== null) {
          path.push(p);
          p = prev.get(p);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

// 不可达时，从源所在的连通分量里找“最靠近目标坐标的末梢节点”，
// 作为路径中断（中间设备缺失）的第一个阻塞点。
export function nearestFrontier(nodes, edges, source, target) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const t = byId.get(target);
  if (!byId.has(source)) return null;
  const adj = buildAdjacency(nodes, edges);
  const seen = new Set([source]);
  const queue = [source];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  if (seen.has(target)) return null; // 实际可达，没有断裂点
  const d = (id) => {
    const n = byId.get(id);
    if (!n || !t) return Infinity;
    return Math.hypot(n.x - t.x, n.y - t.y);
  };
  let best = null;
  let bestDist = Infinity;
  for (const id of seen) {
    // 末梢：邻居都在已访问集合内；连通分量内所有节点都满足，
    // 再用与目标的坐标距离挑出“走得最远”的那台。
    const dist = d(id);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

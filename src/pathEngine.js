// 路径放行计算层（纯函数，不依赖 React / localStorage）
//
// 设备策略结构：node.policy = {
//   in:  { action: 'allow' | 'deny', ruleName: string }, // 入方向（访问入口 / 入站规则）
//   out: { action: 'allow' | 'deny', ruleName: string }, // 出方向（出口策略）
// }
// 未登记的策略按默认放行处理（DEFAULT_POLICY）。

export const BLOCK = {
  ENTRY_MISMATCH: 'entryMismatch', // 访问方向不符
  POLICY_DENY: 'policyDeny',       // 策略拒绝
  DEVICE_MISSING: 'deviceMissing', // 中间设备缺失
  NO_PATH: 'noPath',               // 拓扑不可达（按中间设备缺失处理）
};

export const BLOCK_LABEL = {
  [BLOCK.ENTRY_MISMATCH]: '访问方向不符',
  [BLOCK.POLICY_DENY]: '策略拒绝',
  [BLOCK.DEVICE_MISSING]: '中间设备缺失',
  [BLOCK.NO_PATH]: '中间设备缺失',
};

export const DEFAULT_POLICY = { action: 'allow', ruleName: '' };

const policyOf = (node, dir) => node?.policy?.[dir] || DEFAULT_POLICY;

// 邻接表（物理链路是无向的，方向由访问入口登记来表达）
export function buildAdj(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
  }
  return adj;
}

// BFS 求最短物理路径，返回节点 id 数组；不可达返回 null
export function findPath(nodes, edges, sourceId, targetId) {
  if (sourceId === targetId) return null;
  if (!nodes.some((n) => n.id === sourceId) || !nodes.some((n) => n.id === targetId)) return null;
  const adj = buildAdj(nodes, edges);
  const queue = [sourceId];
  const prev = new Map([[sourceId, null]]);
  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) {
      const path = [];
      for (let id = targetId; id !== null; id = prev.get(id)) path.push(id);
      return path.reverse();
    }
    for (const next of adj.get(cur) || []) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  return null;
}

// 方向校验：登记的访问入口必须是源终端的直连下一跳，且路径必须从该入口进入
function resolveEntryPath(nodes, edges, sourceId, targetId, entryId) {
  const adj = buildAdj(nodes, edges);
  if (entryId && !(adj.get(sourceId) || []).includes(entryId)) {
    return { mismatch: true };
  }
  // 物理路径的第一跳若与登记入口不一致，即为访问方向不符
  const physical = findPath(nodes, edges, sourceId, targetId);
  if (!physical) return { noPath: true };
  if (entryId && physical[1] !== entryId) return { mismatch: true, physical };
  return { path: physical };
}

const nodeMap = (nodes) => new Map(nodes.map((n) => [n.id, n]));

/**
 * 评估一条访问登记请求能否放行。
 * request = { sourceId, targetId, entryId, egress: { ruleName } }
 * 返回：
 *   { allowed: true,  steps }
 *   { allowed: false, blockedAt: index, reason, reasonLabel, ruleName, device, steps }
 * steps: [{ nodeId, name, type, role: 'source'|'hop'|'target', status, ruleName, note, missing }]
 * 路径停在第一个阻塞点：阻塞点之后的步骤 status = 'untested'。
 */
export function evaluatePath(nodes, edges, request) {
  const { sourceId, targetId, entryId, egress = {} } = request;
  const byId = nodeMap(nodes);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);

  // 源或目标设备本身已被移除
  if (!source || !target) {
    const steps = [
      stepOf(byId, sourceId, 'source', source ? 'ok' : 'blocked'),
      stepOf(byId, targetId, 'target', !target ? 'blocked' : 'untested'),
    ];
    return blockResult(steps, 0, BLOCK.DEVICE_MISSING, missingName(byId, !source ? sourceId : targetId), null);
  }

  const resolved = resolveEntryPath(nodes, edges, sourceId, targetId, entryId);

  if (resolved.mismatch) {
    const actualEntry = resolved.physical?.[1]
      ? byId.get(resolved.physical[1])
      : null;
    const steps = resolved.physical
      ? resolved.physical.map((id, i) =>
          stepOf(byId, id, roleOf(i, resolved.physical.length - 1), i === 1 ? 'blocked' : i < 1 ? 'ok' : 'untested'))
      : [stepOf(byId, sourceId, 'source', 'ok')];
    const entryNode = byId.get(entryId);
    return blockResult(
      steps,
      1,
      BLOCK.ENTRY_MISMATCH,
      entryNode?.name || entryId,
      null,
      actualEntry
        ? `登记入口「${entryNode?.name || entryId}」不在访问方向上，实际下一跳为「${actualEntry.name}」`
        : `登记入口「${entryNode?.name || entryId}」不是源终端的直连设备`,
    );
  }

  if (resolved.noPath) {
    const steps = [stepOf(byId, sourceId, 'source', 'ok'), stepOf(byId, targetId, 'target', 'untested')];
    return blockResult(steps, 1, BLOCK.NO_PATH, null, null, '源与目标之间没有可达链路，中间设备缺失');
  }

  const pathIds = resolved.path;
  const byId2 = byId;

  // 逐跳检查，停在第一个阻塞点
  const checks = [];
  for (let i = 0; i < pathIds.length; i++) {
    const id = pathIds[i];
    const node = byId2.get(id);
    const role = roleOf(i, pathIds.length - 1);

    if (!node) {
      // 链路引用的设备已被移除（中间设备缺失）
      checks.push({ block: BLOCK.DEVICE_MISSING, deviceName: id, ruleName: null, dir: null });
      break;
    }

    if (role === 'source') {
      checks.push(null); // 源终端发起访问，不检查
      continue;
    }

    if (role === 'target') {
      // 目标服务：先查入站规则，再核对登记的出口策略
      const inPol = policyOf(node, 'in');
      if (inPol.action === 'deny') {
        checks.push({ block: BLOCK.POLICY_DENY, deviceName: node.name, ruleName: inPol.ruleName, dir: 'in' });
        break;
      }
      const outPol = policyOf(node, 'out');
      const wantRule = (egress.ruleName || '').trim();
      if (outPol.action === 'deny') {
        checks.push({ block: BLOCK.POLICY_DENY, deviceName: node.name, ruleName: outPol.ruleName, dir: 'out' });
        break;
      }
      if (wantRule && wantRule !== (outPol.ruleName || '').trim()) {
        checks.push({
          block: BLOCK.POLICY_DENY,
          deviceName: node.name,
          ruleName: wantRule,
          dir: 'out',
          note: `出口策略 ${wantRule} 未登记在「${node.name}」上，实际策略：${outPol.ruleName || '（默认放行）'}`,
        });
        break;
      }
      checks.push(null); // 通过
      continue;
    }

    // 中间设备：检查入方向（沿途设备入站规则）
    const inPol = policyOf(node, 'in');
    if (inPol.action === 'deny') {
      checks.push({ block: BLOCK.POLICY_DENY, deviceName: node.name, ruleName: inPol.ruleName, dir: 'in' });
      break;
    }
    checks.push(null);
  }

  const blockIdx = checks.findIndex((c) => c !== null);
  const steps = pathIds.map((id, i) => {
    const role = roleOf(i, pathIds.length - 1);
    let status = 'ok';
    if (blockIdx !== -1) {
      status = i < blockIdx ? 'ok' : i === blockIdx ? 'blocked' : 'untested';
    }
    return stepOf(byId2, id, role, status, checks[i]);
  });

  if (blockIdx === -1) return { allowed: true, blockedAt: null, steps };

  const c = checks[blockIdx];
  const node = byId2.get(pathIds[blockIdx]);
  return blockResult(steps, blockIdx, c.block, c.deviceName, c.ruleName, c.note || defaultDenyNote(c, node), node);
}

function roleOf(i, last) {
  if (i === 0) return 'source';
  if (i === last) return 'target';
  return 'hop';
}

function stepOf(byId, id, role, status, check = null) {
  const node = byId.get(id);
  return {
    nodeId: id,
    name: node?.name || id,
    type: node?.type || null,
    missing: !node,
    role,
    status,
    ruleName: check ? check.ruleName : null,
  };
}

function missingName(byId, id) {
  return byId.get(id)?.name || id;
}

function defaultDenyNote(c, node) {
  if (!node) return `设备「${c.deviceName}」已从拓扑中移除，路线在该处中断`;
  const dir = c.dir === 'in' ? '入方向' : '出口';
  return `「${node.name}」${dir}规则 ${c.ruleName || ''} 拒绝该访问`.replace(/\s+/g, ' ');
}

function blockResult(steps, blockedAt, reason, device, ruleName, note) {
  return {
    allowed: false,
    blockedAt,
    reason,
    reasonLabel: BLOCK_LABEL[reason] || reason,
    device,
    ruleName,
    note,
    steps,
  };
}

/**
 * 固化审批路线。
 * 返回记录结构（顺序固定为 pathIds，之后仅坐标可变）。
 */
export function buildRouteRecord(nodes, request, result) {
  const byId = nodeMap(nodes);
  const now = new Date().toISOString();
  return {
    id: 'route-' + Date.now().toString(36),
    sourceId: request.sourceId,
    targetId: request.targetId,
    entryId: request.entryId || null,
    egressRule: request.egress?.ruleName || '',
    pathIds: result.steps.map((s) => s.nodeId),
    status: 'approved', // approved | invalid
    invalidReason: null,
    createdAt: now,
    // 固化时刻的设备快照，设备删除后仍可显示路线
    snapshot: result.steps.map((s) => {
      const n = byId.get(s.nodeId);
      return { id: s.nodeId, name: n?.name || s.name, type: n?.type || s.type || null };
    }),
  };
}

/**
 * 复算已固化路线是否仍然有效。
 * 规则：只有路线中的设备被移除才标失效（失效不可逆）；坐标移动不影响顺序与有效性。
 */
export function revalidateRoute(route, nodes) {
  if (route.status === 'invalid') return route;
  const ids = new Set(nodes.map((n) => n.id));
  const gone = route.pathIds.find((id) => !ids.has(id));
  if (!gone) return route;
  const snap = route.snapshot?.find((s) => s.id === gone);
  return {
    ...route,
    status: 'invalid',
    invalidReason: `设备「${snap?.name || gone}」已移除`,
  };
}

/**
 * 把已固化路线还原成画布高亮所需步骤（不做策略复算，顺序按固化记录）。
 */
export function routeToSteps(route, nodes) {
  const byId = nodeMap(nodes);
  return route.pathIds.map((id, i) => {
    const node = byId.get(id);
    const snap = route.snapshot?.find((s) => s.id === id);
    return {
      nodeId: id,
      name: node?.name || snap?.name || id,
      type: node?.type || snap?.type || null,
      missing: !node,
      role: roleOf(i, route.pathIds.length - 1),
      status: route.status === 'invalid' && !node ? 'missing' : 'frozen',
    };
  });
}

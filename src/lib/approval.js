// 计算层：业务路径放行判定。
// 规则：
//  1. 中间设备缺失（图上不可达）-> 路径停在离目标最近的末梢设备。
//  2. 访问方向不符 -> 入口设备必须允许 inbound（in / both），
//     出口设备必须允许 outbound（out / both），内部转发设备两者都要。
//  3. 策略拒绝 -> 设备 action=deny，或目标服务的出口策略 action=deny。
// 校验沿流量方向逐跳进行，命中第一个阻塞点即返回。

import { nearestFrontier, shortestPath } from './graph.js';

const byIdMap = (nodes) => new Map(nodes.map((n) => [n.id, n]));

function directionFail(node, role) {
  const dir = node.passDir || 'both';
  const allowsIn = dir === 'in' || dir === 'both';
  const allowsOut = dir === 'out' || dir === 'both';
  // 访问入口校验入站，出口校验出站，沿途（中间转发）设备两者都要。
  const needIn = role !== 'exit';
  const needOut = role !== 'entry';
  if (needIn && !allowsIn) {
    return role === 'entry'
      ? '访问入口设备未开放入站方向（passDir=out），业务流量无法从源侧进入'
      : '沿途转发设备未开放入站方向（passDir=out），无法接收上一跳流量';
  }
  if (needOut && !allowsOut) {
    return role === 'exit'
      ? '出口设备未开放出站方向（passDir=in），业务流量无法送达目标服务'
      : '沿途转发设备未开放出站方向（passDir=in），无法向下一跳转发';
  }
  return null;
}

/**
 * 评估一条业务路径。
 * @returns 见各分支，公共字段：
 *   status: 'approved' | 'denied' | 'direction' | 'unreachable'
 *   chain: 沿流量方向的节点 id 序列（不可达时只到断裂点）
 */
export function evaluatePath(nodes, edges, sourceId, targetId) {
  const byId = byIdMap(nodes);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) {
    return {
      status: 'denied',
      chain: [],
      entry: null,
      middle: [],
      exit: null,
      blocker: {
        device: null,
        rule: '源终端或目标服务不存在（可能已被移除）',
        reason: 'endpoints-missing',
        pending: [],
      },
    };
  }

  const path = shortestPath(nodes, edges, sourceId, targetId);

  // —— 阻塞点一：中间设备缺失 ——
  if (path === null) {
    const frontier = nearestFrontier(nodes, edges, sourceId, targetId);
    const chain = [];
    // 断裂点之前的链路由源到 frontier 的最短路径给出。
    if (frontier) {
      const head = shortestPath(nodes, edges, sourceId, frontier);
      if (head) chain.push(...head);
    } else {
      chain.push(sourceId);
    }
    return {
      status: 'unreachable',
      chain,
      entry: chain[1] ? chain[1] : null,
      middle: chain.slice(1, -1),
      exit: null,
      blocker: {
        device: frontier || sourceId,
        rule: '缺少连通的中间设备：拓扑在此中断，后续设备和出口策略均未登记到',
        reason: 'missing-device',
        pending: [],
      },
    };
  }

  // 直接相连时链路上没有中间设备，登记项仍按“源/目标”给出。
  const entry = path.length >= 3 ? path[1] : null;
  const exit = path.length >= 3 ? path[path.length - 2] : null;
  const middle = path.slice(1, -1);

  // 沿流量方向逐跳检查方向与设备策略。
  for (let i = 1; i < path.length - 1; i++) {
    const id = path[i];
    const node = byId.get(id);
    const isEntry = i === 1;
    const isExit = i === path.length - 2;
    const role = isEntry ? 'entry' : isExit ? 'exit' : 'middle';

    const dirMsg = directionFail(node, role);
    if (dirMsg) {
      return {
        status: 'direction',
        chain: path.slice(0, i + 1),
        entry,
        middle: middle.slice(0, middle.indexOf(id) + 1),
        exit,
        blocker: {
          device: id,
          rule: dirMsg,
          reason: isEntry ? 'direction-entry' : isExit ? 'direction-exit' : 'direction',
          pending: path.slice(i + 1),
        },
      };
    }

    if (node.action === 'deny') {
      return {
        status: 'denied',
        chain: path.slice(0, i + 1),
        entry,
        middle: middle.slice(0, middle.indexOf(id) + 1),
        exit,
        blocker: {
          device: id,
          rule: node.denyReason
            ? `访问控制规则：拒绝（${node.denyReason}）`
            : '访问控制规则：该设备动作为拒绝（deny）',
          reason: 'device-deny',
          pending: path.slice(i + 1),
        },
      };
    }
  }

  // —— 出口策略：落在目标服务（服务器）上 ——
  if (target.action === 'deny') {
    return {
      status: 'denied',
      chain: path,
      entry,
      middle,
      exit,
      blocker: {
        device: targetId,
        rule: target.denyReason
          ? `出口策略：拒绝（${target.denyReason}）`
          : '出口策略：目标服务未放行（deny）',
        reason: 'egress-deny',
        pending: [],
      },
    };
  }

  return {
    status: 'approved',
    chain: path,
    entry,
    middle,
    exit,
    blocker: null,
  };
}

// 通过后固化：只存节点 id 顺序与登记时刻快照，之后移动节点只改坐标，
// 顺序不因拓扑增删而改变。
export function createApproval({ result, nodes, sourceId, targetId, name }) {
  const byId = byIdMap(nodes);
  const snap = (id) => {
    const n = byId.get(id);
    return n ? { id: n.id, name: n.name, type: n.type } : null;
  };
  const now = new Date().toISOString();
  return {
    id: 'route-' + Date.now().toString(36),
    name: name || `业务路径 ${now.slice(0, 10)} ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
    sourceId,
    targetId,
    order: result.chain.slice(),
    entryId: result.entry,
    exitId: result.exit,
    egressAction: byId.get(targetId)?.action === 'deny' ? 'deny' : 'allow',
    snapshots: result.chain.map(snap).filter(Boolean),
    createdAt: now,
  };
}

// 设备移除后不删路线，按当前拓扑动态判定失效原因。
export function routeStatus(route, nodes, edges) {
  const byId = byIdMap(nodes);
  for (const id of route.order) {
    if (!byId.has(id)) {
      return { ok: false, reason: '设备已移除，路线失效' };
    }
  }
  if (!byId.has(route.sourceId) || !byId.has(route.targetId)) {
    return { ok: false, reason: '源终端或目标服务已被移除' };
  }
  // 顺序仍在但连接被拆也标失效（缺设备属于硬失效的优先项，已在上面处理）。
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  edges.forEach(([a, b]) => {
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  });
  for (let i = 0; i < route.order.length - 1; i++) {
    if (!adj.get(route.order[i])?.has(route.order[i + 1])) {
      return { ok: false, reason: '路线中的连接已拆除' };
    }
  }
  return { ok: true, reason: '有效' };
}

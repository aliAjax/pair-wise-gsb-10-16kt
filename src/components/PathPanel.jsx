import React, { useEffect, useMemo, useState } from 'react';
import { createApproval, evaluatePath, routeStatus } from '../lib/approval.js';

const TYPE_ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };
const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端' };

const STATUS_TEXT = {
  approved: { t: '放行通过', cls: 'ok' },
  denied: { t: '策略拒绝', cls: 'bad' },
  direction: { t: '访问方向不符', cls: 'warn' },
  unreachable: { t: '中间设备缺失', cls: 'bad' },
};

function Chip({ node, cls, idx }) {
  return (
    <span className={`trace-chip ${cls || ''}`}>
      {typeof idx === 'number' && <b className="trace-idx">{idx + 1}</b>}
      <i className={node?.type || 'device'}>{TYPE_ICON[node?.type] || '▱'}</i>
      <span>
        <strong>{node?.name || '已移除设备'}</strong>
        <small>{node ? TYPE_LABEL[node.type] + (node.ip ? ' · ' + node.ip : '') : '不在当前拓扑中'}</small>
      </span>
    </span>
  );
}

function Trace({ chain, nodes, blockerId, pending = [], gap }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <div className="trace">
      {chain.map((id, i) => {
        const isBlocker = blockerId === id;
        const isPassed = !isBlocker && (blockerId ? i < chain.findIndex((c) => c === blockerId) : true);
        return (
          <React.Fragment key={id + i}>
            <Chip node={byId.get(id)} cls={isBlocker ? 'blocked' : isPassed ? 'passed' : ''} idx={i} />
            {i < chain.length - 1 && <span className="trace-arrow">→</span>}
          </React.Fragment>
        );
      })}
      {gap && (
        <>
          <span className="trace-gap" title={gap}>～ 设备缺失 ～</span>
        </>
      )}
      {pending.map((id) => (
        <React.Fragment key={'p' + id}>
          <span className="trace-arrow dim">→</span>
          <Chip node={byId.get(id)} cls="pending" />
        </React.Fragment>
      ))}
    </div>
  );
}

export default function PathPanel({ nodes, edges, routes, onClose, onPersist, onDeleteRoute, onSelectRoute, selectedRouteId }) {
  const terminals = useMemo(() => nodes.filter((n) => n.type === 'device'), [nodes]);
  const services = useMemo(() => nodes.filter((n) => n.type === 'server'), [nodes]);

  const [sourceId, setSourceId] = useState(
    () => (terminals[0]?.id) || ''
  );
  const [targetId, setTargetId] = useState(
    () => (services[0]?.id) || ''
  );
  const [nonce, setNonce] = useState(0);

  // 源/目标被删掉后兜底到当前可选项。
  useEffect(() => {
    if (sourceId && !nodes.some((n) => n.id === sourceId)) setSourceId(terminals[0]?.id || '');
  }, [nodes, sourceId, terminals]);
  useEffect(() => {
    if (targetId && !nodes.some((n) => n.id === targetId)) setTargetId(services[0]?.id || '');
  }, [nodes, targetId, services]);

  const result = useMemo(() => {
    if (!sourceId || !targetId) return null;
    return evaluatePath(nodes, edges, sourceId, targetId);
  }, [nodes, edges, sourceId, targetId, nonce]);

  const persist = () => {
    if (!result || result.status !== 'approved' || !sourceId || !targetId) return;
    onPersist(createApproval({ result, nodes, sourceId, targetId }));
    setNonce((v) => v + 1);
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="panel-overlay" onMouseDown={onClose}>
      <div className="path-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <strong>业务路径放行审批</strong>
            <small>选择源终端与目标服务，登记入口 / 沿途设备 / 出口策略</small>
          </div>
          <button className="panel-x" onClick={onClose}>×</button>
        </div>

        <div className="panel-body">
          <div className="probe-row">
            <label>
              <span>源终端（访问发起方）</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {terminals.length === 0 && <option value="">无终端设备</option>}
                {terminals.map((n) => <option key={n.id} value={n.id}>{n.name}（{n.ip}）</option>)}
              </select>
            </label>
            <span className="probe-arrow">→</span>
            <label>
              <span>目标服务（出口策略挂载点）</span>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {services.length === 0 && <option value="">无服务器</option>}
                {services.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}（{n.ip}）· {n.action === 'deny' ? '出口拒绝' : '出口放行'}
                  </option>
                ))}
              </select>
            </label>
            <button className="recheck" onClick={() => setNonce((v) => v + 1)}>↻ 重新分析</button>
          </div>

          {!result && <p className="panel-empty">请先在拓扑中添加终端设备与服务器。</p>}

          {result && (
            <>
              <div className={`verdict ${STATUS_TEXT[result.status].cls}`}>
                <b>{STATUS_TEXT[result.status].t}</b>
                {result.status === 'approved'
                  ? <span>访问方向、设备策略与出口策略全部通过，共 {result.chain.length - 1} 跳。</span>
                  : <span>路径停在第一个阻塞点，其后设备未放行。</span>}
              </div>

              <div className="reg-grid">
                <div>
                  <span className="reg-label">访问入口</span>
                  {result.entry
                    ? <Chip node={byId.get(result.entry)} />
                    : <em>源与目标直连，无入口设备</em>}
                </div>
                <div>
                  <span className="reg-label">沿途设备（{result.middle.length}）</span>
                  <div className="reg-list">
                    {result.middle.length
                      ? result.middle.map((id) => <Chip key={id} node={byId.get(id)} />)
                      : <em>无</em>}
                  </div>
                </div>
                <div>
                  <span className="reg-label">出口策略</span>
                  {result.exit ? <Chip node={byId.get(result.exit)} /> : <em>无出口设备</em>}
                  <span className={`egress-tag ${(byId.get(targetId)?.action) === 'deny' ? 'deny' : 'allow'}`}>
                    目标服务：{(byId.get(targetId)?.action) === 'deny' ? '拒绝' : '放行'}
                  </span>
                </div>
              </div>

              <div className="trace-box">
                <span className="reg-label">逐跳路径（流量方向）</span>
                <Trace
                  chain={result.chain}
                  nodes={nodes}
                  blockerId={result.blocker?.device ?? null}
                  pending={result.blocker?.pending || []}
                  gap={result.status === 'unreachable' ? 'gap' : null}
                />
              </div>

              {result.blocker && (
                <div className="blocker-card">
                  <div className="blocker-title">⛔ 第一个阻塞点</div>
                  <div className="blocker-body">
                    <Chip node={byId.get(result.blocker.device)} cls="blocked" />
                    <div>
                      <strong>设备：{byId.get(result.blocker.device)?.name || result.blocker.device || '—'}</strong>
                      <p>{result.blocker.rule}</p>
                      <small>阻塞原因码：{result.blocker.reason} · 后续 {result.blocker.pending.length} 个节点未到达</small>
                    </div>
                  </div>
                </div>
              )}

              {result.status === 'approved' && (
                <div className="persist-bar">
                  <span>✓ 顺序固化后，移动节点仅改变坐标，不改变审批顺序。</span>
                  <button className="persist-btn" onClick={persist}>固化此放行路线</button>
                </div>
              )}
            </>
          )}

          <div className="routes-head">
            <span>已登记的业务路径</span>
            <small>{routes.length} 条</small>
          </div>

          {routes.length === 0 && <p className="panel-empty">尚无固化路线。分析通过后点击“固化此放行路线”。</p>}

          <div className="route-records">
            {routes.map((r) => {
              const st = routeStatus(r, nodes, edges);
              return (
                <div
                  key={r.id}
                  className={`route-record ${st.ok ? 'alive' : 'dead'} ${selectedRouteId === r.id ? 'lit' : ''}`}
                  onClick={() => onSelectRoute(r.id)}
                >
                  <div className="route-top">
                    <strong>{r.name}</strong>
                    <span className={`route-badge ${st.ok ? 'ok' : 'dead'}`}>
                      {st.ok ? '● 有效' : '✕ 失效'}
                    </span>
                    <button
                      className="route-del"
                      title="删除该条记录"
                      onClick={(e) => { e.stopPropagation(); onDeleteRoute(r.id); }}
                    >删除</button>
                  </div>
                  <div className="route-meta">
                    {(r.snapshots[0]?.name || r.sourceId)} → {(r.snapshots[r.snapshots.length - 1]?.name || r.targetId)}
                    <small>{new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })}</small>
                  </div>
                  <div className="route-order">
                    {r.order.map((id, i) => {
                      const snap = r.snapshots.find((s) => s.id === id);
                      const alive = byId.has(id);
                      return (
                        <span key={id + i} className={`order-pill ${alive ? '' : 'gone'}`}>
                          <b>{i + 1}</b>{snap?.name || id}
                        </span>
                      );
                    })}
                  </div>
                  {!st.ok && <div className="route-reason">失效原因：{st.reason}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

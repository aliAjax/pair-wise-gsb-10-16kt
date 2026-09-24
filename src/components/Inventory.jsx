import React from 'react';

const ICONS = { router: '◉', switch: '▦', server: '▣', device: '▱' };
const PALETTE = [
  ['router', '◉', '路由器'],
  ['switch', '▦', '交换机'],
  ['server', '▣', '服务器'],
  ['device', '▱', '终端设备'],
];

// 左侧：设备库 + 图中节点 + 已固化审批路线
export default function Inventory({ nodes, selected, onSelect, onAddType, routes, activeRouteId, onPickRoute }) {
  return (
    <aside className="inventory">
      <div className="section-title">
        <span>设备库</span>
        <small>{nodes.length} 个节点</small>
      </div>
      <div className="device-types">
        {PALETTE.map(([t, icon, label]) => (
          <button
            key={t}
            onClick={() => onAddType(t, label)}
          >
            <i className={t}>{icon}</i>
            {label}
            <span>＋</span>
          </button>
        ))}
      </div>

      <div className="section-title nodes-head">
        <span>图中节点</span>
        <small>点击查看</small>
      </div>
      <div className="node-list">
        {nodes.map((n) => (
          <button
            className={selected === n.id ? 'sel' : ''}
            onClick={() => onSelect(n.id)}
            key={n.id}
          >
            <i className={n.type}>{ICONS[n.type] || '▱'}</i>
            <span>
              <strong>{n.name}</strong>
              <small>{n.ip}</small>
            </span>
            <b>›</b>
          </button>
        ))}
      </div>

      <div className="section-title nodes-head">
        <span>审批路线</span>
        <small>{routes.length} 条固化记录</small>
      </div>
      <div className="route-list">
        {routes.length === 0 && <p className="route-empty">尚无放行记录，使用顶部「路径放行」登记访问</p>}
        {routes.map((r) => (
          <button
            key={r.id}
            className={
              'route-item' +
              (activeRouteId === r.id ? ' sel' : '') +
              (r.status === 'invalid' ? ' invalid' : '')
            }
            onClick={() => onPickRoute(r.id)}
            title={r.status === 'invalid' ? r.invalidReason : '点击在画布上高亮'}
          >
            <span className="route-flag">{r.status === 'invalid' ? '失效' : '已固化'}</span>
            <strong>{nameOf(nodes, r.sourceId, r.snapshot)} → {nameOf(nodes, r.targetId, r.snapshot)}</strong>
            <small>
              {r.pathIds.length} 跳 · {formatTime(r.createdAt)}
            </small>
            {r.status === 'invalid' && <em className="route-reason">{r.invalidReason}</em>}
          </button>
        ))}
      </div>
    </aside>
  );
}

function nameOf(nodes, id, snapshot) {
  return nodes.find((n) => n.id === id)?.name || snapshot?.find((s) => s.id === id)?.name || id;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

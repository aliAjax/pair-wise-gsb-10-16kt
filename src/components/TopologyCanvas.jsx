import React, { useRef, useState } from 'react';

const ICONS = { router: '◉', switch: '▦', server: '▣', device: '▱' };

// 画布：节点坐标可拖动；审批路线只决定高亮，不随拖动改变顺序
export default function TopologyCanvas({ data, selected, onSelect, onMoveNode, activeSteps }) {
  const board = useRef(null);
  const [drag, setDrag] = useState(null);

  const order = new Map();
  const status = new Map();
  (activeSteps || []).forEach((s, i) => {
    order.set(s.nodeId, i);
    status.set(s.nodeId, s.status);
  });
  const hasPath = order.size > 0;

  const edgeState = (a, b) => {
    if (!hasPath) return null;
    const ia = order.get(a);
    const ib = order.get(b);
    if (ia === undefined || ib === undefined || Math.abs(ia - ib) !== 1) return null;
    const sa = status.get(a);
    const sb = status.get(b);
    if (sa === 'blocked' || sb === 'blocked' || sa === 'missing' || sb === 'missing') return 'blocked';
    if (sa === 'untested' || sb === 'untested') return 'dim';
    if (sa === 'frozen' || sb === 'frozen') return 'frozen';
    return 'ok';
  };

  const move = (e) => {
    if (!drag || !board.current) return;
    const r = board.current.getBoundingClientRect();
    onMoveNode(drag, Math.max(35, e.clientX - r.left), Math.max(35, e.clientY - r.top));
  };

  return (
    <section className="canvas-wrap">
      <div
        className="canvas"
        ref={board}
        onMouseMove={move}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        {data.edges.map(([a, b], i) => {
          const n1 = data.nodes.find((n) => n.id === a);
          const n2 = data.nodes.find((n) => n.id === b);
          if (!n1 || !n2) return null;
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const len = Math.hypot(dx, dy);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const st = edgeState(a, b);
          return (
            <div
              className={'edge' + (st ? ' path-' + st : '')}
              key={i}
              style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}
            >
              <span></span>
            </div>
          );
        })}

        {data.nodes.map((n) => {
          const idx = order.get(n.id);
          const st = status.get(n.id);
          return (
            <button
              key={n.id}
              className={
                'node ' + n.type +
                (selected === n.id ? ' picked' : '') +
                (st ? ' on-path path-' + st : '')
              }
              style={{ left: n.x - 42, top: n.y - 31 }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(n.id);
                setDrag(n.id);
              }}
              onClick={() => onSelect(n.id)}
            >
              {idx !== undefined && <em className="path-badge">{idx + 1}</em>}
              <i>{ICONS[n.type] || '▱'}</i>
              <strong>{n.name}</strong>
              <small>{n.ip}</small>
            </button>
          );
        })}

        {activeSteps?.some((s) => s.missing) && (
          <div className="canvas-warn">路线包含已移除设备（红色标记），该审批已失效</div>
        )}

        <div className="legend">
          <span><i className="router"></i>路由器</span>
          <span><i className="switch"></i>交换机</span>
          <span><i className="server"></i>服务器</span>
        </div>
      </div>
      <div className="canvas-footer">
        <span>拖动节点只改坐标，审批顺序保持不变 · {data.edges.length} 条连接</span>
        <span>坐标系：画布局部</span>
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { loadRoutes, loadTopology, saveRoutes, saveTopology } from './lib/storage.js';
import PathPanel from './components/PathPanel.jsx';

const TYPE_ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };
const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };

function App() {
  const [data, setData] = useState(loadTopology);
  const [routes, setRoutes] = useState(loadRoutes);
  const [selected, setSelected] = useState(() => {
    const t = loadTopology();
    return t.nodes[0]?.id;
  });
  const [tool, setTool] = useState('select');
  const [notice, setNotice] = useState('');
  const [drag, setDrag] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [litRoute, setLitRoute] = useState(null);
  const board = useRef();

  useEffect(() => saveTopology(data), [data]);
  useEffect(() => saveRoutes(routes), [routes]);

  const node = data.nodes.find((n) => n.id === selected) || data.nodes[0];

  const updateNode = (k, v) =>
    setData((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === selected ? { ...n, [k]: v } : n)) }));

  const makeNode = (type, label) => ({
    id: 'node' + Date.now(),
    name: label || '新设备',
    type,
    x: 500,
    y: 300,
    ip: '192.168.0.10',
    passDir: 'both',
    action: 'allow',
    denyReason: '',
  });

  const addNodeOfType = (type, label) => {
    const n = makeNode(type, label);
    setData((d) => ({ ...d, nodes: [...d.nodes, n] }));
    setSelected(n.id);
    setTool('select');
    setNotice(`已添加${TYPE_LABEL[type]}`);
  };

  const addNode = () => addNodeOfType('device');

  const connect = () => {
    if (!selected) return;
    const other = prompt('输入要连接的设备 ID（例如 sw1）');
    if (!other) return;
    if (!data.nodes.some((n) => n.id === other)) {
      setNotice('设备 ID 不存在');
      return;
    }
    if (other === selected) return;
    if (data.edges.some((e) => (e[0] === selected && e[1] === other) || (e[1] === selected && e[0] === other))) {
      setNotice('连接已存在');
      return;
    }
    setData((d) => ({ ...d, edges: [...d.edges, [selected, other]] }));
    setNotice('连接已创建');
  };

  const remove = () => {
    if (!node) return;
    const goneId = node.id;
    setData((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== goneId),
      edges: d.edges.filter((e) => !e.includes(goneId)),
    }));
    const affected = routes.filter((r) => r.order.includes(goneId)).length;
    if (affected > 0) {
      // 记录保留不删，routeStatus 会把它们标为失效。
      setNotice(`设备已删除，${affected} 条已登记路线标为失效（记录保留）`);
    } else {
      setNotice('设备已删除');
    }
    setSelected(data.nodes.find((n) => n.id !== goneId)?.id);
  };

  const save = () => setNotice('拓扑图与路线已保存到本地');

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ topology: data, routes }, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    setNotice('JSON 已导出（含已登记路线）');
  };

  const validate = () => {
    const linked = new Set(data.edges.flat());
    const isolated = data.nodes.filter((n) => !linked.has(n.id));
    setNotice(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };

  const move = (e) => {
    if (!drag || tool !== 'select') return;
    const r = board.current.getBoundingClientRect();
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        n.id === drag ? { ...n, x: Math.max(35, e.clientX - r.left), y: Math.max(35, e.clientY - r.top) } : n,
      ),
    }));
  };

  const persistRoute = (route) => {
    setRoutes((rs) => [route, ...rs]);
    setLitRoute(route.id);
    setNotice(`路线已固化：${route.order.length} 个节点，顺序不再随坐标变化`);
  };

  const deleteRoute = (id) => {
    setRoutes((rs) => rs.filter((r) => r.id !== id));
    if (litRoute === id) setLitRoute(null);
  };

  const lit = routes.find((r) => r.id === litRoute);
  const litEdges = useMemo(() => {
    if (!lit) return new Set();
    const set = new Set();
    for (let i = 0; i < lit.order.length - 1; i++) {
      set.add(lit.order[i] + '|' + lit.order[i + 1]);
      set.add(lit.order[i + 1] + '|' + lit.order[i]);
    }
    return set;
  }, [lit]);
  const litOrderIndex = useMemo(() => {
    if (!lit) return new Map();
    return new Map(lit.order.map((id, i) => [id, i]));
  }, [lit]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div><strong>NETSCAPE</strong><small>TOPOLOGY STUDIO</small></div>
        </div>
        <div className="file">
          <span className="dot"></span>
          <div><strong>office-network.json</strong><small>最近保存：刚刚</small></div>
        </div>
        <div className="top-actions">
          <button onClick={() => { setPanelOpen(true); setLitRoute(null); }}>⛉ 路径放行</button>
          <button onClick={validate}>✓ 检查</button>
          <button onClick={exportJson}>↓ 导出</button>
          <button className="save" onClick={save}>保存更改</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <span>工具</span>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>↖ 选择</button>
          <button className={tool === 'connect' ? 'on' : ''} onClick={() => { setTool('connect'); connect(); }}>⌁ 连接</button>
          <button onClick={addNode}>＋ 设备</button>
        </div>
        <div className="tool-group zoom">
          <button onClick={() => setNotice('缩放未启用（固定 100%）')}>−</button>
          <span>100%</span>
          <button onClick={() => setNotice('缩放未启用（固定 100%）')}>＋</button>
          <button onClick={() => setNotice('画布已居中')}>⌗</button>
        </div>
      </div>

      <div className="workspace">
        <aside className="inventory">
          <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
          <div className="device-types">
            {[['router', '路由器'], ['switch', '交换机'], ['server', '服务器'], ['device', '终端设备']].map(([t, l]) => (
              <button key={t} onClick={() => addNodeOfType(t, l)}>
                <i className={t}>{TYPE_ICON[t]}</i>{l}<span>＋</span>
              </button>
            ))}
          </div>
          <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
          <div className="node-list">
            {data.nodes.map((n) => (
              <button key={n.id} className={selected === n.id ? 'sel' : ''} onClick={() => setSelected(n.id)}>
                <i className={n.type}>{TYPE_ICON[n.type]}</i>
                <span><strong>{n.name}</strong><small>{n.ip}</small></span>
                <b>›</b>
              </button>
            ))}
          </div>
        </aside>

        <section className="canvas-wrap">
          <div className="canvas" ref={board} onMouseMove={move} onMouseUp={() => setDrag(null)}>
            {data.edges.map(([a, b], i) => {
              const n1 = data.nodes.find((n) => n.id === a);
              const n2 = data.nodes.find((n) => n.id === b);
              if (!n1 || !n2) return null;
              const dx = n2.x - n1.x;
              const dy = n2.y - n1.y;
              const len = Math.hypot(dx, dy);
              const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
              const hot = litEdges.has(a + '|' + b);
              return (
                <div
                  className={'edge' + (hot ? ' frozen' : '')}
                  key={i}
                  style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}
                >
                  <span></span>
                </div>
              );
            })}

            {data.nodes.map((n) => (
              <button
                key={n.id}
                className={'node ' + n.type + (selected === n.id ? ' picked' : '')}
                style={{ left: n.x - 42, top: n.y - 31 }}
                onMouseDown={(e) => { e.stopPropagation(); setSelected(n.id); setDrag(n.id); }}
                onClick={() => setSelected(n.id)}
              >
                {litOrderIndex.has(n.id) && <span className="order-badge">{litOrderIndex.get(n.id) + 1}</span>}
                <i>{TYPE_ICON[n.type]}</i>
                <strong>{n.name}</strong>
                <small>{n.ip}</small>
              </button>
            ))}

            {lit && lit.order.map((id, i) => {
              if (data.nodes.some((n) => n.id === id)) return null;
              const snap = lit.snapshots.find((s) => s.id === id);
              return (
                <span key={'ghost-' + id} className="ghost-node" title={`${snap?.name || id}（已移除）`}>
                  <span className="order-badge dead">{i + 1}</span>
                  <i>{TYPE_ICON[snap?.type] || '▱'}</i>
                  <strong>{snap?.name || '已移除设备'}</strong>
                </span>
              );
            })}

            <div className="legend">
              <span><i className="router"></i>路由器</span>
              <span><i className="switch"></i>交换机</span>
              <span><i className="server"></i>服务器</span>
            </div>
          </div>
          <div className="canvas-footer">
            <span>拖动节点调整位置 · {data.edges.length} 条连接 · 已登记路线 {routes.length} 条</span>
            <span>坐标系：画布局部 · 固化顺序独立于坐标</span>
          </div>
        </section>

        <aside className="inspector">
          <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
          {node ? (
            <>
              <label>设备名称
                <input value={node.name} onChange={(e) => updateNode('name', e.target.value)} />
              </label>
              <label>IP 地址
                <input value={node.ip} onChange={(e) => updateNode('ip', e.target.value)} />
              </label>
              <label>设备类型
                <select value={node.type} onChange={(e) => updateNode('type', e.target.value)}>
                  <option value="router">路由器</option>
                  <option value="switch">交换机</option>
                  <option value="server">服务器（目标服务）</option>
                  <option value="device">终端设备（访问发起方）</option>
                </select>
              </label>

              {node.type === 'device' && (
                <p className="prop-hint">终端作为业务路径的源，不登记入站/出站规则；出口策略挂在目标服务器上。</p>
              )}

              {node.type !== 'device' && (
                <>
                  <label>访问方向（可通过方向）
                    <select value={node.passDir || 'both'} onChange={(e) => updateNode('passDir', e.target.value)}>
                      <option value="both">双向（in + out）</option>
                      <option value="in">仅入站（in）</option>
                      <option value="out">仅出站（out）</option>
                    </select>
                  </label>
                  <label>设备访问策略
                    <select value={node.action || 'allow'} onChange={(e) => updateNode('action', e.target.value)}>
                      <option value="allow">放行（allow）</option>
                      <option value="deny">拒绝（deny）</option>
                    </select>
                  </label>
                  {(node.action === 'deny') && (
                    <label>拒绝规则说明（阻塞点展示）
                      <input value={node.denyReason || ''} onChange={(e) => updateNode('denyReason', e.target.value)} placeholder="例如：仅允许应用服务器访问 1521 端口" />
                    </label>
                  )}
                  {node.type === 'server' && (
                    <p className="prop-hint">该服务器是路径终点，其策略即为出口策略。</p>
                  )}
                </>
              )}

              <div className="inspector-actions">
                <button onClick={connect}>⌁ 添加连接</button>
                <button className="danger" onClick={remove}>删除设备</button>
              </div>

              <div className="connections">
                <div className="section-title">
                  <span>连接</span>
                  <small>{data.edges.filter((e) => e.includes(node.id)).length} 条</small>
                </div>
                {data.edges.filter((e) => e.includes(node.id)).map((e, i) => {
                  const other = data.nodes.find((n) => n.id === (e[0] === node.id ? e[1] : e[0]));
                  return (
                    <div className="connection" key={i}>
                      <span className={'mini ' + other?.type}></span>
                      <strong>{other?.name || '已移除'}</strong>
                      <small>在线</small>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p>选择一个设备</p>}
        </aside>
      </div>

      {lit && (
        <div className="route-chip">
          <b>{lit.name}</b>
          <span>已固化顺序 {lit.order.length} 跳{litEdges.size ? '' : ''} · 移动节点不改变顺序</span>
          <button onClick={() => setLitRoute(null)}>取消高亮</button>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}

      {panelOpen && (
        <PathPanel
          nodes={data.nodes}
          edges={data.edges}
          routes={routes}
          selectedRouteId={litRoute}
          onClose={() => setPanelOpen(false)}
          onPersist={persistRoute}
          onDeleteRoute={deleteRoute}
          onSelectRoute={(id) => setLitRoute((cur) => (cur === id ? null : id))}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

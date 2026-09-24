import React, { useEffect, useMemo, useState } from 'react';
import { loadTopology, saveTopology, loadRoutes, saveRoutes } from './storage.js';
import { buildRouteRecord, revalidateRoute, routeToSteps } from './pathEngine.js';
import Inventory from './components/Inventory.jsx';
import Inspector from './components/Inspector.jsx';
import TopologyCanvas from './components/TopologyCanvas.jsx';
import AccessModal from './components/AccessModal.jsx';

export default function App() {
  const [data, setData] = useState(loadTopology);
  const [routes, setRoutes] = useState(loadRoutes);
  const [selected, setSelected] = useState(data.nodes[0]?.id || '');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [previewSteps, setPreviewSteps] = useState(null);

  // 持久化：拓扑与审批路线分开
  useEffect(() => saveTopology(data), [data]);
  useEffect(() => saveRoutes(routes), [routes]);

  // 启动时复算一次：处理设备被其他途径删除的情况
  useEffect(() => {
    setRoutes((rs) => {
      const next = rs.map((r) => revalidateRoute(r, data.nodes));
      return next.some((r, i) => r !== rs[i]) ? next : rs;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = (msg) => {
    setNotice(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setNotice(''), 2600);
  };

  const updateNode = (id, patch) => {
    setData((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  };

  const addNodeOfType = (type, label) => {
    const id = 'node' + Date.now();
    setData((d) => ({
      ...d,
      nodes: [
        ...d.nodes,
        {
          id,
          name: label,
          type,
          x: 460 + Math.round(Math.random() * 80),
          y: 300 + Math.round(Math.random() * 60),
          ip: '192.168.0.2',
          policy: {
            in: { action: 'allow', ruleName: '' },
            out: { action: 'allow', ruleName: '' },
          },
        },
      ],
    }));
    setSelected(id);
    toast('已添加设备');
  };

  const connect = (fromId) => {
    if (!fromId) return;
    const other = prompt('输入要连接的设备 ID（例如 sw1）');
    if (!other) return;
    if (!data.nodes.some((n) => n.id === other)) {
      toast('设备不存在');
      return;
    }
    if (other === fromId) return;
    if (data.edges.some((e) => (e[0] === fromId && e[1] === other) || (e[1] === fromId && e[0] === other))) {
      toast('连接已存在');
      return;
    }
    setData((d) => ({ ...d, edges: [...d.edges, [fromId, other]] }));
    toast('连接已创建');
  };

  // 删除设备：拓扑中移除，引用该设备的固化路线保留并标记失效
  const removeNode = (id) => {
    const nextNodes = data.nodes.filter((n) => n.id !== id);
    setData({ nodes: nextNodes, edges: data.edges.filter((e) => !e.includes(id)) });
    setRoutes((rs) => rs.map((r) => revalidateRoute(r, nextNodes)));
    setSelected(nextNodes[0]?.id || '');
    toast('设备已删除；引用该设备的审批路线已标记失效并保留');
  };

  const moveNode = (id, x, y) => {
    // 只改坐标：审批顺序固化在 routes[].pathIds 中，与坐标无关
    setData((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  };

  const validate = () => {
    const linked = new Set(data.edges.flat());
    const isolated = data.nodes.filter((n) => !linked.has(n.id));
    toast(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    toast('JSON 已导出');
  };

  const freeze = ({ sourceId, targetId, entryId, egress, result }) => {
    const record = buildRouteRecord(data.nodes, { sourceId, targetId, entryId, egress }, result);
    setRoutes((rs) => [record, ...rs]);
    setActiveRouteId(record.id);
    setPreviewSteps(null);
    setModalOpen(false);
    toast('审批路线已固化，顺序不会随节点移动改变');
  };

  const pickRoute = (id) => {
    setPreviewSteps(null);
    setActiveRouteId((cur) => (cur === id ? null : id));
  };

  // 画布高亮：优先显示弹窗里的实时检查结果；否则显示选中的固化路线
  const activeSteps = useMemo(() => {
    if (previewSteps) return previewSteps;
    const route = routes.find((r) => r.id === activeRouteId);
    return route ? routeToSteps(route, data.nodes) : null;
  }, [previewSteps, activeRouteId, routes, data.nodes]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div>
            <strong>NETSCAPE</strong>
            <small>TOPOLOGY STUDIO</small>
          </div>
        </div>
        <div className="file">
          <span className="dot"></span>
          <div>
            <strong>office-network.json</strong>
            <small>最近保存：刚刚</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={() => setModalOpen(true)}>⛔ 路径放行</button>
          <button onClick={validate}>✓ 检查</button>
          <button onClick={exportJson}>↓ 导出</button>
          <button className="save" onClick={() => toast('拓扑图已保存')}>保存更改</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <span>工具</span>
          <button className="on">↖ 选择</button>
          <button onClick={() => connect(selected)}>⌁ 连接</button>
          <button onClick={() => addNodeOfType('device', '新设备')}>＋ 设备</button>
        </div>
        <div className="tool-group zoom">
          <button>−</button>
          <span>100%</span>
          <button>＋</button>
          <button onClick={() => toast('画布已居中')}>⌗</button>
        </div>
      </div>

      <div className="workspace">
        <Inventory
          nodes={data.nodes}
          selected={selected}
          onSelect={setSelected}
          onAddType={addNodeOfType}
          routes={routes}
          activeRouteId={activeRouteId}
          onPickRoute={pickRoute}
        />
        <TopologyCanvas
          data={data}
          selected={selected}
          onSelect={setSelected}
          onMoveNode={moveNode}
          activeSteps={activeSteps}
        />
        <Inspector
          data={data}
          selected={selected}
          onUpdate={updateNode}
          onConnect={connect}
          onRemove={removeNode}
        />
      </div>

      {modalOpen && (
        <AccessModal
          nodes={data.nodes}
          edges={data.edges}
          onClose={() => { setModalOpen(false); setPreviewSteps(null); }}
          onFreeze={freeze}
          onPreview={setPreviewSteps}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

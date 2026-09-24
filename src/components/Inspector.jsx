import React from 'react';

const ICONS = { router: '◉', switch: '▦', server: '▣', device: '▱' };
const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };

// 右侧：设备属性 + 入/出方向策略登记 + 连接
export default function Inspector({ data, selected, onUpdate, onConnect, onRemove }) {
  const node = data.nodes.find((n) => n.id === selected) || null;

  if (!node) {
    return (
      <aside className="inspector">
        <div className="section-title"><span>属性</span></div>
        <p>选择一个设备</p>
      </aside>
    );
  }

  const policy = node.policy || {
    in: { action: 'allow', ruleName: '' },
    out: { action: 'allow', ruleName: '' },
  };

  const setPolicy = (dir, key, value) => {
    onUpdate(node.id, {
      policy: {
        in: { ...policy.in },
        out: { ...policy.out },
        [dir]: { ...policy[dir], [key]: value },
      },
    });
  };

  const connections = data.edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.includes(node.id));

  return (
    <aside className="inspector">
      <div className="section-title">
        <span>属性</span>
        <small>{TYPE_LABEL[node.type] || node.type}</small>
      </div>

      <label>
        设备名称
        <input value={node.name} onChange={(e) => onUpdate(node.id, { name: e.target.value })} />
      </label>
      <label>
        IP 地址
        <input value={node.ip} onChange={(e) => onUpdate(node.id, { ip: e.target.value })} />
      </label>
      <label>
        设备类型
        <select value={node.type} onChange={(e) => onUpdate(node.id, { type: e.target.value })}>
          <option value="router">路由器</option>
          <option value="switch">交换机</option>
          <option value="server">服务器</option>
          <option value="device">终端设备</option>
        </select>
      </label>

      <div className="policy-block">
        <div className="policy-head">
          <span>策略规则</span>
          <small>放行审批逐跳核对</small>
        </div>
        {[
          ['in', '入方向规则（访问入口 / 沿途入站）'],
          ['out', '出方向规则（出口策略）'],
        ].map(([dir, title]) => (
          <fieldset className="policy-row" key={dir}>
            <legend>{title}</legend>
            <select
              className={policy[dir].action === 'deny' ? 'deny' : 'allow'}
              value={policy[dir].action}
              onChange={(e) => setPolicy(dir, 'action', e.target.value)}
            >
              <option value="allow">允许 allow</option>
              <option value="deny">拒绝 deny</option>
            </select>
            <input
              placeholder="规则编号，如 GW-IN-01"
              value={policy[dir].ruleName || ''}
              onChange={(e) => setPolicy(dir, 'ruleName', e.target.value)}
            />
          </fieldset>
        ))}
      </div>

      <div className="inspector-actions">
        <button onClick={() => onConnect(node.id)}>⌁ 添加连接</button>
        <button className="danger" onClick={() => onRemove(node.id)}>删除设备</button>
      </div>

      <div className="connections">
        <div className="section-title">
          <span>连接</span>
          <small>{connections.length} 条</small>
        </div>
        {connections.map(({ e, i }) => {
          const otherId = e[0] === node.id ? e[1] : e[0];
          const other = data.nodes.find((n) => n.id === otherId);
          return (
            <div className="connection" key={i}>
              <span className={'mini ' + (other?.type || '')}>{ICONS[other?.type] || ''}</span>
              <strong>{other?.name || otherId}</strong>
              <small>{other ? '在线' : '设备已删除'}</small>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// 初始拓扑数据
export const seed = {
  nodes: [
    { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 200, ip: '10.0.0.1',
      policy: {
        in: { action: 'allow', ruleName: 'GW-IN-01' },
        out: { action: 'allow', ruleName: 'GW-OUT-01' },
      } },
    { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 350, ip: '10.0.1.1',
      policy: {
        in: { action: 'allow', ruleName: 'SW1-IN-01' },
        out: { action: 'allow', ruleName: 'SW1-OUT-DB' },
      } },
    { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 350, ip: '10.0.2.1',
      policy: {
        in: { action: 'allow', ruleName: 'SW2-IN-01' },
        out: { action: 'allow', ruleName: 'SW2-OUT-01' },
      } },
    { id: 'web', name: 'Web Server', type: 'server', x: 100, y: 500, ip: '10.0.1.10',
      policy: {
        in: { action: 'allow', ruleName: 'WEB-IN' },
        out: { action: 'allow', ruleName: 'WEB-OPEN' },
      } },
    { id: 'db', name: 'Database', type: 'server', x: 400, y: 530, ip: '10.0.1.20',
      policy: {
        in: { action: 'allow', ruleName: 'DB-IN-01' },
        out: { action: 'allow', ruleName: 'DB-PROD-ALLOW' },
      } },
    { id: 'user', name: '办公终端', type: 'device', x: 820, y: 510, ip: '10.0.2.22',
      policy: {
        in: { action: 'allow', ruleName: '' },
        out: { action: 'allow', ruleName: '' },
      } },
  ],
  edges: [['gw', 'sw1'], ['gw', 'sw2'], ['sw1', 'web'], ['sw1', 'db'], ['sw2', 'user']],
};

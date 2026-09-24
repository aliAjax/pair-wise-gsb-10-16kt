import React, { useEffect, useMemo, useState } from 'react';
import { buildAdj, evaluatePath, findPath, BLOCK } from '../pathEngine.js';

const ROLE_LABEL = { source: '源终端', hop: '沿途设备', target: '目标服务' };

// 访问登记弹窗：选择源终端 / 目标服务，登记访问入口与出口策略，回答能否放行
export default function AccessModal({ nodes, edges, onClose, onFreeze, onPreview }) {
  const terminals = useMemo(() => nodes.filter((n) => n.type === 'device'), [nodes]);
  const services = useMemo(() => nodes.filter((n) => n.type === 'server'), [nodes]);

  const [sourceId, setSourceId] = useState(terminals[0]?.id || '');
  const [targetId, setTargetId] = useState(services[0]?.id || '');
  const [entryId, setEntryId] = useState('');
  const [egressRule, setEgressRule] = useState('');
  const [result, setResult] = useState(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const adj = useMemo(() => buildAdj(nodes, edges), [nodes, edges]);

  const sourceNeighbors = (adj.get(sourceId) || []).map((id) => byId.get(id)).filter(Boolean);

  // 源切换：入口默认取第一个直连设备
  useEffect(() => {
    const list = adj.get(sourceId) || [];
    setEntryId((cur) => (list.includes(cur) ? cur : list[0] || ''));
  }, [sourceId, adj]);

  // 目标切换：按物理路径自动带出目标服务登记的出口策略
  useEffect(() => {
    if (!sourceId || !targetId) return;
    const path = findPath(nodes, edges, sourceId, targetId);
    if (path) {
      const t = byId.get(targetId);
      setEgressRule(t?.policy?.out?.ruleName || '');
    } else {
      setEgressRule('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, targetId]);

  // 评估结果实时同步到画布高亮
  useEffect(() => {
    onPreview(result ? result.steps : null);
    return () => onPreview(null);
  }, [result, onPreview]);

  const check = () => {
    if (!sourceId || !targetId || !entryId) return;
    setResult(
      evaluatePath(nodes, edges, {
        sourceId,
        targetId,
        entryId,
        egress: { ruleName: egressRule },
      }),
    );
  };

  const freeze = () => {
    onFreeze({
      sourceId,
      targetId,
      entryId,
      egress: { ruleName: egressRule },
      result,
    });
  };

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <strong>业务路径放行登记</strong>
            <small>上线前检查：访问方向 → 沿途策略 → 出口策略</small>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="form-grid">
          <label>
            源终端
            <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setResult(null); }}>
              {terminals.length === 0 && <option value="">（无终端设备）</option>}
              {terminals.map((n) => <option key={n.id} value={n.id}>{n.name} · {n.ip}</option>)}
            </select>
          </label>
          <label>
            目标服务
            <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setResult(null); }}>
              {services.length === 0 && <option value="">（无服务器）</option>}
              {services.map((n) => <option key={n.id} value={n.id}>{n.name} · {n.ip}</option>)}
            </select>
          </label>
          <label>
            访问入口（源终端直连设备）
            <select value={entryId} onChange={(e) => { setEntryId(e.target.value); setResult(null); }}>
              {sourceNeighbors.length === 0 && <option value="">（源终端无直连设备）</option>}
              {sourceNeighbors.map((n) => <option key={n.id} value={n.id}>{n.name} · {n.ip}</option>)}
            </select>
          </label>
          <label>
            出口策略（目标服务登记的出方向规则编号）
            <div className="egress-row">
              <input
                placeholder="如 DB-PROD-ALLOW"
                value={egressRule}
                onChange={(e) => { setEgressRule(e.target.value); setResult(null); }}
              />
              <button
                type="button"
                className="mini-btn"
                title="按物理路径带出目标服务当前出口策略"
                onClick={() => {
                  const t = byId.get(targetId);
                  setEgressRule(t?.policy?.out?.ruleName || '');
                  setResult(null);
                }}
              >
                带出
              </button>
            </div>
          </label>
        </div>

        <div className="modal-actions">
          <button
            className="primary"
            onClick={check}
            disabled={!sourceId || !targetId || !entryId}
          >
            检查能否放行
          </button>
          {result?.allowed && (
            <button className="approve" onClick={freeze}>
              ✓ 固化为审批路线（{result.steps.length} 跳）
            </button>
          )}
        </div>

        {result && (
          <div className={'verdict ' + (result.allowed ? 'pass' : 'fail')}>
            <div className="verdict-head">
              <b>{result.allowed ? '放行通过' : '路径阻断'}</b>
              {!result.allowed && (
                <span className="reason-tag">{result.reasonLabel}</span>
              )}
            </div>

            {!result.allowed && (
              <p className="block-info">
                第一个阻塞点：<b>{result.device || '—'}</b>
                {result.ruleName && <> · 规则 <code>{result.ruleName}</code></>}
                <br />
                <span>{result.note}</span>
                {result.reason === BLOCK.ENTRY_MISMATCH && <em>（访问方向不符：登记入口与实际下一跳不一致）</em>}
              </p>
            )}

            <ol className="steps">
              {result.steps.map((s, i) => (
                <li key={i} className={'step st-' + s.status}>
                  <span className="step-no">{i + 1}</span>
                  <span className="step-body">
                    <strong>{s.name}{s.missing && '（已移除）'}</strong>
                    <small>
                      {ROLE_LABEL[s.role]}
                      {s.ruleName ? ` · ${s.ruleName}` : ''}
                      {s.status === 'untested' ? ' · 未到达（已停在阻塞点）' : ''}
                      {s.status === 'blocked' ? ' · 阻塞点' : ''}
                    </small>
                  </span>
                  <span className="step-mark">
                    {s.status === 'ok' && '✓'}
                    {s.status === 'blocked' && '✕'}
                    {s.status === 'untested' && '…'}
                  </span>
                </li>
              ))}
            </ol>

            {result.allowed && (
              <p className="freeze-hint">
                固化后节点顺序写入审批记录；之后在画布上移动节点只改变坐标，不会改变本顺序。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

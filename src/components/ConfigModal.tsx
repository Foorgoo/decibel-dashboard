import { ChangeEvent, useRef, useState } from 'react';
import { useDashboardStore, type SubaccountAlias } from '../store';
import { createDecibelClient } from '../api/client';

interface ConfigModalProps {
  onClose: () => void;
  onSaveApiKey: (mainnetKey: string) => void;
  onRemoveAccount?: (address: string) => void;
  onUpdateAccountName?: (address: string, name: string) => void;
  accounts: { address: string; name?: string }[];
  subaccounts: SubaccountAlias[];
  onUpdateSubaccountAlias?: (address: string, alias: string) => void;
}

const maskKey = (key: string) => {
  if (!key) return '未保存';
  if (key.length <= 12) return `${key.slice(0, 2)}${'*'.repeat(Math.max(key.length - 4, 4))}${key.slice(-2)}`;
  return `${key.slice(0, 6)}${'*'.repeat(8)}${key.slice(-4)}`;
};

const isAptosAddress = (value: string) => /^0x[a-fA-F0-9]{1,64}$/.test(value);

const maskAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const CONFIG_VERSION = 1;

const readJsonStorage = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};

const getLocalConfig = () => ({
  version: CONFIG_VERSION,
  exported_at: new Date().toISOString(),
  accounts: readJsonStorage('decibel_accounts', []),
  current_account: localStorage.getItem('decibel_current_account') || null,
  subaccount_aliases: readJsonStorage('decibel_subaccount_aliases_mainnet', {}),
});

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeImportedAccounts = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new Error('配置文件缺少 accounts');
  }

  const seen = new Set<string>();
  return value.reduce<{ address: string; name?: string }[]>((list, item) => {
    const address = String(item?.address || '').trim();
    if (!isAptosAddress(address)) return list;

    const normalizedAddress = address.toLowerCase();
    if (seen.has(normalizedAddress)) return list;
    seen.add(normalizedAddress);

    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 48) : '';
    list.push({ address, name: name || undefined });
    return list;
  }, []);
};

const normalizeImportedAliases = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, Record<string, string>>>((owners, [owner, aliases]) => {
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) return owners;

    const ownerKey = owner === 'legacy' ? 'legacy' : owner.toLowerCase();
    const normalizedAliases = Object.entries(aliases as Record<string, unknown>).reduce<Record<string, string>>((items, [address, alias]) => {
      if (typeof alias !== 'string') return items;
      const trimmedAlias = alias.trim().slice(0, 48);
      if (!trimmedAlias) return items;
      items[address.toLowerCase()] = trimmedAlias;
      return items;
    }, {});

    if (Object.keys(normalizedAliases).length > 0) {
      owners[ownerKey] = normalizedAliases;
    }
    return owners;
  }, {});
};

const groupSubaccountsByOwner = (
  subaccounts: SubaccountAlias[],
  accounts: { address: string; name?: string }[],
) => {
  const ownerMap = new Map<string, { owner: string; ownerName?: string; subaccounts: SubaccountAlias[] }>();

  subaccounts.forEach((subaccount) => {
    const owner = subaccount.owner || 'unknown';
    const account = accounts.find((item) => item.address.toLowerCase() === owner.toLowerCase());
    const ownerName = subaccount.ownerName || account?.name;
    const group = ownerMap.get(owner) || { owner, ownerName, subaccounts: [] };

    group.subaccounts.push(subaccount);
    ownerMap.set(owner, group);
  });

  return Array.from(ownerMap.values());
};

export function ConfigModal({
  onClose,
  onSaveApiKey,
  onRemoveAccount,
  onUpdateAccountName,
  accounts,
  subaccounts,
  onUpdateSubaccountAlias,
}: ConfigModalProps) {
  const storedMainnetKey = typeof window !== 'undefined' ? localStorage.getItem('decibel_api_key_mainnet') || '' : '';
  const [localMainnetKey, setLocalMainnetKey] = useState(storedMainnetKey);
  const [editingKey, setEditingKey] = useState(!storedMainnetKey);

  const [newAddress, setNewAddress] = useState('');
  const [newName, setNewName] = useState('');
  const [accountError, setAccountError] = useState('');
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [editingAccount, setEditingAccount] = useState<{ address: string; name: string } | null>(null);
  const [editingSubaccount, setEditingSubaccount] = useState<{ address: string; alias: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const { addAccount } = useDashboardStore();

  const handleSaveKey = () => {
    const nextMainnetKey = localMainnetKey.trim();

    setLocalMainnetKey(nextMainnetKey);
    onSaveApiKey(nextMainnetKey);
    setEditingKey(false);
  };

  const handleDeleteKey = () => {
    setLocalMainnetKey('');
    onSaveApiKey('');
    setEditingKey(true);
    setConfigMessage({ type: 'warning', text: 'API Key 已从本地删除' });
  };

  const handleTestKey = async () => {
    const key = localMainnetKey.trim();
    if (!key) {
      setConfigMessage({ type: 'error', text: '请先填写主网 API Key' });
      return;
    }

    setTestingKey(true);
    setConfigMessage(null);
    try {
      const client = createDecibelClient(key);
      const markets = await client.getMarkets();
      setConfigMessage({
        type: 'success',
        text: `连接成功，已读取 ${Array.isArray(markets) ? markets.length : 0} 个市场`,
      });
    } catch (error: any) {
      setConfigMessage({ type: 'error', text: error?.message || '连接失败，请检查 API Key' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleExportConfig = () => {
    try {
      downloadTextFile('decibel-dashboard-config.json', JSON.stringify(getLocalConfig(), null, 2));
      setConfigMessage({ type: 'success', text: '配置已导出，默认不包含 API Key' });
    } catch {
      setConfigMessage({ type: 'error', text: '导出失败，请稍后重试' });
    }
  };

  const handleImportConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const importedAccounts = normalizeImportedAccounts(config.accounts);
      if (importedAccounts.length === 0) {
        throw new Error('配置文件没有有效主钱包地址');
      }
      const importedAliases = normalizeImportedAliases(config.subaccount_aliases);

      localStorage.setItem('decibel_accounts', JSON.stringify(importedAccounts));
      if (typeof config.current_account === 'string' || config.current_account === null) {
        const currentAccountIsValid = config.current_account === 'all'
          || importedAccounts.some((account) => account.address.toLowerCase() === String(config.current_account).toLowerCase());
        if (config.current_account && currentAccountIsValid) {
          localStorage.setItem('decibel_current_account', config.current_account);
        } else {
          localStorage.removeItem('decibel_current_account');
        }
      }
      if (Object.keys(importedAliases).length > 0) {
        localStorage.setItem('decibel_subaccount_aliases_mainnet', JSON.stringify(importedAliases));
      }

      setConfigMessage({ type: 'success', text: '配置已导入，页面将刷新以应用变更' });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error: any) {
      setConfigMessage({ type: 'error', text: error?.message || '导入失败，请检查配置文件' });
    }
  };

  const handleClearLocalData = () => {
    const confirmed = window.confirm('确认清除本地保存的 API Key、主钱包、别名和 AMP 基准吗？此操作不可恢复。');
    if (!confirmed) return;

    Object.keys(localStorage)
      .filter((key) => key.startsWith('decibel_'))
      .forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  const handleAddAccount = () => {
    const address = newAddress.trim();
    const name = newName.trim();

    if (!address) {
      setAccountError('请输入账户地址');
      return;
    }

    if (!isAptosAddress(address)) {
      setAccountError('请输入有效的 0x 开头主钱包地址');
      return;
    }

    if (accounts.some((account) => account.address.toLowerCase() === address.toLowerCase())) {
      setAccountError('该账户已经添加过');
      return;
    }

    addAccount({ address, name: name || undefined });
    setNewAddress('');
    setNewName('');
    setAccountError('');
  };

  const handleRemove = (address: string) => {
    onRemoveAccount?.(address);
  };

  const handleUpdateName = () => {
    if (editingAccount) {
      onUpdateAccountName?.(editingAccount.address, editingAccount.name.trim());
      setEditingAccount(null);
      setAccountError('');
    }
  };

  const handleUpdateSubaccountAlias = () => {
    if (!editingSubaccount) return;
    onUpdateSubaccountAlias?.(editingSubaccount.address, editingSubaccount.alias);
    setEditingSubaccount(null);
  };

  const groupedSubaccounts = groupSubaccountsByOwner(subaccounts, accounts);

  const renderKeyField = () => {
    return (
      <>
        <div className="key-config-row">
          <div className="key-config-main">
            <label className="form-label">主网 API Key</label>
            {editingKey ? (
              <input
                type="password"
                className="form-input"
                value={localMainnetKey}
                onChange={(e) => setLocalMainnetKey(e.target.value)}
                placeholder="主网 API Key"
                autoComplete="off"
              />
            ) : (
              <div className="key-mask mono">{maskKey(localMainnetKey)}</div>
            )}
          </div>
          <div className="key-actions">
            {editingKey ? (
              <button className="btn btn-primary btn-small" onClick={handleSaveKey}>
                保存
              </button>
            ) : (
              <button className="btn btn-secondary btn-small" onClick={() => setEditingKey(true)}>
                修改
              </button>
            )}
            <button className="btn btn-secondary btn-small" onClick={handleTestKey} disabled={testingKey || !localMainnetKey.trim()}>
              {testingKey ? '测试中' : '测试连接'}
            </button>
            {localMainnetKey && (
              <button className="btn btn-secondary btn-small btn-danger-text" onClick={handleDeleteKey}>
                删除
              </button>
            )}
          </div>
        </div>
        <div className="settings-hint">
          API Key 仅保存在当前浏览器本地，不会写入配置导出文件，也不会上传到网站服务器。更换浏览器或设备后需要重新配置。
          {' '}
          新用户可前往
          {' '}
          <a className="settings-link" href="https://geomi.dev" target="_blank" rel="noreferrer">
            Geomi
          </a>
          {' '}
          注册并创建 API Key。
        </div>
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal config-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">设置</h2>
        {configMessage && (
          <div className={`settings-message ${configMessage.type}`}>
            {configMessage.text}
          </div>
        )}
        
        <div className="settings-section">
          <h3 className="settings-section-title">API Key 配置</h3>
          {renderKeyField()}
        </div>

        <div className="settings-section settings-section-bordered">
          <h3 className="settings-section-title">管理主钱包</h3>

          {accounts.length > 0 && (
            <div className="account-list">
              {accounts.map((acc) => (
                <div key={acc.address} className="account-list-item">
                  {editingAccount?.address === acc.address ? (
                    <>
                      <input
                        type="text"
                        className="form-input"
                        value={editingAccount.name}
                        onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                        placeholder="别名"
                        autoFocus
                      />
                      <div className="account-actions">
                        <button className="btn btn-primary btn-small" onClick={handleUpdateName}>保存</button>
                        <button className="btn btn-secondary btn-small" onClick={() => setEditingAccount(null)}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="account-meta">
                        <div className="account-name">{acc.name || '未命名'}</div>
                        <div className="account-address mono">{acc.address}</div>
                      </div>
                      <div className="account-actions">
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => setEditingAccount({ address: acc.address, name: acc.name || '' })}
                        >编辑</button>
                        <button
                          className="btn btn-secondary btn-small btn-danger-text"
                          onClick={() => handleRemove(acc.address)}
                        >删除</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="add-account-row">
            <div className="form-group">
              <label className="form-label">主钱包地址</label>
              <input
                type="text"
                className="form-input"
                value={newAddress}
                onChange={(e) => {
                  setNewAddress(e.target.value);
                  setAccountError('');
                }}
                placeholder="0x..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">别名（可选）</label>
              <input
                type="text"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如：主账户"
              />
            </div>
            <button className="btn btn-primary add-account-btn" onClick={handleAddAccount}>
              添加
            </button>
          </div>
          {accountError && (
            <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '8px' }}>
              {accountError}
            </div>
          )}
        </div>

        <div className="settings-section settings-section-bordered">
          <h3 className="settings-section-title">本地子账户别名</h3>

          {groupedSubaccounts.length > 0 ? (
            <div className="subaccount-groups">
              {groupedSubaccounts.map((group) => (
                <div key={group.owner} className="subaccount-group">
                  <div className="subaccount-group-header">
                    <div>
                      <div className="account-name">{group.ownerName || '未命名主钱包'}</div>
                      {group.owner !== 'unknown' && (
                        <div className="account-address mono" title={group.owner}>
                          {maskAddress(group.owner)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="account-list">
                    {group.subaccounts.map((subaccount) => (
                      <div key={subaccount.address} className="account-list-item subaccount-list-item">
                        {editingSubaccount?.address === subaccount.address ? (
                          <>
                            <input
                              type="text"
                              className="form-input"
                              value={editingSubaccount.alias}
                              onChange={(e) => setEditingSubaccount({ ...editingSubaccount, alias: e.target.value })}
                              placeholder="本地别名，留空则使用官方字段或地址"
                              autoFocus
                            />
                            <div className="account-actions">
                              <button className="btn btn-primary btn-small" onClick={handleUpdateSubaccountAlias}>保存</button>
                              <button className="btn btn-secondary btn-small" onClick={() => setEditingSubaccount(null)}>取消</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="account-meta">
                              <div className="account-name">{subaccount.alias || '未设置本地别名'}</div>
                              <div className="account-address mono" title={subaccount.address}>
                                {maskAddress(subaccount.address)}
                              </div>
                            </div>
                            <div className="account-actions">
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => setEditingSubaccount({ address: subaccount.address, alias: subaccount.alias || '' })}
                              >编辑</button>
                              {subaccount.alias && (
                                <button
                                  className="btn btn-secondary btn-small btn-danger-text"
                                  onClick={() => onUpdateSubaccountAlias?.(subaccount.address, '')}
                                >清除</button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">刷新数据后会显示已发现的子账户</div>
          )}
        </div>

        <div className="settings-section settings-section-bordered">
          <div className="settings-section-heading">
            <h3 className="settings-section-title">本地配置</h3>
            <span className="settings-section-meta">{accounts.length} 个主钱包 · {subaccounts.length} 个子账户</span>
          </div>
          <div className="settings-hint">
            导出文件包含主钱包和本地别名，不包含 API Key。导入后会刷新页面应用配置。
          </div>
          <div className="settings-actions-row">
            <button className="btn btn-secondary btn-small" onClick={handleExportConfig}>
              导出配置
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => importInputRef.current?.click()}>
              导入配置
            </button>
            <button className="btn btn-secondary btn-small btn-danger-text" onClick={handleClearLocalData}>
              清除本地数据
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden-file-input"
              onChange={handleImportConfig}
            />
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: '24px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

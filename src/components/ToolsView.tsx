import { Database, FileDown, Rocket, Server, Upload } from 'lucide-react';
import { CalendarEvent, FtpConfig, NavState, Note, WebDavConfig } from '../types';
import { getApiBaseUrl } from '../lib/api';

interface ToolsViewProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  notes: Note[];
  customEvents: CalendarEvent[];
  webdavConfig: WebDavConfig;
  ftpConfig?: FtpConfig;
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  setNavState: (state: NavState) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  uiScale: number;
  setUiScale?: (scale: number) => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const DEVICE_PRESETS = [
  { id: 'win-pc', label: 'Win 电脑', desc: '1.0x UI · 标准字号' },
  { id: 'win-tablet', label: 'Win 平板', desc: '1.2x UI · 较大字号' },
  { id: 'android-13', label: 'Android 13 手机', desc: '1.0x UI · 触控优化' },
  { id: 'sharp-r2', label: '夏普 R2', desc: '0.9x UI · 紧凑字号' },
  { id: 'nokia-n1', label: '诺基亚 N1', desc: '1.3x UI · 大字高对比' },
];

export default function ToolsView({
  activeTool,
  setActiveTool,
  notes,
  customEvents,
  webdavConfig,
  ftpConfig,
  handleExportDatabase,
  handleImportDatabase,
  setNavState,
  fontSizeLevel,
  setFontSizeLevel,
  uiScale,
  setUiScale,
  deviceProfile,
  applyDevicePreset,
  notify,
}: ToolsViewProps) {
  return (
    <div className="flex-1 flex flex-col sn-canvas border-l sn-border overflow-hidden w-full select-none min-w-0">
      {/* HEADER */}
      <div className="h-14 px-6 lg:px-8 border-b sn-border flex items-center justify-between gap-3 shrink-0 sn-panel">
        <div className="flex items-center gap-2.5 min-w-0">
          <Rocket className="w-5 h-5 text-indigo-500 shrink-0" />
          <span className="text-sm font-bold sn-text truncate">系统工具箱</span>
          <span className="text-xs sn-muted hidden sm:inline">
            {activeTool === 'device' ? '· 多端自适应配置' : '· 状态快照备份'}
          </span>
        </div>

        <div className="flex gap-1 sn-surface p-1 border sn-border rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTool('backup')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTool === 'backup'
                ? 'bg-indigo-600 text-white'
                : 'sn-muted hover:sn-text'
            }`}
          >
            整库快照
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('device')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTool === 'device'
                ? 'bg-indigo-600 text-white'
                : 'sn-muted hover:sn-text'
            }`}
          >
            多端自适应
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pb-16">
        {activeTool !== 'device' && (
          <div className="p-6 lg:p-8 max-w-4xl space-y-6 mx-auto w-full">
            <div className="sn-surface border sn-border p-6 rounded-2xl space-y-2">
              <h2 className="text-sm font-bold sn-text flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <span>离线优先快照与分布式备份</span>
              </h2>
              <p className="text-xs sn-muted leading-relaxed">
                可直接导出本地 LWW-Element-Set 完整数据快照（JSON / ZIP），或连接自建 WebDAV 与私有 FTP 服务完成跨终端冷备份。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Snapshot export/import */}
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
                <h3 className="text-xs font-bold sn-text uppercase tracking-wider">
                  状态快照归档
                </h3>
                <p className="text-xs sn-muted leading-relaxed">
                  包含全部笔记、思维导图、多级标签关系与自定义日历事件。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleExportDatabase}
                    className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>导出快照</span>
                  </button>
                  <label className="py-2.5 px-4 sn-elevated hover:border-indigo-500 sn-text border sn-border-strong font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>导入快照</span>
                    <input
                      type="file"
                      accept=".json,.zip"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.name.endsWith('.zip')) {
                          try {
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await fetch(`${getApiBaseUrl()}/backup/import`, {
                              method: 'POST',
                              body: formData,
                            });
                            if (!response.ok) throw new Error('导入 ZIP 失败');
                            notify('success', 'ZIP 备份导入成功，即将刷新页面');
                            setTimeout(() => window.location.reload(), 900);
                          } catch (err: any) {
                            notify('error', `ZIP 备份导入失败: ${err?.message || err}`);
                          }
                        } else {
                          const text = await file.text();
                          handleImportDatabase(text);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="p-3.5 sn-surface rounded-lg border sn-border text-xs sn-muted space-y-1 font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span>活跃笔记</span>
                    <span className="sn-text font-semibold">
                      {notes.filter((n) => !n.deleted).length} 篇
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>日程事件</span>
                    <span className="sn-text font-semibold">{customEvents.length} 条</span>
                  </div>
                  <div className="flex justify-between">
                    <span>一致性策略</span>
                    <span className="text-emerald-500 font-semibold">LWW-Element-Set</span>
                  </div>
                </div>
              </div>

              {/* Cloud Relay summary */}
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
                <h3 className="text-xs font-bold sn-text uppercase tracking-wider">
                  WebDAV 与 FTP 中继节点
                </h3>
                <p className="text-xs sn-muted leading-relaxed">
                  支持坚果云、NextCloud 或群晖 NAS 等私有 WebDAV / FTP 存储节点。
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="sn-surface border sn-border p-2.5 rounded-lg flex items-center justify-between">
                    <span className="sn-muted">WebDAV</span>
                    <span className={webdavConfig?.url ? 'text-emerald-500 font-semibold' : 'sn-muted'}>
                      {webdavConfig?.url ? '已配置' : '未配置'}
                    </span>
                  </div>
                  <div className="sn-surface border sn-border p-2.5 rounded-lg flex items-center justify-between">
                    <span className="sn-muted">FTP</span>
                    <span className={ftpConfig?.host ? 'text-emerald-500 font-semibold' : 'sn-muted'}>
                      {ftpConfig?.host ? '已配置' : '未配置'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNavState('settings')}
                  className="w-full py-2.5 px-4 sn-elevated hover:border-indigo-500 text-indigo-500 font-semibold text-xs border sn-border-strong rounded-xl transition-colors cursor-pointer"
                >
                  前往系统设置管理同步参数
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTool === 'device' && (
          <div className="p-6 lg:p-8 max-w-4xl space-y-6 mx-auto w-full">
            <div className="sn-surface border sn-border p-6 rounded-2xl space-y-2">
              <h2 className="text-sm font-bold sn-text flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-500" />
                <span>多端真机视口自适应配置</span>
              </h2>
              <p className="text-xs sn-muted leading-relaxed">
                根据当前屏幕物理尺寸与 DPI 自动匹配字体等级与界面缩放比例，兼顾桌面、平板与旧版 Android WebView。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Scale & Font */}
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="sn-text">全局字体大小等级</span>
                    <span className="text-indigo-500 font-mono tabular-nums">
                      {fontSizeLevel} / 5 级
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={fontSizeLevel}
                    onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 accent-indigo-500 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-2 pt-3 border-t sn-border">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="sn-text">界面整体缩放比例</span>
                    <span className="text-indigo-500 font-mono tabular-nums">
                      {(uiScale * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={uiScale}
                    onChange={(e) => setUiScale && setUiScale(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-indigo-500 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Device Profiles (aligned with App.tsx) */}
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-3">
                <h3 className="text-xs font-bold sn-text uppercase tracking-wider">
                  真机适配预设
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEVICE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        applyDevicePreset(p.id);
                        notify('success', `已切换为「${p.label}」适配方案`);
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        deviceProfile === p.id
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'sn-surface sn-text sn-border-strong hover:border-indigo-500'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          deviceProfile === p.id ? 'text-indigo-100' : 'sn-muted'
                        }`}
                      >
                        {p.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

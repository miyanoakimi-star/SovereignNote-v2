import {
  Calendar,
  ChevronLeft,
  FileText,
  Info,
  Menu,
  Rocket,
  Search,
  Settings,
  Tag,
} from 'lucide-react';
import { NavState } from '../types';

interface SidebarProps {
  navState: NavState;
  setNavState: (state: NavState) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  themeMode: 'day' | 'night';
  setThemeMode: (mode: 'day' | 'night') => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  uiScale: number;
  setUiScale: (scale: number) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
}

export default function Sidebar({
  navState,
  setNavState,
  isOpen,
  setIsOpen,
  searchQuery,
  setSearchQuery,
  themeMode,
  setThemeMode,
  deviceProfile,
  applyDevicePreset,
  uiScale,
  setUiScale,
  fontSizeLevel,
  setFontSizeLevel,
}: SidebarProps) {
  if (!isOpen) {
    return (
      <div className="w-14 shrink-0 flex flex-col items-center py-4 sn-sidebar border-r sn-border">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-2 sn-surface rounded-lg sn-muted hover:sn-text"
          aria-label="展开侧边栏"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 sn-sidebar border-r sn-border flex flex-col transition-all duration-200 select-none">
      <div className="h-14 flex items-center justify-between px-4 border-b sn-border shrink-0">
        <span className="font-bold sn-text flex items-center gap-2 text-sm">
          <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center text-xs font-black">
            S
          </div>
          SovereignNote
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="sn-muted hover:sn-text p-1 rounded"
          aria-label="收起侧边栏"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3.5 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 sn-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="全局搜索笔记..."
            className="w-full h-9 pl-9 pr-3 text-xs sn-input border rounded-lg focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <nav className="flex-1 px-2.5 space-y-1 overflow-y-auto">
        <NavItem
          active={navState === 'notes'}
          onClick={() => setNavState('notes')}
          icon={<FileText className="w-4 h-4 text-indigo-500" />}
          label="笔记"
        />
        <NavItem
          active={navState === 'tags'}
          onClick={() => setNavState('tags')}
          icon={<Tag className="w-4 h-4 text-pink-500" />}
          label="标签"
        />
        <NavItem
          active={navState === 'calendar'}
          onClick={() => setNavState('calendar')}
          icon={<Calendar className="w-4 h-4 text-emerald-500" />}
          label="日历"
        />
        <NavItem
          active={navState === 'tools'}
          onClick={() => setNavState('tools')}
          icon={<Rocket className="w-4 h-4 text-amber-500" />}
          label="工具箱"
        />

        {/* 多端环境与自适应 */}
        <div className="pt-3 px-0.5">
          <div className="sn-panel p-2.5 rounded-xl border sn-border space-y-2.5">
            <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
              多端环境与主题
            </h3>

            {/* Day / Night toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-lg sn-surface p-0.5 border sn-border">
              <button
                type="button"
                onClick={() => setThemeMode('day')}
                className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  themeMode === 'day'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'sn-muted hover:sn-text'
                }`}
              >
                ☀️ 日间
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('night')}
                className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  themeMode === 'night'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'sn-muted hover:sn-text'
                }`}
              >
                🌙 夜间
              </button>
            </div>

            {/* Device preset selector */}
            <div className="grid grid-cols-2 gap-1">
              {[
                { id: 'win-pc', label: 'Win 电脑' },
                { id: 'win-tablet', label: 'Win 平板' },
                { id: 'android-13', label: '安卓 13' },
                { id: 'sharp-r2', label: '夏普 R2' },
                { id: 'nokia-n1', label: '诺基亚 N1' },
              ].map((prof) => (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => applyDevicePreset(prof.id)}
                  className={`py-1 px-1.5 rounded-md text-[10px] font-semibold transition-colors text-center border ${
                    deviceProfile === prof.id
                      ? 'bg-indigo-600/20 text-indigo-500 border-indigo-500/40'
                      : 'sn-surface sn-muted sn-border hover:sn-text'
                  }`}
                >
                  {prof.label}
                </button>
              ))}
            </div>

            {/* Font & UI Scale */}
            <div className="sn-surface p-2 rounded-lg border sn-border space-y-2 text-[10px] sn-muted font-mono tabular-nums">
              <div>
                <div className="flex justify-between items-center font-semibold mb-1">
                  <span>字号等级</span>
                  <span className="text-indigo-500">{fontSizeLevel} / 5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={fontSizeLevel}
                  onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 h-1 cursor-pointer rounded-lg"
                />
              </div>

              <div className="border-t sn-border pt-1.5">
                <div className="flex justify-between items-center font-semibold mb-1">
                  <span>UI 缩放</span>
                  <span className="text-emerald-500">{uiScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={uiScale}
                  onChange={(e) => setUiScale(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 cursor-pointer rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="p-2 border-t sn-border shrink-0 space-y-1">
        <NavItem
          active={navState === 'about'}
          onClick={() => setNavState('about')}
          icon={<Info className="w-4 h-4 text-sky-500" />}
          label="关于 SovereignNote"
        />
        <NavItem
          active={navState === 'settings'}
          onClick={() => setNavState('settings')}
          icon={<Settings className="w-4 h-4 text-indigo-500" />}
          label="系统与 AI 设置"
        />
      </div>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
        active
          ? 'bg-indigo-600/15 text-indigo-500'
          : 'sn-muted hover:sn-surface hover:sn-text'
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

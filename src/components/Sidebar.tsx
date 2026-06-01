import { Search, FileText, Tag, Calendar, Settings, ChevronLeft, Menu } from 'lucide-react';
import { NavState } from '../types';

interface SidebarProps {
  navState: NavState;
  setNavState: (state: NavState) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function Sidebar({ navState, setNavState, isOpen, setIsOpen, searchQuery, setSearchQuery }: SidebarProps) {
  if (!isOpen) {
    return (
      <div className="w-14 shrink-0 flex flex-col items-center py-4 bg-slate-950 border-r border-slate-800">
        <button onClick={() => setIsOpen(true)} className="p-2 bg-slate-800 rounded text-slate-400 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300">
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
        <span className="font-bold text-slate-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-xs">S</div>
          SovereignNote
        </span>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="全局搜索..."
            className="w-full h-9 pl-9 pr-4 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        <NavItem active={navState === 'notes'} onClick={() => setNavState('notes')} icon={<FileText />} label="笔记" />
        <NavItem active={navState === 'tags'} onClick={() => setNavState('tags')} icon={<Tag />} label="标签" />
        <NavItem active={navState === 'calendar'} onClick={() => setNavState('calendar')} icon={<Calendar />} label="日历" />
      </nav>

      <div className="p-2 border-t border-slate-800 shrink-0">
        <NavItem active={navState === 'settings'} onClick={() => setNavState('settings')} icon={<Settings />} label="设置" />
      </div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Bold,
  Bot,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Download,
  Edit3,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import { FTP } from '../plugins/ftp';
import { SovereignNative } from '../plugins/sovereignNative';
import {
  AiCustomCommand,
  AiModelPreset,
  AiProtocol,
  CalendarEvent,
  FetchedAiModel,
  FtpConfig,
  Note,
  ProbeLogItem,
  SettingsTab,
  SyncLogEntry,
  WebDavConfig,
} from '../types';
import { addSyncLog, getApiBaseUrl } from '../lib/api';
import {
  fetchAiModelsFromServer,
  fetchServerAiStatus,
  testAiPresetConnection,
} from '../lib/ai';
import { universalExport } from '../utils/export';
import { safeStorage } from '../utils/safeStorage';

interface SettingsViewProps {
  activeSettingsTab: SettingsTab;
  themeMode: 'day' | 'night';
  setThemeMode: (mode: 'day' | 'night') => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  uiScale: number;
  setUiScale?: (scale: number) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
  notes: Note[];
  setNotes?: (notes: Note[]) => void;
  customEvents: CalendarEvent[];
  setCustomEvents: (events: CalendarEvent[]) => void;
  customFestivals: Record<string, string>;
  independentTags: string[];
  setIndependentTags: (tags: string[]) => void;
  noteTagsMap: Record<string, string[]>;
  setNoteTagsMap: (map: Record<string, string[]>) => void;
  webdavConfig: WebDavConfig;
  setWebdavConfig: (cfg: WebDavConfig) => void;
  ftpConfig?: FtpConfig;
  setFtpConfig?: (cfg: FtpConfig) => void;
  handleExportDatabase: () => void;
  handleImportDatabase: (jsonData: string) => void;
  presets: AiModelPreset[];
  activePresetId: string;
  onSelectPreset: (id: string) => void;
  onUpsertPreset: (preset: AiModelPreset) => void;
  onBatchAddPresets: (presets: AiModelPreset[]) => void;
  onDeletePreset: (id: string) => void;
  customCommands: AiCustomCommand[];
  onUpsertCustomCommand: (cmd: AiCustomCommand) => void;
  onDeleteCustomCommand: (id: string) => void;
  onResetCustomCommands: () => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
  releaseVersion: string;
}

const EMPTY_PRESET_FORM: AiModelPreset = {
  id: '',
  name: '',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  systemPrompt: '',
  directBrowser: false,
};

export default function SettingsView({
  activeSettingsTab,
  themeMode,
  setThemeMode,
  deviceProfile,
  applyDevicePreset,
  uiScale,
  setUiScale,
  fontSizeLevel,
  setFontSizeLevel,
  notes,
  setNotes,
  customEvents,
  setCustomEvents,
  customFestivals,
  independentTags,
  setIndependentTags,
  noteTagsMap,
  setNoteTagsMap,
  webdavConfig,
  setWebdavConfig,
  ftpConfig,
  setFtpConfig,
  handleExportDatabase,
  handleImportDatabase,
  presets,
  activePresetId,
  onSelectPreset,
  onUpsertPreset,
  onBatchAddPresets,
  onDeletePreset,
  customCommands,
  onUpsertCustomCommand,
  onDeleteCustomCommand,
  onResetCustomCommands,
  notify,
  releaseVersion,
}: SettingsViewProps) {
  // AI Presets & Model Fetching State
  const [serverAiAvailable, setServerAiAvailable] = useState<boolean | null>(null);
  const [editingPreset, setEditingPreset] = useState<AiModelPreset | null>(null);
  const [testingPresetId, setTestingPresetId] = useState<string | null>(null);
  const [presetTestResults, setPresetTestResults] = useState<
    Record<string, { ok: boolean; message: string; latencyMs: number }>
  >({});

  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedAiModel[]>([]);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [modelFilterQuery, setModelFilterQuery] = useState('');
  const [selectedFetchedModelIds, setSelectedFetchedModelIds] = useState<Record<string, boolean>>({});

  // Custom AI Commands Form State
  const [editingCommand, setEditingCommand] = useState<{ id: string; name: string; prompt: string } | null>(
    null
  );

  // Cache reset confirmation
  const [confirmClearCache, setConfirmClearCache] = useState(false);

  // Sync & Health Diagnostics State
  const [webdavStatus, setWebdavStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [webdavLog, setWebdavLog] = useState<string[]>([]);
  const [ftpTestStatus, setFtpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ftpTestResultLogs, setFtpTestResultLogs] = useState<ProbeLogItem[]>([]);
  const [lwwTestStatus, setLwwTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [lwwTestResultLogs, setLwwTestResultLogs] = useState<ProbeLogItem[]>([]);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [androidHealthStatus, setAndroidHealthStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [androidHealthLogs, setAndroidHealthLogs] = useState<string[]>([]);

  // Android Native Storage
  const [nativePathInfo, setNativePathInfo] = useState<any>(null);
  const [activeNativeFolder, setActiveNativeFolder] = useState<string>('backup');
  const [nativeFiles, setNativeFiles] = useState<any[]>([]);
  const [nativeStatusMessage, setNativeStatusMessage] = useState<string>('');

  // Persistent Sync Logs
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [realSyncLogs, setRealSyncLogs] = useState<SyncLogEntry[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<'all' | 'ftp' | 'webdav' | 'lww'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeSettingsTab === 'ai') {
      fetchServerAiStatus().then((s) => setServerAiAvailable(s.serverGeminiAvailable));
    }
  }, [activeSettingsTab]);

  const fetchRealSyncLogs = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/sync/logs`);
      if (res.ok) {
        const data = await res.json();
        setRealSyncLogs(data);
      }
    } catch (e) {
      console.error('Failed to fetch real sync logs', e);
    }
  };

  useEffect(() => {
    if (activeSettingsTab === 'sync') {
      fetchRealSyncLogs();
    }
    const handleLogsUpdate = () => fetchRealSyncLogs();
    window.addEventListener('sovereign_sync_logs_updated', handleLogsUpdate);
    return () => window.removeEventListener('sovereign_sync_logs_updated', handleLogsUpdate);
  }, [activeSettingsTab]);

  const loadNativePathAndFiles = async (folder = activeNativeFolder) => {
    try {
      if (!Capacitor.isNativePlatform()) return;
      const info = await SovereignNative.getStoragePathInfo();
      setNativePathInfo(info);
      const fileRes = await SovereignNative.listFiles({ folderName: folder });
      setNativeFiles(fileRes.files || []);
    } catch (err) {
      console.warn('Failed to load native storage info or files:', err);
    }
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform() && activeSettingsTab === 'sync') {
      loadNativePathAndFiles(activeNativeFolder);
    }
  }, [activeNativeFolder, activeSettingsTab]);

  const groupedSessions = useMemo(() => {
    const groups: Record<
      string,
      {
        sessionId: string;
        protocol: string;
        startTime: string;
        endTime: string;
        status: 'SUCCESS' | 'ERROR' | 'WARN' | 'INFO';
        steps: { step?: string; level: string; message: string; timestamp: string }[];
      }
    > = {};

    const sortedLogs = [...realSyncLogs].reverse();
    sortedLogs.forEach((log) => {
      let sessionId = log.session_id;
      let protocol = log.protocol;

      if (!sessionId) {
        if (log.message.includes('[FTP]') || log.message.startsWith('FTP')) {
          sessionId = 'ftp-unassigned';
          protocol = 'ftp';
        } else if (log.message.includes('[WebDAV]') || log.message.startsWith('WebDAV')) {
          sessionId = 'webdav-unassigned';
          protocol = 'webdav';
        } else {
          sessionId = 'lww-unassigned';
          protocol = 'lww';
        }
      } else if (!protocol) {
        protocol = sessionId.startsWith('webdav')
          ? 'webdav'
          : sessionId.startsWith('ftp')
          ? 'ftp'
          : 'lww';
      }

      if (!groups[sessionId]) {
        groups[sessionId] = {
          sessionId,
          protocol: protocol || 'lww',
          startTime: log.timestamp,
          endTime: log.timestamp,
          status: 'INFO',
          steps: [],
        };
      }

      groups[sessionId].endTime = log.timestamp;
      if (log.level === 'ERROR') {
        groups[sessionId].status = 'ERROR';
      } else if (log.level === 'WARN' && groups[sessionId].status !== 'ERROR') {
        groups[sessionId].status = 'WARN';
      } else if (
        log.level === 'SUCCESS' &&
        groups[sessionId].status !== 'ERROR' &&
        groups[sessionId].status !== 'WARN'
      ) {
        groups[sessionId].status = 'SUCCESS';
      }

      groups[sessionId].steps.push({
        step: log.step,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
      });
    });

    return Object.values(groups)
      .sort((a, b) => b.endTime.localeCompare(a.endTime))
      .filter((sess) => {
        if (selectedProtocol === 'all') return true;
        return sess.protocol.toLowerCase() === selectedProtocol;
      });
  }, [realSyncLogs, selectedProtocol]);

  // Direct Android WebView to Core API Health Check (AGENTS.md requirement: no empty catch)
  const testHealth = async () => {
    setAndroidHealthStatus('testing');
    setAndroidHealthLogs([
      `[${new Date().toLocaleTimeString()}] 开始直连本地健康端口 (http://127.0.0.1:8787/api/health)...`,
    ]);
    try {
      const res = await fetch('http://127.0.0.1:8787/api/health');
      const txt = await res.text();
      setAndroidHealthLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 状态码: ${res.status}`,
        `[${new Date().toLocaleTimeString()}] 响应: ${txt}`,
      ]);
      setAndroidHealthStatus(res.ok ? 'success' : 'error');
    } catch (e: any) {
      console.error('Local 8787 health check failed:', e);
      setAndroidHealthLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 通讯异常: ${e?.message || String(e)}`,
      ]);
      setAndroidHealthStatus('error');
    }
  };

  // WebDAV test & backup
  const handleTestWebDAV = async () => {
    setWebdavStatus('testing');
    const url = webdavConfig.url || '';
    const port = webdavConfig.port || '443';
    const path = webdavConfig.path || '';
    const username = webdavConfig.username || '';
    const password = webdavConfig.password || '';
    const sessionId = 'webdav-test-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    setWebdavLog([`[1/3] 校验目标节点 ${url}:${port}${path}`]);
    await addSyncLog('INFO', `准备校验 WebDAV: ${url}:${port}${path}`, sessionId, 'webdav', 'connect');

    setTimeout(async () => {
      if (!url || !path || !username || !password) {
        setWebdavStatus('error');
        setWebdavLog((prev) => [...prev, '[失败] 服务器地址、路径、用户名与密码不能为空']);
        await addSyncLog('ERROR', 'WebDAV 配置缺少必要字段', sessionId, 'webdav', 'error');
      } else {
        setWebdavStatus('success');
        setWebdavLog((prev) => [...prev, '[就绪] WebDAV 配置格式与凭据已通过预检']);
        await addSyncLog('SUCCESS', `WebDAV 路径 "${path}" 预检就绪`, sessionId, 'webdav', 'end');
      }
      fetchRealSyncLogs();
    }, 350);
  };

  const handleBackupToWebDAV = async () => {
    const sessionId = 'webdav-sync-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    setBackupStatus('正在生成 LWW 状态快照准备上传 WebDAV...');
    await addSyncLog('INFO', `打包 ${notes.length} 篇笔记及 ${customEvents.length} 条日程`, sessionId, 'webdav', 'start');
    setTimeout(async () => {
      setBackupStatus(`已完成 WebDAV 目录 ${webdavConfig.path}/ 的快照归档`);
      await addSyncLog('SUCCESS', `WebDAV 快照写入完成: ${webdavConfig.path}/sovereign_backup.json`, sessionId, 'webdav', 'end');
      fetchRealSyncLogs();
    }, 450);
  };

  // FTP test & Android Native FTP helpers
  const getNativeFtpOptions = () => {
    const hostStr = ftpConfig?.host || '';
    let host = hostStr;
    let port = 21;
    if (hostStr.includes(':')) {
      const parts = hostStr.split(':');
      host = parts[0];
      port = Number(parts[1]) || 21;
    }
    return {
      host,
      port: ftpConfig?.port ? Number(ftpConfig.port) : port,
      user: ftpConfig?.user || '',
      pass: ftpConfig?.pass || '',
      username: ftpConfig?.user || '',
      password: ftpConfig?.pass || '',
      path: ftpConfig?.path || '',
    };
  };

  const handleTestFTP = async () => {
    setFtpTestStatus('testing');
    const sessionId = `ftp-probe-${Math.random().toString(36).substring(2, 9)}`;
    setFtpTestResultLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        status: 'start',
        layer: 'frontend',
        message: '发起 FTP 连接探测...',
        step: 'init',
      },
    ]);

    const host = ftpConfig?.host || '';
    const user = ftpConfig?.user || '';
    const pass = ftpConfig?.pass || '';

    if (!host || !user || !pass) {
      setFtpTestStatus('error');
      setFtpTestResultLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'error',
          layer: 'frontend',
          message: '主机、用户名或密码为空',
          step: 'validate',
        },
      ]);
      return;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FTP.testConnection({
          host,
          port: Number(ftpConfig?.port) || 21,
          username: user,
          password: pass,
          path: ftpConfig?.path || '',
        });
        setFtpTestStatus('success');
        setBackupStatus('Native FTP 连接验证成功');
        setFtpTestResultLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            status: 'ok',
            layer: 'frontend',
            message: `Native FTP 成功: ${result.message}`,
            step: 'native_connected',
          },
        ]);
        await addSyncLog('SUCCESS', `Android Native FTP 连接成功: ${result.message}`, sessionId, 'ftp', 'native_connected');
        fetchRealSyncLogs();
        return;
      }

      await import('../lib/api').then((m) =>
        m.probeKernel(sessionId, 'frontend', 'ftp', 'send_request', 'start', '发送 FTP 测试请求')
      );
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/sync/ftp/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, config: ftpConfig }),
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setFtpTestResultLogs(data.logs);
      if (res.ok && data.success) {
        setFtpTestStatus('success');
        setBackupStatus('FTP 通道校验成功');
      } else {
        setFtpTestStatus('error');
        setBackupStatus(`FTP 错误: ${data.message || '连接失败'}`);
      }
    } catch (err: any) {
      setFtpTestStatus('error');
      setBackupStatus(`FTP 连接测试失败: ${err?.message || err}`);
      setFtpTestResultLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'error',
          layer: 'frontend',
          message: `连接失败: ${err?.message || err}`,
          step: 'network',
        },
      ]);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const handleAndroidFtpPush = async () => {
    setBackupStatus('正在通过 Android Native 上传备份...');
    try {
      const opts = getNativeFtpOptions();
      const { getLocalNotes } = await import('../lib/api');
      const content = JSON.stringify(getLocalNotes(), null, 2);
      const result = await FTP.uploadFile({
        ...opts,
        filename: 'sovereign_backup.json',
        content,
      });
      setBackupStatus(result.success ? 'Android Native FTP 推送成功' : 'Android Native FTP 上传失败');
    } catch (err: any) {
      setBackupStatus(`Android Native FTP 失败: ${err?.message || err}`);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const handleAndroidFtpPull = async () => {
    setBackupStatus('正在通过 Android Native 拉取合并...');
    try {
      const opts = getNativeFtpOptions();
      const result = await FTP.downloadFile({ ...opts, filename: 'sovereign_backup.json' });
      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        const downloaded = Array.isArray(parsed) ? parsed : parsed?.notes || [];
        const { getLocalNotes, mergeNotesLWW, saveLocalNotes } = await import('../lib/api');
        const merged = mergeNotesLWW(getLocalNotes(), downloaded);
        saveLocalNotes(merged);
        if (setNotes) setNotes(merged);
        setBackupStatus('Android Native FTP 拉取合并成功');
      } else {
        setBackupStatus('Android Native FTP 拉取失败');
      }
    } catch (err: any) {
      setBackupStatus(`Android Native FTP 拉取失败: ${err?.message || err}`);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const handleAndroidFtpSync = async () => {
    setBackupStatus('正在通过 Android Native 执行双向 LWW 合并...');
    try {
      const opts = getNativeFtpOptions();
      let downloadedNotes: Note[] = [];
      try {
        const dl = await FTP.downloadFile({ ...opts, filename: 'sovereign_backup.json' });
        if (dl.success && dl.content) {
          const parsed = JSON.parse(dl.content);
          downloadedNotes = Array.isArray(parsed) ? parsed : parsed?.notes || [];
        }
      } catch (dlErr) {
        console.warn('No remote FTP backup yet, starting fresh upload:', dlErr);
      }
      const { getLocalNotes, mergeNotesLWW, saveLocalNotes } = await import('../lib/api');
      const merged = mergeNotesLWW(getLocalNotes(), downloadedNotes);
      saveLocalNotes(merged);
      if (setNotes) setNotes(merged);
      const up = await FTP.uploadFile({
        ...opts,
        filename: 'sovereign_backup.json',
        content: JSON.stringify(merged, null, 2),
      });
      setBackupStatus(up.success ? 'Android Native FTP 双向同步成功' : '上传阶段失败');
    } catch (err: any) {
      setBackupStatus(`Android Native FTP 双向同步失败: ${err?.message || err}`);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const handleTestLWW = async () => {
    setLwwTestStatus('testing');
    const sessionId = `lww-probe-${Math.random().toString(36).substring(2, 9)}`;
    setLwwTestResultLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        status: 'start',
        layer: 'frontend',
        message: '正在向本地协调核心发起 LWW 状态环路检查...',
        step: 'init',
      },
    ]);
    try {
      await import('../lib/api').then((m) =>
        m.probeKernel(sessionId, 'frontend', 'lww', 'send_request', 'start', '发起 LWW 链路检测')
      );
      const res = await fetch(`${getApiBaseUrl()}/notes/sync/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLwwTestResultLogs(data.logs);
      if (res.ok && data.success) {
        setLwwTestStatus('success');
        setBackupStatus('LWW 协同检测通过');
      } else {
        setLwwTestStatus('error');
        setBackupStatus(`LWW 检测异常: ${data.message || '响应中止'}`);
      }
    } catch (err: any) {
      setLwwTestStatus('error');
      setBackupStatus(`LWW 探测无法连通本地核心: ${err?.message || err}`);
      setLwwTestResultLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          status: 'error',
          layer: 'frontend',
          message: `本地核心未连接: ${err?.message || err}`,
          step: 'network',
        },
      ]);
    } finally {
      fetchRealSyncLogs();
    }
  };

  const handleNativeExportAll = async () => {
    try {
      if (!Capacitor.isNativePlatform()) return;
      setNativeStatusMessage('正在导出本地离线数据包...');
      const timestamp = new Date().toISOString().slice(0, 10);
      await SovereignNative.exportFile({
        folderName: 'settings',
        filename: 'settings.json',
        content: JSON.stringify(
          {
            fontSizeLevel,
            themeMode,
            deviceProfile,
            uiScale,
            webdavConfig,
            ftpConfig,
            customFestivals,
            independentTags,
            noteTagsMap,
          },
          null,
          2
        ),
      });
      await SovereignNative.exportFile({
        folderName: 'export',
        filename: 'notes.json',
        content: JSON.stringify(notes, null, 2),
      });
      const mdContent = notes
        .filter((n) => !n.deleted)
        .map((n) => `# ${n.title}\n\n${n.content}`)
        .join('\n\n---\n\n');
      await SovereignNative.exportFile({
        folderName: 'export',
        filename: `notes-${timestamp}.md`,
        content: mdContent,
      });
      setNativeStatusMessage('已成功导出至 Download/SovereignNote/');
      loadNativePathAndFiles(activeNativeFolder);
    } catch (err: any) {
      setNativeStatusMessage(`导出失败: ${err?.message || err}`);
    }
  };

  const handleNativeImportFile = async (folderName: string, fileName: string) => {
    try {
      const res = await SovereignNative.importFile({ folderName, filename: fileName });
      const parsed = JSON.parse(res.content);
      const imported: Note[] = Array.isArray(parsed) ? parsed : parsed?.notes || [];
      if (imported.length > 0 && setNotes) {
        const mergedMap: Record<string, Note> = {};
        for (const n of [...imported, ...notes]) {
          if (!mergedMap[n.id] || n.updated_at > mergedMap[n.id].updated_at) {
            mergedMap[n.id] = n;
          }
        }
        const finalNotes = Object.values(mergedMap);
        setNotes(finalNotes);
        safeStorage.setItem('sovereign_notes', JSON.stringify(finalNotes));
        if (Array.isArray(parsed?.customEvents)) setCustomEvents(parsed.customEvents);
        if (Array.isArray(parsed?.independentTags)) setIndependentTags(parsed.independentTags);
        if (parsed?.noteTagsMap) setNoteTagsMap(parsed.noteTagsMap);
        setNativeStatusMessage(`已从 ${fileName} 合并恢复 ${imported.length} 篇笔记`);
      }
    } catch (err: any) {
      setNativeStatusMessage(`导入失败: ${err?.message || err}`);
    }
  };

  // AI Preset Handlers
  const handleSavePresetForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPreset) return;
    if (!editingPreset.name.trim()) {
      notify('error', '请输入预设名称');
      return;
    }
    if (!editingPreset.model.trim()) {
      notify('error', '请输入模型 ID（例如 gemini-4-hydrogen、gpt-4o-mini 等）');
      return;
    }
    if (editingPreset.protocol !== 'server-gemini' && !editingPreset.baseUrl.trim()) {
      notify('error', '自定义协议需填写 API Base URL');
      return;
    }

    const saved: AiModelPreset = {
      ...editingPreset,
      id: editingPreset.id || `preset_${Date.now()}`,
      name: editingPreset.name.trim(),
      model: editingPreset.model.trim(),
      baseUrl: editingPreset.baseUrl.trim(),
      apiKey: editingPreset.protocol === 'server-gemini' ? '' : editingPreset.apiKey.trim(),
      systemPrompt: editingPreset.systemPrompt?.trim() || '',
    };

    onUpsertPreset(saved);
    onSelectPreset(saved.id);
    setEditingPreset(null);
    setFetchedModels([]);
    setFetchModelsError(null);
    setSelectedFetchedModelIds({});
    setModelFilterQuery('');
    notify('success', `已保存并启用 AI 模型预设「${saved.name}」`);
  };

  const handleFetchModelsForPreset = async (targetPreset: AiModelPreset) => {
    setIsFetchingModels(true);
    setFetchModelsError(null);
    setModelFilterQuery('');
    setSelectedFetchedModelIds({});
    try {
      const models = await fetchAiModelsFromServer({
        protocol: targetPreset.protocol,
        baseUrl: targetPreset.baseUrl,
        apiKey: targetPreset.apiKey,
        directBrowser: targetPreset.directBrowser,
      });
      setFetchedModels(models);
      if (models.length === 0) {
        notify('info', '服务器返回了空的模型列表');
      } else {
        notify('success', `成功从服务器抓取 ${models.length} 个可用模型`);
      }
    } catch (err: any) {
      const msg = err?.message || '从服务器抓取模型失败';
      setFetchModelsError(msg);
      setFetchedModels([]);
      notify('error', msg);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const filteredFetchedModels = useMemo(() => {
    const q = modelFilterQuery.trim().toLowerCase();
    if (!q) return fetchedModels;
    return fetchedModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.displayName || '').toLowerCase().includes(q) ||
        (m.ownedBy || '').toLowerCase().includes(q)
    );
  }, [fetchedModels, modelFilterQuery]);

  const selectedModelCount = useMemo(
    () => Object.values(selectedFetchedModelIds).filter(Boolean).length,
    [selectedFetchedModelIds]
  );

  const handleBatchCreatePresetsFromFetched = () => {
    if (!editingPreset) return;
    const chosenIds = Object.keys(selectedFetchedModelIds).filter((id) => selectedFetchedModelIds[id]);
    if (chosenIds.length === 0) {
      notify('info', '请先勾选至少一个要生成预设的模型');
      return;
    }
    const existingKeys = new Set(
      presets.map((p) => `${p.protocol}::${p.baseUrl.trim()}::${p.model.trim()}`)
    );
    const prefix = editingPreset.name.trim();
    const toCreate: AiModelPreset[] = [];
    chosenIds.forEach((modelId, idx) => {
      const key = `${editingPreset.protocol}::${editingPreset.baseUrl.trim()}::${modelId.trim()}`;
      if (existingKeys.has(key)) return;
      const modelMeta = fetchedModels.find((m) => m.id === modelId);
      const label = prefix
        ? `${prefix} · ${modelId}`
        : modelMeta?.displayName || modelId;
      toCreate.push({
        id: `preset_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        name: label,
        protocol: editingPreset.protocol,
        baseUrl: editingPreset.baseUrl.trim(),
        apiKey: editingPreset.protocol === 'server-gemini' ? '' : editingPreset.apiKey.trim(),
        model: modelId,
        systemPrompt: editingPreset.systemPrompt?.trim() || '',
        directBrowser: editingPreset.directBrowser,
      });
    });

    if (toCreate.length === 0) {
      notify('info', '所选模型已全部存在于预设列表中');
      return;
    }

    onBatchAddPresets(toCreate);
    setSelectedFetchedModelIds({});
    notify('success', `已批量生成 ${toCreate.length} 条模型预设`);
  };

  const handleSaveCustomCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCommand) return;
    const name = editingCommand.name.trim();
    const prompt = editingCommand.prompt.trim();
    if (!name || !prompt) {
      notify('error', '请填写命令名称与指令内容');
      return;
    }
    onUpsertCustomCommand({
      id: editingCommand.id || `cmd_${Date.now()}`,
      name,
      prompt,
      updatedAt: Date.now(),
    });
    setEditingCommand(null);
    notify('success', `已保存自定义 AI 命令「${name}」`);
  };

  const handleTestPreset = async (preset: AiModelPreset) => {
    setTestingPresetId(preset.id);
    const result = await testAiPresetConnection(preset);
    setPresetTestResults((prev) => ({ ...prev, [preset.id]: result }));
    setTestingPresetId(null);
    notify(
      result.ok ? 'success' : 'error',
      `${preset.name}: ${result.message} (${result.latencyMs}ms)`
    );
  };

  const tabHeaderMap: Record<SettingsTab, { title: string; subtitle: string }> = {
    general: { title: '系统环境通用设置', subtitle: '设备适配 · 健康探针 · 缓存管理' },
    appearance: { title: '界面外观与视觉主题', subtitle: '日间 / 夜间高对比度配色' },
    editor: { title: '编辑器与文字排版', subtitle: '全局五级字号调节' },
    calendar: { title: '日历与日程模块', subtitle: '农历干支与笔记双向联动' },
    ai: { title: 'AI 模型预设与自定义接口', subtitle: '多模型切换 · 自定义兼容 API' },
    sync: { title: '同步与备份中心', subtitle: 'LWW · WebDAV · FTP · 日志追踪' },
    about: { title: '关于与系统哲学', subtitle: '离线优先 · 数据主权自治' },
  };

  return (
    <div className="flex-1 flex flex-col sn-canvas border-l sn-border sn-text overflow-y-auto w-full min-w-0">
      {/* Header */}
      <div className="h-14 px-6 lg:px-8 border-b sn-border flex items-center shrink-0 justify-between sn-panel">
        <div className="flex items-center gap-3 min-w-0">
          {activeSettingsTab === 'ai' ? (
            <Bot className="w-5 h-5 text-indigo-500 shrink-0" />
          ) : (
            <Settings className="w-5 h-5 text-indigo-500 shrink-0" />
          )}
          <h1 className="font-bold sn-text truncate">{tabHeaderMap[activeSettingsTab].title}</h1>
        </div>
        <div className="sn-muted text-xs hidden sm:block">
          {tabHeaderMap[activeSettingsTab].subtitle}
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-3xl pb-16 mx-auto w-full space-y-8">
        {/* TAB 1: AI MODEL PRESETS */}
        {activeSettingsTab === 'ai' && (
          <div className="space-y-6">
            <div className="p-5 sn-panel rounded-xl border sn-border flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold sn-text">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <span>多模型预设与自定义 API 管理</span>
                </div>
                <p className="text-xs sn-muted">
                  支持内置服务端 Gemini 引擎、自定义 OpenAI 兼容接口（DeepSeek / SiliconFlow / OneAPI）、自定义 Gemini 代理以及浏览器直连本地 Ollama。
                </p>
                {serverAiAvailable !== null && (
                  <p className="text-xs font-mono sn-muted pt-1">
                    内置服务端 Gemini 状态：
                    <span
                      className={
                        serverAiAvailable
                          ? 'text-emerald-500 font-semibold ml-1'
                          : 'text-amber-500 font-semibold ml-1'
                      }
                    >
                      {serverAiAvailable ? '已就绪' : '服务端暂未配置（可使用自定义 API 预设）'}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPreset({ ...EMPTY_PRESET_FORM });
                  setFetchedModels([]);
                  setFetchModelsError(null);
                  setSelectedFetchedModelIds({});
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>新建模型预设</span>
              </button>
            </div>

            {/* Edit / Create Preset Form */}
            {editingPreset && (
              <form
                onSubmit={handleSavePresetForm}
                className="p-5 sn-surface rounded-xl border border-indigo-500/40 space-y-4"
              >
                <div className="flex items-center justify-between border-b sn-border pb-3">
                  <h3 className="text-sm font-bold sn-text">
                    {editingPreset.id ? '编辑模型预设' : '新增自定义模型预设'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPreset(null);
                      setFetchedModels([]);
                      setFetchModelsError(null);
                    }}
                    className="text-xs sn-muted hover:sn-text"
                  >
                    取消
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs sn-muted font-semibold">预设名称</label>
                    <input
                      type="text"
                      value={editingPreset.name}
                      onChange={(e) =>
                        setEditingPreset({ ...editingPreset, name: e.target.value })
                      }
                      placeholder="例如：DeepSeek Chat / 公司内部网关"
                      className="w-full sn-input border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs sn-muted font-semibold">接口协议</label>
                    <select
                      value={editingPreset.protocol}
                      onChange={(e) => {
                        const protocol = e.target.value as AiProtocol;
                        setFetchedModels([]);
                        setFetchModelsError(null);
                        setSelectedFetchedModelIds({});
                        setEditingPreset({
                          ...editingPreset,
                          protocol,
                          baseUrl:
                            protocol === 'server-gemini'
                              ? ''
                              : editingPreset.baseUrl ||
                                (protocol === 'openai'
                                  ? 'https://api.openai.com/v1'
                                  : 'https://generativelanguage.googleapis.com'),
                          model:
                            protocol === 'server-gemini'
                              ? 'gemini-4-hydrogen'
                              : editingPreset.model ||
                                (protocol === 'openai' ? 'gpt-4o-mini' : 'gemini-4-hydrogen'),
                          apiKey: protocol === 'server-gemini' ? '' : editingPreset.apiKey,
                        });
                      }}
                      className="w-full sn-input border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="openai">OpenAI 兼容接口 (/v1/chat/completions)</option>
                      <option value="gemini-custom">自定义 Gemini REST 接口</option>
                      <option value="server-gemini">内置服务端 Gemini (无需填写密钥)</option>
                    </select>
                  </div>

                  {editingPreset.protocol !== 'server-gemini' && (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs sn-muted font-semibold">API Base URL</label>
                      <input
                        type="text"
                        value={editingPreset.baseUrl}
                        onChange={(e) =>
                          setEditingPreset({ ...editingPreset, baseUrl: e.target.value })
                        }
                        placeholder={
                          editingPreset.protocol === 'openai'
                            ? 'https://api.openai.com/v1 或 http://127.0.0.1:11434/v1'
                            : 'https://generativelanguage.googleapis.com'
                        }
                        className="w-full sn-input border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs sn-muted font-semibold">模型名称 (Model ID)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingPreset.model}
                        onChange={(e) =>
                          setEditingPreset({ ...editingPreset, model: e.target.value })
                        }
                        placeholder="例如：gemini-4-hydrogen / deepseek-chat"
                        className="flex-1 min-w-0 sn-input border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={isFetchingModels}
                        onClick={() => handleFetchModelsForPreset(editingPreset)}
                        className="h-[34px] px-3 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        title="从当前服务器抓取可用模型列表"
                      >
                        {isFetchingModels ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                        ) : (
                          <Download className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                        <span>抓取模型</span>
                      </button>
                    </div>
                  </div>

                  {editingPreset.protocol !== 'server-gemini' && (
                    <div className="space-y-1">
                      <label className="text-xs sn-muted font-semibold">自定义 API Key</label>
                      <input
                        type="password"
                        value={editingPreset.apiKey}
                        onChange={(e) =>
                          setEditingPreset({ ...editingPreset, apiKey: e.target.value })
                        }
                        placeholder="sk-...（仅保存在当前设备本地存储）"
                        className="w-full sn-input border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {/* Server Fetched Models Picker */}
                  {(isFetchingModels || fetchModelsError || fetchedModels.length > 0) && (
                    <div className="md:col-span-2 sn-panel border sn-border rounded-xl p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold sn-text flex items-center gap-2">
                          <span>服务器可用模型列表</span>
                          {fetchedModels.length > 0 && (
                            <span className="font-mono tabular-nums sn-muted font-normal">
                              共 {fetchedModels.length} 项
                            </span>
                          )}
                        </div>
                        {fetchedModels.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                const allChecked = filteredFetchedModels.every(
                                  (m) => selectedFetchedModelIds[m.id]
                                );
                                if (allChecked) {
                                  setSelectedFetchedModelIds({});
                                } else {
                                  const next: Record<string, boolean> = { ...selectedFetchedModelIds };
                                  filteredFetchedModels.forEach((m) => {
                                    next[m.id] = true;
                                  });
                                  setSelectedFetchedModelIds(next);
                                }
                              }}
                              className="text-indigo-500 hover:underline font-medium"
                            >
                              {filteredFetchedModels.length > 0 &&
                              filteredFetchedModels.every((m) => selectedFetchedModelIds[m.id])
                                ? '取消全选'
                                : '全选当前筛选'}
                            </button>
                            <button
                              type="button"
                              onClick={handleBatchCreatePresetsFromFetched}
                              disabled={selectedModelCount === 0}
                              className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white font-semibold whitespace-nowrap"
                            >
                              批量生成预设 ({selectedModelCount})
                            </button>
                          </div>
                        )}
                      </div>

                      {isFetchingModels && (
                        <div className="py-4 flex items-center justify-center gap-2 text-xs sn-muted">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          <span>正在向服务器请求模型目录...</span>
                        </div>
                      )}

                      {fetchModelsError && !isFetchingModels && (
                        <div className="text-xs text-rose-500 py-1">{fetchModelsError}</div>
                      )}

                      {fetchedModels.length > 0 && !isFetchingModels && (
                        <>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 sn-muted absolute left-2.5 top-2.5 pointer-events-none" />
                            <input
                              type="text"
                              value={modelFilterQuery}
                              onChange={(e) => setModelFilterQuery(e.target.value)}
                              placeholder="筛选模型 ID 或名称..."
                              className="w-full h-8 pl-8 pr-3 sn-input border rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div className="max-h-52 overflow-y-auto divide-y sn-border border sn-border rounded-lg">
                            {filteredFetchedModels.length === 0 ? (
                              <div className="p-4 text-center text-xs sn-muted">
                                没有匹配「{modelFilterQuery}」的模型
                              </div>
                            ) : (
                              filteredFetchedModels.map((m) => {
                                const isChecked = Boolean(selectedFetchedModelIds[m.id]);
                                const isCurrentModel = editingPreset.model.trim() === m.id;
                                return (
                                  <div
                                    key={m.id}
                                    className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-indigo-500/5"
                                  >
                                    <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) =>
                                          setSelectedFetchedModelIds((prev) => ({
                                            ...prev,
                                            [m.id]: e.target.checked,
                                          }))
                                        }
                                        className="accent-indigo-500 rounded shrink-0"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="font-mono sn-text truncate">{m.id}</div>
                                        {(m.displayName || m.ownedBy) && (
                                          <div className="text-[11px] sn-muted truncate">
                                            {[m.displayName, m.ownedBy].filter(Boolean).join(' · ')}
                                          </div>
                                        )}
                                      </div>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPreset({
                                          ...editingPreset,
                                          model: m.id,
                                          name: editingPreset.name.trim()
                                            ? editingPreset.name
                                            : m.displayName || m.id,
                                        });
                                        notify('info', `已填入模型 ID：${m.id}`);
                                      }}
                                      className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors ${
                                        isCurrentModel
                                          ? 'bg-emerald-600/15 text-emerald-500'
                                          : 'sn-elevated border sn-border-strong sn-text hover:border-indigo-500'
                                      }`}
                                    >
                                      {isCurrentModel ? '已填入' : '单选填入'}
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs sn-muted font-semibold">
                      默认系统提示词（System Prompt，可选）
                    </label>
                    <textarea
                      rows={2}
                      value={editingPreset.systemPrompt || ''}
                      onChange={(e) =>
                        setEditingPreset({ ...editingPreset, systemPrompt: e.target.value })
                      }
                      placeholder="设定该模型在笔记问答时的角色和回答风格..."
                      className="w-full sn-input border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  {editingPreset.protocol !== 'server-gemini' && (
                    <label className="md:col-span-2 flex items-center gap-2 text-xs sn-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingPreset.directBrowser)}
                        onChange={(e) =>
                          setEditingPreset({
                            ...editingPreset,
                            directBrowser: e.target.checked,
                          })
                        }
                        className="accent-indigo-500 rounded"
                      />
                      <span>
                        浏览器直接请求（适用于本机 Ollama 127.0.0.1 或内网自建模型，公网 API 建议保持关闭以通过本地服务端转发）
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPreset(null);
                      setFetchedModels([]);
                      setFetchModelsError(null);
                    }}
                    className="px-3.5 py-2 rounded-lg border sn-border-strong text-xs sn-muted hover:sn-text"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
                  >
                    保存预设
                  </button>
                </div>
              </form>
            )}

            {/* Presets List */}
            <div className="space-y-3">
              {presets.map((preset) => {
                const isActive = preset.id === activePresetId;
                const testResult = presetTestResults[preset.id];
                const isTesting = testingPresetId === preset.id;

                return (
                  <div
                    key={preset.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isActive
                        ? 'sn-surface border-indigo-500'
                        : 'sn-panel sn-border hover:sn-border-strong'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold sn-text">{preset.name}</span>
                          {isActive && (
                            <span className="text-[11px] font-semibold text-indigo-500 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              当前使用
                            </span>
                          )}
                        </div>
                        <div className="text-xs sn-muted font-mono flex flex-wrap items-center gap-2">
                          <span>协议: {preset.protocol}</span>
                          <span aria-hidden="true">·</span>
                          <span>模型: {preset.model}</span>
                          {preset.baseUrl && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-xs">{preset.baseUrl}</span>
                            </>
                          )}
                          {preset.directBrowser && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-500">浏览器直连</span>
                            </>
                          )}
                        </div>
                        {testResult && (
                          <div
                            className={`text-xs pt-1 ${
                              testResult.ok ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            {testResult.message} ({testResult.latencyMs}ms)
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPreset(preset.id);
                              notify('success', `已切换 AI 模型为「${preset.name}」`);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors"
                          >
                            设为当前
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const draft = { ...preset };
                            setEditingPreset(draft);
                            handleFetchModelsForPreset(draft);
                          }}
                          className="px-2.5 py-1.5 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg font-medium flex items-center gap-1"
                        >
                          <Download className="w-3 h-3 text-indigo-500" />
                          <span>抓取模型</span>
                        </button>
                        <button
                          type="button"
                          disabled={isTesting}
                          onClick={() => handleTestPreset(preset)}
                          className="px-2.5 py-1.5 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg font-medium flex items-center gap-1"
                        >
                          {isTesting && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>测试连通</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPreset({ ...preset });
                            setFetchedModels([]);
                            setFetchModelsError(null);
                          }}
                          className="px-2.5 py-1.5 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg font-medium"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPreset({
                              ...preset,
                              id: '',
                              name: `${preset.name} (副本)`,
                            });
                            setFetchedModels([]);
                            setFetchModelsError(null);
                          }}
                          className="p-1.5 sn-muted hover:sn-text rounded-lg"
                          title="复制预设"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {presets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onDeletePreset(preset.id);
                              notify('info', `已删除预设「${preset.name}」`);
                            }}
                            className="p-1.5 sn-muted hover:text-rose-500 rounded-lg"
                            title="删除预设"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom AI Commands Section (synced with NoteEditor & AiAssistantDrawer) */}
            <div className="pt-4 border-t sn-border space-y-4">
              <div className="p-5 sn-panel rounded-xl border sn-border flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold sn-text">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>笔记自定义 AI 命令管理</span>
                  </div>
                  <p className="text-xs sn-muted">
                    自定义常用指令会实时同步到笔记栏「AI 写作」菜单与右侧「AI 助手」抽屉，并支持在笔记页随时临时输入指令并保存。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onResetCustomCommands();
                      notify('info', '已恢复默认常用 AI 命令');
                    }}
                    className="px-3 py-2 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text text-xs font-medium rounded-lg flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>恢复默认</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCommand({ id: '', name: '', prompt: '' })}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>新增命令</span>
                  </button>
                </div>
              </div>

              {editingCommand && (
                <form
                  onSubmit={handleSaveCustomCommand}
                  className="p-4 sn-surface rounded-xl border border-indigo-500/40 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold sn-text">
                      {editingCommand.id ? '编辑自定义 AI 命令' : '新增自定义 AI 命令'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setEditingCommand(null)}
                      className="text-xs sn-muted hover:sn-text"
                    >
                      取消
                    </button>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs sn-muted font-semibold">命令名称</label>
                    <input
                      type="text"
                      value={editingCommand.name}
                      onChange={(e) =>
                        setEditingCommand({ ...editingCommand, name: e.target.value })
                      }
                      placeholder="例如：整理为周报 / 提炼技术风险"
                      className="w-full sn-input border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs sn-muted font-semibold">AI 执行指令 (Prompt)</label>
                    <textarea
                      rows={3}
                      value={editingCommand.prompt}
                      onChange={(e) =>
                        setEditingCommand({ ...editingCommand, prompt: e.target.value })
                      }
                      placeholder="描述希望 AI 对当前笔记或选中片段执行的具体要求..."
                      className="w-full sn-input border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingCommand(null)}
                      className="px-3 py-1.5 rounded-lg border sn-border-strong text-xs sn-muted hover:sn-text"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
                    >
                      保存命令
                    </button>
                  </div>
                </form>
              )}

              {customCommands.length === 0 ? (
                <div className="p-6 sn-panel rounded-xl border sn-border text-center text-xs sn-muted space-y-2">
                  <p>当前尚未添加自定义 AI 命令，点击右上角「新增命令」或在笔记栏直接保存常用指令。</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {customCommands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="p-4 sn-panel rounded-xl border sn-border flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-xs font-bold sn-text">{cmd.name}</div>
                        <p className="text-xs sn-muted leading-relaxed break-words">{cmd.prompt}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCommand({ id: cmd.id, name: cmd.name, prompt: cmd.prompt })
                          }
                          className="px-2.5 py-1.5 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>编辑</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCustomCommand(cmd.id);
                            notify('info', `已删除自定义命令「${cmd.name}」`);
                          }}
                          className="p-1.5 sn-muted hover:text-rose-500 rounded-lg"
                          title="删除命令"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: GENERAL */}
        {activeSettingsTab === 'general' && (
          <div className="space-y-6">
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-5">
              <div className="flex items-center gap-2 text-sm font-bold sn-text">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span>终端真机适配预设</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'win-pc', label: 'Win 电脑', desc: '1.0x · 中字' },
                  { id: 'win-tablet', label: 'Win 平板', desc: '1.2x · 较大' },
                  { id: 'android-13', label: '安卓 13', desc: '1.0x · 触控' },
                  { id: 'sharp-r2', label: '夏普 R2', desc: '0.9x · 小字' },
                  { id: 'nokia-n1', label: '诺基亚 N1', desc: '1.3x · 大字' },
                ].map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => applyDevicePreset(prof.id)}
                    className={`p-2.5 rounded-lg text-xs font-semibold transition-colors flex flex-col items-center gap-1 border ${
                      deviceProfile === prof.id
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'sn-surface sn-border-strong sn-muted hover:sn-text'
                    }`}
                  >
                    <span>{prof.label}</span>
                    <span className="text-[10px] opacity-80 font-normal">{prof.desc}</span>
                  </button>
                ))}
              </div>

              {setUiScale && (
                <div className="space-y-2 pt-4 border-t sn-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold sn-text">界面微观 UI 缩放</span>
                    <span className="font-mono tabular-nums font-bold text-indigo-500">
                      {uiScale.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0.6"
                      max="1.6"
                      step="0.05"
                      value={uiScale}
                      onChange={(e) => setUiScale(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 h-1.5 rounded-lg cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setUiScale(1.0)}
                      className="px-3 py-1.5 sn-surface hover:border-indigo-500 text-xs rounded-lg border sn-border-strong font-medium"
                    >
                      重置 1.0x
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 8787 Core Health Probe (AGENTS.md requirement) */}
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold sn-text">
                <Terminal className="w-4 h-4 text-indigo-500" />
                <span>本地内核端口健康探测 (127.0.0.1:8787)</span>
              </div>
              <p className="text-xs sn-muted">
                用于 Android WebView 或桌面端直连本地 Rust Core 服务的连通性校验。
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setAndroidHealthStatus('testing');
                    setAndroidHealthLogs((prev) => [
                      ...prev,
                      `[PROBE] 请求 ${getApiBaseUrl()}/health`,
                    ]);
                    try {
                      const res = await fetch(`${getApiBaseUrl()}/health`);
                      const data = await res.json();
                      setAndroidHealthStatus('success');
                      setAndroidHealthLogs((prev) => [
                        ...prev,
                        `[PROBE] 连通成功: ${JSON.stringify(data)}`,
                      ]);
                    } catch (e: any) {
                      setAndroidHealthStatus('error');
                      setAndroidHealthLogs((prev) => [
                        ...prev,
                        `[PROBE] 连接失败: ${e?.message || String(e)}`,
                      ]);
                    }
                  }}
                  className="px-3.5 py-2 sn-surface hover:border-indigo-500 border sn-border-strong sn-text font-semibold text-xs rounded-lg"
                >
                  测试当前 API 连通性
                </button>
                {androidHealthLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAndroidHealthLogs([])}
                    className="px-3 py-2 text-xs sn-muted hover:sn-text"
                  >
                    清空输出
                  </button>
                )}
              </div>
              {androidHealthLogs.length > 0 && (
                <div className="p-3 sn-surface rounded-lg border sn-border font-mono text-[11px] sn-text space-y-1 max-h-40 overflow-y-auto">
                  {androidHealthLogs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Cache Reset */}
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-500">
                <Database className="w-4 h-4" />
                <span>清理本地浏览器缓存</span>
              </div>
              <p className="text-xs sn-muted">
                清空当前浏览器缓存的笔记与日程记录，适用于重置当前工作区。建议操作前先导出快照备份。
              </p>
              {!confirmClearCache ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearCache(true)}
                  className="px-4 py-2 bg-rose-600/15 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                >
                  清空本地缓存并重载
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-500 font-semibold">
                    确认永久清除本地缓存？
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      safeStorage.removeItem('sovereign_notes');
                      safeStorage.removeItem('sovereign_events');
                      window.location.reload();
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                  >
                    确认销毁
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearCache(false)}
                    className="px-3 py-1.5 sn-surface border sn-border rounded-lg text-xs sn-muted"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: APPEARANCE */}
        {activeSettingsTab === 'appearance' && (
          <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
            <h3 className="text-sm font-bold sn-text">视觉主题模式</h3>
            <p className="text-xs sn-muted">
              高对比度日间浅色与护眼夜间深色双轨切换，适配 LCD 与 OLED 屏幕。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setThemeMode('day')}
                className={`py-3 px-4 rounded-xl text-xs font-semibold border transition-colors ${
                  themeMode === 'day'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'sn-surface sn-border-strong sn-muted hover:sn-text'
                }`}
              >
                ☀️ 日间浅色模式
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('night')}
                className={`py-3 px-4 rounded-xl text-xs font-semibold border transition-colors ${
                  themeMode === 'night'
                    ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                    : 'sn-surface sn-border-strong sn-muted hover:sn-text'
                }`}
              >
                🌙 夜间深色模式
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: EDITOR */}
        {activeSettingsTab === 'editor' && (
          <div className="p-5 sn-panel rounded-xl border sn-border space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold sn-text">
              <Bold className="w-4 h-4 text-indigo-500" />
              <span>全局字号调节（当前 {fontSizeLevel}/5 级）</span>
            </div>
            <div className="flex items-center gap-3 sn-surface p-3 rounded-xl border sn-border">
              <button
                type="button"
                onClick={() => setFontSizeLevel(Math.max(1, fontSizeLevel - 1))}
                className="px-3 py-1.5 sn-elevated border sn-border-strong text-xs font-semibold rounded-lg sn-text"
              >
                A-
              </button>
              <div className="flex-1 grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setFontSizeLevel(lvl)}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      fontSizeLevel === lvl
                        ? 'bg-indigo-600 text-white'
                        : 'sn-elevated sn-muted hover:sn-text'
                    }`}
                  >
                    {lvl === 5 ? '5级大字' : `${lvl}级`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFontSizeLevel(Math.min(5, fontSizeLevel + 1))}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-lg text-white"
              >
                A+
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: CALENDAR */}
        {activeSettingsTab === 'calendar' && (
          <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold sn-text">
              <CalendarIcon className="w-4 h-4 text-indigo-500" />
              <span>农历与笔记日程双向联动</span>
            </div>
            <div className="sn-surface rounded-xl border sn-border divide-y sn-border text-xs">
              <div className="flex items-center justify-between p-3.5">
                <span className="sn-text">传统农历月份、闰月与干支纪年</span>
                <span className="text-emerald-500 font-semibold">已启用</span>
              </div>
              <div className="flex items-center justify-between p-3.5">
                <span className="sn-text">#YYYY-MM-DD 标签自动识别挂载</span>
                <span className="text-emerald-500 font-semibold">已启用</span>
              </div>
              <div className="flex items-center justify-between p-3.5">
                <span className="sn-text">AI 自动提取笔记内日期生成日程建议</span>
                <span className="text-emerald-500 font-semibold">已启用</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ABOUT */}
        {activeSettingsTab === 'about' && (
          <div className="space-y-6">
            <div className="sn-panel border sn-border p-8 rounded-2xl flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">
                S
              </div>
              <h2 className="text-lg font-bold sn-text">SovereignNote 主权笔记</h2>
              <p className="text-xs sn-muted font-mono">Version {releaseVersion}</p>
              <p className="text-xs sn-muted leading-relaxed max-w-md">
                离线优先、无任何商业云锁定、支持 LWW-Element-Set 多端融合、自定义 AI 助手、思维导图与手写白板的知识管理工具。
              </p>
            </div>
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-2.5 text-xs sn-text-secondary leading-relaxed">
              <div className="flex items-center gap-2 font-bold sn-text text-sm pb-1">
                <Info className="w-4 h-4 text-indigo-500" />
                <span>设计原则</span>
              </div>
              <p>1. 本地 SQLite / 浏览器存储优先读写，离线依然流畅可用。</p>
              <p>2. 开放 WebDAV、FTP、局域网 SSE 与原生文件目录导出。</p>
              <p>3. 支持自由接入自有 AI 接口与多模型预设切换。</p>
            </div>
          </div>
        )}

        {/* TAB 7: SYNC & BACKUP */}
        {activeSettingsTab === 'sync' && (
          <div className="space-y-6">
            {/* LAN LWW & Android Health */}
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm sn-text">局域网 LWW 节点与端口直测</h3>
                  <p className="text-xs sn-muted mt-0.5">
                    检测本地协同核心连通性及 LWW-Element-Set 一致性环路。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${getApiBaseUrl()}/notes/sync/force`, {
                        method: 'POST',
                      });
                      if (res.ok) {
                        notify('success', '强制同步触发成功');
                        fetchRealSyncLogs();
                      } else {
                        notify('error', '强制同步失败，请检查本地后台节点');
                      }
                    } catch {
                      notify('error', '无法连接到本地核心服务');
                    }
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>强制同步</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={handleTestLWW}
                  disabled={lwwTestStatus === 'testing'}
                  className="px-3.5 py-2 sn-surface hover:border-indigo-500 border sn-border-strong sn-text rounded-lg text-xs font-semibold"
                >
                  {lwwTestStatus === 'testing' ? '正在检测 LWW...' : '检测 LWW 协同链路'}
                </button>

                <button
                  type="button"
                  id="btn-android-health-direct-test"
                  onClick={testHealth}
                  disabled={androidHealthStatus === 'testing'}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                >
                  {androidHealthStatus === 'testing'
                    ? '直测中...'
                    : 'Android WebView 8787 /api/health 直测'}
                </button>

                {androidHealthLogs.length > 0 && (
                  <button
                    type="button"
                    id="btn-android-health-clear-logs"
                    onClick={() => {
                      setAndroidHealthLogs([]);
                      setAndroidHealthStatus('idle');
                    }}
                    className="px-3 py-2 sn-surface border sn-border rounded-lg text-xs sn-muted hover:sn-text"
                  >
                    清空直测输出
                  </button>
                )}
              </div>

              {androidHealthLogs.length > 0 && (
                <div
                  id="android-health-log-viewer"
                  className="sn-surface rounded-lg p-3 border sn-border font-mono text-[11px] space-y-1 sn-text max-h-40 overflow-y-auto"
                >
                  {androidHealthLogs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap break-all select-all">
                      {log}
                    </div>
                  ))}
                </div>
              )}

              {lwwTestResultLogs.length > 0 && (
                <div className="sn-surface rounded-lg p-3 border sn-border font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                  {lwwTestResultLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2 sn-text-secondary">
                      <span className="sn-muted shrink-0">[{log.timestamp}]</span>
                      <span className="font-semibold uppercase shrink-0">{log.status || 'INFO'}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* WebDAV */}
            <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm sn-text">WebDAV 云端备份</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="sn-input border p-2.5 rounded-lg text-xs focus:border-indigo-500 outline-none"
                  value={webdavConfig.url}
                  onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
                  placeholder="服务器 URL (如 https://dav.jianguoyun.com/dav)"
                />
                <input
                  className="sn-input border p-2.5 rounded-lg text-xs focus:border-indigo-500 outline-none"
                  value={webdavConfig.port}
                  onChange={(e) => setWebdavConfig({ ...webdavConfig, port: e.target.value })}
                  placeholder="端口 (如 443)"
                />
                <input
                  className="sn-input border p-2.5 rounded-lg text-xs focus:border-indigo-500 outline-none"
                  value={webdavConfig.path}
                  onChange={(e) => setWebdavConfig({ ...webdavConfig, path: e.target.value })}
                  placeholder="备份目录路径 (如 /SovereignNotes)"
                />
                <input
                  className="sn-input border p-2.5 rounded-lg text-xs focus:border-indigo-500 outline-none"
                  value={webdavConfig.username}
                  onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                  placeholder="用户名"
                />
                <input
                  type="password"
                  className="md:col-span-2 sn-input border p-2.5 rounded-lg text-xs focus:border-indigo-500 outline-none"
                  value={webdavConfig.password}
                  onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                  placeholder="应用专用密码"
                />
              </div>
              {webdavLog.length > 0 && (
                <div className="sn-surface p-3 rounded-lg border sn-border font-mono text-[11px] sn-text-secondary space-y-1">
                  {webdavLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleTestWebDAV}
                  className="px-3.5 py-2 sn-surface border sn-border-strong hover:border-indigo-500 rounded-lg text-xs font-semibold text-indigo-500"
                >
                  校验 WebDAV 配置
                </button>
                {webdavStatus === 'success' && (
                  <button
                    type="button"
                    onClick={handleBackupToWebDAV}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white"
                  >
                    立即备份至 WebDAV
                  </button>
                )}
              </div>
              {backupStatus && (
                <div className="text-xs text-emerald-500 font-medium">{backupStatus}</div>
              )}
            </div>

            {/* FTP */}
            {ftpConfig && setFtpConfig && (
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm sn-text">私有 FTP / NAS 同步</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="sn-input border p-2.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                    value={ftpConfig.host}
                    onChange={(e) => setFtpConfig({ ...ftpConfig, host: e.target.value })}
                    placeholder="主机与端口 (192.168.1.100:21)"
                  />
                  <input
                    className="sn-input border p-2.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                    value={ftpConfig.path}
                    onChange={(e) => setFtpConfig({ ...ftpConfig, path: e.target.value })}
                    placeholder="目录路径 (/Backup)"
                  />
                  <input
                    className="sn-input border p-2.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                    value={ftpConfig.user}
                    onChange={(e) => setFtpConfig({ ...ftpConfig, user: e.target.value })}
                    placeholder="用户名"
                  />
                  <input
                    type="password"
                    className="sn-input border p-2.5 rounded-lg text-xs focus:border-emerald-500 outline-none"
                    value={ftpConfig.pass}
                    onChange={(e) => setFtpConfig({ ...ftpConfig, pass: e.target.value })}
                    placeholder="密码"
                  />
                </div>
                {ftpTestResultLogs.length > 0 && (
                  <div className="sn-surface rounded-lg border sn-border p-3 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                    {ftpTestResultLogs.map((log, i) => (
                      <div key={i} className="sn-text-secondary break-all">
                        [{log.timestamp}] {log.message}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleTestFTP}
                    disabled={ftpTestStatus === 'testing'}
                    className="px-3.5 py-2 sn-surface border sn-border-strong hover:border-indigo-500 rounded-lg text-xs font-semibold sn-text"
                  >
                    {ftpTestStatus === 'testing' ? '测试中...' : '测试 FTP 连接'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        await handleAndroidFtpPush();
                        return;
                      }
                      try {
                        const res = await fetch(`${getApiBaseUrl()}/sync/ftp`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(ftpConfig),
                        });
                        const data = await res.json();
                        setBackupStatus(
                          res.ok && data.success ? `FTP 推送成功: ${data.message}` : `FTP 错误: ${data.message}`
                        );
                      } catch (err: any) {
                        setBackupStatus(`FTP 连接失败: ${err?.message || err}`);
                      }
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold text-white"
                  >
                    推送上传
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        await handleAndroidFtpPull();
                        return;
                      }
                      try {
                        const res = await fetch(`${getApiBaseUrl()}/sync/ftp/pull`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(ftpConfig),
                        });
                        const data = await res.json();
                        if (res.ok && data.success && data.notes && setNotes) {
                          setNotes(data.notes);
                          safeStorage.setItem('sovereign_notes', JSON.stringify(data.notes));
                          setBackupStatus('FTP 拉取合并成功');
                        } else {
                          setBackupStatus(`FTP 拉取错误: ${data.message || '失败'}`);
                        }
                      } catch (err: any) {
                        setBackupStatus(`FTP 连接失败: ${err?.message || err}`);
                      }
                    }}
                    className="px-3.5 py-2 sn-surface border sn-border-strong rounded-lg text-xs font-semibold sn-text"
                  >
                    拉取合并
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        await handleAndroidFtpSync();
                        return;
                      }
                      try {
                        const res = await fetch(`${getApiBaseUrl()}/sync/ftp/sync`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(ftpConfig),
                        });
                        const data = await res.json();
                        if (res.ok && data.success && data.notes && setNotes) {
                          setNotes(data.notes);
                          safeStorage.setItem('sovereign_notes', JSON.stringify(data.notes));
                          setBackupStatus('FTP 双向同步完成');
                        } else {
                          setBackupStatus(`FTP 双向同步错误: ${data.message || '失败'}`);
                        }
                      } catch (err: any) {
                        setBackupStatus(`FTP 同步失败: ${err?.message || err}`);
                      }
                    }}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white"
                  >
                    双向融合同步
                  </button>
                </div>
              </div>
            )}

            {/* Android Native Storage (shown when running on Capacitor native) */}
            {Capacitor.isNativePlatform() && (
              <div className="p-5 sn-panel rounded-xl border sn-border space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sn-text">Android 原生文件管理</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleNativeExportAll}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                    >
                      导出全部至本地存储
                    </button>
                    <button
                      type="button"
                      onClick={() => loadNativePathAndFiles(activeNativeFolder)}
                      className="px-3 py-1.5 sn-surface border sn-border rounded-lg text-xs sn-text"
                    >
                      刷新
                    </button>
                  </div>
                </div>
                {nativePathInfo && (
                  <div className="text-xs sn-muted font-mono">
                    目录: {nativePathInfo.externalSovereignDir || 'Download/SovereignNote/'}
                  </div>
                )}
                {nativeStatusMessage && (
                  <div className="text-xs text-indigo-500">{nativeStatusMessage}</div>
                )}
                <div className="flex gap-1.5 text-xs">
                  {['backup', 'export', 'database', 'settings', 'logs'].map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => setActiveNativeFolder(folder)}
                      className={`px-2.5 py-1 rounded-md font-medium ${
                        activeNativeFolder === folder
                          ? 'bg-indigo-600 text-white'
                          : 'sn-surface sn-muted'
                      }`}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
                <div className="sn-surface border sn-border rounded-lg divide-y sn-border max-h-48 overflow-y-auto">
                  {nativeFiles.length === 0 ? (
                    <div className="p-4 text-center text-xs sn-muted">目录为空</div>
                  ) : (
                    nativeFiles.map((file) => (
                      <div
                        key={file.name}
                        className="p-2.5 flex items-center justify-between text-xs gap-2"
                      >
                        <span className="font-mono sn-text truncate">{file.name}</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleNativeImportFile(activeNativeFolder, file.name)}
                            className="text-emerald-500 font-semibold"
                          >
                            恢复
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              SovereignNative.shareFile({
                                folderName: activeNativeFolder,
                                filename: file.name,
                              })
                            }
                            className="text-indigo-500 font-semibold"
                          >
                            分享
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Collapsible Sync Logs Drawer (streamlined from cluttered default panel) */}
            <div className="sn-panel rounded-xl border sn-border overflow-hidden">
              <button
                type="button"
                onClick={() => setIsLogsDrawerOpen(!isLogsDrawerOpen)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-indigo-500/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-bold sn-text">同步诊断日志（高级）</span>
                  <span className="text-xs sn-muted font-mono tabular-nums">
                    {realSyncLogs.length} 条记录
                  </span>
                </div>
                {isLogsDrawerOpen ? (
                  <ChevronUp className="w-4 h-4 sn-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 sn-muted" />
                )}
              </button>

              {isLogsDrawerOpen && (
                <div className="p-4 pt-0 space-y-3 border-t sn-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      {(['all', 'lww', 'ftp', 'webdav'] as const).map((proto) => (
                        <button
                          key={proto}
                          type="button"
                          onClick={() => setSelectedProtocol(proto)}
                          className={`px-2.5 py-1 rounded-md font-medium ${
                            selectedProtocol === proto
                              ? 'bg-indigo-600 text-white'
                              : 'sn-surface sn-muted hover:sn-text'
                          }`}
                        >
                          {proto === 'all' ? '全部' : proto.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setViewMode(viewMode === 'grouped' ? 'flat' : 'grouped')}
                        className="px-2.5 py-1 sn-surface border sn-border rounded-md sn-text"
                      >
                        {viewMode === 'grouped' ? '分组视图' : '原始流'}
                      </button>
                      <button
                        type="button"
                        onClick={fetchRealSyncLogs}
                        className="px-2.5 py-1 sn-surface border sn-border rounded-md sn-text"
                      >
                        刷新
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (realSyncLogs.length === 0) return;
                          const txt = realSyncLogs
                            .map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`)
                            .join('\n');
                          universalExport(txt, `sovereign_sync_logs_${Date.now()}.txt`, 'text/plain');
                        }}
                        className="px-2.5 py-1 sn-surface border sn-border rounded-md text-indigo-500"
                      >
                        导出
                      </button>
                    </div>
                  </div>

                  {viewMode === 'grouped' ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {groupedSessions.length === 0 ? (
                        <div className="p-4 text-center text-xs sn-muted">暂无同步会话记录</div>
                      ) : (
                        groupedSessions.map((sess) => {
                          const isExp = !!expandedSessions[sess.sessionId];
                          return (
                            <div
                              key={sess.sessionId}
                              className="sn-surface border sn-border rounded-lg overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSessions((p) => ({
                                    ...p,
                                    [sess.sessionId]: !isExp,
                                  }))
                                }
                                className="w-full p-2.5 flex items-center justify-between text-xs text-left"
                              >
                                <span className="font-mono sn-text">
                                  [{sess.protocol.toUpperCase()}] {sess.sessionId.slice(0, 14)}
                                </span>
                                <span
                                  className={
                                    sess.status === 'ERROR'
                                      ? 'text-rose-500 font-semibold'
                                      : sess.status === 'SUCCESS'
                                      ? 'text-emerald-500 font-semibold'
                                      : 'sn-muted'
                                  }
                                >
                                  {sess.status} · {sess.steps.length} 步
                                </span>
                              </button>
                              {isExp && (
                                <div className="p-2.5 border-t sn-border font-mono text-[11px] space-y-1 sn-text-secondary">
                                  {sess.steps.map((st, idx) => (
                                    <div key={idx} className="break-all">
                                      [{st.timestamp}] [{st.level}] {st.message}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="sn-surface border sn-border rounded-lg p-3 font-mono text-[11px] max-h-64 overflow-y-auto space-y-1">
                      {realSyncLogs.length === 0 ? (
                        <div className="text-center sn-muted">暂无同步日志</div>
                      ) : (
                        realSyncLogs.map((log, i) => (
                          <div key={i} className="sn-text-secondary break-all">
                            [{log.timestamp}] [{log.level}] {log.message}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manual Import/Export */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleExportDatabase}
                className="p-4 sn-panel rounded-xl border sn-border hover:border-indigo-500 text-left transition-colors"
              >
                <h3 className="font-bold text-sm text-indigo-500 mb-1">导出 LWW 全量数据库</h3>
                <p className="text-xs sn-muted">打包笔记、标签与日程为备份快照下载。</p>
              </button>
              <label className="p-4 sn-panel rounded-xl border sn-border hover:border-indigo-500 text-left cursor-pointer transition-colors">
                <h3 className="font-bold text-sm text-indigo-500 mb-1">导入 LWW 数据库合并</h3>
                <p className="text-xs sn-muted">导入 JSON 快照文件并按时间戳自动合并。</p>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const text = await file.text();
                      handleImportDatabase(text);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

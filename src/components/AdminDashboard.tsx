import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Activity,
  PhoneCall,
  Flame,
  QrCode,
  Settings,
  Home,
  LogOut,
  RefreshCw,
  Search,
  MessageCircle,
  Copy,
  Check,
  Send,
  Download,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Radio,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Clock,
  Sparkles,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
  Plus,
  Wand2,
  Play,
  Film,
  HelpCircle,
  X,
  Layers,
  ArrowUp
} from 'lucide-react';
import {
  AdminStats,
  VisitorRecord,
  ChatMessage,
  AdminConfigData,
  VideoItem,
  FieldVisibilityConfig,
  getAdminStats,
  getAdminVisitors,
  updateVisitorStatus,
  getAdminChat,
  sendAdminReply,
  getAdminHouseInfo,
  updateAdminHouseInfo,
  getAdminConfig,
  updateAdminConfig,
  testLlmConnection,
  getAdminQrCode,
  adminChangePassword,
  clearAdminToken,
  uploadMediaFile,
  optimizeHouseDescriptionApi
} from '../services/api.ts';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'visitors' | 'qrcode' | 'llm' | 'house'>('visitors');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [filterIntent, setFilterIntent] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('score');

  // Selected visitor drawer
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null);
  const [visitorChats, setVisitorChats] = useState<ChatMessage[]>([]);
  const [chatReplyInput, setChatReplyInput] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Online / Offline toggle
  const [isOnline, setIsOnline] = useState(false);
  const [updatingOnline, setUpdatingOnline] = useState(false);

  // QR Code state
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [loadingQr, setLoadingQr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // LLM Config state
  const [llmConfig, setLlmConfig] = useState<AdminConfigData | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('https://apihub.agnes-ai.com/v1');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelName, setModelName] = useState('Agnes-2.5-flash');
  const [imageModel, setImageModel] = useState('Agnes-Image-2.1-flash');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingLlm, setTestingLlm] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);

  // House info state
  const [houseForm, setHouseForm] = useState<any>(null);
  const [savingHouse, setSavingHouse] = useState(false);
  const [houseSavedSuccess, setHouseSavedSuccess] = useState(false);

  // Media upload & AI Optimization states
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');

  // AI Description Optimization modal & state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [aiOptimizedResult, setAiOptimizedResult] = useState<string | null>(null);
  const [aiOptimizeError, setAiOptimizeError] = useState<string | null>(null);

  const defaultVisibilityConfig: FieldVisibilityConfig = {
    title: true,
    images: true,
    videos: true,
    layout: true,
    area_sqm: true,
    orientation: true,
    floor: true,
    location: true,
    metro_info: true,
    amenities: true,
    description: true,
    guarantee: true,
    landlord_phone: true,
    landlord_wechat: true
  };

  const handleToggleVisibility = (fieldKey: keyof FieldVisibilityConfig) => {
    if (!houseForm) return;
    const currentVis = houseForm.field_visibility || defaultVisibilityConfig;
    const isCurrentlyVisible = currentVis[fieldKey] !== false;
    const updated = {
      ...currentVis,
      [fieldKey]: !isCurrentlyVisible
    };
    setHouseForm({
      ...houseForm,
      field_visibility: updated
    });
  };

  // Upload multiple photos
  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    setPhotoUploadProgress(`正在准备上传 ${files.length} 张照片...`);

    const newUploadedUrls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setPhotoUploadProgress(`正在上传第 ${i + 1}/${files.length} 张照片 (${files[i].name})...`);
        const res = await uploadMediaFile(files[i], 'image');
        newUploadedUrls.push(res.url);
      }
      const existingImages = houseForm.images || [];
      setHouseForm({
        ...houseForm,
        images: [...existingImages, ...newUploadedUrls]
      });
      setPhotoUploadProgress(`成功上传 ${newUploadedUrls.length} 张照片！`);
      setTimeout(() => setPhotoUploadProgress(''), 3000);
    } catch (err: any) {
      alert('上传照片出错: ' + err.message);
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    const existing = houseForm.images || [];
    setHouseForm({
      ...houseForm,
      images: [...existing, newImageUrl.trim()]
    });
    setNewImageUrl('');
  };

  const handleDeleteImage = (index: number) => {
    const existing = [...(houseForm.images || [])];
    existing.splice(index, 1);
    setHouseForm({ ...houseForm, images: existing });
  };

  const handleSetCoverImage = (index: number) => {
    if (index === 0) return;
    const existing = [...(houseForm.images || [])];
    const [item] = existing.splice(index, 1);
    existing.unshift(item);
    setHouseForm({ ...houseForm, images: existing });
  };

  // Upload video
  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    try {
      const res = await uploadMediaFile(file, 'video');
      const newVideoItem: VideoItem = {
        url: res.url,
        title: file.name.replace(/\.[^.]+$/, '') || '房源实景视频'
      };
      const existing = houseForm.videos || [];
      setHouseForm({
        ...houseForm,
        videos: [...existing, newVideoItem]
      });
    } catch (err: any) {
      alert('上传视频出错: ' + err.message);
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleAddVideoUrl = () => {
    if (!newVideoUrl.trim()) return;
    const newVideoItem: VideoItem = {
      url: newVideoUrl.trim(),
      title: newVideoTitle.trim() || '房源实景漫游'
    };
    const existing = houseForm.videos || [];
    setHouseForm({
      ...houseForm,
      videos: [...existing, newVideoItem]
    });
    setNewVideoUrl('');
    setNewVideoTitle('');
  };

  const handleDeleteVideo = (index: number) => {
    const existing = [...(houseForm.videos || [])];
    existing.splice(index, 1);
    setHouseForm({ ...houseForm, videos: existing });
  };

  const handleResetSampleVideo = () => {
    const sample: VideoItem = {
      url: 'https://assets.mixkit.co/videos/preview/mixkit-living-room-with-modern-interior-design-4820-large.mp4',
      title: '滨江壹号院 · 客厅与主卧实景漫游',
      poster: 'https://res.cloudinary.com/jcgfauar/image/upload/v1790500169/zufang2boss/static/rental_living_room_1790429189718.jpg'
    };
    const existing = houseForm?.videos || [];
    setHouseForm({
      ...houseForm,
      videos: [sample, ...existing]
    });
  };

  // Trigger AI Optimization
  const handleOpenAiOptimizeModal = () => {
    setAiOptimizedResult(null);
    setAiOptimizeError(null);
    setShowAiModal(true);
  };

  const handleGenerateAiDescription = async () => {
    setAiOptimizing(true);
    setAiOptimizeError(null);
    try {
      const res = await optimizeHouseDescriptionApi({
        title: houseForm.title,
        location: houseForm.location,
        area_sqm: houseForm.area_sqm,
        layout: houseForm.layout,
        orientation: houseForm.orientation,
        floor: houseForm.floor,
        metro_info: houseForm.metro_info,
        amenities: houseForm.amenities,
        currentDescription: houseForm.description
      });
      setAiOptimizedResult(res.optimizedText);
    } catch (err: any) {
      setAiOptimizeError(err.message || '生成文案失败');
    } finally {
      setAiOptimizing(false);
    }
  };

  const handleApplyAiDescription = () => {
    if (!aiOptimizedResult) return;
    setHouseForm({
      ...houseForm,
      description: aiOptimizedResult
    });
    setShowAiModal(false);
  };

  // Password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const statsRes = await getAdminStats();
      setStats(statsRes);
      setIsOnline(statsRes.isOnline);
      loadVisitorsList();
      loadConfigData();
    } catch (err: any) {
      if (err.message === 'AUTH_EXPIRED') {
        clearAdminToken();
        onLogout();
      }
    }
  };

  const loadVisitorsList = async () => {
    setLoadingVisitors(true);
    try {
      const res = await getAdminVisitors({
        filterIntent: filterIntent === 'all' ? undefined : filterIntent,
        sortBy,
        order: 'desc'
      });
      setVisitors(res);
    } catch (err: any) {
      console.error('Failed to load visitors:', err);
    } finally {
      setLoadingVisitors(false);
    }
  };

  useEffect(() => {
    loadVisitorsList();
  }, [filterIntent, sortBy]);

  const loadConfigData = async () => {
    try {
      const cfg = await getAdminConfig();
      setLlmConfig(cfg);
      setApiBaseUrl(cfg.apiBaseUrl || 'https://apihub.agnes-ai.com/v1');
      setModelName(cfg.modelName || 'Agnes-2.5-flash');
      setImageModel(cfg.imageModel || 'Agnes-Image-2.1-flash');
      setIsOnline(cfg.isOnline);
    } catch (err) {
      console.error('Failed to load admin config:', err);
    }
  };

  const loadQrCode = async () => {
    setLoadingQr(true);
    try {
      const res = await getAdminQrCode();
      setQrDataUrl(res.qrDataUrl);
      setTargetUrl(res.targetUrl);
    } catch (err) {
      console.error('Failed to load QR code:', err);
    } finally {
      setLoadingQr(false);
    }
  };

  const loadHouseInfo = async () => {
    try {
      const data = await getAdminHouseInfo();
      const vis = { ...defaultVisibilityConfig, ...(data.field_visibility || {}) };
      setHouseForm({
        ...data,
        videos: Array.isArray(data.videos) ? data.videos : [],
        images: Array.isArray(data.images) ? data.images : [],
        field_visibility: vis
      });
    } catch (err) {
      console.error('Failed to load house info:', err);
    }
  };

  const handleToggleOnlineStatus = async () => {
    const nextStatus = !isOnline;
    setUpdatingOnline(true);
    try {
      await updateAdminConfig({
        apiBaseUrl,
        modelName,
        isOnline: nextStatus
      });
      setIsOnline(nextStatus);
      if (stats) setStats({ ...stats, isOnline: nextStatus });
    } catch (err) {
      console.error('Failed to toggle status:', err);
    } finally {
      setUpdatingOnline(false);
    }
  };

  const handleOpenVisitorDrawer = async (v: VisitorRecord) => {
    setSelectedVisitor(v);
    setStatusDraft(v.contact_status || 'pending');
    setNotesDraft(v.notes || '');
    setCopiedPhone(false);
    try {
      const chats = await getAdminChat(v.device_id);
      setVisitorChats(chats);
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  };

  const handleSaveVisitorStatus = async () => {
    if (!selectedVisitor) return;
    setSavingStatus(true);
    try {
      await updateVisitorStatus(selectedVisitor.device_id, {
        contactStatus: statusDraft,
        notes: notesDraft
      });
      setSelectedVisitor({
        ...selectedVisitor,
        contact_status: statusDraft as any,
        notes: notesDraft
      });
      loadVisitorsList();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSendLandlordReply = async () => {
    if (!selectedVisitor || !chatReplyInput.trim() || isSendingReply) return;
    setIsSendingReply(true);
    try {
      const sentMsg = await sendAdminReply(selectedVisitor.device_id, chatReplyInput.trim());
      setVisitorChats((prev) => [...prev, sentMsg]);
      setChatReplyInput('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setTestResult(null);
    try {
      const res = await testLlmConnection({
        apiBaseUrl,
        apiKey: apiKeyInput,
        modelName
      });
      setTestResult({
        success: res.success,
        message: res.message
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || '测试失败'
      });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleSaveLlmConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    try {
      await updateAdminConfig({
        apiBaseUrl,
        apiKey: apiKeyInput,
        modelName,
        imageModel,
        isOnline
      });
      setApiKeyInput('');
      loadConfigData();
      alert('大模型配置保存成功！');
    } catch (err: any) {
      alert('保存失败: ' + err.message);
    } finally {
      setSavingLlm(false);
    }
  };

  const handleSaveHouseInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHouse(true);
    setHouseSavedSuccess(false);
    try {
      await updateAdminHouseInfo(houseForm);
      setHouseSavedSuccess(true);
      setTimeout(() => setHouseSavedSuccess(false), 2500);
    } catch (err: any) {
      alert('保存房源信息失败: ' + err.message);
    } finally {
      setSavingHouse(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');
    try {
      await adminChangePassword({ oldPassword, newPassword });
      setPwdMsg('密码修改成功！');
      setTimeout(() => {
        setShowPasswordModal(false);
        setOldPassword('');
        setNewPassword('');
        setPwdMsg('');
      }, 1500);
    } catch (err: any) {
      setPwdMsg(err.message || '修改失败');
    }
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: '待跟进', color: 'bg-slate-100 text-slate-700' },
    contacted: { label: '已电话联系', color: 'bg-blue-100 text-blue-800' },
    wechat_added: { label: '已加微信', color: 'bg-emerald-100 text-emerald-800' },
    viewing_scheduled: { label: '已约实地看房', color: 'bg-amber-100 text-amber-800' },
    signed: { label: '已签约成交', color: 'bg-purple-100 text-purple-800' },
    no_intent: { label: '暂无意向', color: 'bg-rose-100 text-rose-700' }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-slate-800 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white text-slate-900 flex items-center justify-center font-bold text-xs">
            房
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">房东管理后台</h1>
            <p className="text-[11px] text-slate-400">滨江壹号院 · 意向租客线索与AI管家</p>
          </div>
        </div>

        {/* Center / Right Status Controls */}
        <div className="flex items-center gap-3">
          {/* Online / Offline Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-medium text-slate-300">
              {isOnline ? '房东实时在线' : '房东离线 (AI代答)'}
            </span>
            <button
              onClick={handleToggleOnlineStatus}
              disabled={updatingOnline}
              className={`ml-2 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                isOnline
                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isOnline ? '切换为离线' : '切换为在线'}
            </button>
          </div>

          {/* Password change */}
          <button
            onClick={() => setShowPasswordModal(true)}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs"
            title="修改管理密码"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            onClick={() => {
              clearAdminToken();
              onLogout();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-300 text-xs transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">累计独立访客</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {stats?.totalVisitors || 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">按设备指纹唯一识别</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">今日活跃浏览</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {stats?.todayVisitors || 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">今日浏览设备数</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">主动询租留电</span>
              <PhoneCall className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
              {stats?.inquiriesCount || 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">已提交手机号码</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">极高/较高意向</span>
              <Flame className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-400">
              {stats?.highIntentCount || 0}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">意向评分 ≥ 60 分</p>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl">
            <button
              onClick={() => setActiveTab('visitors')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'visitors'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>访客意向看板</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('qrcode');
                loadQrCode();
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'qrcode'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>房源推广二维码</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('llm');
                loadConfigData();
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'llm'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>大模型与客服配置</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('house');
                loadHouseInfo();
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'house'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>房源信息维护</span>
            </button>
          </div>

          {activeTab === 'visitors' && (
            <button
              onClick={loadVisitorsList}
              disabled={loadingVisitors}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingVisitors ? 'animate-spin' : ''}`} />
              <span>刷新数据</span>
            </button>
          )}
        </div>

        {/* TAB 1: VISITOR INTENT DASHBOARD */}
        {activeTab === 'visitors' && (
          <div className="space-y-4">
            {/* Filter and Sorter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 mr-1">筛选意向:</span>
                {[
                  { id: 'all', label: '全部访客' },
                  { id: 'high', label: '高意向(≥60分)' },
                  { id: 'has_phone', label: '已留手机号' },
                  { id: 'has_chat', label: '发起过咨询' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setFilterIntent(item.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      filterIntent === item.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">排序:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1 outline-none"
                >
                  <option value="score">意向评分 (从高到低)</option>
                  <option value="visits">访问次数 (从多到少)</option>
                  <option value="duration">浏览时长 (从长到短)</option>
                  <option value="last_visit">最近到访时间</option>
                </select>
              </div>
            </div>

            {/* Visitors Data Table */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/80 bg-slate-900/60 text-slate-400">
                      <th className="py-3 px-4 font-semibold">访客设备指纹</th>
                      <th className="py-3 px-4 font-semibold text-center">意向评分 (0-100)</th>
                      <th className="py-3 px-4 font-semibold">访问频次 / 时长</th>
                      <th className="py-3 px-4 font-semibold">询租状态 / 手机号</th>
                      <th className="py-3 px-4 font-semibold text-center">咨询记录</th>
                      <th className="py-3 px-4 font-semibold">跟进状态</th>
                      <th className="py-3 px-4 font-semibold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {visitors.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          {loadingVisitors ? '正在读取访客埋点数据...' : '暂无符合筛选条件的访客记录'}
                        </td>
                      </tr>
                    ) : (
                      visitors.map((v) => {
                        const statusObj = statusMap[v.contact_status] || statusMap.pending;
                        return (
                          <tr
                            key={v.device_id}
                            className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                            onClick={() => handleOpenVisitorDrawer(v)}
                          >
                            {/* Device ID */}
                            <td className="py-3.5 px-4">
                              <div className="font-mono text-xs font-semibold text-slate-200">
                                {v.device_id.slice(0, 16)}...
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                首次: {new Date(v.first_visit_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </td>

                            {/* Intent Score */}
                            <td className="py-3.5 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span
                                  className="text-base font-bold font-mono tabular-nums px-2 py-0.5 rounded-md"
                                  style={{
                                    color: v.intent_color,
                                    backgroundColor: `${v.intent_color}18`
                                  }}
                                >
                                  {v.intent_score}
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  {v.intent_label.split(' ')[0]}
                                </span>
                              </div>
                            </td>

                            {/* Visits & Duration */}
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-300">
                                累计 <span className="text-white font-mono">{v.total_visits}</span> 次
                                {v.recent_visits_7d > 1 && (
                                  <span className="text-amber-400 text-[10px] ml-1">
                                    (7天内{v.recent_visits_7d}次)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                停留: {Math.floor(v.total_duration_sec / 60)}分{v.total_duration_sec % 60}秒
                              </div>
                            </td>

                            {/* Inquired Rent & Phone */}
                            <td className="py-3.5 px-4">
                              {v.phone_number ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-semibold text-xs">
                                    <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>{v.phone_number}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400">已点【询问租金】</span>
                                </div>
                              ) : v.inquired_rent ? (
                                <span className="text-amber-400 text-xs">曾点击询租(未留号)</span>
                              ) : (
                                <span className="text-slate-500 text-xs">未触发询租</span>
                              )}
                            </td>

                            {/* Chat records */}
                            <td className="py-3.5 px-4 text-center">
                              {v.chat_count > 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800 text-xs font-mono">
                                  {v.chat_count} 条互动
                                </span>
                              ) : (
                                <span className="text-slate-500 text-xs">-</span>
                              )}
                            </td>

                            {/* Follow-up Status */}
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusObj.color}`}>
                                {statusObj.label}
                              </span>
                            </td>

                            {/* Action */}
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenVisitorDrawer(v);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                              >
                                意向分析
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QR CODE & PROMOTION POSTER */}
        {activeTab === 'qrcode' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-3xl text-center space-y-5 shadow-2xl">
              <div>
                <h3 className="text-base font-bold text-white">房源展示H5推广二维码</h3>
                <p className="text-xs text-slate-400 mt-1">
                  打印张贴或发送给租客，扫码后将自动激活设备指纹埋点与意向度追踪
                </p>
              </div>

              {/* Printable Poster Card */}
              <div className="bg-white text-slate-900 p-6 rounded-2xl shadow-xl max-w-sm mx-auto text-left space-y-4 border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">滨江壹号院 · 精装两居</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">房东直租 · 无中介费 · 随时起租</p>
                  </div>
                  <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                    真房源
                  </span>
                </div>

                <div className="flex justify-center p-2 bg-slate-50 rounded-xl border border-slate-100">
                  {loadingQr ? (
                    <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                      二维码生成中...
                    </div>
                  ) : qrDataUrl ? (
                    <img src={qrDataUrl} alt="房源二维码" className="w-56 h-56 object-contain rounded-lg" />
                  ) : (
                    <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                      加载失败
                    </div>
                  )}
                </div>

                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-800">微信/浏览器 扫码直接看房</p>
                  <p className="text-[10px] text-slate-400">支持全景照片、交通配套与在线向房东询底价</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download="滨江壹号院看房二维码.png"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>下载高清二维码图片 (PNG)</span>
                  </a>
                )}

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(targetUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? '已复制看房链接' : '复制推广链接'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 break-all font-mono">
                目标链接：{targetUrl || '获取中...'}
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: LLM & CUSTOMER SERVICE CONFIG */}
        {activeTab === 'llm' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-3xl space-y-6 shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white">大模型智能客服配置</h3>
                <p className="text-xs text-slate-400 mt-1">
                  当房东在线状态为【离线】时，访客在H5发送的咨询将自动交由此大模型代答。
                </p>
              </div>

              {/* Online status card */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">房东在线工作状态</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isOnline
                      ? '当前处于【在线】：租客提问将等待房东人工回复'
                      : '当前处于【离线】：租客提问将自动由Agnes大模型实时专业代答'}
                  </p>
                </div>
                <button
                  onClick={handleToggleOnlineStatus}
                  disabled={updatingOnline}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    isOnline ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isOnline ? '转为离线 (开AI)' : '转为在线 (人工)'}
                </button>
              </div>

              <form onSubmit={handleSaveLlmConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    API Base URL (接口基地址)
                  </label>
                  <input
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="例如: https://apihub.agnes-ai.com/v1"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    API Key (密钥凭证)
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={llmConfig?.maskedApiKey ? `已配置 (${llmConfig.maskedApiKey})，留空表示保持不变` : '输入API Key'}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    当前配置：{llmConfig?.maskedApiKey || '未设置'}（已做加密隔离保护，不泄露至前端）
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      文本对话模型 (Text Model)
                    </label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="例如: Agnes-2.5-flash"
                      className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      图片模型 (Image Model)
                    </label>
                    <input
                      type="text"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      placeholder="例如: Agnes-Image-2.1-flash"
                      className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                {/* Test Feedback banner */}
                {testResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/70 border border-rose-800 text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{testResult.success ? '测试通过' : '测试失败'}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed">{testResult.message}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTestLlm}
                    disabled={testingLlm}
                    className="flex-1 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Radio className={`w-3.5 h-3.5 ${testingLlm ? 'animate-pulse text-amber-400' : ''}`} />
                    <span>{testingLlm ? '正在测试连接...' : '测试大模型连接'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingLlm}
                    className="flex-1 h-10 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>{savingLlm ? '正在保存...' : '保存配置参数'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: HOUSE INFO MAINTENANCE */}
        {activeTab === 'house' && houseForm && (
          <div className="max-w-4xl mx-auto space-y-6">
            <form onSubmit={handleSaveHouseInfo} className="bg-slate-800/80 border border-slate-700 p-6 sm:p-7 rounded-3xl space-y-6 shadow-xl">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-700 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">房源信息维护</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium">
                      多媒体与展示配置
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    支持上传多张房屋实勘照片、漫游视频、AI一键生成亮点，并可为每个参数配置前台可见/不可见状态。
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {houseSavedSuccess && (
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-3 py-1 rounded-lg animate-in fade-in">
                      ✓ 保存成功！
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={savingHouse}
                    className="px-5 py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {savingHouse ? '正在保存...' : '保存全部房源配置'}
                  </button>
                </div>
              </div>

              {/* 1. House Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>房源展示标题</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('title')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.title !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                    title="切换前台可见性"
                  >
                    {houseForm.field_visibility?.title !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.title !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={houseForm.title || ''}
                  onChange={(e) => setHouseForm({ ...houseForm, title: e.target.value })}
                  placeholder="输入房源标题"
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-white"
                  required
                />
              </div>

              {/* 2. Photo Gallery Management (Multiple Photos) */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-semibold text-slate-200">房屋照片图集</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      (共 {houseForm.images?.length || 0} 张)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('images')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.images !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                    title="切换照片图集在前端的可见性"
                  >
                    {houseForm.field_visibility?.images !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.images !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>

                {/* Photo Upload Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    ref={photoInputRef}
                    onChange={handleUploadPhotos}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhotos}
                    className="px-3.5 py-1.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingPhotos ? '上传中...' : '上传本地多张照片'}</span>
                  </button>

                  <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="或输入图片URL链接..."
                      className="flex-1 h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {photoUploadProgress && (
                  <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800 text-[11px] text-sky-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{photoUploadProgress}</span>
                  </div>
                )}

                {/* Photos Grid */}
                {houseForm.images && houseForm.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    {houseForm.images.map((imgUrl: string, idx: number) => (
                      <div
                        key={idx}
                        className="group relative aspect-4/3 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-sm"
                      >
                        <img
                          src={imgUrl}
                          alt={`房源图片 ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Badges & Actions */}
                        <div className="absolute top-1.5 left-1.5">
                          {idx === 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-900 text-[10px] font-bold shadow">
                              首图封面
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono">
                              #{idx + 1}
                            </span>
                          )}
                        </div>

                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                          {idx !== 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetCoverImage(idx)}
                              className="p-1.5 rounded-lg bg-white/20 hover:bg-white text-white hover:text-slate-900 text-[10px] font-medium transition-colors"
                              title="设为首图封面"
                            >
                              设为封面
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(idx)}
                            className="p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-[10px] transition-colors"
                            title="删除图片"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-500 text-xs border border-dashed border-slate-700 rounded-xl">
                    暂未添加照片，点击上方按钮上传多张实勘照片或输入图片链接
                  </div>
                )}
              </div>

              {/* 3. House Videos Management */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-slate-200">房源实勘视频</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      (共 {houseForm.videos?.length || 0} 个)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('videos')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.videos !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                    title="切换实勘视频在前端的可见性"
                  >
                    {houseForm.field_visibility?.videos !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.videos !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>

                {/* Video Upload Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="file"
                    accept="video/*"
                    ref={videoInputRef}
                    onChange={handleUploadVideo}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploadingVideo}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingVideo ? '上传视频中...' : '上传本地实勘视频 (MP4/WebM)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSampleVideo}
                    className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>添加精选漫游视频示例</span>
                  </button>
                </div>

                {/* Video URL Adder */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newVideoTitle}
                    onChange={(e) => setNewVideoTitle(e.target.value)}
                    placeholder="视频标题 (例如: 客厅采光漫游)"
                    className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                  />
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="视频网络直链 (URL)..."
                    className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddVideoUrl}
                    className="h-8 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                  >
                    添加视频链接
                  </button>
                </div>

                {/* Videos List Preview */}
                {houseForm.videos && houseForm.videos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {houseForm.videos.map((vid: VideoItem, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative"
                      >
                        <div className="relative aspect-16/9 rounded-lg overflow-hidden bg-black">
                          <video
                            src={vid.url}
                            controls
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={vid.title || ''}
                            onChange={(e) => {
                              const updated = [...houseForm.videos];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setHouseForm({ ...houseForm, videos: updated });
                            }}
                            placeholder="设置视频描述标题"
                            className="flex-1 h-7 px-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteVideo(idx)}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 text-xs"
                            title="删除视频"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-slate-500 text-xs border border-dashed border-slate-700 rounded-xl">
                    暂未添加视频，上传本地视频后用户可在前端直接播放漫游
                  </div>
                )}
              </div>

              {/* 4. Core Info Grid (Layout, Area, Orientation, Floor) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">户型格局</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('layout')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.layout !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.layout !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={houseForm.layout || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, layout: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">建筑面积 (㎡)</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('area_sqm')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.area_sqm !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.area_sqm !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={houseForm.area_sqm || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, area_sqm: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">房屋朝向</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('orientation')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.orientation !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.orientation !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={houseForm.orientation || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, orientation: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">楼层信息</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('floor')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.floor !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.floor !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={houseForm.floor || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, floor: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* 5. Location */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">房屋详细地址</label>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('location')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.location !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400'
                    }`}
                  >
                    {houseForm.field_visibility?.location !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.location !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={houseForm.location || ''}
                  onChange={(e) => setHouseForm({ ...houseForm, location: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  required
                />
              </div>

              {/* 6. Subway & Transport (specifically requested by user) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">地铁与交通描述</label>
                    <span className="text-[10px] text-slate-400">(设置为不可见时前台将完全隐藏交通板块)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('metro_info')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.metro_info !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400'
                    }`}
                    title="点击切换地铁交通描述在前端页面上的可见性"
                  >
                    {houseForm.field_visibility?.metro_info !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.metro_info !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={houseForm.metro_info || ''}
                  onChange={(e) => setHouseForm({ ...houseForm, metro_info: e.target.value })}
                  placeholder="例如: 距地铁6号线星民站A出口步行约260米，直达钱江新城与滨江阿里网易园区"
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
              </div>

              {/* 7. Secret Rent Price */}
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/80 space-y-1">
                <label className="block text-xs font-bold text-amber-300">
                  🔒 房东内部租金底价与政策 (前台展示页一律不直接显示，仅在房东后台与AI询租智能代答中使用)
                </label>
                <input
                  type="text"
                  value={houseForm.secret_rent_price || ''}
                  onChange={(e) => setHouseForm({ ...houseForm, secret_rent_price: e.target.value })}
                  placeholder="例如: 租金报价4800元/月，押一付三，含物业费，长租可面议"
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-amber-800/80 text-xs text-amber-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* 8. House Description Highlights with AI Optimization */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-300">房源详细介绍亮点</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('description')}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                        houseForm.field_visibility?.description !== false
                          ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300'
                          : 'bg-slate-800 border border-slate-600/80 text-slate-400'
                      }`}
                    >
                      {houseForm.field_visibility?.description !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{houseForm.field_visibility?.description !== false ? '前台可见' : '前台隐藏'}</span>
                    </button>
                  </div>

                  {/* AI Optimization Trigger Button */}
                  <button
                    type="button"
                    onClick={handleOpenAiOptimizeModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-900/40 active:scale-95 transition-all"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>AI一键优化亮点文案</span>
                  </button>
                </div>

                <textarea
                  rows={6}
                  value={houseForm.description || ''}
                  onChange={(e) => setHouseForm({ ...houseForm, description: e.target.value })}
                  placeholder="写下房源亮点，或者点击右上方【AI一键优化亮点文案】自动调用大模型创作..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-white font-sans"
                />
              </div>

              {/* 9. Amenities */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    房屋设施与配套 (包含家电、供暖、门锁等)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility('amenities')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                      houseForm.field_visibility?.amenities !== false
                        ? 'bg-emerald-950/70 border border-emerald-700/80 text-emerald-300'
                        : 'bg-slate-800 border border-slate-600/80 text-slate-400'
                    }`}
                  >
                    {houseForm.field_visibility?.amenities !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{houseForm.field_visibility?.amenities !== false ? '前台可见' : '前台隐藏'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-900/60 border border-slate-700">
                  {[
                    '集中供暖',
                    '独立景观南阳台',
                    '西门子洗烘一体机',
                    '博世双开门冰箱',
                    '大金中央空调',
                    '威能恒温地暖',
                    '指纹密码智能门锁',
                    '民用水电燃气',
                    '24小时管家安防',
                    '地库直达车位'
                  ].map((amenity, idx) => {
                    const isSelected = (houseForm.amenities || []).includes(amenity);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const current = houseForm.amenities || [];
                          if (isSelected) {
                            setHouseForm({
                              ...houseForm,
                              amenities: current.filter((item: string) => item !== amenity)
                            });
                          } else {
                            setHouseForm({
                              ...houseForm,
                              amenities: [...current, amenity]
                            });
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-white text-slate-900 font-semibold'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{amenity}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 10. Guarantee Banner & Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">房东直租保障声明</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('guarantee')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.guarantee !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.guarantee !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-[11px] text-slate-400">
                    前台保障声明条卡片
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">房东联系电话</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('landlord_phone')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.landlord_phone !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.landlord_phone !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={houseForm.landlord_phone || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, landlord_phone: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">房东微信</label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility('landlord_wechat')}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        houseForm.field_visibility?.landlord_wechat !== false
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {houseForm.field_visibility?.landlord_wechat !== false ? '可见' : '隐藏'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={houseForm.landlord_wechat || ''}
                    onChange={(e) => setHouseForm({ ...houseForm, landlord_wechat: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                </div>
              </div>

              {/* Bottom Submit Bar */}
              <div className="pt-3 border-t border-slate-700 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  点击按钮即可立即更新数据库与前台展示
                </div>
                <button
                  type="submit"
                  disabled={savingHouse}
                  className="px-6 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {savingHouse && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingHouse ? '正在保存...' : '保存全部房源配置'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* AI DESCRIPTION OPTIMIZATION MODAL */}
        {showAiModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-slate-900 rounded-3xl border border-slate-700 p-6 shadow-2xl text-white animate-in zoom-in-95 duration-150 space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">AI房源亮点文案智能创作</h3>
                    <p className="text-[11px] text-slate-400">
                      直接调用 Agnes 房产专属大模型，结合当前户型、面积、配套与交通生成高转化文案
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Context Summary */}
              <div className="p-3 bg-slate-800/60 rounded-xl text-xs space-y-1.5 border border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  AI将基于以下当前房源属性创作：
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] text-slate-300">
                  <div>户型: <span className="text-white">{houseForm?.layout || '未填'}</span></div>
                  <div>面积: <span className="text-white">{houseForm?.area_sqm || ''}㎡</span></div>
                  <div>朝向: <span className="text-white">{houseForm?.orientation || '南'}</span></div>
                  <div>地铁: <span className="text-white truncate block">{houseForm?.metro_info || '近地铁'}</span></div>
                </div>
              </div>

              {/* Generation Actions & Loading */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleGenerateAiDescription}
                  disabled={aiOptimizing}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-all shadow-md shadow-indigo-900/30"
                >
                  {aiOptimizing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在调用大模型创作中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>{aiOptimizedResult ? '重新生成一份新文案' : '立即开始AI生成/优化'}</span>
                    </>
                  )}
                </button>

                {aiOptimizedResult && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(aiOptimizedResult);
                      alert('文案已复制到剪贴板！');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制文案</span>
                  </button>
                )}
              </div>

              {aiOptimizeError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
                  {aiOptimizeError}
                </div>
              )}

              {/* Output Preview */}
              <div className="flex-1 overflow-y-auto space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">
                  {aiOptimizedResult ? 'AI生成文案预览：' : '文案预览区：'}
                </span>
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed min-h-[140px] whitespace-pre-line font-sans">
                  {aiOptimizing ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                      <p className="text-xs">大模型正在推演更优表达与分段排版...</p>
                    </div>
                  ) : aiOptimizedResult ? (
                    aiOptimizedResult
                  ) : (
                    <div className="text-slate-500 py-6 text-center">
                      点击上方【立即开始AI生成/优化】按钮，让AI根据真实房源配置一键生成高转化文案。
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApplyAiDescription}
                  disabled={!aiOptimizedResult}
                  className="px-5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  采纳并应用到房源描述
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SELECTED VISITOR DETAIL & CHAT DRAWER */}
      {selectedVisitor && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">访客意向档案与跟进</span>
                  <span
                    className="text-xs font-bold font-mono px-2 py-0.5 rounded"
                    style={{
                      color: selectedVisitor.intent_color,
                      backgroundColor: `${selectedVisitor.intent_color}20`
                    }}
                  >
                    {selectedVisitor.intent_score} 分 · {selectedVisitor.intent_label}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-sm">
                  设备指纹: {selectedVisitor.device_id}
                </div>
              </div>

              <button
                onClick={() => setSelectedVisitor(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Phone Action Card */}
              {selectedVisitor.phone_number ? (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-400 block font-medium">租客意向联系电话</span>
                    <span className="text-lg font-bold font-mono text-emerald-300">
                      {selectedVisitor.phone_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedVisitor.phone_number!);
                        setCopiedPhone(true);
                        setTimeout(() => setCopiedPhone(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-medium flex items-center gap-1"
                    >
                      {copiedPhone ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPhone ? '已复制' : '复制手机号'}</span>
                    </button>
                    <a
                      href={`tel:${selectedVisitor.phone_number}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>呼叫租客</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-400">
                  该访客目前尚未主动留存手机号码，建议重点关注其在线咨询内容。
                </div>
              )}

              {/* Intent Score Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  意向度评分加权构成 (0-100)
                </h4>
                <div className="space-y-2 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-800">
                  {selectedVisitor.score_breakdown.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">{item.category}</span>
                        <span className="font-mono text-white font-semibold">
                          +{item.points} / {item.maxPoints}分
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(item.points / item.maxPoints) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status & Notes Modification */}
              <div className="space-y-3 bg-slate-800/60 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-bold text-slate-300">房东跟进处理与备注</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">跟进状态</label>
                    <select
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 outline-none"
                    >
                      <option value="pending">待跟进</option>
                      <option value="contacted">已电话联系</option>
                      <option value="wechat_added">已加微信</option>
                      <option value="viewing_scheduled">已约实地看房</option>
                      <option value="signed">已签约成交</option>
                      <option value="no_intent">暂无意向</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">快捷保存</label>
                    <button
                      onClick={handleSaveVisitorStatus}
                      disabled={savingStatus}
                      className="w-full h-9 rounded-xl bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 disabled:opacity-50"
                    >
                      {savingStatus ? '正在保存...' : '更新状态与备注'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">跟进备注与租客意向备忘</label>
                  <textarea
                    rows={2}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="例如: 预计本周六下午看房，预算4500左右，养一只温顺小猫..."
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              {/* Chat Conversation History & Direct Landlord Reply */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300">在线咨询交流记录</h4>
                  <span className="text-[11px] text-slate-400 font-mono">共 {visitorChats.length} 条</span>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 max-h-72 overflow-y-auto space-y-3">
                  {visitorChats.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      该访客尚未发起在线咨询
                    </div>
                  ) : (
                    visitorChats.map((msg, idx) => {
                      const isUser = msg.sender === 'user';
                      const isAi = msg.sender === 'ai';
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 ${isUser ? 'flex-row' : 'flex-row-reverse'}`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isUser ? 'bg-blue-600 text-white' : isAi ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {isUser ? '客' : isAi ? 'AI' : '房'}
                          </div>
                          <div
                            className={`p-2.5 rounded-2xl text-xs max-w-[80%] leading-relaxed ${
                              isUser
                                ? 'bg-slate-800 text-slate-200 rounded-tl-xs'
                                : isAi
                                ? 'bg-purple-950/60 border border-purple-800/80 text-purple-200 rounded-tr-xs'
                                : 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 rounded-tr-xs'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <div className="text-[9px] text-slate-400 mt-1 font-mono">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Direct Reply Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatReplyInput}
                    onChange={(e) => setChatReplyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendLandlordReply();
                      }
                    }}
                    placeholder="以房东身份回复该租客..."
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-white"
                  />
                  <button
                    onClick={handleSendLandlordReply}
                    disabled={!chatReplyInput.trim() || isSendingReply}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>人工回复</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI DESCRIPTION OPTIMIZATION MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 p-6 rounded-3xl border border-slate-700 shadow-2xl text-white space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>AI 智能优化房源亮点文案</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-700/80 text-[10px] text-purple-300 font-mono">
                      Agnes AI
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    根据房源户型、交通、朝向与家电配套，由大模型为您一键生成高转化率的房产介绍
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Context Summary */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI 将综合以下房源信息进行文案创意：</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-500">标题：</span>
                    <span className="font-medium text-slate-200">{houseForm?.title || '未填写'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">户型面积：</span>
                    <span className="font-medium text-slate-200">
                      {houseForm?.layout || '精装两居'} · {houseForm?.area_sqm || 0}㎡
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">朝向楼层：</span>
                    <span className="font-medium text-slate-200">
                      {houseForm?.orientation || '南'} · {houseForm?.floor || '高层'}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">详细地址：</span>
                    <span className="font-medium text-slate-200">{houseForm?.location || '未填写'}</span>
                  </div>
                  <div className="sm:col-span-3">
                    <span className="text-slate-500">交通配套：</span>
                    <span className="font-medium text-slate-200">
                      {houseForm?.metro_info || '近地铁站'}
                    </span>
                  </div>
                  <div className="sm:col-span-3">
                    <span className="text-slate-500">配套设施：</span>
                    <span className="font-medium text-slate-200">
                      {(houseForm?.amenities || []).join('、') || '全套家电'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Error alert */}
              {aiOptimizeError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">AI优化文案请求失败</p>
                    <p className="text-[11px] text-rose-400/90 mt-0.5">{aiOptimizeError}</p>
                  </div>
                </div>
              )}

              {/* Action trigger button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAiDescription}
                  disabled={aiOptimizing}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {aiOptimizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>正在调用大模型生成精品文案，请稍候...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>{aiOptimizedResult ? '🔄 不满意？重新生成文案' : '🚀 开始调用大模型一键生成亮点文案'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Editor Preview */}
              {aiOptimizedResult && (
                <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>AI 生成文案预览 (可直接在下方编辑微调)：</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {aiOptimizedResult.length} 字
                    </span>
                  </div>

                  <textarea
                    rows={8}
                    value={aiOptimizedResult}
                    onChange={(e) => setAiOptimizedResult(e.target.value)}
                    className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-xs text-slate-100 leading-relaxed font-sans focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
              >
                关闭
              </button>

              <div className="flex items-center gap-2">
                {aiOptimizedResult && (
                  <button
                    type="button"
                    onClick={handleApplyAiDescription}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/40 flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>采纳并应用到房源描述</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-sm font-bold">修改管理员密码</h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {pwdMsg && (
              <div className="p-2.5 rounded-xl bg-slate-700 text-xs text-amber-300">
                {pwdMsg}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">当前旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">新密码 (不少于6位)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100"
                >
                  确认修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

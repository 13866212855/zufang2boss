import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Maximize2,
  Compass,
  Building,
  Train,
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  Send,
  X,
  Bot,
  User,
  ShieldCheck,
  Sparkles,
  Wifi,
  Flame,
  KeyRound,
  Wind,
  Bed,
  Car,
  Film,
  Image as ImageIcon,
  Play,
  Copy,
  Check,
  ZoomIn
} from 'lucide-react';
import {
  PublicHouseInfo,
  ChatMessage,
  VideoItem,
  FieldVisibilityConfig,
  getHouseInfo,
  submitRentInquiry,
  getChatMessages,
  sendChatMessage
} from '../services/api.ts';
import { getOrCreateDeviceId } from '../utils/fingerprint.ts';

const amenityIcons: Record<string, React.ReactNode> = {
  '集中供暖': <Flame className="w-4 h-4 text-orange-600" />,
  '独立景观南阳台': <Maximize2 className="w-4 h-4 text-blue-600" />,
  '西门子洗烘一体机': <Sparkles className="w-4 h-4 text-emerald-600" />,
  '博世双开门冰箱': <CheckCircle2 className="w-4 h-4 text-teal-600" />,
  '大金中央空调': <Wind className="w-4 h-4 text-sky-600" />,
  '威能恒温地暖': <Flame className="w-4 h-4 text-amber-600" />,
  '指纹密码智能门锁': <KeyRound className="w-4 h-4 text-indigo-600" />,
  '民用水电燃气': <CheckCircle2 className="w-4 h-4 text-cyan-600" />,
  '24小时管家安防': <ShieldCheck className="w-4 h-4 text-emerald-600" />,
  '地库直达车位': <Car className="w-4 h-4 text-purple-600" />
};

export default function VisitorRentalView() {
  const [house, setHouse] = useState<PublicHouseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  // Media Tab: 'photos' | 'videos'
  const [mediaTab, setMediaTab] = useState<'photos' | 'videos'>('photos');
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  // Inquire rent modal state
  const [showInquireModal, setShowInquireModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [inquireSuccess, setInquireSuccess] = useState(false);
  const [submittingInquiry, setSubmittingInquiry] = useState(false);

  // Chat window state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isLandlordOnline, setIsLandlordOnline] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Contact copy state
  const [copiedWechat, setCopiedWechat] = useState(false);

  const deviceId = getOrCreateDeviceId();

  useEffect(() => {
    loadHouseData();
  }, []);

  const loadHouseData = async () => {
    try {
      const data = await getHouseInfo();
      setHouse(data);

      // Determine initial media tab based on visibility and available media
      const vis: Partial<FieldVisibilityConfig> = data.field_visibility || {};
      const hasImages = (vis.images !== false) && (data.images && data.images.length > 0);
      const hasVideos = (vis.videos !== false) && (data.videos && data.videos.length > 0);

      if (!hasImages && hasVideos) {
        setMediaTab('videos');
      } else {
        setMediaTab('photos');
      }
    } catch (err) {
      console.error('Failed to load house data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = async () => {
    setShowChatModal(true);
    try {
      const res = await getChatMessages(deviceId);
      setChatMessages(res.messages || []);
      setIsLandlordOnline(res.isLandlordOnline);
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, showChatModal]);

  const handleSendChat = async (presetText?: string) => {
    const textToSend = (presetText || chatInput).trim();
    if (!textToSend || isSendingChat) return;

    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      sender: 'user',
      content: textToSend,
      created_at: new Date().toISOString()
    };

    setChatMessages((prev) => [...prev, tempUserMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const res = await sendChatMessage({
        deviceId,
        content: textToSend
      });

      if (res.mode === 'ai' && res.aiReply) {
        setChatMessages((prev) => [...prev, res.aiReply!]);
      } else if (res.mode === 'manual') {
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'ai',
            content: '消息已送达房东微信与工作台，房东正在实时处理，请稍候...',
            created_at: new Date().toISOString()
          }
        ]);
      }
    } catch (err: any) {
      console.error('Send chat error:', err);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleInquireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.trim();

    if (!cleanPhone) {
      setPhoneError('请输入您的手机号码');
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(cleanPhone)) {
      setPhoneError('手机号码格式不正确，请输入11位有效手机号');
      return;
    }

    setPhoneError('');
    setSubmittingInquiry(true);

    try {
      await submitRentInquiry({
        deviceId,
        phoneNumber: cleanPhone,
        sourceNote: '移动端H5展示页-询问租金'
      });
      setInquireSuccess(true);
    } catch (err: any) {
      setPhoneError(err.message || '提交失败，请重试');
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const nextImage = () => {
    if (!house?.images?.length) return;
    setCurrentImgIndex((prev) => (prev + 1) % house.images.length);
  };

  const prevImage = () => {
    if (!house?.images?.length) return;
    setCurrentImgIndex((prev) => (prev - 1 + house.images.length) % house.images.length);
  };

  const handleCopyWechat = (wx: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(wx);
      setCopiedWechat(true);
      setTimeout(() => setCopiedWechat(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-500">房源信息加载中...</p>
        </div>
      </div>
    );
  }

  if (!house) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center bg-white p-6 rounded-2xl max-w-sm border border-slate-200">
          <p className="text-base font-semibold text-slate-800 mb-2">未找到房源信息</p>
          <button
            onClick={loadHouseData}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const vis = house.field_visibility || {
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

  const images = vis.images !== false ? (house.images || []) : [];
  const videos: VideoItem[] = vis.videos !== false ? (house.videos || []) : [];
  const hasImages = images.length > 0;
  const hasVideos = videos.length > 0;
  const showMediaBanner = hasImages || hasVideos;

  // Active video
  const activeVideo = videos[currentVideoIndex] || videos[0];

  // Core grid items check
  const coreGridItems: { label: string; value: string; isNum?: boolean }[] = [];
  if (vis.layout !== false && house.layout) {
    coreGridItems.push({ label: '户型格局', value: house.layout });
  }
  if (vis.area_sqm !== false && house.area_sqm) {
    coreGridItems.push({ label: '建筑面积', value: `${house.area_sqm}㎡`, isNum: true });
  }
  if (vis.orientation !== false && house.orientation) {
    coreGridItems.push({ label: '房屋朝向', value: house.orientation });
  }
  if (vis.floor !== false && house.floor) {
    coreGridItems.push({ label: '所在楼层', value: house.floor });
  }

  const showLocationSection = (vis.location !== false && house.location) || (vis.metro_info !== false && house.metro_info);
  const showAmenitiesSection = vis.amenities !== false && house.amenities && house.amenities.length > 0;
  const showDescriptionSection = vis.description !== false && house.description && house.description.trim().length > 0;
  const showGuaranteeBanner = vis.guarantee !== false;
  const showContactCard = (vis.landlord_phone !== false && house.landlord_phone) || (vis.landlord_wechat !== false && house.landlord_wechat);

  return (
    <div className="min-h-screen bg-neutral-100 flex justify-center pb-24 selection:bg-slate-900 selection:text-white">
      {/* Mobile viewport constraint (max 480px width on desktop) */}
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative flex flex-col">
        {/* Top Header Tag */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-semibold text-slate-900 tracking-wide">
              房东一手直租 · 免中介费
            </span>
          </div>

          {/* Media counter indicator */}
          {showMediaBanner && (
            <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
              {mediaTab === 'photos' && hasImages && (
                <span>
                  {currentImgIndex + 1}/{images.length} 张
                </span>
              )}
              {mediaTab === 'videos' && hasVideos && (
                <span>
                  {currentVideoIndex + 1}/{videos.length} 视频
                </span>
              )}
            </div>
          )}
        </div>

        {/* Media Container: Photo Carousel + Video Player */}
        {showMediaBanner && (
          <div className="relative w-full bg-slate-950">
            {/* Top Media Switcher Bar (when both photos and videos exist) */}
            {hasImages && hasVideos && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center p-1 bg-black/60 backdrop-blur-md rounded-full border border-white/20 shadow-lg">
                <button
                  type="button"
                  onClick={() => setMediaTab('photos')}
                  className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${
                    mediaTab === 'photos'
                      ? 'bg-white text-slate-950 font-bold shadow'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>照片 ({images.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaTab('videos')}
                  className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${
                    mediaTab === 'videos'
                      ? 'bg-purple-600 text-white font-bold shadow'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>视频漫游 ({videos.length})</span>
                </button>
              </div>
            )}

            {/* TAB 1: PHOTO CAROUSEL */}
            {mediaTab === 'photos' && hasImages && (
              <div className="relative aspect-4/3 w-full bg-slate-950 overflow-hidden group select-none">
                <img
                  src={images[currentImgIndex]}
                  alt={house.title}
                  className="w-full h-full object-cover transition-transform duration-300"
                  referrerPolicy="no-referrer"
                  onClick={() => setShowLightbox(true)}
                />

                {/* Carousel Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      aria-label="上一张"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextImage}
                      aria-label="下一张"
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Fullscreen zoom button */}
                <button
                  onClick={() => setShowLightbox(true)}
                  className="absolute right-3 bottom-3 z-10 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[11px] flex items-center gap-1 active:scale-95 transition-all"
                  title="全屏查看所有高清大图"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>看大图</span>
                </button>

                {/* Bottom gradient and indicators */}
                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2.5 pointer-events-none">
                  <div className="flex items-center gap-1.5">
                    {images.map((_, idx) => (
                      <span
                        key={idx}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === currentImgIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: VIDEO ROAMING PLAYER */}
            {mediaTab === 'videos' && hasVideos && activeVideo && (
              <div className="w-full bg-slate-950 p-2 space-y-2">
                <div className="relative aspect-16/9 rounded-xl overflow-hidden bg-black shadow-lg">
                  <video
                    key={activeVideo.url}
                    src={activeVideo.url}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                    poster={activeVideo.poster || images[0]}
                  />
                </div>

                {/* Video title & multi-video switcher */}
                <div className="px-1 py-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                    <span className="text-xs font-semibold text-white">
                      {activeVideo.title || '房源实景漫游视频'}
                    </span>
                  </div>
                  {videos.length > 1 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      切换视频 ({currentVideoIndex + 1}/{videos.length})
                    </span>
                  )}
                </div>

                {/* Multiple video selection chips */}
                {videos.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {videos.map((vid, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentVideoIndex(idx)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                          idx === currentVideoIndex
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{vid.title || `视频 ${idx + 1}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom thumbnail strip for photos if more than 3 photos */}
            {mediaTab === 'photos' && images.length > 1 && (
              <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-slate-800">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImgIndex(idx)}
                    className={`shrink-0 w-12 h-9 rounded-lg overflow-hidden border-2 transition-all ${
                      idx === currentImgIndex
                        ? 'border-white scale-105 shadow'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`缩略图 ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 space-y-5 flex-1">
          {/* Title & Trust Tags (Honoring field_visibility.title) */}
          {vis.title !== false && house.title && (
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5 font-medium">
                <span>整套出租</span>
                <span aria-hidden="true">·</span>
                <span>随时起租</span>
                <span aria-hidden="true">·</span>
                <span>实勘真房源</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-snug tracking-tight">
                {house.title}
              </h1>
            </div>
          )}

          {/* Core Info Grid (Only rendering visible properties) */}
          {coreGridItems.length > 0 && (
            <div
              className={`grid gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100/80 ${
                coreGridItems.length === 1
                  ? 'grid-cols-1'
                  : coreGridItems.length === 2
                  ? 'grid-cols-2'
                  : coreGridItems.length === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-4'
              }`}
            >
              {coreGridItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`text-center ${idx !== 0 ? 'border-l border-slate-200/60' : ''}`}
                >
                  <span className="text-[11px] text-slate-500 block mb-0.5">{item.label}</span>
                  <span
                    className={`text-sm font-semibold text-slate-900 block truncate ${
                      item.isNum ? 'font-mono tabular-nums' : ''
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Location & Subway Section (Honoring field_visibility.location & field_visibility.metro_info) */}
          {showLocationSection && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                地理位置与交通配套
              </h2>
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2">
                {vis.location !== false && house.location && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-700 leading-relaxed font-medium">
                      {house.location}
                    </span>
                  </div>
                )}
                {vis.metro_info !== false && house.metro_info && (
                  <div
                    className={`flex items-start gap-2.5 ${
                      vis.location !== false && house.location ? 'pt-2 border-t border-slate-100' : ''
                    }`}
                  >
                    <Train className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-600 leading-relaxed font-medium">
                      {house.metro_info}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Amenities & Equipments (Honoring field_visibility.amenities) */}
          {showAmenitiesSection && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  房屋设施与配套
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  共 {house.amenities?.length || 0} 项
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {house.amenities?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 font-medium"
                  >
                    {amenityIcons[item] || <CheckCircle2 className="w-4 h-4 text-slate-600" />}
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* House Description Highlights (Honoring field_visibility.description) */}
          {showDescriptionSection && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  房源亮点与详细介绍
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[10px] text-blue-600 font-medium">
                  房东直写
                </span>
              </div>
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line font-sans">
                {house.description}
              </div>
            </div>
          )}

          {/* Landlord Contact Info Card (Honoring field_visibility.landlord_phone & landlord_wechat) */}
          {showContactCard && (
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>房东直通联系通道</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800">
                  真实直签 · 免中介费
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                {vis.landlord_phone !== false && house.landlord_phone && (
                  <a
                    href={`tel:${house.landlord_phone}`}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-between transition-colors border border-slate-700/80"
                  >
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-blue-400" />
                      <span>直拨房东电话</span>
                    </span>
                    <span className="font-mono font-bold text-white text-[11px]">
                      {house.landlord_phone}
                    </span>
                  </a>
                )}

                {vis.landlord_wechat !== false && house.landlord_wechat && (
                  <button
                    type="button"
                    onClick={() => handleCopyWechat(house.landlord_wechat!)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-between transition-colors border border-slate-700/80 text-left"
                  >
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>房东微信</span>
                    </span>
                    <span className="font-mono text-emerald-300 text-[11px] flex items-center gap-1">
                      <span>{house.landlord_wechat}</span>
                      {copiedWechat ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-60" />}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Landlord Promise Banner (Honoring field_visibility.guarantee) */}
          {showGuaranteeBanner && (
            <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/60 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <p className="font-semibold mb-0.5">房东直租保障声明</p>
                <p className="text-amber-800">
                  本房源由房东本人直签，无中介费及隐形服务费。看房时间支持周末或工作日晚间。点击下方按钮即可一键询底价或在线沟通。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Bar (Obeying <= 15% mobile sticky cap) */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg">
          <div className="w-full max-w-md px-4 py-2.5 flex items-center gap-3">
            {/* Online Consultation Button */}
            <button
              onClick={handleOpenChat}
              className="flex-1 h-11 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4 text-slate-700" />
              <span>在线咨询</span>
            </button>

            {/* Inquire Rent Button (Primary CTA) */}
            <button
              onClick={() => {
                setShowInquireModal(true);
                setInquireSuccess(false);
                setPhoneError('');
              }}
              className="flex-1 h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/15 transition-transform active:scale-[0.98]"
            >
              <PhoneCall className="w-4 h-4" />
              <span>询问租金</span>
            </button>
          </div>
        </div>

        {/* LIGHTBOX MODAL: FULLSCREEN PHOTO VIEWER */}
        {showLightbox && hasImages && (
          <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4">
            <div className="flex items-center justify-between text-white text-xs z-10 pt-2">
              <span className="font-mono">
                {currentImgIndex + 1} / {images.length}
              </span>
              <button
                onClick={() => setShowLightbox(false)}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              <img
                src={images[currentImgIndex]}
                alt={`大图 ${currentImgIndex + 1}`}
                className="max-h-full max-w-full object-contain"
              />

              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail preview strip in lightbox */}
            <div className="flex items-center justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImgIndex(idx)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    idx === currentImgIndex ? 'border-white scale-110' : 'border-transparent opacity-50'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal 1: Inquire Rent Dialog */}
        {showInquireModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">询问房源租金底价</h3>
                <button
                  onClick={() => setShowInquireModal(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!inquireSuccess ? (
                <form onSubmit={handleInquireSubmit} className="mt-4 space-y-4">
                  <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-100 text-xs text-blue-900 leading-relaxed">
                    <p className="font-semibold text-blue-800 mb-0.5">温馨提示：</p>
                    <p>该手机号将发送给房东，房东会主动联系您，告知底价租金及看房安排。</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      您的联系手机号
                    </label>
                    <input
                      type="tel"
                      maxLength={11}
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value.replace(/\D/g, ''));
                        setPhoneError('');
                      }}
                      placeholder="请输入11位手机号码"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                      autoFocus
                    />
                    {phoneError && (
                      <p className="text-xs text-red-500 mt-1.5 font-medium">{phoneError}</p>
                    )}
                  </div>

                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInquireModal(false)}
                      className="flex-1 h-11 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={submittingInquiry}
                      className="flex-1 h-11 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {submittingInquiry ? '提交中...' : '提交询租'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 text-center py-2 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">询租需求已提交</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      已将您的手机号同步至房东工作台，房东将尽快主动致电您！
                    </p>
                  </div>
                  <button
                    onClick={() => setShowInquireModal(false)}
                    className="w-full h-10 rounded-xl bg-slate-900 text-white text-xs font-medium mt-2"
                  >
                    我知道了
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal 2: Online Chat Drawer */}
        {showChatModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl h-[85vh] sm:h-[620px] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
              {/* Chat Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                    房
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">房东直联在线咨询</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isLandlordOnline ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                      ></span>
                      <span>
                        {isLandlordOnline ? '房东实时在线' : '智能看房管家 (房东离线时智能代答)'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowChatModal(false)}
                  className="w-7 h-7 rounded-full bg-slate-200/60 flex items-center justify-center text-slate-600 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Messages Body */}
              <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/40">
                {/* Welcome Message */}
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    管
                  </div>
                  <div className="bg-white p-3 rounded-2xl rounded-tl-xs border border-slate-100 shadow-xs max-w-[85%] text-xs text-slate-800 leading-relaxed">
                    您好！欢迎查看本套精装房源。房东直租无中介费，您可以随时向我咨询房屋租金底价、配套设施、付款周期或预约实地看房。
                  </div>
                </div>

                {chatMessages.map((msg, index) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id || index}
                      className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isUser ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : msg.sender === 'ai' ? <Bot className="w-3.5 h-3.5" /> : '房'}
                      </div>
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[82%] ${
                          isUser
                            ? 'bg-slate-900 text-white rounded-tr-xs'
                            : 'bg-white text-slate-800 border border-slate-100 shadow-xs rounded-tl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <div
                          className={`text-[9px] mt-1 font-mono ${
                            isUser ? 'text-slate-400 text-right' : 'text-slate-400'
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isSendingChat && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 pl-9">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    <span>正在思考回复中...</span>
                  </div>
                )}
              </div>

              {/* Quick Questions Chips */}
              <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  '租金大概是多少？有优惠吗？',
                  '什么时候方便实地看房？',
                  '水电燃气费是民用还是商用？',
                  '租金付款方式是怎样的？'
                ].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendChat(q)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] whitespace-nowrap active:scale-95 transition-transform"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder="输入您想咨询的问题..."
                  className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-slate-900"
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={!chatInput.trim() || isSendingChat}
                  className="h-10 px-3.5 rounded-xl bg-slate-900 text-white text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

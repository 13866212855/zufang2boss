import React, { useState } from 'react';
import { Lock, User, KeyRound, ShieldAlert, CheckCircle, ArrowRight } from 'lucide-react';
import { adminLogin, adminChangePassword } from '../services/api.ts';

interface AdminLoginProps {
  onLoginSuccess: (userInfo: { username: string; mustChangePassword: boolean; isOnline: boolean }) => void;
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Forced password change dialog state
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdChangeError, setPwdChangeError] = useState('');
  const [pwdChangeLoading, setPwdChangeLoading] = useState(false);
  const [pwdChangeSuccess, setPwdChangeSuccess] = useState(false);
  const [cachedUserInfo, setCachedUserInfo] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('请输入管理员账号和登录密码');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    try {
      const res = await adminLogin({
        username: username.trim(),
        password
      });

      if (res.user.mustChangePassword) {
        setCachedUserInfo(res.user);
        setOldPassword(password);
        setShowChangePwdModal(true);
      } else {
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPwdChangeError('新密码长度不能少于6位字符');
      return;
    }
    if (newPassword === oldPassword) {
      setPwdChangeError('新密码不能与初始默认密码相同');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdChangeError('两次输入的新密码不一致');
      return;
    }

    setPwdChangeError('');
    setPwdChangeLoading(true);

    try {
      await adminChangePassword({
        oldPassword,
        newPassword
      });
      setPwdChangeSuccess(true);
      setTimeout(() => {
        if (cachedUserInfo) {
          onLoginSuccess({
            ...cachedUserInfo,
            mustChangePassword: false
          });
        }
      }, 1200);
    } catch (err: any) {
      setPwdChangeError(err.message || '修改密码失败');
    } finally {
      setPwdChangeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-white selection:text-slate-900">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-white text-slate-900 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-black/20">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">房东管理后台</h1>
          <p className="text-xs text-slate-400 mt-1">访客意向分析与智能咨询系统</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/80 backdrop-blur-xl p-6 rounded-3xl border border-slate-700/60 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-xs text-red-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                管理员账号
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入账号"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                登录密码
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-white text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-md shadow-white/5 active:scale-[0.99] mt-2"
            >
              {loading ? (
                <span>正在验证...</span>
              ) : (
                <>
                  <span>进入管理后台</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-[11px] text-slate-500">
          受安全策略保护 · 连续多次错误将自动限制访问
        </div>
      </div>

      {/* Mandatory Password Change Dialog on Initial Login */}
      {showChangePwdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl text-white animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 mb-3 text-amber-400">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">安全提示：首次登录强制改密</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              系统检测到您当前正使用初始默认密码。为了房源数据安全和防范未授权访问，系统要求您必须设置专属高强度密码后方可进入。
            </p>

            {pwdChangeSuccess ? (
              <div className="text-center py-4 space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-emerald-300">密码修改成功！</p>
                <p className="text-xs text-slate-400">正在进入管理面板...</p>
              </div>
            ) : (
              <form onSubmit={handlePasswordChangeSubmit} className="space-y-3.5">
                {pwdChangeError && (
                  <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300">
                    {pwdChangeError}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-300 mb-1">设置新密码 (不少于6位)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="输入新密码"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-white"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pwdChangeLoading}
                  className="w-full h-11 rounded-xl bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 disabled:opacity-50 mt-2"
                >
                  {pwdChangeLoading ? '正在更新...' : '保存新密码并进入后台'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

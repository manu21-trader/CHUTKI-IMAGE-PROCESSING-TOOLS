import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUsage } from '../context/UsageContext.jsx';

const UsageStatusBar = () => {
  const { isAuthenticated } = useAuth();
  const { usage, loading, error, refreshUsage } = useUsage();
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!isAuthenticated) return null;

  if (!usage) {
    return (
      <div className="border-b border-purple-100 bg-white/95 px-4 py-2 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {loading ? '正在加载本月额度…' : (
          <button type="button" onClick={refreshUsage} className="text-purple-600 hover:underline dark:text-purple-300">
            {error || '查看本月额度'}
          </button>
        )}
      </div>
    );
  }

  const isFree = usage.plan !== 'pro';
  const isExhausted = usage.remaining === 0;
  const isLow = isFree && usage.remaining > 0 && usage.remaining <= 2;
  const progress = usage.limit > 0
    ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
    : 0;

  return (
    <>
      <section className="border-b border-purple-100 bg-white/95 px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-gray-900 dark:text-white">
                {isFree ? '免费版' : 'Pro 会员'}
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                本月已用 {usage.used} / {usage.limit} 次
              </span>
              <span className="font-medium text-purple-700 dark:text-purple-300">
                剩余 {usage.remaining} 次
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" aria-label="本月额度使用进度">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isExhausted ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {isLow && (
              <p className="mt-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
                本月免费额度即将用完。
              </p>
            )}
            {isFree && isExhausted && (
              <p className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-300">
                本月免费额度已用完，升级 Pro 可获得每月 500 次额度。
              </p>
            )}
          </div>

          {isFree && (
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              className="shrink-0 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-purple-700 hover:to-pink-700"
            >
              升级 Pro
            </button>
          )}
        </div>
      </section>

      {showUpgrade && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" role="presentation" onMouseDown={() => setShowUpgrade(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-300">升级套餐</p>
                <h2 id="upgrade-title" className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Pro</h2>
              </div>
              <button type="button" onClick={() => setShowUpgrade(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-700 dark:hover:text-white" aria-label="关闭">×</button>
            </div>
            <p className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">¥19.9<span className="text-base font-normal text-gray-500">/月</span></p>
            <p className="mt-2 text-gray-600 dark:text-gray-300">500 次图片处理/月</p>
            <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-lg bg-gray-200 px-4 py-3 font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              支付功能即将上线
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default UsageStatusBar;

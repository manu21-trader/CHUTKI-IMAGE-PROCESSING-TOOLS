import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUsage } from '../context/UsageContext.jsx';

const UsageStatusBar = () => {
  const { isAuthenticated, user } = useAuth();
  const { usage, loading, error, refreshUsage } = useUsage();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [qrAvailable, setQrAvailable] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');

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
  const accountReference = user?.email || user?.id || '';
  const accountLabel = user?.email ? '注册邮箱' : '用户 ID';

  const copyAccountReference = async () => {
    if (!accountReference) return;

    try {
      await navigator.clipboard.writeText(accountReference);
      setCopyStatus('已复制');
      window.setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('复制失败，请手动复制');
    }
  };

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
                本月免费额度已用完，升级 Pro 可获得每自然月 500 次额度。
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-6" role="presentation" onMouseDown={() => setShowUpgrade(false)}>
          <div
            className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-300">升级套餐</p>
                <h2 id="upgrade-title" className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Pro 会员</h2>
              </div>
              <button type="button" onClick={() => setShowUpgrade(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-700 dark:hover:text-white" aria-label="关闭">×</button>
            </div>
            <p className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">¥19.9 <span className="text-base font-normal text-gray-500 dark:text-gray-400">/ 30天</span></p>
            <p className="mt-2 text-gray-600 dark:text-gray-300">500 次 / 自然月</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">按北京时间自然月重置</p>

            <div className="mt-5 rounded-xl border border-purple-100 bg-purple-50/60 p-4 text-center dark:border-gray-700 dark:bg-gray-900/40">
              {qrAvailable ? (
                <img
                  src="/payment/wechat-qr.png"
                  alt="微信收款二维码"
                  className="mx-auto h-48 w-48 rounded-lg bg-white object-contain"
                  onError={() => setQrAvailable(false)}
                />
              ) : (
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  微信收款二维码待配置
                </div>
              )}
              <p className="mt-3 font-semibold text-gray-900 dark:text-white">请使用微信扫码支付 ¥19.9</p>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">当前账号（{accountLabel}）</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                  {accountReference || '账号信息暂不可用'}
                </code>
                <button
                  type="button"
                  onClick={copyAccountReference}
                  disabled={!accountReference}
                  className="shrink-0 rounded-md border border-purple-200 px-3 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-gray-700"
                >
                  {copyStatus || '复制'}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                付款后请将您的注册邮箱作为付款备注，或联系管理员提供该账号。
              </p>
            </div>

            <div className="mt-4 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              <p>付款后请保留支付记录。</p>
              <p>我们确认到账后会人工为您的账号开通 30 天 Pro 会员。</p>
              <p>当前为人工确认流程，不会自动到账或自动开通。</p>
              <p>管理员确认开通后，请刷新页面查看会员状态。</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UsageStatusBar;

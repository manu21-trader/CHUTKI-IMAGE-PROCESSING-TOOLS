export const QUOTA_EXCEEDED_MESSAGE = '本月免费额度已用完，升级 Pro 可继续使用。';

export const getProcessingErrorMessage = async (response, fallbackMessage = '图片处理失败，请稍后重试。') => {
  const errorData = await response.json().catch(() => ({}));

  if (errorData?.error === 'quota_exceeded') {
    return QUOTA_EXCEEDED_MESSAGE;
  }

  return errorData?.message || errorData?.error || fallbackMessage;
};

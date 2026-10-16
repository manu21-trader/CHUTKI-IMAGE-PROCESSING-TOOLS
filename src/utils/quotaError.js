export const QUOTA_EXCEEDED_MESSAGE = '本月免费额度已用完，升级 Pro 可继续使用。';

export const getProcessingErrorMessage = async (response, fallbackMessage = '图片处理失败，请稍后重试。') => {
  const errorData = await response.json().catch(() => ({}));

  if (errorData?.error === 'quota_exceeded') {
    return QUOTA_EXCEEDED_MESSAGE;
  }

  if (response.status === 401) {
    return '请先登录后再使用图片工具。';
  }

  if (response.status === 413) {
    return '上传的文件过大，请选择较小的文件。';
  }

  const serverMessage = errorData?.message || errorData?.error;
  return /[\u3400-\u9fff]/.test(serverMessage || '') ? serverMessage : fallbackMessage;
};

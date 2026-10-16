// Comprehensive passport photo requirements database
const passportCountries = {
  US: {
    name: '美国',
    size: { width: 2, height: 2, unit: 'inches' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 50, max: 69, percentage: 70 },
    eyeLevel: { percentage: 60 },
    requirements: [
      '下巴底部到头顶的距离应为 25mm～35mm',
      '照片须为最近 6 个月内拍摄',
      '使用白色或米白色背景',
      '面部须正对镜头',
      '保持自然表情并睁开双眼'
    ]
  },
  GB: {
    name: '英国',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#F5F5F5',
    headSize: { min: 29, max: 34, percentage: 80 },
    eyeLevel: { percentage: 50 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '下巴到头顶的距离应为 29mm～34mm',
      '使用纯浅灰色或米色背景',
      '面部须清晰对焦',
      '面部及头部后方不得有阴影'
    ]
  },
  CA: {
    name: '加拿大',
    size: { width: 50, height: 70, unit: 'mm' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 31, max: 36, percentage: 70 },
    eyeLevel: { percentage: 60 },
    requirements: [
      '照片尺寸须为 50mm × 70mm',
      '下巴到头顶的距离应为 31mm～36mm',
      '使用纯白色或浅色背景',
      '面部须清晰对焦并保持自然表情',
      '双眼须清晰可见'
    ]
  },
  IN: {
    name: '印度',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 25, max: 35, percentage: 70 },
    eyeLevel: { percentage: 60 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '下巴到头顶的距离应为 25mm～35mm',
      '使用白色背景',
      '面部须正对镜头',
      '保持自然表情并闭合嘴巴'
    ]
  },
  AU: {
    name: '澳大利亚',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#F5F5F5',
    headSize: { min: 32, max: 36, percentage: 75 },
    eyeLevel: { percentage: 55 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '下巴到头顶的距离应为 32mm～36mm',
      '使用纯浅色背景',
      '面部须清晰对焦',
      '保持自然表情并闭合嘴巴'
    ]
  },
  DE: {
    name: '德国',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#F5F5F5',
    headSize: { min: 32, max: 36, percentage: 75 },
    eyeLevel: { percentage: 55 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '头部高度应为 32mm～36mm',
      '使用纯浅灰色背景',
      '面部须居中并清晰对焦',
      '保持自然表情并闭合嘴巴'
    ]
  },
  FR: {
    name: '法国',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#F5F5F5',
    headSize: { min: 32, max: 36, percentage: 75 },
    eyeLevel: { percentage: 55 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '头部高度应为 32mm～36mm',
      '使用浅灰色或浅蓝色背景',
      '面部须居中',
      '保持自然表情'
    ]
  },
  JP: {
    name: '日本',
    size: { width: 35, height: 45, unit: 'mm' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 32, max: 36, percentage: 75 },
    eyeLevel: { percentage: 55 },
    requirements: [
      '照片尺寸须为 35mm × 45mm',
      '头部高度应为 32mm～36mm',
      '使用白色或浅蓝色背景',
      '面部须正对镜头',
      '保持自然表情'
    ]
  },
  CN: {
    name: '中国',
    size: { width: 33, height: 48, unit: 'mm' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 28, max: 33, percentage: 70 },
    eyeLevel: { percentage: 60 },
    requirements: [
      '照片尺寸须为 33mm × 48mm',
      '头部高度应为 28mm～33mm',
      '使用白色背景',
      '面部须居中',
      '保持自然表情并睁开双眼'
    ]
  },
  BR: {
    name: '巴西',
    size: { width: 50, height: 70, unit: 'mm' },
    dpi: 300,
    background: '#FFFFFF',
    headSize: { min: 32, max: 36, percentage: 70 },
    eyeLevel: { percentage: 60 },
    requirements: [
      '照片尺寸须为 50mm × 70mm',
      '头部高度应为 32mm～36mm',
      '使用白色背景',
      '面部须清晰对焦',
      '保持自然表情'
    ]
  }
};

export default passportCountries;

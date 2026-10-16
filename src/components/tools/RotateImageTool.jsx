import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ToolLayout from '../shared/ToolLayout';
import ScrollEffect from '../shared/ScrollEffect';
import config from '../../config';
import FileUploadZone from '../shared/FileUploadZone';

const RotateImageSettings = ({ selectedFile, loading, onSubmit }) => {
  const [angle, setAngle] = useState('90');
  const [background, setBackground] = useState('white');

  const presetAngles = [
    { value: '90', label: '顺时针 90°' },
    { value: '180', label: '旋转 180°' },
    { value: '270', label: '逆时针 90°' },
    { value: '-90', label: '逆时针 90°' }
  ];

  const backgroundOptions = [
    { value: 'white', label: '白色', color: '#FFFFFF' },
    { value: 'black', label: '黑色', color: '#000000' },
    { value: 'transparent', label: '透明', color: 'transparent' },
    { value: 'red', label: '红色', color: '#FF0000' },
    { value: 'blue', label: '蓝色', color: '#0000FF' },
    { value: 'green', label: '绿色', color: '#00FF00' }
  ];

  const handleSubmit = () => {
    const formData = { angle: parseFloat(angle), background };
    onSubmit(formData);
  };

  return (
    <>
      {/* Preset Angles */}
      <ScrollEffect animation="fade-up" duration={600} delay={0}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">快速旋转</h3>
        <div className="grid grid-cols-2 gap-3">
          {presetAngles.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setAngle(preset.value)}
              className={`p-3 border rounded-lg transition-colors ${angle === preset.value
                  ? 'bg-blue-50 border-blue-300'
                  : 'hover:bg-gray-50 hover:border-gray-300'
                }`}
            >
              <div className="font-medium text-sm">{preset.label}</div>
            </button>
          ))}
        </div>
      </div>
      </ScrollEffect>

      {/* Custom Angle */}
      <ScrollEffect animation="fade-up" duration={600} delay={100}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">自定义角度</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              旋转角度：{angle}°
            </label>
            <input
              type="range"
              min="-360"
              max="360"
              step="1"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>-360°</span>
              <span>0°</span>
              <span>360°</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">或输入精确角度：</label>
            <input
              type="number"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              min="-360"
              max="360"
              step="0.1"
            />
          </div>
        </div>
      </div>
      </ScrollEffect>

      {/* Background Color */}
      <ScrollEffect animation="fade-up" duration={600} delay={150}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">背景填充</h3>
        <div className="grid grid-cols-2 gap-3">
          {backgroundOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setBackground(option.value)}
              className={`p-3 border rounded-lg transition-colors flex items-center space-x-2 ${background === option.value
                  ? 'bg-green-50 border-green-300'
                  : 'hover:bg-gray-50 hover:border-gray-300'
                }`}
            >
              <div
                className="w-4 h-4 rounded border"
                style={{
                  backgroundColor: option.color,
                  border: option.color === 'transparent' ? '1px dashed #ccc' : 'none'
                }}
              ></div>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          背景颜色用于填充旋转后产生的空白区域
        </p>
      </div>
      </ScrollEffect>

      {/* Rotation Preview */}
      {selectedFile && (
        <ScrollEffect animation="fade-up" duration={600} delay={200}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4">旋转预览</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>旋转角度：</span>
              <span className="font-medium">{angle}°</span>
            </div>
            <div className="flex justify-between">
              <span>背景：</span>
              <span className="font-medium capitalize">{background}</span>
            </div>
            <div className="flex justify-between">
              <span>方向：</span>
              <span className="font-medium">
                {parseFloat(angle) > 0 ? '顺时针' : parseFloat(angle) < 0 ? '逆时针' : '不旋转'}
              </span>
            </div>
          </div>
        </div>
        </ScrollEffect>
      )}

      {/* Process Button */}
      <ScrollEffect animation="scale-up" duration={500} delay={250}>
      <motion.button
        onClick={handleSubmit}
        disabled={!selectedFile || loading}
        className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${!selectedFile || loading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700'
          }`}
        whileHover={!loading && selectedFile ? { scale: 1.02 } : {}}
        whileTap={!loading && selectedFile ? { scale: 0.98 } : {}}
      >
        {loading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
            正在旋转...
          </div>
        ) : (
          '旋转图片'
        )}
      </motion.button>
      </ScrollEffect>

      {/* Tips */}
      <ScrollEffect animation="fade-up" duration={600} delay={300}>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <h4 className="font-semibold text-orange-800 mb-2">旋转提示：</h4>
        <ul className="text-sm text-orange-700 space-y-1">
          <li>• 正角度表示顺时针旋转</li>
          <li>• 负角度表示逆时针旋转</li>
          <li>• 透明背景可以保留图片原始形状</li>
          <li>• 文档图片通常适合使用白色背景</li>
        </ul>
      </div>
      </ScrollEffect>
    </>
  );
};

const RotateImageTool = () => {
  return (
    <ToolLayout
      title="旋转图片"
      description="按任意角度旋转图片，并可自定义空白区域的背景颜色"
      endpoint={`${config.API_BASE_URL}/api/tools/rotate`}
      acceptedFormats="image/jpeg, image/png, image/webp"
      maxFileSize={15}
    >
      <RotateImageSettings />
    </ToolLayout>
  );
};

export default RotateImageTool;

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ToolLayout from '../shared/ToolLayout';
import ScrollEffect from '../shared/ScrollEffect';
import config from '../../config';
import FileUploadZone from '../shared/FileUploadZone';

const FlipImageSettings = ({ selectedFile, loading, onSubmit = () => {} }) => {
  const [direction, setDirection] = useState('horizontal');

  const flipOptions = [
    {
      value: 'horizontal',
      label: '水平翻转',
      description: '将图片左右镜像翻转',
      icon: '↔️'
    },
    {
      value: 'vertical',
      label: '垂直翻转',
      description: '将图片上下镜像翻转',
      icon: '↕️'
    }
  ];

  const handleSubmit = () => {
    const formData = { direction };
    onSubmit(formData);
  };

  return (
    <>
      {/* Flip Direction Selection */}
      <ScrollEffect animation="fade-up" duration={600} delay={0}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">选择翻转方向</h3>
        <div className="space-y-4">
          {flipOptions.map((option) => (
            <label
              key={option.value}
              className="flex items-center space-x-4 cursor-pointer p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <input
                type="radio"
                name="direction"
                value={option.value}
                checked={direction === option.value}
                onChange={(e) => setDirection(e.target.value)}
                className="w-4 h-4"
              />
              <div className="text-2xl">{option.icon}</div>
              <div className="flex-1">
                <div className="font-medium">{option.label}</div>
                <div className="text-sm text-gray-500">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      </ScrollEffect>

      {/* Visual Preview */}
      <ScrollEffect animation="fade-up" duration={600} delay={100}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">翻转预览</h3>
        <div className="flex items-center justify-center space-x-8">
          <div className="text-center text-base px-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg mb-2 flex items-center justify-center text-white font-bold">
              A
            </div>
            <div className="text-sm text-gray-600">原图</div>
          </div>

          <div className="text-2xl text-gray-400">→</div>

          <div className="text-center text-base px-8">
            <div
              className={`w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg mb-2 flex items-center justify-center text-white font-bold ${direction === 'horizontal' ? 'transform scale-x-[-1]' : 'transform scale-y-[-1]'
                }`}
            >
              A
            </div>
            <div className="text-sm text-gray-600">
              {direction === 'horizontal' ? '水平翻转后' : '垂直翻转后'}
            </div>
          </div>
        </div>
      </div>
      </ScrollEffect>

      {/* Settings Summary */}
      {selectedFile && (
        <ScrollEffect animation="fade-up" duration={600} delay={200}>
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <h3 className="text-lg font-semibold mb-4">翻转设置</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>方向：</span>
              <span className="font-medium">{direction === 'horizontal' ? '水平' : '垂直'}</span>
            </div>
            <div className="flex justify-between">
              <span>效果：</span>
              <span className="font-medium">
                {direction === 'horizontal' ? '左 ↔ 右镜像' : '上 ↕ 下镜像'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>质量：</span>
              <span className="font-medium text-green-600">无损</span>
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
            : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700'
          }`}
        whileHover={!loading && selectedFile ? { scale: 1.02 } : {}}
        whileTap={!loading && selectedFile ? { scale: 0.98 } : {}}
      >
        {loading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
            正在翻转...
          </div>
        ) : (
          `${direction === 'horizontal' ? '水平' : '垂直'}翻转图片`
        )}
      </motion.button>
      </ScrollEffect>

      {/* Use Cases */}
      <ScrollEffect animation="fade-up" duration={600} delay={300}>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">常见用途：</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>水平翻转：</strong>修正自拍方向或制作镜像效果</li>
          <li>• <strong>垂直翻转：</strong>修正上下颠倒的图片或制作艺术效果</li>
          <li>• 适合社交媒体图片和照片方向修正</li>
          <li>• 无损处理，可随时翻转恢复</li>
        </ul>
      </div>
      </ScrollEffect>
    </>
  );
};

const FlipImageTool = () => {
  return (
    <ToolLayout
      title="翻转图片"
      description="水平或垂直镜像翻转图片，并保持原始画质"
      endpoint={`${config.API_BASE_URL}/api/tools/flip`}
      acceptedFormats="image/jpeg, image/png, image/webp, image/tiff, image/avif"
      maxFileSize={20}
    >
      <FlipImageSettings />
    </ToolLayout>
  );
};

export default FlipImageTool;

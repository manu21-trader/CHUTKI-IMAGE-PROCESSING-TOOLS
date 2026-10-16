import React, { useState, useMemo } from "react";
import ImageTools from "./ImageTools";
import ChutkiAssistant from "./ChutkiAssistant";
import Footer from "./Footer";
import ScrollEffect from "./shared/ScrollEffect";

function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  // Memoize search input to prevent unnecessary re-renders
  const memoizedSearchInput = useMemo(() => (
    <div className="max-w-full sm:max-w-md lg:max-w-lg mx-auto relative">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-full opacity-75 blur-sm animate-pulse"></div>
      <div className="relative flex items-center gap-2 bg-white dark:bg-gray-900 border border-purple-300/60 dark:border-purple-500/50 rounded-full px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5">
          <input
            type="text"
            placeholder="搜索图片工具..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-purple-400 dark:placeholder-purple-300 text-sm sm:text-base lg:text-lg"
        />
        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
      </div>
    </div>
  ), [searchQuery]);

  return (
    <>
      {/* ======= HEADLINE SECTION (NOT STICKY) ======= */}
      <ScrollEffect animation="fade-down" duration={1000}>
        <section className="text-center px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
          <h2 className="text-lg sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">
            CHUTKI 图片压缩与编辑工具
          </h2>
          <p className="max-w-2xl lg:max-w-4xl mx-auto text-sm sm:text-base lg:text-lg text-gray-600 dark:text-gray-300 mt-3 sm:mt-4 lg:mt-6 leading-relaxed px-2">
            提供 100 多种在线图片工具，支持图片压缩、尺寸调整、格式转换、HEIC 转 JPG、
            背景移除等常用操作。
          </p>
        </section>
      </ScrollEffect>

      {/* ======= STICKY SEARCH BAR ======= */}
      <div className="sticky top-[40px] z-40 bg-gradient-to-r from-white/95 via-purple-50/80 to-white/95 dark:from-gray-900/95 dark:via-purple-900/50 dark:to-gray-900/95 backdrop-blur-md px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-5 shadow-lg border-b border-purple-200/30 dark:border-purple-500/20">
        {memoizedSearchInput}
      </div>

      {/* Main Content - Tools Section */}
      <ScrollEffect animation="fade-up" duration={800} delay={200}>
        <ImageTools searchQuery={searchQuery} />
      </ScrollEffect>
      
      <ScrollEffect animation="fade-up" duration={800} delay={400}>
        <ChutkiAssistant />
      </ScrollEffect>
      
      <ScrollEffect animation="fade-up" duration={800} delay={600}>
        <Footer />
      </ScrollEffect>
    </>
  );
}

export default Home;

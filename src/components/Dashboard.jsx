import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ScrollEffect from './shared/ScrollEffect';
import { toolsConfig, getToolCount, getToolsByCategory } from '../toolsConfig';

// ==================== CONSTANTS ====================
/**
 * Featured tools configuration for dashboard display
 * Each tool includes metadata for rendering and navigation
 */
const FEATURED_TOOLS = [
  {
    id: 'passport-photo',
    name: 'Passport Photo',
    description: 'Create professional passport photos',
    route: '/tools/passport-photo',
    icon: 'user',
    color: 'blue',
    category: 'Image Editing Tools'
  },
  {
    id: 'rotate',
    name: 'Rotate Image',
    description: 'Rotate images by any angle',
    route: '/tools/rotate',
    icon: 'rotate',
    color: 'green',
    category: 'Image Editing Tools'
  },
  {
    id: 'flip',
    name: 'Flip Image',
    description: 'Flip images horizontally or vertically',
    route: '/tools/flip',
    icon: 'flip',
    color: 'purple',
    category: 'Image Editing Tools'
  },
  {
    id: 'resize',
    name: 'Resize Image',
    description: 'Resize images by centimeters or pixels',
    route: '/tools/resize-pixel',
    icon: 'resize',
    color: 'yellow',
    category: 'Image Editing Tools'
  },
  {
    id: 'compress',
    name: 'Compress Image',
    description: 'Reduce image file size',
    route: '/tools/compress-50kb',
    icon: 'compress',
    color: 'red',
    category: 'Image Compression Tools'
  },
  {
    id: 'convert',
    name: 'Convert Format',
    description: 'Convert between image formats',
    route: '/tools/webp-to-jpg',
    icon: 'convert',
    color: 'indigo',
    category: 'Image Conversion Tools'
  }
];

/**
 * SVG icon components for tools
 */
const ICONS = {
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
  rotate: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  ),
  flip: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  ),
  resize: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  ),
  compress: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  ),
  convert: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
  )
};

/**
 * Color schemes for tool cards
 */
const COLOR_SCHEMES = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900',
    text: 'text-blue-600 dark:text-blue-400'
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900',
    text: 'text-green-600 dark:text-green-400'
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900',
    text: 'text-purple-600 dark:text-purple-400'
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    text: 'text-yellow-600 dark:text-yellow-400'
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-600 dark:text-red-400'
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900',
    text: 'text-indigo-600 dark:text-indigo-400'
  }
};

// ==================== COMPONENT DEFINITIONS ====================
/**
 * Dashboard Header Component
 * Displays user info and logout button
 */
const DashboardHeader = ({ user, onLogout }) => (
  <ScrollEffect animation="fade-down" duration={600}>
    <header className="bg-white dark:bg-gray-800 shadow">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="flex justify-between items-center py-4 sm:py-5 lg:py-6">
          <div className="flex items-center">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
              CHUTKI Dashboard
            </h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4">
            <UserAvatar user={user} />
            <button
              onClick={() => window.location.href = '/profile'}
              className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="View Profile"
              title="View Profile"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="hidden sm:inline text-sm font-medium">Profile</span>
            </button>
            <button
              onClick={onLogout}
              className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  </ScrollEffect>
);

/**
 * User Avatar Component
 * Displays user profile picture or initials
 */
const UserAvatar = ({ user }) => (
  <div className="flex items-center space-x-1.5 sm:space-x-2">
    {user?.avatar ? (
      <img
        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full"
        src={user.avatar}
        alt={user.name}
      />
    ) : (
      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
        <span className="text-xs sm:text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {user?.name?.charAt(0).toUpperCase()}
        </span>
      </div>
    )}
    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
      {user?.name}
    </span>
  </div>
);

/**
 * Welcome Section Component
 * Displays greeting and total tool count
 */
const WelcomeSection = ({ userName, toolCount }) => (
  <ScrollEffect animation="fade-up" duration={800} delay={100}>
    <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg mb-4 sm:mb-6">
      <div className="px-4 py-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
          Welcome back, {userName}!
        </h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Ready to process some images? Choose from our <strong>{toolCount}+ powerful tools</strong> below.
        </p>
      </div>
    </div>
  </ScrollEffect>
);

/**
 * Tool Card Component
 * Individual tool display with icon and description
 */
const ToolCard = ({ tool, delay, onClick }) => {
  const colorScheme = COLOR_SCHEMES[tool.color];
  
  return (
    <ScrollEffect animation="fade-up" duration={600} delay={delay}>
      <div
        onClick={() => onClick(tool.route)}
        className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg hover:shadow-lg transition-all duration-300 cursor-pointer transform hover:-translate-y-1 active:scale-95"
        role="button"
        tabIndex={0}
        onKeyPress={(e) => e.key === 'Enter' && onClick(tool.route)}
        aria-label={`Navigate to ${tool.name}`}
      >
        <div className="px-3 py-4 sm:p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`h-7 w-7 sm:h-8 sm:w-8 ${colorScheme.bg} rounded-md flex items-center justify-center`}>
                <svg className={`h-4 w-4 sm:h-5 sm:w-5 ${colorScheme.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {ICONS[tool.icon]}
                </svg>
              </div>
            </div>
            <div className="ml-3 sm:ml-4 flex-1 min-w-0">
              <h3 className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 dark:text-white truncate">
                {tool.name}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {tool.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ScrollEffect>
  );
};

/**
 * Account Information Component
 * Displays user account details
 */
const AccountInformation = ({ user }) => (
  <ScrollEffect animation="slide-scale" duration={800} delay={300}>
    <div className="mt-6 sm:mt-8 bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
      <div className="px-4 py-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-3 sm:mb-4">
          Account Information
        </h3>
        <dl className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6">
          <InfoItem label="Full name" value={user?.name} />
          <InfoItem label="Email address" value={user?.email} />
          <InfoItem label="Account type" value={user?.role || 'User'} capitalize />
          <InfoItem 
            label="Member since" 
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recently'} 
          />
        </dl>
      </div>
    </div>
  </ScrollEffect>
);

/**
 * Info Item Component
 * Single information row in account details
 */
const InfoItem = ({ label, value, capitalize = false }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {label}
    </dt>
    <dd className={`mt-1 text-sm text-gray-900 dark:text-white ${capitalize ? 'capitalize' : ''}`}>
      {value}
    </dd>
  </div>
);

// ==================== MAIN DASHBOARD COMPONENT ====================
/**
 * Dashboard Component
 * Main dashboard page displaying tools and user information
 * 
 * Features:
 * - User welcome message
 * - Featured tools grid
 * - Account information
 * - Tool count statistics
 */
const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Memoized calculations for performance
  const toolCount = useMemo(() => getToolCount(), []);

  /**
   * Handle logout action
   */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /**
   * Navigate to tool page
   */
  const handleToolClick = (route) => {
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DashboardHeader user={user} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="sm:px-0">
          <WelcomeSection userName={user?.name} toolCount={toolCount} />

          {/* Featured Tools Grid */}
          <ScrollEffect animation="zoom-in" duration={1000} delay={200}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              {FEATURED_TOOLS.map((tool, index) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  delay={100 + (index * 100)}
                  onClick={handleToolClick}
                />
              ))}
            </div>
          </ScrollEffect>

          <AccountInformation user={user} />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

import { createContext, useContext, useReducer, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import config from '../config.js';

const AuthContext = createContext();

// Auth reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        loading: true,
        error: null
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: action.payload
      };
    case 'LOGOUT':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: null
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    default:
      return state;
  }
};

// Initial state
const initialState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true,
  error: null
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing token on app load
  useEffect(() => {
    let cancelled = false;

    const verifyStoredToken = async (token) => {
      if (!token) {
        if (!cancelled) dispatch({ type: 'LOGOUT' });
        return;
      }

      try {
        const response = await fetch(`${config.API_BASE_URL}/api/auth/verify-token`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();
        if (cancelled) return;

        if (response.ok && data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          dispatch({ type: 'LOGIN_SUCCESS', payload: { token, user: data.user } });
          return;
        }

        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
        dispatch({ type: 'LOGOUT' });
      } catch (error) {
        console.error('Unable to verify stored authentication:', error);
        if (!cancelled) dispatch({ type: 'LOGOUT' });
      }
    };

    verifyStoredToken(localStorage.getItem('token'));

    // Listen for storage events (OAuth login from other tabs/components)
    const handleStorageChange = (e) => {
      if (e.key === 'token' && e.newValue) {
        verifyStoredToken(e.newValue);
      } else if (e.key === 'token' && !e.newValue) {
        // Token was removed (logout)
        dispatch({ type: 'LOGOUT' });
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Login function
  const login = async (email, password) => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            token: data.token,
            user: data.user
          }
        });

        toast.success('登录成功！');
        return { success: true };
      } else {
        dispatch({
          type: 'LOGIN_FAILURE',
          payload: data.message || '登录失败'
        });
        toast.error('登录失败，请检查邮箱和密码。');
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = '网络连接异常，请稍后重试。';
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: errorMessage
      });
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Register function
  const register = async (name, email, password) => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            token: data.token,
            user: data.user
          }
        });

        toast.success('注册成功！');
        return { success: true };
      } else {
        dispatch({
          type: 'LOGIN_FAILURE',
          payload: data.message || '注册失败'
        });
        toast.error('注册失败，请检查填写的信息。');
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = '网络连接异常，请稍后重试。';
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: errorMessage
      });
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch({ type: 'LOGOUT' });
    toast.success('已安全退出。');
  };

  // Update user profile
  const updateUser = async (userData) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (data.success) {
        const updatedUser = data.user;
        localStorage.setItem('user', JSON.stringify(updatedUser));

        dispatch({
          type: 'UPDATE_USER',
          payload: updatedUser
        });

        toast.success('个人资料已更新。');
        return { success: true };
      } else {
        toast.error('个人资料更新失败。');
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error('网络连接异常，请稍后重试。');
      return { success: false, error: '网络连接异常' };
    }
  };

  // Get current user
  const getCurrentUser = async () => {
    if (!state.token) return null;

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/auth/verify-token`, {
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        dispatch({
          type: 'UPDATE_USER',
          payload: data.user
        });
        return data.user;
      } else {
        // Only logout if it's a 401 unauthorized error
        if (response.status === 401) {
          logout();
        }
        return null;
      }
    } catch (error) {
      console.error('Get current user error:', error);
      // Don't logout on network errors, only on auth errors
      return null;
    }
  };

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value = {
    ...state,
    login,
    register,
    logout,
    updateUser,
    getCurrentUser,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Named export for AuthContext
export { AuthContext };

export default AuthContext;

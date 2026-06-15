import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AppProvider } from '@/contexts/AppContext';
import BottomNav from '@/components/BottomNav';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <IntersectObserver />
        {/* 
          pt-safe: 顶部安全区域（状态栏高度）
          pb-safe: 底部安全区域（手势条/弧角屏幕）
          max-w-md: 限制最大宽度，移动端全屏桌面端居中
        */}
        <div className="flex flex-col min-h-screen max-w-md mx-auto relative pt-safe pb-safe">
          <main className="flex-grow">
            <Routes>
              {routes.map((route, index) => (
                <Route
                  key={index}
                  path={route.path}
                  element={route.element}
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
        <Toaster position="top-center" />
      </Router>
    </AppProvider>
  );
};

export default App;

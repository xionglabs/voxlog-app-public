import HomePage from './pages/HomePage';
import DiaryListPage from './pages/DiaryListPage';
import DiaryDetailPage from './pages/DiaryDetailPage';
import SearchPage from './pages/SearchPage';
import SummaryPage from './pages/SummaryPage';
import SettingsPage from './pages/SettingsPage';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: '首页',
    path: '/',
    element: <HomePage />,
    public: true,
  },
  {
    name: '日记列表',
    path: '/list',
    element: <DiaryListPage />,
    public: true,
  },
  {
    name: '日记详情',
    path: '/diary/:date',
    element: <DiaryDetailPage />,
    public: true,
  },
  {
    name: '搜索',
    path: '/search',
    element: <SearchPage />,
    public: true,
  },
  {
    name: 'AI 总结',
    path: '/summary',
    element: <SummaryPage />,
    public: true,
  },
  {
    name: '设置',
    path: '/settings',
    element: <SettingsPage />,
    public: true,
  },
];

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import DashboardPage from '../pages/DashboardPage';
import ArenaPage from '../pages/ArenaPage';
import ProfilePage from '../pages/ProfilePage';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="arena" element={<ArenaPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

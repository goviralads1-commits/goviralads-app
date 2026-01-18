import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import ErrorBoundary from './components/ErrorBoundary';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Recharges from './pages/Recharges';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Plans from './pages/Plans';
import Categories from './pages/Categories';
import Profile from './pages/Profile';
import TaskDetail from './pages/TaskDetail';
import PlanDetail from './pages/PlanDetail';
import PlanPreview from './pages/PlanPreview';
import Wallet from './pages/Wallet';
import OfficeCMS from './pages/OfficeCMS';
import NotFound from './pages/NotFound';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const isAuthenticatedUser = isAuthenticated();
  const userRole = getUserRole();

  if (!isAuthenticatedUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Main App Component
const App = () => {
  return (
    <ErrorBoundary>
      <Router>
        <div className="App">
          <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginForm />} />
          
          {/* Protected ADMIN Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/clients" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Clients />
            </ProtectedRoute>
          } />
          <Route path="/recharges" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Recharges />
            </ProtectedRoute>
          } />
          <Route path="/tasks" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Tasks />
            </ProtectedRoute>
          } />
          <Route path="/tasks/:taskId" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TaskDetail />
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Notifications />
            </ProtectedRoute>
          } />
          <Route path="/plans" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Plans />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <PlanDetail />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId/preview" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <PlanPreview />
            </ProtectedRoute>
          } />
          <Route path="/categories" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Categories />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/wallet" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Wallet />
            </ProtectedRoute>
          } />
          <Route path="/office-cms" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <OfficeCMS />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
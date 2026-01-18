import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import ErrorBoundary from './components/ErrorBoundary';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import CookieConsent from './components/CookieConsent';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Tasks from './pages/Tasks';
import Plans from './pages/Plans';
import PlanDetail from './pages/PlanDetail';
import Subscriptions from './pages/Subscriptions';
import Profile from './pages/Profile';
import TaskDetail from './pages/TaskDetail';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import LegalPage from './pages/LegalPage';
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
          <Route path="/legal/:slug" element={<LegalPage />} />
          
          {/* Protected CLIENT Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/wallet" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Wallet />
            </ProtectedRoute>
          } />
          <Route path="/tasks" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Tasks />
            </ProtectedRoute>
          } />
          <Route path="/tasks/:taskId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <TaskDetail />
            </ProtectedRoute>
          } />
          <Route path="/plans" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Plans />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <PlanDetail />
            </ProtectedRoute>
          } />
          <Route path="/subscriptions" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Subscriptions />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Tickets />
            </ProtectedRoute>
          } />
          <Route path="/tickets/:ticketId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <TicketDetail />
            </ProtectedRoute>
          } />
          
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieConsent />
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
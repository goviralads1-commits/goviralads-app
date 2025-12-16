import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Tasks from './pages/Tasks';

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
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginForm />} />
          
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
          
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
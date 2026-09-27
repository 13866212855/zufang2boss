import { useState, useEffect } from 'react';
import VisitorRentalView from './components/VisitorRentalView.tsx';
import AdminLogin from './components/AdminLogin.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import { getAdminToken } from './services/api.ts';
import { initVisitorTracking } from './utils/tracker.ts';

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  useEffect(() => {
    // Check initial route
    const checkRoute = () => {
      const path = window.location.pathname;
      const isAdmin = path === '/admin' || path.startsWith('/admin/');
      setIsAdminRoute(isAdmin);

      if (isAdmin) {
        const token = getAdminToken();
        setIsAdminLoggedIn(!!token);
      } else {
        // Front-end visitor view: trigger silent device tracking & heartbeat
        initVisitorTracking();
      }
    };

    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  // Admin route rendering
  if (isAdminRoute) {
    if (isAdminLoggedIn) {
      return <AdminDashboard onLogout={() => setIsAdminLoggedIn(false)} />;
    }
    return (
      <AdminLogin
        onLoginSuccess={() => {
          setIsAdminLoggedIn(true);
        }}
      />
    );
  }

  // Visitor H5 rental view (No admin button on home page, credentials strictly hidden)
  return <VisitorRentalView />;
}

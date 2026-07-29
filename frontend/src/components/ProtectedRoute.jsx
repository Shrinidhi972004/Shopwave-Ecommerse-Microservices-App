import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from './ui';

/**
 * Gate for authenticated (and optionally admin-only) routes.
 *
 * While the session is being restored we render a loader rather than
 * redirecting — otherwise a hard refresh on /orders would bounce a logged-in
 * user to /login before their token had a chance to be verified.
 *
 * This is a UX guard, not a security boundary: every protected route is also
 * enforced server-side by requireAuth / requireRole.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <PageLoader label="Checking your session" />;

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return children;
}

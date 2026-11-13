import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spinner } from '@/shared/components';
import { RequireAuth, PublicRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/app/layouts/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import SsoCallbackPage from '@/pages/SsoCallbackPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import ContactPage from '@/pages/ContactPage';
import { ChatPage } from '@/features/chat/ChatPage';

// Pages other than chat are separate downloads, fetched on first visit (Data Visualization and
// ECharts are large): the first load stays small and fast.
const ImagePlaygroundPage = lazy(() => import('@/features/image/ImagePlaygroundPage').then((module) => ({ default: module.ImagePlaygroundPage })));
const BillingPage = lazy(() => import('@/features/billing/BillingPage').then((module) => ({ default: module.BillingPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const VisualizeLayout = lazy(() => import('@/features/visualize/VisualizeLayout').then((module) => ({ default: module.VisualizeLayout })));
const DataPage = lazy(() => import('@/features/visualize/pages/DataPage').then((module) => ({ default: module.DataPage })));
const GalleryPage = lazy(() => import('@/features/visualize/pages/GalleryPage').then((module) => ({ default: module.GalleryPage })));
const ExplorePage = lazy(() => import('@/features/visualize/pages/ExplorePage').then((module) => ({ default: module.ExplorePage })));
const PredictPage = lazy(() => import('@/features/visualize/pages/PredictPage').then((module) => ({ default: module.PredictPage })));
const ReportsPage = lazy(() => import('@/features/visualize/pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const DashboardPage = lazy(() => import('@/features/visualize/dashboards/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DashboardsHome = lazy(() => import('@/features/visualize/dashboards/DashboardsHome').then((module) => ({ default: module.DashboardsHome })));
const DashboardEditor = lazy(() => import('@/features/visualize/dashboards/editor/DashboardEditor').then((module) => ({ default: module.DashboardEditor })));
const SharedDashboardPage = lazy(() => import('@/features/visualize/dashboards/SharedDashboardPage').then((module) => ({ default: module.SharedDashboardPage })));

/** A page that downloads on first visit; the surrounding shell stays on screen meanwhile. */
function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <Spinner />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      {/* Public marketing routes - redirect to app if signed in */}
      <Route element={<PublicRoute />}>
        <Route path="/" element={<Navigate to="/app/chat" replace />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/sso-callback" element={<SsoCallbackPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Route>

      {/* App shell is PUBLIC. The sidebar, chat landing page, theme, language,
          collapse and account controls are available to guests. Features that
          call the API (images, history, visualization, billing, settings) need an account. */}
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="chat" replace />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="image" element={<Navigate to="/app/images" replace />} />
        <Route path="images" element={<RequireAuth><Page><ImagePlaygroundPage /></Page></RequireAuth>} />
        <Route path="history" element={<RequireAuth><Page><HistoryPage /></Page></RequireAuth>} />
        {/* Data Analytics is now part of Data Visualization (Data → Organize). */}
        <Route path="analytics" element={<Navigate to="/app/visualize/data" replace />} />
        <Route path="visualize" element={<RequireAuth><Page><VisualizeLayout /></Page></RequireAuth>}>
          <Route index element={<Page><DashboardsHome /></Page>} />
          <Route path="data" element={<Page><DataPage /></Page>} />
          <Route path="gallery" element={<Page><GalleryPage /></Page>} />
          <Route path="explore" element={<Page><ExplorePage /></Page>} />
          {/* Studio became Explore. */}
          <Route path="studio" element={<Navigate to="/app/visualize/explore" replace />} />
          <Route path="predict" element={<Page><PredictPage /></Page>} />
          <Route path="reports" element={<Page><ReportsPage /></Page>} />
          <Route path="dashboards" element={<Page><DashboardsHome /></Page>} />
          <Route path="dashboards/:dashboardId" element={<Page><DashboardPage /></Page>} />
          <Route path="dashboards/:dashboardId/edit" element={<Page><DashboardEditor /></Page>} />
        </Route>
        <Route path="billing" element={<RequireAuth><Page><BillingPage /></Page></RequireAuth>} />
        <Route path="settings" element={<RequireAuth><Page><SettingsPage /></Page></RequireAuth>} />
      </Route>

      {/* Public, read-only dashboards from a share link or an embed (no sign-in). */}
      <Route path="/share/:token" element={<Page><SharedDashboardPage /></Page>} />
      <Route path="/embed/:token" element={<Page><SharedDashboardPage embed /></Page>} />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
import { Routes, Route, Navigate } from 'react-router-dom';
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
import { ImagePlaygroundPage } from '@/features/image/ImagePlaygroundPage';
import { BillingPage } from '@/features/billing/BillingPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { VisualizeLayout } from '@/features/visualize/VisualizeLayout';
import { OverviewPage } from '@/features/visualize/pages/OverviewPage';
import { DataPage } from '@/features/visualize/pages/DataPage';
import { GalleryPage } from '@/features/visualize/pages/GalleryPage';
import { StudioPage } from '@/features/visualize/pages/StudioPage';
import { PredictPage } from '@/features/visualize/pages/PredictPage';
import { ReportsPage } from '@/features/visualize/pages/ReportsPage';
import { DashboardPage } from '@/features/visualize/dashboards/DashboardPage';
import { DashboardsHome } from '@/features/visualize/dashboards/DashboardsHome';
import { DashboardEditor } from '@/features/visualize/dashboards/editor/DashboardEditor';

export function App() {
  return (
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
        <Route path="images" element={<RequireAuth><ImagePlaygroundPage /></RequireAuth>} />
        <Route path="history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        {/* Data Analytics is now part of Data Visualization (Data → Organize). */}
        <Route path="analytics" element={<Navigate to="/app/visualize/data" replace />} />
        <Route path="visualize" element={<RequireAuth><VisualizeLayout /></RequireAuth>}>
          <Route index element={<OverviewPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="predict" element={<PredictPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="dashboards" element={<DashboardsHome />} />
          <Route path="dashboards/:dashboardId" element={<DashboardPage />} />
          <Route path="dashboards/:dashboardId/edit" element={<DashboardEditor />} />
        </Route>
        <Route path="billing" element={<RequireAuth><BillingPage /></RequireAuth>} />
        <Route path="settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
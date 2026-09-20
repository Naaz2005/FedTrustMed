import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LoginModal } from './components/auth/LoginModal';
import { LandingPage } from './components/landing/LandingPage';

import { PatientDashboard } from './components/dashboards/PatientDashboard';
import { DoctorDashboard } from './components/dashboards/DoctorDashboard';
import { HospitalAdminDashboard } from './components/dashboards/HospitalAdminDashboard';
import { SystemAdminDashboard } from './components/dashboards/SystemAdminDashboard';

import { EncryptionVault } from './components/modules/EncryptionVault';
import { BlockchainExplorer } from './components/modules/BlockchainExplorer';
import { ConsentManager } from './components/modules/ConsentManager';
import { TrustScoreMatrix } from './components/modules/TrustScoreMatrix';
import { AIThreatDetector } from './components/modules/AIThreatDetector';
import { FederatedLearningView } from './components/modules/FederatedLearningView';
import { DocumentationView } from './components/modules/DocumentationView';

function MainApp() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const { role, isAuthenticated, openLoginModal, setOpenLoginModal } = useAuth();

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const renderDashboardByRole = () => {
    switch (role) {
      case 'PATIENT':
        return <PatientDashboard setActiveTab={setActiveTab} />;
      case 'DOCTOR':
        return <DoctorDashboard setActiveTab={setActiveTab} />;
      case 'HOSPITAL_ADMIN':
        return <HospitalAdminDashboard setActiveTab={setActiveTab} />;
      case 'SYSTEM_ADMIN':
        return <SystemAdminDashboard setActiveTab={setActiveTab} />;
      default:
        return <PatientDashboard setActiveTab={setActiveTab} />;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboardByRole();
      case 'records':
        return <EncryptionVault />;
      case 'consent':
        return <ConsentManager />;
      case 'blockchain':
        return <BlockchainExplorer />;
      case 'trust':
        return <TrustScoreMatrix />;
      case 'threats':
        return <AIThreatDetector />;
      case 'federated':
        return <FederatedLearningView />;
      case 'admin':
        return <SystemAdminDashboard setActiveTab={setActiveTab} />;
      case 'docs':
        return <DocumentationView />;
      default:
        return renderDashboardByRole();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-500 selection:text-white">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      <LoginModal isOpen={openLoginModal} onClose={() => setOpenLoginModal(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

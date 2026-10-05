import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { subscribeRealtimeEvents } from './services/realtime';
import { LandingPage } from './components/landing/LandingPage';

import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

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
  /*
   * ============================================================
   * ACTIVE TAB
   * ============================================================
   *
   * dashboard
   * records
   * consent
   * blockchain
   * trust
   * threats
   * federated
   * admin
   * docs
   */
  const [activeTab, setActiveTab] =
    useState<string>('dashboard');


  /*
   * ============================================================
   * AUTHENTICATION / ROLE
   * ============================================================
   */
  const {
    role,
    isAuthenticated,
    openLoginModal,
    setOpenLoginModal,
  } = useAuth();


  /*
   * ============================================================
   * REAL-TIME REFRESH KEY
   * ============================================================
   *
   * When another FedTrustMed tab changes shared data,
   * BroadcastChannel sends a DATA_CHANGED event.
   *
   * We increase this key.
   *
   * React then remounts the currently displayed module,
   * causing its existing API-fetching useEffect() to run again.
   */
  const [refreshKey, setRefreshKey] =
    useState<number>(0);


  /*
   * ============================================================
   * MULTI-TAB REAL-TIME LISTENER
   * ============================================================
   */
  useEffect(() => {
    const unsubscribe =
      subscribeRealtimeEvents((event) => {
        /*
         * We only want application-data changes
         * to refresh the current screen.
         */
        if (
          event.type !== 'DATA_CHANGED'
        ) {
          return;
        }

        /*
         * Change the key.
         *
         * Example:
         *
         * Tab 1:
         * Admin approves doctor
         *
         *        ↓
         *
         * BroadcastChannel
         *
         *        ↓
         *
         * Tab 2:
         * DATA_CHANGED
         *
         *        ↓
         *
         * refreshKey changes
         *
         *        ↓
         *
         * Current dashboard/module reloads
         */
        setRefreshKey(
          (current) => current + 1
        );
      });

    /*
     * Remove the listener when MainApp
     * is unmounted.
     */
    return unsubscribe;
  }, []);


  /*
   * ============================================================
   * LOGGED OUT STATE
   * ============================================================
   *
   * Users must first see the landing/login/registration page.
   */
  if (!isAuthenticated) {
    return (
      <LandingPage />
    );
  }


  /*
   * ============================================================
   * ROLE-BASED DASHBOARD
   * ============================================================
   *
   * IMPORTANT:
   * There is NO persona switching here.
   *
   * The dashboard is selected from the authenticated
   * user's actual role.
   */
  const renderDashboardByRole = () => {
    switch (role) {

      case 'PATIENT':
        return (
          <PatientDashboard
            setActiveTab={setActiveTab}
          />
        );

      case 'DOCTOR':
        return (
          <DoctorDashboard
            setActiveTab={setActiveTab}
          />
        );

      case 'HOSPITAL_ADMIN':
        return (
          <HospitalAdminDashboard
            setActiveTab={setActiveTab}
          />
        );

      case 'SYSTEM_ADMIN':
        return (
          <SystemAdminDashboard
            setActiveTab={setActiveTab}
          />
        );

      /*
       * Safety fallback.
       *
       * The backend should always return one
       * of the supported roles.
       */
      default:
        return (
          <PatientDashboard
            setActiveTab={setActiveTab}
          />
        );
    }
  };


  /*
   * ============================================================
   * ACTIVE MODULE
   * ============================================================
   *
   * The refreshKey is used here.
   *
   * When another tab changes something:
   *
   * refreshKey:
   *
   * 0 → 1 → 2 → 3 ...
   *
   * The component gets a new React key and remounts.
   */
  const renderActiveTab = () => {

    switch (activeTab) {

      /*
       * --------------------------------------------------------
       * DASHBOARD
       * --------------------------------------------------------
       */
      case 'dashboard':
        return (
          <React.Fragment
            key={`dashboard-${refreshKey}`}
          >
            {renderDashboardByRole()}
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * MEDICAL RECORDS / ENCRYPTION
       * --------------------------------------------------------
       */
      case 'records':
        return (
          <React.Fragment
            key={`records-${refreshKey}`}
          >
            <EncryptionVault />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * CONSENT
       * --------------------------------------------------------
       */
      case 'consent':
        return (
          <React.Fragment
            key={`consent-${refreshKey}`}
          >
            <ConsentManager />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * BLOCKCHAIN
       * --------------------------------------------------------
       */
      case 'blockchain':
        return (
          <React.Fragment
            key={`blockchain-${refreshKey}`}
          >
            <BlockchainExplorer />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * TRUST
       * --------------------------------------------------------
       */
      case 'trust':
        return (
          <React.Fragment
            key={`trust-${refreshKey}`}
          >
            <TrustScoreMatrix />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * THREAT DETECTION
       * --------------------------------------------------------
       */
      case 'threats':
        return (
          <React.Fragment
            key={`threats-${refreshKey}`}
          >
            <AIThreatDetector />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * FEDERATED LEARNING
       * --------------------------------------------------------
       */
      case 'federated':
        return (
          <React.Fragment
            key={`federated-${refreshKey}`}
          >
            <FederatedLearningView />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * ADMIN
       * --------------------------------------------------------
       *
       * The actual visibility of this tab is still controlled
       * by your existing role-based Sidebar.
       */
      case 'admin':
        return (
          <React.Fragment
            key={`admin-${refreshKey}`}
          >
            <SystemAdminDashboard
              setActiveTab={setActiveTab}
            />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * DOCUMENTATION
       * --------------------------------------------------------
       */
      case 'docs':
        return (
          <React.Fragment
            key={`docs-${refreshKey}`}
          >
            <DocumentationView />
          </React.Fragment>
        );


      /*
       * --------------------------------------------------------
       * DEFAULT
       * --------------------------------------------------------
       */
      default:
        return (
          <React.Fragment
            key={`default-${refreshKey}`}
          >
            {renderDashboardByRole()}
          </React.Fragment>
        );
    }
  };


  /*
   * ============================================================
   * AUTHENTICATED APPLICATION LAYOUT
   * ============================================================
   */
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ------------------------------------------------------
          TOP NAVBAR
          ------------------------------------------------------ */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />


      <div className="flex">

        {/* ----------------------------------------------------
            ROLE-BASED SIDEBAR
            ---------------------------------------------------- */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />


        {/* ----------------------------------------------------
            MAIN CONTENT
            ---------------------------------------------------- */}
        <main className="flex-1 min-w-0">
          {renderActiveTab()}
        </main>

      </div>


      /*
       * Keep login modal state available for the existing
       * authentication UI.
       *
       * The actual LoginModal remains controlled by the
       * existing LandingPage/Navbar authentication flow.
       */
      {openLoginModal && (
        <div className="hidden">
          {String(setOpenLoginModal)}
        </div>
      )}

    </div>
  );
}


/*
 * ============================================================
 * ROOT APP
 * ============================================================
 */
export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
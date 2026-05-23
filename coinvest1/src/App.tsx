/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { LandingPage } from './components/LandingPage';
import { Layout } from './components/Layout';
import { Overview } from './components/Overview';
import { Investments } from './components/Investments';
import { CFDTrading } from './components/CFDTrading';
import { CopyTrading } from './components/CopyTrading';
import { Wallet } from './components/Wallet';
import { Profile } from './components/Profile';
import { AdminPanel } from './components/AdminPanel';

function DashboardContent() {
  const { user } = useDashboard();
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState<'website' | 'console'>('website');

  if (!user) {
    return <LandingPage onEnterConsole={() => setViewMode('console')} />;
  }

  if (viewMode === 'website') {
    return <LandingPage onEnterConsole={() => setViewMode('console')} />;
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      onBrowseWebsite={() => setViewMode('website')}
    >
      {activeTab === 'overview' && <Overview setActiveTab={setActiveTab} />}
      {activeTab === 'investments' && <Investments />}
      {activeTab === 'trading' && <CFDTrading />}
      {activeTab === 'copy-trading' && <CopyTrading />}
      {activeTab === 'wallet' && <Wallet />}
      {activeTab === 'profile' && <Profile />}
      
      {/* Absolute Admin Control Overlay */}
      <AdminPanel />
    </Layout>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
